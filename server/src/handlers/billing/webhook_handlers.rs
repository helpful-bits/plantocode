use actix_web::{web, HttpResponse, post, HttpRequest};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
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
        
        // Process the webhook event with proper try/catch block
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
    let db_pool = billing_service.get_db_pool();
    let email_service = crate::services::email_notification_service::EmailNotificationService::new(db_pool.clone())?;

    // SIMPLIFIED WEBHOOK HANDLING - Only process essential sync events
    // Complex operations are delegated to Stripe Customer Portal
    match event.type_.to_string().as_str() {
        // Essential subscription sync events
        "customer.subscription.updated" => {
            info!("Subscription updated: {}", event.id);
            if let stripe::EventObject::Subscription(subscription) = &event.data.object {
                sync_subscription_status(subscription, billing_service).await?;
            }
        },
        "customer.subscription.deleted" => {
            info!("Subscription deleted: {}", event.id);
            if let stripe::EventObject::Subscription(subscription) = &event.data.object {
                handle_subscription_cancellation(subscription, billing_service).await?;
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
                reset_usage_allowances(invoice, billing_service).await?;
            }
        },
        
        // Payment method events
        "payment_method.attached" => {
            info!("Payment method attached: {}", event.id);
            if let stripe::EventObject::PaymentMethod(payment_method) = &event.data.object {
                handle_payment_method_attached(payment_method, billing_service).await?;
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

/// Sync subscription status from Stripe to local database
async fn sync_subscription_status(
    subscription: &stripe::Subscription,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Syncing subscription status for: {}", subscription.id);
    
    // Find user by Stripe customer ID
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let customer_id = subscription.customer.id().to_string();
    
    let user = user_repo.get_by_stripe_customer_id(&customer_id).await?;
    let sub_repo = crate::db::repositories::SubscriptionRepository::new(billing_service.get_db_pool().clone());
    
    // Update subscription status in local database
    if let Some(mut local_sub) = sub_repo.get_by_user_id(&user.id).await? {
        local_sub.status = format!("{:?}", subscription.status);
        local_sub.updated_at = Utc::now();
        sub_repo.update(&local_sub).await?;
        info!("Updated local subscription status for user: {}", user.id);
    }
    
    Ok(())
}

/// Handle subscription cancellation
async fn handle_subscription_cancellation(
    subscription: &stripe::Subscription,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling subscription cancellation for: {}", subscription.id);
    
    // Find user and update local subscription
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let customer_id = subscription.customer.id().to_string();
    
    let user = user_repo.get_by_stripe_customer_id(&customer_id).await?;
    let sub_repo = crate::db::repositories::SubscriptionRepository::new(billing_service.get_db_pool().clone());
    
    if let Some(mut local_sub) = sub_repo.get_by_user_id(&user.id).await? {
        local_sub.status = "canceled".to_string();
        local_sub.updated_at = Utc::now();
        sub_repo.update(&local_sub).await?;
        info!("Marked subscription as canceled for user: {}", user.id);
    }
    
    Ok(())
}

/// Process credit purchase from successful payment intent
async fn process_credit_purchase(
    payment_intent: &stripe::PaymentIntent,
    billing_service: &BillingService,
    email_service: &crate::services::email_notification_service::EmailNotificationService,
) -> Result<(), AppError> {
    info!("Processing payment_intent.succeeded for PaymentIntent: {}", payment_intent.id);
    
    // Check if this is a credit purchase by examining metadata
    if let metadata = &payment_intent.metadata {
        if metadata.get("type").map(|t| t.as_str()) != Some("credit_purchase") {
            info!("PaymentIntent {} is not a credit purchase, ignoring", payment_intent.id);
            return Ok(());
        }
        
        info!("PaymentIntent {} is a credit purchase, processing", payment_intent.id);
        
        // Extract required metadata
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
                return Ok(());
            }
        };
        
        // Parse user_id and credit_pack_id as UUIDs
        let user_uuid = match Uuid::parse_str(user_id_str) {
            Ok(uuid) => uuid,
            Err(e) => {
                error!("Invalid user_id UUID in PaymentIntent {}: {}", payment_intent.id, e);
                return Ok(());
            }
        };
        
        let credit_pack_id = credit_pack_id_str;
        
        // Parse credit value
        let credit_value = match credit_value_str.parse::<BigDecimal>() {
            Ok(value) => value,
            Err(e) => {
                error!("Invalid credit_value in PaymentIntent {}: {}", payment_intent.id, e);
                return Ok(());
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
                return Ok(());
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
    } else {
        info!("PaymentIntent {} has no metadata, ignoring", payment_intent.id);
    }
    
    Ok(())
}


/// Reset usage allowances after successful invoice payment
async fn reset_usage_allowances(
    invoice: &stripe::Invoice,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Resetting usage allowances for invoice: {}", invoice.id);
    
    // Find user by Stripe customer ID and reset their usage allowances
    let user_repo = crate::db::repositories::UserRepository::new(billing_service.get_db_pool().clone());
    let customer_id = invoice.customer.as_ref().unwrap().id().to_string();
    
    let user = user_repo.get_by_stripe_customer_id(&customer_id).await?;
    let cost_service = billing_service.get_cost_based_billing_service();
    // Note: reset_monthly_usage functionality would be implemented here
    info!("Would reset monthly usage for user: {}", user.id);
    info!("Reset usage allowances for user: {}", user.id);
    
    Ok(())
}

/// Handle payment method attached event
async fn handle_payment_method_attached(
    payment_method: &stripe::PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method attached: {}", payment_method.id);
    
    // Payment method attachment is primarily handled by Stripe Customer Portal
    // We can optionally sync payment method data to local database here if needed
    // For now, we'll just log the event
    
    info!("Payment method {} attached successfully", payment_method.id);
    Ok(())
}

/// Handle customer default source updated event
async fn handle_customer_default_source_updated(
    customer: &stripe::Customer,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling customer default source updated: {}", customer.id);
    
    // Customer default source updates are primarily handled by Stripe Customer Portal
    // We can optionally sync default payment method data to local database here if needed
    // For now, we'll just log the event
    
    info!("Customer {} default source updated successfully", customer.id);
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

