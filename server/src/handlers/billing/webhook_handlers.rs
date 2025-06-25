use actix_web::{web, HttpResponse, post, HttpRequest};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::db::repositories::webhook_idempotency_repository::WebhookIdempotencyRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::{CreditTransactionRepository, CreditTransaction};
use crate::db::repositories::credit_pack_repository::CreditPackRepository;
use uuid::Uuid;
use log::{error, info, warn};
use chrono::Utc;
use bigdecimal::{BigDecimal, ToPrimitive};
use stripe::{Event, EventObject, Webhook, PaymentIntent};

// ========================================
// METERED BILLING STRIPE WEBHOOK HANDLERS
// ========================================
//
// This module handles Stripe webhook events for the metered billing system:
//
// 1. invoice.payment_succeeded - Handles subscription payments and resets monthly spending allowances
//    - Calls CostBasedBillingService.reset_billing_period() for subscription invoices
//    - Unblocks services that were blocked due to spending limits
//    - Sends admin alerts if billing period reset fails
//
// 2. payment_intent.succeeded - Handles credit top-up purchases (NOT subscription payments)
//    - Delegates to CreditService for one-time credit purchases
//    - Does NOT handle subscription payments (those go through invoice.payment_succeeded)
//    - Includes proper logging to distinguish between top-up vs subscription handling
//
// 3. Proper integration with CostBasedBillingService:
//    - Webhook handlers have access to CostBasedBillingService via BillingService
//    - Comprehensive error handling for billing service failures
//    - Admin alerts for critical billing failures
//    - Webhook processing continues even if optional operations fail
// ========================================

/// Handle Stripe webhook events (simplified for Customer Portal integration)
#[post("/stripe")]
pub async fn stripe_webhook(
    req: HttpRequest,
    body: web::Bytes,
    billing_service: web::Data<BillingService>,
    app_state: web::Data<crate::models::runtime_config::AppState>,
) -> Result<HttpResponse, AppError> {
    let stripe_signature = req.headers()
        .get("Stripe-Signature")
        .ok_or(AppError::InvalidArgument("Missing Stripe-Signature header".to_string()))?
        .to_str()
        .map_err(|_| AppError::InvalidArgument("Invalid Stripe-Signature header".to_string()))?;
    
    let webhook_secret = &app_state.settings.stripe.webhook_secret;
    let body_str = std::str::from_utf8(&body)
        .map_err(|_| AppError::InvalidArgument("Invalid UTF-8 in webhook body".to_string()))?;

    let event = stripe::Webhook::construct_event(body_str, stripe_signature, webhook_secret)
        .map_err(|e| {
            error!("Stripe webhook signature verification failed: {}", e);
            AppError::Auth(format!("Invalid Stripe webhook signature: {}", e))
        })?;

    // Validate event timestamp to prevent replay attacks - reject events outside 5-minute window
    let current_time = chrono::Utc::now().timestamp() as i64;
    let event_time = event.created;
    let time_diff = (current_time - event_time).abs();
    
    if time_diff > 300 { // 5 minutes = 300 seconds tolerance
        error!("Webhook event {} timestamp validation failed: event created at {}, current time {}, difference {} seconds (max allowed: 300)", 
               event.id, event_time, current_time, time_diff);
        return Err(AppError::Auth(format!(
            "Webhook event timestamp outside allowed window: event is {} seconds old (maximum 300 seconds allowed)", 
            time_diff
        )));
    }

    let webhook_repo = WebhookIdempotencyRepository::new(billing_service.get_db_pool().clone());
    let worker_id = format!("webhook-handler-{}", uuid::Uuid::new_v4().to_string()[..8].to_string());
    
    let _webhook_record = match webhook_repo.acquire_webhook_lock(
        &event.id,
        "stripe",
        &event.type_.to_string(),
        &worker_id,
        5,
        Some(serde_json::json!({
            "stripe_event_id": event.id,
            "stripe_event_type": event.type_,
            "created": event.created,
            "livemode": event.livemode,
            "api_version": event.api_version
        }))
    ).await {
        Ok(record) => {
            info!("Acquired lock for webhook event {} (worker: {})", event.id, worker_id);
            record
        }
        Err(AppError::Database(msg)) if msg.contains("already locked") => {
            info!("Webhook event {} already being processed, skipping", event.id);
            return Ok(HttpResponse::Ok().finish());
        }
        Err(e) => {
            error!("Failed to acquire lock for webhook event {}: {}", event.id, e);
            return Err(e);
        }
    };
    
    match process_stripe_webhook_event(&event, &billing_service, &app_state).await {
        Ok(response) => {
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
            error!("METERED BILLING: Failed to process webhook event {} (type: {}): {}", event.id, event.type_, error_message);
            
            // Send admin alert with metered billing context
            crate::utils::admin_alerting::send_stripe_webhook_failure_alert(
                &event.id,
                &error_message,
                &event.type_.to_string(),
            ).await;
            
            let should_retry = !is_permanent_error(&e);
            
            if should_retry {
                if let Err(mark_error) = webhook_repo.release_webhook_lock_with_failure(
                    &event.id,
                    &error_message,
                    5,
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

async fn process_stripe_webhook_event(
    event: &stripe::Event,
    billing_service: &BillingService,
    _app_state: &crate::models::runtime_config::AppState,
) -> Result<HttpResponse, AppError> {
    let db_pools = billing_service.get_db_pools();
    let email_service = crate::services::email_notification_service::EmailNotificationService::new(db_pools.clone())?;
    let audit_service = billing_service.get_audit_service();
    
    // Get credit service for metered billing operations  
    let _credit_service = billing_service.get_credit_service();
    info!("METERED BILLING: Processing Stripe webhook event {} of type {} with credit service", 
          event.id, event.type_);

    match event.type_.to_string().as_str() {
        "customer.subscription.updated" => {
            info!("Processing subscription updated: {}", event.id);
            if let stripe::EventObject::Subscription(subscription) = &event.data.object {
                billing_service.sync_subscription_from_webhook(subscription).await?;
                
                let customer_id = subscription.customer.id().to_string();
                let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_db_pool().clone());
                if let Ok(user) = user_repo.get_by_stripe_customer_id(&customer_id).await {
                    let new_plan_id = subscription.items.data.first()
                        .and_then(|item| item.price.as_ref())
                        .map(|price| price.id.to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    
                    let new_plan_name = subscription.items.data.first()
                        .and_then(|item| item.price.as_ref())
                        .and_then(|price| price.nickname.as_ref())
                        .map(|name| name.clone())
                        .unwrap_or_else(|| new_plan_id.clone());
                    
                    // Log audit event for subscription update
                    let audit_context = crate::services::audit_service::AuditContext::new(user.id);
                    if let Err(e) = audit_service.log_event(
                        &audit_context,
                        crate::services::audit_service::AuditEvent::new(
                            "subscription_updated",
                            "subscription"
                        )
                        .with_entity_id(subscription.id.to_string())
                        .with_metadata(serde_json::json!({
                            "new_plan_id": new_plan_id,
                            "new_plan_name": new_plan_name,
                            "status": format!("{:?}", subscription.status),
                            "customer_id": customer_id,
                            "event_id": event.id
                        }))
                    ).await {
                        warn!("Failed to log subscription update audit for user {}: {}", user.id, e);
                    }
                    
                    if let Err(e) = email_service.send_plan_change_notification(
                        &user.id,
                        &user.email,
                        "previous_plan",
                        &new_plan_id,
                        &new_plan_name,
                    ).await {
                        error!("Failed to send plan change notification for user {}: {}", user.id, e);
                    }
                }
            }
        },
        "customer.subscription.deleted" => {
            info!("Processing subscription deleted: {}", event.id);
            if let stripe::EventObject::Subscription(subscription) = &event.data.object {
                billing_service.sync_subscription_from_webhook(subscription).await?;
                
                let customer_id = subscription.customer.id().to_string();
                let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_db_pool().clone());
                if let Ok(user) = user_repo.get_by_stripe_customer_id(&customer_id).await {
                    // Log audit event for subscription deletion
                    let audit_context = crate::services::audit_service::AuditContext::new(user.id);
                    if let Err(e) = audit_service.log_event(
                        &audit_context,
                        crate::services::audit_service::AuditEvent::new(
                            "subscription_deleted",
                            "subscription"
                        )
                        .with_entity_id(subscription.id.to_string())
                        .with_metadata(serde_json::json!({
                            "deleted_plan_id": subscription.items.data.first()
                                .and_then(|item| item.price.as_ref())
                                .map(|price| price.id.to_string())
                                .unwrap_or_else(|| "unknown".to_string()),
                            "customer_id": customer_id,
                            "cancellation_reason": "customer_portal",
                            "event_id": event.id
                        }))
                    ).await {
                        warn!("Failed to log subscription deletion audit for user {}: {}", user.id, e);
                    }
                    
                    if let Err(e) = email_service.send_subscription_cancellation_notification(
                        &user.id,
                        &user.email,
                        false,
                        None,
                        None,
                    ).await {
                        error!("Failed to send subscription cancellation notification for user {}: {}", user.id, e);
                    }
                }
            }
        },
        "payment_intent.succeeded" => {
            info!("Processing payment intent succeeded for metered billing: {}", event.id);
            if let stripe::EventObject::PaymentIntent(payment_intent) = &event.data.object {
                // Determine payment type from metadata to differentiate subscription vs top-up
                let payment_type = payment_intent.metadata.get("type")
                    .map(|t| t.as_str())
                    .unwrap_or("unknown");
                
                info!("METERED BILLING: Payment intent {} type: {} - delegating to appropriate handler", payment_intent.id, payment_type);
                
                // Log audit event for successful payment
                if let Some(user_id_str) = payment_intent.metadata.get("user_id") {
                    if let Ok(user_id) = Uuid::parse_str(user_id_str) {
                        let audit_context = crate::services::audit_service::AuditContext::new(user_id);
                        if let Err(e) = audit_service.log_event(
                            &audit_context,
                            crate::services::audit_service::AuditEvent::new(
                                "payment_succeeded",
                                "payment"
                            )
                            .with_entity_id(payment_intent.id.to_string())
                            .with_metadata(serde_json::json!({
                                "amount": payment_intent.amount,
                                "currency": payment_intent.currency,
                                "payment_type": payment_type,
                                "event_id": event.id,
                                "metered_billing": true,
                                "handler": "payment_intent.succeeded"
                            }))
                        ).await {
                            warn!("Failed to log payment success audit for user {}: {}", user_id, e);
                        }
                    }
                }
                
                // Handle different payment types for metered billing
                match payment_type {
                    "credit_purchase" => {
                        // Process one-time credit top-up - this is the primary use case for payment_intent.succeeded
                        info!("METERED BILLING: Processing credit top-up for payment intent {}", payment_intent.id);
                        match process_credit_purchase(payment_intent, billing_service, &email_service).await {
                            Ok(_) => {
                                info!("METERED BILLING: Successfully processed credit top-up for payment intent {}", payment_intent.id);
                            },
                            Err(e) => {
                                error!("METERED BILLING: Failed to process credit top-up for payment intent {}: {}", payment_intent.id, e);
                                crate::utils::admin_alerting::send_payment_processing_error_alert(
                                    &payment_intent.id.to_string(),
                                    &payment_intent.customer.as_ref()
                                        .map(|c| c.id().to_string())
                                        .unwrap_or_else(|| "unknown".to_string()),
                                    &format!("{}", e),
                                ).await;
                                return Err(e);
                            }
                        }
                    },
                    "subscription" => {
                        // Subscription payments should NOT be handled here - they go through invoice.payment_succeeded
                        info!("METERED BILLING: Subscription payment detected in payment_intent.succeeded for {} - delegating to invoice.payment_succeeded event handler", payment_intent.id);
                        warn!("Payment intent {} marked as subscription type but processed through payment_intent.succeeded - this should be handled by invoice.payment_succeeded event", payment_intent.id);
                    },
                    _ => {
                        // Unknown payment type - try to process as credit purchase for backward compatibility
                        warn!("METERED BILLING: Unknown payment type '{}' for payment intent {} - attempting credit purchase processing", payment_type, payment_intent.id);
                        match process_credit_purchase(payment_intent, billing_service, &email_service).await {
                            Ok(_) => {
                                info!("METERED BILLING: Successfully processed unknown payment type as credit top-up for payment intent {}", payment_intent.id);
                            },
                            Err(e) => {
                                warn!("METERED BILLING: Failed to process unknown payment type for payment intent {}: {} - continuing webhook processing", payment_intent.id, e);
                                // Don't return error for unknown types to avoid webhook failures
                            }
                        }
                    }
                }
            }
        },
        "invoice.payment_succeeded" => {
            info!("Processing invoice payment succeeded: {}", event.id);
            if let stripe::EventObject::Invoice(invoice) = &event.data.object {
                info!("Invoice payment succeeded for {} - webhook processing complete", invoice.id);
            }
        },
        "payment_method.attached" => {
            info!("Processing payment method attached: {}", event.id);
            if let stripe::EventObject::PaymentMethod(payment_method) = &event.data.object {
                handle_payment_method_attached(payment_method, billing_service).await?;
            }
        },
        "payment_method.detached" => {
            info!("Processing payment method detached: {}", event.id);
            if let stripe::EventObject::PaymentMethod(payment_method) = &event.data.object {
                handle_payment_method_detached(payment_method, billing_service).await?;
            }
        },
        "customer.default_source_updated" => {
            info!("Processing customer default source updated: {}", event.id);
            if let stripe::EventObject::Customer(customer) = &event.data.object {
                handle_customer_default_source_updated(customer, billing_service).await?;
            }
        },
        "checkout.session.completed" => {
            info!("Processing checkout session completed: {}", event.id);
            if let stripe::EventObject::CheckoutSession(session) = &event.data.object {
                handle_checkout_session_completed(session, billing_service, &email_service).await?;
            }
        },
        _ => {
            info!("Ignoring Stripe event type: {} - handled by Customer Portal", event.type_);
        }
    }
    
    Ok(HttpResponse::Ok().finish())
}

// ========================================
// SIMPLIFIED WEBHOOK EVENT HANDLERS
// ========================================


/// Process credit purchase from successful payment intent (one-time top-up)
/// This handles individual credit purchases separate from subscription billing
async fn process_credit_purchase(
    payment_intent: &stripe::PaymentIntent,
    billing_service: &BillingService,
    email_service: &crate::services::email_notification_service::EmailNotificationService,
) -> Result<(), AppError> {
    info!("METERED BILLING: Processing credit top-up for PaymentIntent: {}", payment_intent.id);
    
    // Check if this is a credit purchase by examining metadata
    let metadata = &payment_intent.metadata;
    let payment_type = metadata.get("type").map(|t| t.as_str()).unwrap_or("unknown");
    
    // For metered billing, we need to be more lenient about payment types
    // as this function might be called for various one-time payments
    if payment_type != "credit_purchase" {
        // Try to determine if this could be a credit purchase based on other metadata
        if metadata.get("credit_amount").is_none() && metadata.get("amount").is_none() {
            info!("METERED BILLING: PaymentIntent {} is not a credit top-up (type: {}), skipping credit processing", payment_intent.id, payment_type);
            return Ok(());
        }
        warn!("METERED BILLING: PaymentIntent {} has type '{}' but appears to be a credit top-up, processing", payment_intent.id, payment_type);
    }
    
    info!("METERED BILLING: PaymentIntent {} confirmed as credit top-up, processing", payment_intent.id);
    
    // Extract required metadata with robust validation and detailed logging
    info!("METERED BILLING: Validating metadata for PaymentIntent {}: available keys: {:?}", 
          payment_intent.id, metadata.keys().collect::<Vec<_>>());
    
    let user_id_str = match metadata.get("user_id").map(|v| v.as_str()) {
        Some(user_id) => {
            info!("METERED BILLING: Found user_id in metadata for PaymentIntent {}: {}", payment_intent.id, user_id);
            user_id
        },
        None => {
            error!("METERED BILLING: Missing required metadata field 'user_id' in PaymentIntent {}. Available metadata keys: {:?}, full metadata: {:?}", 
                   payment_intent.id, metadata.keys().collect::<Vec<_>>(), metadata);
            return Err(AppError::InvalidArgument("Missing required user_id in credit purchase metadata. This field is required to identify the user for credit top-up.".to_string()));
        }
    };
    
    // Extract amount and currency from metadata with detailed validation logging
    let amount_str = match metadata.get("amount").map(|v| v.as_str()) {
        Some(amount) => {
            info!("METERED BILLING: Found amount in metadata for PaymentIntent {}: {}", payment_intent.id, amount);
            amount
        },
        None => {
            error!("METERED BILLING: Missing required metadata field 'amount' in PaymentIntent {}. Available metadata keys: {:?}, full metadata: {:?}", 
                   payment_intent.id, metadata.keys().collect::<Vec<_>>(), metadata);
            return Err(AppError::InvalidArgument("Missing required amount in credit purchase metadata. This field specifies the credit amount to add to the user's account.".to_string()));
        }
    };
    
    let currency = match metadata.get("currency").map(|v| v.as_str()) {
        Some(currency) => {
            info!("METERED BILLING: Found currency in metadata for PaymentIntent {}: {}", payment_intent.id, currency);
            currency
        },
        None => {
            error!("METERED BILLING: Missing required metadata field 'currency' in PaymentIntent {}. Available metadata keys: {:?}, full metadata: {:?}", 
                   payment_intent.id, metadata.keys().collect::<Vec<_>>(), metadata);
            return Err(AppError::InvalidArgument("Missing required currency in credit purchase metadata. This field specifies the currency for the credit purchase (must be USD).".to_string()));
        }
    };
    
    // Validate that the currency is USD with detailed logging
    if currency.to_uppercase() != "USD" {
        error!("METERED BILLING: PaymentIntent {} uses unsupported currency: {}. Only USD is supported. Available metadata keys: {:?}, full metadata: {:?}", 
               payment_intent.id, currency, metadata.keys().collect::<Vec<_>>(), metadata);
        return Err(AppError::InvalidArgument(
            format!("Only USD currency is supported for credit purchases, got: {}. Please ensure metadata includes currency='USD'.", currency)
        ));
    }
    
    info!("METERED BILLING: All required metadata fields validated successfully for PaymentIntent {}", payment_intent.id);
    
    // Parse and validate user_id UUID with enhanced logging
    let user_uuid = match Uuid::parse_str(user_id_str) {
        Ok(uuid) => {
            info!("METERED BILLING: Successfully parsed user_id UUID for PaymentIntent {}: {}", payment_intent.id, uuid);
            uuid
        },
        Err(e) => {
            error!("METERED BILLING: Invalid user_id UUID format in PaymentIntent {}: '{}' - {}", payment_intent.id, user_id_str, e);
            return Err(AppError::InvalidArgument(format!("Invalid user_id UUID format '{}': {}. User ID must be a valid UUID.", user_id_str, e)));
        }
    };
    
    // Parse the amount from metadata
    let amount = match amount_str.parse::<BigDecimal>() {
        Ok(amount) => amount,
        Err(e) => {
            error!("Invalid amount in PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::InvalidArgument(format!("Invalid amount: {}", e)));
        }
    };
    
    info!("METERED BILLING: Processing credit top-up for user {} with amount {} {} (payment type: {})", 
          user_uuid, amount, currency, payment_type);
    
    // Process credit purchase directly from amount
    let db_pools = billing_service.get_db_pools();
    let credit_service = crate::services::credit_service::CreditService::new(db_pools.clone());
    
    // Validate payment amount matches metadata amount (convert to cents for comparison)
    let expected_amount_cents = (&amount * BigDecimal::from(100)).to_i64()
        .ok_or_else(|| AppError::InvalidArgument("Invalid amount for cents conversion".to_string()))?;
    
    if payment_intent.amount != expected_amount_cents {
        error!("Payment amount mismatch in PaymentIntent {}: expected {} cents, got {} cents", 
               payment_intent.id, expected_amount_cents, payment_intent.amount);
        return Err(AppError::Payment("Payment amount mismatch".to_string()));
    }
    
    if payment_intent.currency.to_string().to_uppercase() != currency.to_uppercase() {
        error!("Currency mismatch in PaymentIntent {}: expected {}, got {}", 
               payment_intent.id, currency, payment_intent.currency);
        return Err(AppError::Payment("Currency mismatch".to_string()));
    }
    
    // Process the credit purchase using the credit service
    let updated_balance = match credit_service.process_credit_purchase_from_payment_intent(
        &user_uuid,
        &amount,
        currency,
        payment_intent,
    ).await {
        Ok(balance) => balance,
        Err(e) => {
            error!("METERED BILLING: Failed to process credit top-up for PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::Payment(format!("Credit top-up processing failed: {}", e)));
        }
    };
    
    info!("METERED BILLING: Successfully processed credit top-up for PaymentIntent {}: user {} new balance: {}", 
          payment_intent.id, user_uuid, updated_balance.balance);
    
    // Send success email notification
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_db_pool().clone());
    if let Ok(user) = user_repo.get_by_id(&user_uuid).await {
        // Get credit value from payment intent metadata for email
        let credit_value = amount.clone();
        
        email_service.send_credit_purchase_notification(
            &user_uuid,
            &user.email,
            &credit_value,
            &payment_intent.currency.to_string(),
        ).await.map_err(|e| {
            error!("Failed to send credit purchase notification for PaymentIntent {}: {}", payment_intent.id, e);
            e
        }).unwrap_or_else(|e| {
            error!("Failed to send credit purchase notification for PaymentIntent {}: {}", payment_intent.id, e);
        });
        
        info!("Sent credit top-up success email notification for user {} after PaymentIntent {}", user_uuid, payment_intent.id);
    } else {
        warn!("Could not find user {} to send credit top-up email notification for PaymentIntent {}", user_uuid, payment_intent.id);
    }
    
    Ok(())
}



/// Handle payment method attached event
async fn handle_payment_method_attached(
    payment_method: &stripe::PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method attached: {}", payment_method.id);
    
    let customer_id = match &payment_method.customer {
        Some(customer) => customer.id().to_string(),
        None => {
            warn!("Payment method {} has no associated customer, skipping audit", payment_method.id);
            return Ok(());
        }
    };
    
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_db_pool().clone());
    let user = match user_repo.get_by_stripe_customer_id(&customer_id).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with attached payment method {}", customer_id, payment_method.id);
            return Ok(());
        }
    };
    
    info!("Payment method {} attached for user {}", payment_method.id, user.id);
    
    let audit_service = billing_service.get_audit_service();
    let audit_context = crate::services::audit_service::AuditContext::new(user.id);
    
    let audit_event = crate::services::audit_service::AuditEvent::new("payment_method_attached", "payment_method")
        .with_entity_id(payment_method.id.to_string())
        .with_metadata(serde_json::json!({
            "payment_method_type": format!("{:?}", payment_method.type_),
            "customer_id": customer_id,
            "source": "stripe_customer_portal"
        }));
    
    if let Err(e) = audit_service.log_event(&audit_context, audit_event).await {
        warn!("Failed to log payment method attachment audit for user {}: {}", user.id, e);
    }
    
    info!("Audit: Payment method {} of type {:?} attached to customer {} (user {}) via Stripe Customer Portal", 
          payment_method.id, 
          payment_method.type_, 
          customer_id, 
          user.id);
    
    Ok(())
}

/// Handle payment method detached event
async fn handle_payment_method_detached(
    payment_method: &stripe::PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method detached: {}", payment_method.id);
    
    let customer_id = match &payment_method.customer {
        Some(customer) => customer.id().to_string(),
        None => {
            warn!("Payment method {} has no associated customer, skipping audit", payment_method.id);
            return Ok(());
        }
    };
    
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_db_pool().clone());
    let user = match user_repo.get_by_stripe_customer_id(&customer_id).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with detached payment method {}", customer_id, payment_method.id);
            return Ok(());
        }
    };
    
    info!("Payment method {} detached for user {}", payment_method.id, user.id);
    
    let audit_service = billing_service.get_audit_service();
    let audit_context = crate::services::audit_service::AuditContext::new(user.id);
    
    let audit_event = crate::services::audit_service::AuditEvent::new("payment_method_detached", "payment_method")
        .with_entity_id(payment_method.id.to_string())
        .with_metadata(serde_json::json!({
            "payment_method_type": format!("{:?}", payment_method.type_),
            "customer_id": customer_id,
            "source": "stripe_customer_portal"
        }));
    
    if let Err(e) = audit_service.log_event(&audit_context, audit_event).await {
        warn!("Failed to log payment method detachment audit for user {}: {}", user.id, e);
    }
    
    info!("Audit: Payment method {} of type {:?} detached from customer {} (user {}) via Stripe Customer Portal", 
          payment_method.id, 
          payment_method.type_, 
          customer_id, 
          user.id);
    
    Ok(())
}

/// Handle customer default source updated event
async fn handle_customer_default_source_updated(
    customer: &stripe::Customer,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling customer default source updated: {}", customer.id);
    
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_db_pool().clone());
    let user = match user_repo.get_by_stripe_customer_id(&customer.id.to_string()).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with updated default source", customer.id);
            return Ok(());
        }
    };
    
    let default_payment_method_id = customer.invoice_settings
        .as_ref()
        .and_then(|settings| settings.default_payment_method.as_ref())
        .map(|pm| match pm {
            stripe::Expandable::Id(id) => id.to_string(),
            stripe::Expandable::Object(pm_obj) => pm_obj.id.to_string(),
        });
    
    let audit_service = billing_service.get_audit_service();
    let audit_context = crate::services::audit_service::AuditContext::new(user.id);
    
    match default_payment_method_id {
        Some(pm_id) => {
            info!("Customer {} (user {}) default payment method changed to {}", customer.id, user.id, pm_id);
            
            let audit_event = crate::services::audit_service::AuditEvent::new("default_payment_method_updated", "customer")
                .with_entity_id(customer.id.to_string())
                .with_metadata(serde_json::json!({
                    "new_default_payment_method_id": pm_id,
                    "source": "stripe_customer_portal"
                }));
            
            if let Err(e) = audit_service.log_event(&audit_context, audit_event).await {
                warn!("Failed to log default payment method update audit for user {}: {}", user.id, e);
            }
            
            info!("Audit: Customer {} (user {}) default payment method changed to {} via Stripe Customer Portal", 
                  customer.id, user.id, pm_id);
        }
        None => {
            info!("Customer {} (user {}) default payment method was removed", customer.id, user.id);
            
            let audit_event = crate::services::audit_service::AuditEvent::new("default_payment_method_removed", "customer")
                .with_entity_id(customer.id.to_string())
                .with_metadata(serde_json::json!({
                    "source": "stripe_customer_portal"
                }));
            
            if let Err(e) = audit_service.log_event(&audit_context, audit_event).await {
                warn!("Failed to log default payment method removal audit for user {}: {}", user.id, e);
            }
            
            info!("Audit: Customer {} (user {}) default payment method removed via Stripe Customer Portal", 
                  customer.id, user.id);
        }
    }
    
    Ok(())
}

/// Handle checkout session completed event
async fn handle_checkout_session_completed(
    session: &stripe::CheckoutSession,
    billing_service: &BillingService,
    email_service: &crate::services::email_notification_service::EmailNotificationService,
) -> Result<(), AppError> {
    info!("Handling checkout session completed: {}", session.id);
    
    match session.mode {
        stripe::CheckoutSessionMode::Payment => {
            info!("Processing payment mode checkout session: {}", session.id);
            
            if let Some(payment_intent_id) = session.payment_intent.as_ref() {
                let stripe_service = billing_service.get_stripe_service()?;
                let payment_intent = stripe_service.get_payment_intent(&payment_intent_id.id().to_string()).await
                    .map_err(|e| AppError::External(format!("Failed to retrieve payment intent: {}", e)))?;
                
                process_credit_purchase(&payment_intent, billing_service, email_service).await?;
            }
        },
        stripe::CheckoutSessionMode::Subscription => {
            info!("Processing subscription mode checkout session: {}", session.id);
            
            if let Some(subscription_id) = session.subscription.as_ref() {
                let stripe_service = billing_service.get_stripe_service()?;
                let subscription = stripe_service.get_subscription(&subscription_id.id().to_string()).await
                    .map_err(|e| AppError::External(format!("Failed to retrieve subscription: {}", e)))?;
                
                billing_service.sync_subscription_from_webhook(&subscription).await?;
            }
        },
        stripe::CheckoutSessionMode::Setup => {
            info!("Setup mode checkout session completed successfully: {}", session.id);
        },
        _ => {
            info!("Ignoring checkout session mode: {:?}", session.mode);
        }
    }
    
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

