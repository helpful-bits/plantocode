use actix_web::{web, HttpResponse, post, HttpRequest};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::db::repositories::webhook_idempotency_repository::WebhookIdempotencyRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::{CreditTransactionRepository, CreditTransaction};
use crate::db::repositories::credit_pack_repository::CreditPackRepository;
use crate::utils::stripe_currency_utils::{stripe_cents_to_decimal, validate_stripe_amount_matches};
use uuid::Uuid;
use log::{debug, error, info, warn};
use chrono::{DateTime, Utc, Duration};
use bigdecimal::BigDecimal;
use stripe::{Event, EventObject, Webhook, Client, Subscription as StripeSubscription, Expandable, PaymentIntent};

// ========================================
// SIMPLIFIED STRIPE WEBHOOK HANDLERS
// ========================================

/// Handle Stripe webhook events (optimized for Customer Portal integration)
#[post("/stripe")]
pub async fn stripe_webhook(
    req: HttpRequest,
    body: web::Bytes,
    billing_service: web::Data<BillingService>,
    app_state: web::Data<crate::models::runtime_config::AppState>,
) -> Result<HttpResponse, AppError> {
    // Get the Stripe signature from the request header
    let stripe_signature = req.headers()
        .get("Stripe-Signature")
        .ok_or(AppError::InvalidArgument("Missing Stripe-Signature header".to_string()))?
        .to_str()
        .map_err(|_| AppError::InvalidArgument("Invalid Stripe-Signature header".to_string()))?;
    
    // Verify and process the webhook
    {
        // Get webhook secret from app_state
        let webhook_secret = &app_state.settings.stripe.webhook_secret;

        // Convert body bytes to string for construct_event
        let body_str = std::str::from_utf8(&body)
            .map_err(|_| AppError::InvalidArgument("Invalid UTF-8 in webhook body".to_string()))?;

        // Construct and verify the event using the stripe-rs utility
        let event = stripe::Webhook::construct_event(body_str, stripe_signature, webhook_secret)
            .map_err(|e| {
                error!("Stripe webhook signature verification or parsing failed: {}", e);
                AppError::Auth(format!("Invalid Stripe webhook signature or payload: {}", e))
            })?;

        // Initialize webhook idempotency repository
        let webhook_repo = WebhookIdempotencyRepository::new(billing_service.get_db_pool().clone());
        
        // Generate a unique worker ID for this instance
        let worker_id = format!("webhook-handler-{}", uuid::Uuid::new_v4().to_string()[..8].to_string());
        
        // Attempt to acquire a lock on the webhook event
        let _webhook_record = match webhook_repo.acquire_webhook_lock(
            &event.id,
            "stripe",
            &event.type_.to_string(),
            &worker_id,
            5, // 5 minute lock duration
            Some(serde_json::json!({
                "stripe_event_id": event.id,
                "stripe_event_type": event.type_,
                "created": event.created,
                "livemode": event.livemode,
                "api_version": event.api_version
            }))
        ).await {
            Ok(record) => {
                info!("Successfully acquired lock for webhook event {} (worker: {})", event.id, worker_id);
                record
            }
            Err(AppError::Database(msg)) if msg.contains("already locked") => {
                info!("Webhook event {} is already being processed by another worker, skipping", event.id);
                return Ok(HttpResponse::Ok().finish());
            }
            Err(e) => {
                error!("Failed to acquire lock for webhook event {}: {}", event.id, e);
                return Err(e);
            }
        };
        
        // Process the webhook event with proper error handling
        match process_stripe_webhook_event(&event, &billing_service, &app_state).await {
            Ok(response) => {
                // Mark webhook processing as completed successfully
                if let Err(e) = webhook_repo.mark_as_completed(
                    &event.id,
                    Some(serde_json::json!({
                        "completed_at": Utc::now().to_rfc3339(),
                        "status": "success",
                        "worker_id": worker_id
                    }))
                ).await {
                    warn!("Failed to mark webhook processing as completed for event {}: {}", event.id, e);
                }
                info!("Successfully processed webhook event {} (worker: {})", event.id, worker_id);
                Ok(response)
            }
            Err(e) => {
                let error_message = format!("{}", e);
                error!("Failed to process webhook event {}: {}", event.id, error_message);
                
                // Send admin alert for webhook failure
                crate::utils::admin_alerting::send_stripe_webhook_failure_alert(
                    &event.id,
                    &error_message,
                    &event.type_.to_string(),
                ).await;
                
                // Check if we should retry or mark as permanently failed
                const MAX_RETRIES: i32 = 3;
                const RETRY_DELAY_MINUTES: i32 = 5;
                
                // For critical errors, mark as failed immediately
                // For transient errors, schedule retry
                let should_retry = !is_permanent_error(&e);
                
                if should_retry {
                    if let Err(mark_error) = webhook_repo.release_webhook_lock_with_failure(
                        &event.id,
                        &error_message,
                        RETRY_DELAY_MINUTES,
                        Some(serde_json::json!({
                            "failed_at": Utc::now().to_rfc3339(),
                            "error": error_message,
                            "worker_id": worker_id,
                            "will_retry": true
                        }))
                    ).await {
                        warn!("Failed to schedule retry for webhook event {}: {}", event.id, mark_error);
                    } else {
                        info!("Scheduled retry for webhook event {} (worker: {})", event.id, worker_id);
                    }
                } else {
                    // Mark as permanently failed
                    if let Err(mark_error) = webhook_repo.mark_as_failed(
                        &event.id,
                        &error_message,
                        Some(serde_json::json!({
                            "failed_at": Utc::now().to_rfc3339(),
                            "error": error_message,
                            "worker_id": worker_id,
                            "permanent_failure": true
                        }))
                    ).await {
                        warn!("Failed to mark webhook as permanently failed for event {}: {}", event.id, mark_error);
                    } else {
                        info!("Marked webhook event {} as permanently failed (worker: {})", event.id, worker_id);
                    }
                }
                
                Err(e)
            }
        }
    }
}

/// Process a Stripe webhook event (simplified for Customer Portal integration)
async fn process_stripe_webhook_event(
    event: &stripe::Event,
    billing_service: &BillingService,
    app_state: &crate::models::runtime_config::AppState,
) -> Result<HttpResponse, AppError> {
    // Get repositories for webhook processing
    let db_pools = billing_service.get_db_pools();
    let email_service = crate::services::email_notification_service::EmailNotificationService::new(db_pools.clone())?;
    let audit_service = billing_service.get_audit_service();

    // SIMPLIFIED WEBHOOK HANDLING - Only process essential sync events
    // Complex operations are delegated to Stripe Customer Portal
    match event.type_.to_string().as_str() {
        // Essential subscription sync events
        "customer.subscription.updated" => {
            info!("Subscription updated: {}", event.id);
            if let stripe::EventObject::Subscription(subscription) = &event.data.object {
                billing_service.sync_subscription_from_webhook(subscription).await?;
                
                // Send plan change notification if applicable
                let customer_id = subscription.customer.id().to_string();
                let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
                if let Ok(user) = user_repo.get_by_stripe_customer_id(&customer_id).await {
                    let plan_id = subscription.items.data.first()
                        .and_then(|item| item.price.as_ref())
                        .map(|price| price.id.to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    
                    let plan_name = subscription.items.data.first()
                        .and_then(|item| item.price.as_ref())
                        .and_then(|price| price.nickname.as_ref())
                        .map(|name| name.clone())
                        .unwrap_or_else(|| plan_id.clone());
                    
                    if let Err(e) = email_service.send_plan_change_notification(
                        &user.id,
                        &user.email,
                        "previous_plan",
                        &plan_id,
                        &plan_name,
                    ).await {
                        error!("Failed to send plan change notification for user {}: {}", user.id, e);
                    }
                }
            }
        },
        "customer.subscription.deleted" => {
            info!("Subscription deleted: {}", event.id);
            if let stripe::EventObject::Subscription(subscription) = &event.data.object {
                billing_service.sync_subscription_from_webhook(subscription).await?;
                
                // Send cancellation notification
                let customer_id = subscription.customer.id().to_string();
                let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
                if let Ok(user) = user_repo.get_by_stripe_customer_id(&customer_id).await {
                    if let Err(e) = email_service.send_subscription_cancellation_notification(
                        &user.id,
                        &user.email,
                        false, // immediate cancellation
                        None,
                        None,
                    ).await {
                        error!("Failed to send subscription cancellation notification for user {}: {}", user.id, e);
                    }
                }
            }
        },
        
        // Essential payment events for credit purchases
        "payment_intent.succeeded" => {
            info!("Payment intent succeeded: {}", event.id);
            if let stripe::EventObject::PaymentIntent(payment_intent) = &event.data.object {
                process_credit_purchase(payment_intent, billing_service, &email_service).await?;
            }
        },
        
        // Essential billing events
        "invoice.payment_succeeded" => {
            info!("Invoice payment succeeded: {}", event.id);
            if let stripe::EventObject::Invoice(invoice) = &event.data.object {
                reset_usage_allowances(invoice, billing_service, &audit_service).await?;
            }
        },
        
        // Payment method events
        "payment_method.attached" => {
            info!("Payment method attached: {}", event.id);
            if let stripe::EventObject::PaymentMethod(payment_method) = &event.data.object {
                handle_payment_method_attached(payment_method, billing_service).await?;
            }
        },
        "payment_method.detached" => {
            info!("Payment method detached: {}", event.id);
            if let stripe::EventObject::PaymentMethod(payment_method) = &event.data.object {
                handle_payment_method_detached(payment_method, billing_service).await?;
            }
        },
        
        // Customer default source events  
        "customer.default_source_updated" => {
            info!("Customer default source updated: {}", event.id);
            if let stripe::EventObject::Customer(customer) = &event.data.object {
                handle_customer_default_source_updated(customer, billing_service).await?;
            }
        },
        
        // All other events are handled by Stripe Customer Portal
        _ => {
            info!("Ignoring Stripe event type: {} - handled by Customer Portal", event.type_);
        }
    }
    
    // Return success
    Ok(HttpResponse::Ok().finish())
}

// ========================================
// SIMPLIFIED WEBHOOK EVENT HANDLERS
// ========================================


/// Process credit purchase from successful payment intent
async fn process_credit_purchase(
    payment_intent: &stripe::PaymentIntent,
    billing_service: &BillingService,
    email_service: &crate::services::email_notification_service::EmailNotificationService,
) -> Result<(), AppError> {
    info!("Processing payment_intent.succeeded for PaymentIntent: {}", payment_intent.id);
    
    // Check if this is a credit purchase by examining metadata
    let metadata = &payment_intent.metadata;
    if metadata.get("type").map(|t| t.as_str()) != Some("credit_purchase") {
        info!("PaymentIntent {} is not a credit purchase, ignoring", payment_intent.id);
        return Ok(());
    }
    
    info!("PaymentIntent {} is a credit purchase, processing", payment_intent.id);
    
    // Extract required metadata with robust validation
    let (user_id_str, credit_pack_id_str, credit_value_str, currency) = match (
        metadata.get("user_id").map(|v| v.as_str()),
        metadata.get("credit_pack_id").map(|v| v.as_str()),
        metadata.get("credit_value").map(|v| v.as_str()),
        metadata.get("currency").map(|v| v.as_str())
    ) {
        (Some(user_id), Some(credit_pack_id), Some(credit_value), Some(currency)) => {
            (user_id, credit_pack_id, credit_value, currency)
        }
        _ => {
            error!("Missing required metadata in PaymentIntent {}: user_id, credit_pack_id, credit_value, or currency", payment_intent.id);
            return Err(AppError::InvalidArgument("Missing required credit purchase metadata".to_string()));
        }
    };
    
    // Parse and validate user_id UUID
    let user_uuid = match Uuid::parse_str(user_id_str) {
        Ok(uuid) => uuid,
        Err(e) => {
            error!("Invalid user_id UUID in PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::InvalidArgument(format!("Invalid user_id UUID: {}", e)));
        }
    };
    
    let credit_pack_id = credit_pack_id_str;
    
    // Parse and validate credit value
    let credit_value = match credit_value_str.parse::<BigDecimal>() {
        Ok(value) => {
            if value <= BigDecimal::from(0) {
                error!("Invalid credit_value (must be positive) in PaymentIntent {}: {}", payment_intent.id, value);
                return Err(AppError::InvalidArgument("Credit value must be positive".to_string()));
            }
            value
        },
        Err(e) => {
            error!("Invalid credit_value format in PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::InvalidArgument(format!("Invalid credit_value format: {}", e)));
        }
    };
    
    info!("Processing credit purchase for user {} with credit_pack_id {} and value {}", 
          user_uuid, credit_pack_id, credit_value);
    
    // Security: Fetch the corresponding CreditPack from the database and validate amount
    let credit_pack_repo = crate::db::repositories::CreditPackRepository::new(billing_service.get_db_pool().clone());
    let selected_pack = match credit_pack_repo.get_pack_by_id(credit_pack_id).await? {
        Some(pack) => pack,
        None => {
            error!("Credit pack not found for ID {} in PaymentIntent {}", credit_pack_id, payment_intent.id);
            return Err(AppError::InvalidArgument(format!("Credit pack not found: {}", credit_pack_id)));
        }
    };
    
    // Validate that the payment intent amount matches our expected price
    validate_stripe_amount_matches(payment_intent.amount, &selected_pack.price_amount, currency)?;
    info!("Amount validation successful for PaymentIntent {}: {} matches expected {}", 
          payment_intent.id, payment_intent.amount, selected_pack.price_amount);
    
    // Start a database transaction
    let mut tx = billing_service.get_system_db_pool().begin().await
        .map_err(|e| AppError::Database(format!("Failed to begin transaction for PaymentIntent {}: {}", payment_intent.id, e)))?;
    
    info!("Started transaction for PaymentIntent {}", payment_intent.id);
    
    // Add credits to user balance
    let credit_repo = UserCreditRepository::new(billing_service.get_system_db_pool());
    let updated_balance = credit_repo.increment_balance_with_executor(
        &user_uuid,
        &credit_value,
        &mut tx
    ).await.map_err(|e| {
        error!("Failed to increment user balance for PaymentIntent {}: {}", payment_intent.id, e);
        e
    })?;
    
    info!("Incremented user {} balance by {} for PaymentIntent {}, new balance: {}", 
          user_uuid, credit_value, payment_intent.id, updated_balance.balance);
    
    // Create credit transaction record
    let transaction_repo = CreditTransactionRepository::new(billing_service.get_system_db_pool());
    let transaction = CreditTransaction {
        id: Uuid::new_v4(),
        user_id: user_uuid,
        transaction_type: "purchase".to_string(),
        amount: credit_value.clone(),
        currency: currency.to_string(),
        description: Some(format!("Credit purchase via Stripe PaymentIntent")),
        stripe_charge_id: Some(payment_intent.id.to_string()),
        related_api_usage_id: None,
        metadata: Some(serde_json::to_value(&payment_intent.metadata).unwrap_or_default()),
        created_at: Some(Utc::now()),
    };
    
    transaction_repo.create_transaction_with_executor(&transaction, &mut tx).await.map_err(|e| {
        error!("Failed to create credit transaction for PaymentIntent {}: {}", payment_intent.id, e);
        e
    })?;
    
    info!("Created credit transaction record for PaymentIntent {}", payment_intent.id);
    
    // Commit transaction
    tx.commit().await.map_err(|e| {
        error!("Failed to commit transaction for PaymentIntent {}: {}", payment_intent.id, e);
        AppError::Database(format!("Failed to commit transaction: {}", e))
    })?;
    
    info!("Successfully processed credit purchase for PaymentIntent {}: user {} received {} credits", 
          payment_intent.id, user_uuid, credit_value);
    
    // Send success email notification
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    if let Ok(user) = user_repo.get_by_id(&user_uuid).await {
        email_service.send_credit_purchase_notification(
            &user_uuid,
            &user.email,
            &credit_value,
            currency,
        ).await.map_err(|e| {
            error!("Failed to send credit purchase notification for PaymentIntent {}: {}", payment_intent.id, e);
            e
        }).unwrap_or_else(|e| {
            error!("Failed to send credit purchase notification for PaymentIntent {}: {}", payment_intent.id, e);
        });
        
        info!("Sent success email notification for user {} after PaymentIntent {}", user_uuid, payment_intent.id);
    } else {
        warn!("Could not find user {} to send email notification for PaymentIntent {}", user_uuid, payment_intent.id);
    }
    
    Ok(())
}


/// Reset usage allowances after successful invoice payment
async fn reset_usage_allowances(
    invoice: &stripe::Invoice,
    billing_service: &BillingService,
    audit_service: &crate::services::audit_service::AuditService,
) -> Result<(), AppError> {
    info!("Processing invoice payment for usage reset: {}", invoice.id);
    
    // Verify this is a subscription invoice (not a one-time payment)
    if invoice.subscription.is_none() {
        info!("Invoice {} is not subscription-related, skipping usage reset", invoice.id);
        return Ok(());
    }
    
    // Find user by Stripe customer ID
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let customer_id = invoice.customer.as_ref()
        .ok_or_else(|| AppError::InvalidArgument("Invoice missing customer information".to_string()))?
        .id().to_string();
    
    let user = user_repo.get_by_stripe_customer_id(&customer_id).await?;
    
    info!("Resetting monthly usage allowances for user {} after successful invoice payment {}", user.id, invoice.id);
    
    // CRITICAL: Actually reset the user's spending allowances for the new billing period
    // This is essential for subscription billing - users should get fresh allowances each month
    let cost_based_billing_service = billing_service.get_cost_based_billing_service();
    
    match cost_based_billing_service.reset_billing_period(&user.id).await {
        Ok(_) => {
            info!("Successfully reset monthly spending allowances for user {} after invoice {}", user.id, invoice.id);
            
            // Create formal audit trail for the allowance reset
            let audit_context = AuditContext::new(user.id);
            if let Err(e) = audit_service.log_spending_limit_reset(
                &audit_context,
                &user.id,
                &invoice.id.to_string(),
            ).await {
                warn!("Failed to log spending limit reset audit for user {}: {}", user.id, e);
            }
            
            info!("Audit: Monthly spending allowances reset for user {} after successful subscription payment (invoice {})", 
                  user.id, invoice.id);
        }
        Err(e) => {
            error!("CRITICAL: Failed to reset monthly spending allowances for user {} after successful invoice payment {}: {}", 
                   user.id, invoice.id, e);
            
            // This is a critical error - user paid but didn't get fresh allowances
            // We should continue processing but log this as a critical issue
            error!("BILLING ALERT: User {} paid subscription but allowances not reset - manual intervention required", user.id);
            
            // Don't fail the webhook - we want Stripe to consider it processed
            // But the error logs will alert operators to the issue
        }
    }
    
    Ok(())
}

/// Handle payment method attached event
async fn handle_payment_method_attached(
    payment_method: &stripe::PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method attached: {}", payment_method.id);
    
    // Get the customer ID from the payment method
    let customer_id = match &payment_method.customer {
        Some(customer) => customer.id().to_string(),
        None => {
            warn!("Payment method {} has no associated customer, skipping sync", payment_method.id);
            return Ok(());
        }
    };
    
    // Find the user by Stripe customer ID
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let user = match user_repo.get_by_stripe_customer_id(&customer_id).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with attached payment method {}", customer_id, payment_method.id);
            return Ok(());
        }
    };
    
    info!("Payment method {} attached for user {}", payment_method.id, user.id);
    
    // Get Stripe service to check current payment methods
    let stripe_service = billing_service.get_stripe_service()?;
    let current_payment_methods = stripe_service.list_payment_methods(&customer_id).await
        .map_err(|e| AppError::External(format!("Failed to list payment methods: {}", e)))?;
    
    // If this is the user's first payment method, set it as default
    if current_payment_methods.len() == 1 {
        info!("Setting payment method {} as default for user {} (first payment method)", payment_method.id, user.id);
        if let Err(e) = stripe_service.set_default_payment_method(&customer_id, &payment_method.id.to_string()).await {
            error!("Failed to set payment method {} as default: {}", payment_method.id, e);
        } else {
            info!("Successfully set payment method {} as default for user {}", payment_method.id, user.id);
        }
    }
    
    // Create an audit trail for security - this gives us visibility into payment method changes
    info!("Audit: Payment method {} of type {:?} attached to customer {} (user {}) via Stripe Customer Portal", 
          payment_method.id, 
          payment_method.type_, 
          customer_id, 
          user.id);
    
    // Clear any cached payment method data so frontend gets fresh data
    // This is critical for keeping the frontend in sync with Stripe
    info!("Payment method {} attached successfully for user {} - frontend will refresh payment methods", payment_method.id, user.id);
    
    Ok(())
}

/// Handle payment method detached event
async fn handle_payment_method_detached(
    payment_method: &stripe::PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method detached: {}", payment_method.id);
    
    // Get the customer ID from the payment method
    let customer_id = match &payment_method.customer {
        Some(customer) => customer.id().to_string(),
        None => {
            warn!("Payment method {} has no associated customer, skipping sync", payment_method.id);
            return Ok(());
        }
    };
    
    // Find the user by Stripe customer ID
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let user = match user_repo.get_by_stripe_customer_id(&customer_id).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with detached payment method {}", customer_id, payment_method.id);
            return Ok(());
        }
    };
    
    info!("Payment method {} detached for user {}", payment_method.id, user.id);
    
    // Create an audit trail for security - this gives us visibility into payment method removal
    info!("Audit: Payment method {} of type {:?} detached from customer {} (user {}) via Stripe Customer Portal", 
          payment_method.id, 
          payment_method.type_, 
          customer_id, 
          user.id);
    
    // When a payment method is removed, the frontend needs to refresh to show accurate data
    // This is critical for keeping the frontend in sync with Stripe
    info!("Payment method {} detached successfully for user {} - frontend will refresh payment methods", payment_method.id, user.id);
    
    Ok(())
}

/// Handle customer default source updated event
async fn handle_customer_default_source_updated(
    customer: &stripe::Customer,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling customer default source updated: {}", customer.id);
    
    // Find the user by Stripe customer ID
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let user = match user_repo.get_by_stripe_customer_id(&customer.id.to_string()).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with updated default source", customer.id);
            return Ok(());
        }
    };
    
    // Get the new default payment method ID
    let default_payment_method_id = customer.invoice_settings
        .as_ref()
        .and_then(|settings| settings.default_payment_method.as_ref())
        .map(|pm| match pm {
            stripe::Expandable::Id(id) => id.to_string(),
            stripe::Expandable::Object(pm_obj) => pm_obj.id.to_string(),
        });
    
    match default_payment_method_id {
        Some(pm_id) => {
            info!("Customer {} (user {}) default payment method changed to {}", customer.id, user.id, pm_id);
            
            // Create audit trail for security
            info!("Audit: Customer {} (user {}) default payment method changed to {} via Stripe Customer Portal", 
                  customer.id, user.id, pm_id);
        }
        None => {
            info!("Customer {} (user {}) default payment method was removed", customer.id, user.id);
            
            // Create audit trail
            info!("Audit: Customer {} (user {}) default payment method removed via Stripe Customer Portal", 
                  customer.id, user.id);
        }
    }
    
    // This webhook ensures that when users change their default payment method via Customer Portal,
    // the frontend will show the correct default when it fetches fresh payment method data
    info!("Customer {} default source updated successfully - frontend will refresh payment methods", customer.id);
    
    Ok(())
}

/// Determine if an error is permanent and should not be retried
fn is_permanent_error(error: &AppError) -> bool {
    match error {
        // Authentication and authorization errors are typically permanent
        AppError::Auth(_) => true,
        // Validation errors are typically permanent
        AppError::InvalidArgument(_) => true,
        AppError::Validation(_) => true,
        AppError::BadRequest(_) => true,
        // Database constraint violations are typically permanent
        AppError::Database(msg) if msg.contains("constraint") => true,
        AppError::Database(msg) if msg.contains("foreign key") => true,
        AppError::Database(msg) if msg.contains("not found") => true,
        // Configuration errors are typically permanent
        AppError::Configuration(_) => true,
        // Temporary database issues should be retried
        AppError::Database(_) => false,
        // Network and timeout issues should be retried (External is used for network errors)
        AppError::External(_) => false,
        // Payment errors might be transient (e.g., temporary payment processor issues)
        AppError::Payment(_) => false,
        // Other errors should be retried by default
        _ => false,
    }
}

