use actix_web::{web, HttpResponse, post, HttpRequest};
use std::sync::Arc;
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::db::repositories::webhook_idempotency_repository::WebhookIdempotencyRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::{CreditTransactionRepository, CreditTransaction};
use crate::db::repositories::user_repository::UserRepository;
use uuid::Uuid;
use log::{error, info, warn};
use chrono::Utc;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};
use crate::stripe_types::*;
use crate::stripe_types::enums::*;
use serde::{Deserialize, Serialize};


/// Handle Stripe webhook events with enhanced security
#[post("/stripe")]
pub async fn stripe_webhook(
    req: HttpRequest,
    body: web::Bytes,
    billing_service: web::Data<Arc<BillingService>>,
    app_state: web::Data<crate::models::runtime_config::AppState>,
) -> Result<HttpResponse, AppError> {
    // Step 1: Extract Stripe-Signature header
    let stripe_signature = req.headers()
        .get("Stripe-Signature")
        .ok_or_else(|| {
            error!("Missing Stripe-Signature header in webhook request");
            AppError::BadRequest("Missing Stripe-Signature header".to_string())
        })?
        .to_str()
        .map_err(|e| {
            error!("Invalid Stripe-Signature header encoding: {}", e);
            AppError::BadRequest("Invalid Stripe-Signature header".to_string())
        })?;
    
    // Step 2: Get raw request body as string for signature verification
    let body_str = std::str::from_utf8(&body)
        .map_err(|e| {
            error!("Invalid UTF-8 in webhook body: {}", e);
            AppError::BadRequest("Invalid webhook body encoding".to_string())
        })?;
    
    // Step 3: Use StripeService to verify signature and construct event
    let stripe_service = billing_service.get_stripe_service()
        .map_err(|e| {
            error!("Failed to get stripe service: {}", e);
            AppError::Configuration(format!("Failed to get stripe service: {}", e))
        })?;
    
    // Verify webhook signature and construct event using the secure construct_event method
    let event = stripe_service.construct_event(body_str, stripe_signature)
        .map_err(|e| {
            error!("Stripe webhook signature verification failed: {}", e);
            // Return 400 Bad Request for signature verification failures
            AppError::BadRequest(format!("Invalid webhook signature: {}", e))
        })?;
    
    info!("Successfully verified Stripe webhook signature for event {} (type: {})", 
          event.id, event.type_);

    // Step 4: Idempotency check before processing
    let webhook_repo = WebhookIdempotencyRepository::new(billing_service.get_system_db_pool());
    let worker_id = format!("webhook-handler-{}", uuid::Uuid::new_v4().to_string()[..8].to_string());
    
    // Check if event was already processed
    match webhook_repo.get_by_event_id(&event.id).await? {
        Some(record) => {
            match record.status.as_str() {
                "completed" => {
                    info!("Webhook event {} already processed successfully, returning 200 OK", event.id);
                    return Ok(HttpResponse::Ok().finish());
                }
                "processing" => {
                    // Check if lock is still valid
                    if let Some(lock_expires) = record.lock_expires_at {
                        if lock_expires > Utc::now() {
                            info!("Webhook event {} is currently being processed by {}, returning 200 OK", 
                                  event.id, record.locked_by.unwrap_or_default());
                            return Ok(HttpResponse::Ok().finish());
                        }
                    }
                    // Lock expired, we can try to acquire it
                }
                "failed" => {
                    // Check if we should retry
                    if record.retry_count >= record.max_retries {
                        warn!("Webhook event {} has permanently failed, returning 200 OK to prevent retries", event.id);
                        return Ok(HttpResponse::Ok().finish());
                    }
                    // Otherwise, we'll try to process it again
                }
                _ => {}
            }
        }
        None => {
            // New event, will be created when we acquire the lock
        }
    }
    
    // Try to acquire lock for processing
    let _webhook_record = match webhook_repo.acquire_webhook_lock(
        &event.id,
        "stripe",
        &event.type_,
        &worker_id,
        5, // 5 minute lock duration
        Some(serde_json::json!({
            "stripe_event_id": event.id,
            "stripe_event_type": event.type_,
            "created": event.created,
            "livemode": event.livemode,
            "api_version": event.api_version,
            "signature_verified": true,
            "worker_id": worker_id
        }))
    ).await {
        Ok(record) => {
            info!("Acquired lock for webhook event {} (worker: {})", event.id, worker_id);
            record
        }
        Err(e) => {
            error!("Failed to acquire lock for webhook event {}: {}", event.id, e);
            // Return 200 OK to prevent Stripe from retrying
            return Ok(HttpResponse::Ok().finish());
        }
    };
    
    // Step 5: Process the event
    match process_stripe_webhook_event(&event, &billing_service, &app_state).await {
        Ok(response) => {
            // Mark as completed
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
            error!("Failed to process webhook event {} (type: {}): {}", event.id, event.type_, error_message);
            
            // Send admin alert
            crate::utils::admin_alerting::send_stripe_webhook_failure_alert(
                &event.id,
                &error_message,
                &event.type_,
            ).await;
            
            let should_retry = !is_permanent_error(&e);
            
            if should_retry {
                // Release lock and schedule retry
                if let Err(mark_error) = webhook_repo.release_webhook_lock_with_failure(
                    &event.id,
                    &error_message,
                    5, // Retry in 5 minutes
                    Some(serde_json::json!({
                        "failed_at": Utc::now().to_rfc3339(),
                        "error": error_message,
                        "worker_id": worker_id,
                        "will_retry": true
                    }))
                ).await {
                    warn!("Failed to schedule retry for webhook event {}: {}", event.id, mark_error);
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
                }
            }
            
            // Always return 200 OK to prevent Stripe from retrying
            // We handle our own retry logic
            Ok(HttpResponse::Ok().finish())
        }
    }
}

async fn process_stripe_webhook_event(
    event: &Event,
    billing_service: &BillingService,
    _app_state: &crate::models::runtime_config::AppState,
) -> Result<HttpResponse, AppError> {
    let db_pools = billing_service.get_db_pools();
    let email_service = crate::services::email_notification_service::EmailNotificationService::new(db_pools.clone())?;
    let audit_service = billing_service.get_audit_service();
    
    // Get credit service for metered billing operations  
    let _credit_service = billing_service.get_credit_service();
    info!("Processing Stripe webhook event {} of type {}", event.id, event.type_);

    match event.type_.as_str() {
        EVENT_PAYMENT_INTENT_SUCCEEDED => {
            info!("Processing payment intent succeeded: {}", event.id);
            // Parse payment intent from event data
            let payment_intent: PaymentIntent = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse payment intent: {}", e)))?;
            
            // Determine payment type from metadata to differentiate credit purchase types
            let payment_type = payment_intent.metadata.as_ref()
                .and_then(|metadata| metadata.get("type"))
                .map(|t| t.as_str())
                .unwrap_or("unknown");
            
            info!("Payment intent {} type: {} - processing", payment_intent.id, payment_type);
            
            // Log audit event for successful payment (excluding credit purchases, which have their own specific audit logging)
            if payment_type != "credit_purchase" {
                if let Some(metadata) = &payment_intent.metadata {
                    if let Some(user_id_str) = metadata.get("user_id") {
                        if let Ok(user_id) = Uuid::parse_str(user_id_str) {
                            let audit_context = crate::services::audit_service::AuditContext::new(user_id);
                            if let Err(e) = audit_service.log_event(
                                &audit_context,
                                crate::services::audit_service::AuditEvent::new(
                                    "payment_succeeded",
                                    "payment"
                                )
                                .with_entity_id(payment_intent.id.clone())
                                .with_metadata(serde_json::json!({
                                    "amount": payment_intent.amount,
                                    "currency": payment_intent.currency,
                                    "payment_type": payment_type,
                                    "event_id": event.id,
                                    "handler": "payment_intent.succeeded"
                                }))
                            ).await {
                                warn!("Failed to log payment success audit for user {}: {}", user_id, e);
                            }
                        }
                    }
                }
            }
            
            match payment_type {
                "credit_purchase" => {
                    let user_id_str = payment_intent.metadata.as_ref()
                        .and_then(|metadata| metadata.get("user_id"))
                        .map(|v| v.as_str()).unwrap_or("unknown");
                    let amount = payment_intent.metadata.as_ref()
                        .and_then(|metadata| metadata.get("amount")
                            .or_else(|| metadata.get("credit_amount")))
                        .map(|v| v.as_str()).unwrap_or("unknown");
                    
                    info!("Processing credit purchase for payment intent {} - user_id: {}, amount: {}", 
                          payment_intent.id, user_id_str, amount);
                    
                    match process_credit_purchase(&payment_intent, billing_service, &email_service).await {
                        Ok(_) => {
                            info!("Successfully processed credit purchase for payment intent {} - user_id: {}, amount: {}", 
                                  payment_intent.id, user_id_str, amount);
                        },
                        Err(e) => {
                            error!("Failed to process credit purchase for payment intent {} - user_id: {}, amount: {} - Error: {}", 
                                   payment_intent.id, user_id_str, amount, e);
                            crate::utils::admin_alerting::send_payment_processing_error_alert(
                                &payment_intent.id,
                                &payment_intent.customer.clone().unwrap_or_else(|| "unknown".to_string()),
                                &format!("{}", e),
                            ).await;
                            return Err(e);
                        }
                    }
                },
                _ => {
                    warn!("Unknown payment type '{}' for payment intent {} - attempting credit purchase processing", payment_type, payment_intent.id);
                    match process_credit_purchase(&payment_intent, billing_service, &email_service).await {
                        Ok(_) => {
                            info!("Successfully processed unknown payment type as credit purchase for payment intent {}", payment_intent.id);
                        },
                        Err(e) => {
                            warn!("Failed to process unknown payment type for payment intent {}: {} - continuing webhook processing", payment_intent.id, e);
                        }
                    }
                }
            }
        },
        EVENT_INVOICE_PAYMENT_SUCCEEDED => {
            info!("Processing invoice.payment_succeeded for event {}", event.id);
            let invoice: Invoice = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse invoice: {}", e)))?;
            handle_invoice_payment_succeeded(&invoice, billing_service).await?;
        },
        EVENT_PAYMENT_METHOD_ATTACHED => {
            info!("Processing payment method attached: {}", event.id);
            let payment_method: PaymentMethod = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse payment method: {}", e)))?;
            handle_payment_method_attached(&payment_method, billing_service).await?;
        },
        EVENT_PAYMENT_METHOD_DETACHED => {
            info!("Processing payment method detached: {}", event.id);
            let payment_method: PaymentMethod = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse payment method: {}", e)))?;
            handle_payment_method_detached(&payment_method, billing_service).await?;
        },
        EVENT_CUSTOMER_DEFAULT_SOURCE_UPDATED => {
            info!("Processing customer default source updated: {}", event.id);
            let customer: Customer = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse customer: {}", e)))?;
            handle_customer_default_source_updated(&customer, billing_service).await?;
        },
        EVENT_CHECKOUT_SESSION_COMPLETED => {
            info!("Processing checkout session completed: {}", event.id);
            let session: CheckoutSession = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse checkout session: {}", e)))?;
            handle_checkout_session_completed(&session, billing_service, &email_service).await?;
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
/// This handles individual credit purchases for the credit-based billing system
async fn process_credit_purchase(
    payment_intent: &PaymentIntent,
    billing_service: &BillingService,
    email_service: &crate::services::email_notification_service::EmailNotificationService,
) -> Result<(), AppError> {
    info!("Processing credit purchase for PaymentIntent: {}", payment_intent.id);
    
    // Check if this is a credit purchase by examining metadata
    let metadata = payment_intent.metadata.as_ref();
    let payment_type = metadata
        .and_then(|m| m.get("type"))
        .map(|t| t.as_str())
        .unwrap_or("unknown");
    
    if payment_type != "credit_purchase" {
        if metadata.map_or(true, |m| m.get("credit_amount").is_none() && m.get("amount").is_none()) {
            info!("PaymentIntent {} is not a credit purchase (type: {}), skipping credit processing", payment_intent.id, payment_type);
            return Ok(());
        }
        warn!("PaymentIntent {} has type '{}' but appears to be a credit purchase, processing", payment_intent.id, payment_type);
    }
    
    info!("PaymentIntent {} confirmed as credit purchase, processing", payment_intent.id);
    
    let metadata = metadata.ok_or_else(|| {
        error!("Missing metadata in PaymentIntent {}", payment_intent.id);
        AppError::InvalidArgument("Missing metadata in credit purchase payment intent".to_string())
    })?;
    
    info!("Validating metadata for PaymentIntent {}: available keys: {:?}", 
          payment_intent.id, metadata.keys().collect::<Vec<_>>());
    
    let user_id_str = match metadata.get("user_id").map(|v| v.as_str()) {
        Some(user_id) => {
            info!("Found user_id in metadata for PaymentIntent {}: {}", payment_intent.id, user_id);
            user_id
        },
        None => {
            error!("Missing required metadata field 'user_id' in PaymentIntent {}. Available metadata keys: {:?}, full metadata: {:?}", 
                   payment_intent.id, metadata.keys().collect::<Vec<_>>(), metadata);
            return Err(AppError::InvalidArgument("Missing required user_id in credit purchase metadata. This field is required to identify the user for credit top-up.".to_string()));
        }
    };
    
    // Extract amounts from metadata - prefer new fields, fallback to legacy
    let (gross_amount_str, fee_amount_str, net_amount_str) = if let (Some(gross), Some(fee), Some(net)) = 
        (metadata.get("gross_amount").map(|v| v.as_str()),
         metadata.get("fee_amount").map(|v| v.as_str()),
         metadata.get("net_amount").map(|v| v.as_str())) {
        info!("Found tiered fee metadata for PaymentIntent {}: gross={}, fee={}, net={}", 
              payment_intent.id, gross, fee, net);
        (gross, fee, net)
    } else {
        // Fallback to legacy amount field
        let amount_str = match metadata.get("amount").map(|v| v.as_str()) {
            Some(amount) => {
                info!("Found legacy amount in metadata for PaymentIntent {}: {}", payment_intent.id, amount);
                amount
            },
            None => {
                // Try to extract amount from credit_amount for backward compatibility
                match metadata.get("credit_amount").map(|v| v.as_str()) {
                    Some(credit_amount) => {
                        info!("Found credit_amount in metadata for PaymentIntent {} (fallback): {}", payment_intent.id, credit_amount);
                        credit_amount
                    },
                    None => {
                        error!("Missing required metadata field 'amount' or 'credit_amount' in PaymentIntent {}. Available metadata keys: {:?}, full metadata: {:?}", 
                               payment_intent.id, metadata.keys().collect::<Vec<_>>(), metadata);
                        return Err(AppError::InvalidArgument("Missing required amount in credit purchase metadata. This field specifies the credit amount to add to the user's account.".to_string()));
                    }
                }
            }
        };
        
        // For legacy, gross = net = amount (no fees)
        (amount_str, "0", amount_str)
    };
    
    let currency = match metadata.get("currency").map(|v| v.as_str()) {
        Some(currency) => {
            info!("Found currency in metadata for PaymentIntent {}: {}", payment_intent.id, currency);
            currency
        },
        None => {
            error!("Missing required metadata field 'currency' in PaymentIntent {}. Available metadata keys: {:?}, full metadata: {:?}", 
                   payment_intent.id, metadata.keys().collect::<Vec<_>>(), metadata);
            return Err(AppError::InvalidArgument("Missing required currency in credit purchase metadata. This field specifies the currency for the credit purchase (must be USD).".to_string()));
        }
    };
    
    // Validate that the currency is USD with detailed logging
    if currency.to_uppercase() != "USD" {
        error!("PaymentIntent {} uses unsupported currency: {}. Only USD is supported. Available metadata keys: {:?}, full metadata: {:?}", 
               payment_intent.id, currency, metadata.keys().collect::<Vec<_>>(), metadata);
        return Err(AppError::InvalidArgument(
            format!("Only USD currency is supported for credit purchases, got: {}. Please ensure metadata includes currency='USD'.", currency)
        ));
    }
    
    info!("All required metadata fields validated successfully for PaymentIntent {}", payment_intent.id);
    
    // Parse and validate user_id UUID with enhanced logging
    let user_uuid = match Uuid::parse_str(user_id_str) {
        Ok(uuid) => {
            info!("Successfully parsed user_id UUID for PaymentIntent {}: {}", payment_intent.id, uuid);
            uuid
        },
        Err(e) => {
            error!("Invalid user_id UUID format in PaymentIntent {}: '{}' - {}", payment_intent.id, user_id_str, e);
            return Err(AppError::InvalidArgument(format!("Invalid user_id UUID format '{}': {}. User ID must be a valid UUID.", user_id_str, e)));
        }
    };
    
    // Parse the amounts from metadata
    let gross_amount = match gross_amount_str.parse::<BigDecimal>() {
        Ok(amount) => amount,
        Err(e) => {
            error!("Invalid gross_amount in PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::InvalidArgument(format!("Invalid gross_amount: {}", e)));
        }
    };
    
    let fee_amount = match fee_amount_str.parse::<BigDecimal>() {
        Ok(amount) => amount,
        Err(e) => {
            error!("Invalid fee_amount in PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::InvalidArgument(format!("Invalid fee_amount: {}", e)));
        }
    };
    
    let net_amount = match net_amount_str.parse::<BigDecimal>() {
        Ok(amount) => amount,
        Err(e) => {
            error!("Invalid net_amount in PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::InvalidArgument(format!("Invalid net_amount: {}", e)));
        }
    };
    
    info!("Processing credit purchase for user {} with gross_amount {} {} (fee: {}, net: {}) (payment type: {})", 
          user_uuid, gross_amount, currency, fee_amount, net_amount, payment_type);
    
    // Process credit purchase directly from amount
    let db_pools = billing_service.get_db_pools();
    let credit_service = crate::services::credit_service::CreditService::new(db_pools.clone());
    
    // Validate payment amount matches gross amount (convert to cents for comparison)
    let expected_amount_cents = (&gross_amount * BigDecimal::from(100)).to_i64()
        .ok_or_else(|| AppError::InvalidArgument("Invalid gross amount for cents conversion".to_string()))?;
    
    if payment_intent.amount != expected_amount_cents {
        error!("Payment amount mismatch in PaymentIntent {}: expected {} cents, got {} cents", 
               payment_intent.id, expected_amount_cents, payment_intent.amount);
        return Err(AppError::Payment("Payment amount mismatch".to_string()));
    }
    
    if payment_intent.currency.to_uppercase() != currency.to_uppercase() {
        error!("Currency mismatch in PaymentIntent {}: expected {}, got {}", 
               payment_intent.id, currency, payment_intent.currency);
        return Err(AppError::Payment("Currency mismatch".to_string()));
    }
    
    // Create audit context for the credit purchase
    let audit_context = AuditContext::new(user_uuid);
    
    // Serialize payment intent metadata
    let metadata_json = serde_json::to_value(&payment_intent.metadata)
        .map_err(|e| AppError::InvalidArgument(format!("Failed to serialize payment intent metadata: {}", e)))?;
    
    // Process the credit purchase using the credit service
    let updated_balance = match credit_service.record_credit_purchase(
        &user_uuid,
        &gross_amount,
        &fee_amount,
        currency,
        &payment_intent.id,
        metadata_json,
        &audit_context,
    ).await {
        Ok(balance) => balance,
        Err(AppError::AlreadyExists(_)) => {
            info!("Credit purchase for payment intent {} was already processed (duplicate), returning current balance", payment_intent.id);
            // Return current balance for idempotent response
            billing_service.get_credit_service().get_user_balance(&user_uuid).await
                .map_err(|e| AppError::Payment(format!("Failed to get current balance after duplicate detection: {}", e)))?
        },
        Err(e) => {
            error!("Failed to process credit purchase for PaymentIntent {}: {}", payment_intent.id, e);
            return Err(AppError::Payment(format!("Credit purchase processing failed: {}", e)));
        }
    };
    
    info!("Successfully processed credit purchase for PaymentIntent {}: user {} new balance: {}", 
          payment_intent.id, user_uuid, updated_balance.balance);
    
    // Send success email notification
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_system_db_pool());
    if let Ok(user) = user_repo.get_by_id(&user_uuid).await {
        email_service.send_credit_purchase_notification(
            &user_uuid,
            &user.email,
            &net_amount,
            &payment_intent.currency,
        ).await.map_err(|e| {
            error!("Failed to send credit purchase notification for PaymentIntent {}: {}", payment_intent.id, e);
            e
        }).unwrap_or_else(|e| {
            error!("Failed to send credit purchase notification for PaymentIntent {}: {}", payment_intent.id, e);
        });
        
        info!("Sent credit purchase success email notification for user {} after PaymentIntent {}", user_uuid, payment_intent.id);
    } else {
        warn!("Could not find user {} to send credit purchase email notification for PaymentIntent {}", user_uuid, payment_intent.id);
    }
    
    Ok(())
}



/// Handle payment method attached event
async fn handle_payment_method_attached(
    payment_method: &PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method attached: {}", payment_method.id);
    
    let customer_id = match &payment_method.customer {
        Some(customer_id) => customer_id.clone(),
        None => {
            warn!("Payment method {} has no associated customer, skipping audit", payment_method.id);
            return Ok(());
        }
    };
    
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_system_db_pool());
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
        .with_entity_id(payment_method.id.clone())
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
    payment_method: &PaymentMethod,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling payment method detached: {}", payment_method.id);
    
    let customer_id = match &payment_method.customer {
        Some(customer_id) => customer_id.clone(),
        None => {
            warn!("Payment method {} has no associated customer, skipping audit", payment_method.id);
            return Ok(());
        }
    };
    
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_system_db_pool());
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
        .with_entity_id(payment_method.id.clone())
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
    customer: &Customer,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Handling customer default source updated: {}", customer.id);
    
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_system_db_pool());
    let user = match user_repo.get_by_stripe_customer_id(&customer.id).await {
        Ok(user) => user,
        Err(_) => {
            warn!("Could not find user for customer {} with updated default source", customer.id);
            return Ok(());
        }
    };
    
    let default_payment_method_id = customer.invoice_settings
        .as_ref()
        .and_then(|settings| settings.default_payment_method.as_ref())
        .map(|pm_id| pm_id.clone());
    
    let audit_service = billing_service.get_audit_service();
    let audit_context = crate::services::audit_service::AuditContext::new(user.id);
    
    match default_payment_method_id {
        Some(pm_id) => {
            info!("Customer {} (user {}) default payment method changed to {}", customer.id, user.id, pm_id);
            
            let audit_event = crate::services::audit_service::AuditEvent::new("default_payment_method_updated", "customer")
                .with_entity_id(customer.id.clone())
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
                .with_entity_id(customer.id.clone())
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
    session: &CheckoutSession,
    billing_service: &BillingService,
    email_service: &crate::services::email_notification_service::EmailNotificationService,
) -> Result<(), AppError> {
    info!("Handling checkout session completed: {}", session.id);
    
    match session.mode {
        CheckoutSessionMode::Payment => {
            info!("Processing payment mode checkout session: {}", session.id);
            
            if let Some(payment_intent_id) = session.payment_intent.as_ref() {
                let stripe_service = billing_service.get_stripe_service()?;
                let payment_intent = stripe_service.get_payment_intent(payment_intent_id).await
                    .map_err(|e| AppError::External(format!("Failed to retrieve payment intent: {}", e)))?;
                
                process_credit_purchase(&payment_intent, billing_service, &email_service).await?;
            }
        },
        CheckoutSessionMode::Setup => {
            info!("Setup mode checkout session completed successfully: {}", session.id);
        },
    }
    
    Ok(())
}

/// Handle invoice payment succeeded event for auto_topoff invoices
async fn handle_invoice_payment_succeeded(
    invoice: &Invoice,
    billing_service: &BillingService,
) -> Result<(), AppError> {
    info!("Processing invoice.payment_succeeded for invoice: {}", invoice.id);
    
    // Check if this is an auto_topoff invoice
    let invoice_type = invoice.metadata.as_ref()
        .and_then(|metadata| metadata.get("type"))
        .map(|t| t.as_str())
        .unwrap_or("unknown");
    
    if invoice_type != "auto_topoff" {
        info!("Invoice {} is not an auto_topoff invoice (type: {}), skipping processing", 
              invoice.id, invoice_type);
        return Ok(());
    }
    
    info!("Processing auto_topoff invoice: {}", invoice.id);
    
    // Extract customer ID from invoice
    let customer_id = &invoice.customer;
    info!("Found customer ID for invoice {}: {}", invoice.id, customer_id);
    
    // Find the associated application user
    let user_repo = UserRepository::new(billing_service.get_system_db_pool());
    let user = match user_repo.get_by_stripe_customer_id(customer_id).await {
        Ok(user) => {
            info!("Found user {} for customer ID {} in invoice {}", 
                  user.id, customer_id, invoice.id);
            user
        },
        Err(e) => {
            error!("Could not find user for customer ID {} in invoice {}: {}", 
                   customer_id, invoice.id, e);
            return Err(AppError::NotFound(format!(
                "User not found for customer ID {} in invoice {}", 
                customer_id, invoice.id
            )));
        }
    };
    
    // Extract charge ID (serves as idempotency key)
    let charge_id = match &invoice.charge {
        Some(charge_id) => {
            info!("Found charge ID for invoice {}: {}", invoice.id, charge_id);
            charge_id
        },
        None => {
            error!("Missing charge ID in invoice {} - cannot process payment", invoice.id);
            return Err(AppError::InvalidArgument(format!(
                "Missing charge ID in invoice {} - this is required for idempotency", 
                invoice.id
            )));
        }
    };
    
    // Extract amount paid (in cents) and convert to dollars
    let amount_paid_cents = invoice.amount_paid;
    let amount_paid_dollars = BigDecimal::from(amount_paid_cents) / BigDecimal::from(100);
    
    info!("Processing auto_topoff payment for user {} - amount: ${} (charge: {})", 
          user.id, amount_paid_dollars, charge_id);
    
    // Get currency from invoice
    let currency = &invoice.currency;
    
    // Validate currency is USD
    if currency.to_uppercase() != "USD" {
        error!("Invoice {} uses unsupported currency: {}. Only USD is supported for auto_topoff", 
               invoice.id, currency);
        return Err(AppError::InvalidArgument(format!(
            "Only USD currency is supported for auto_topoff, got: {} in invoice {}", 
            currency, invoice.id
        )));
    }
    
    // Prepare metadata for the credit transaction
    let metadata = serde_json::json!({
        "invoice_id": invoice.id,
        "charge_id": charge_id,
        "customer_id": customer_id,
        "invoice_type": invoice_type,
        "amount_paid_cents": amount_paid_cents,
        "currency": currency,
        "processed_via": "invoice.payment_succeeded_webhook"
    });
    
    info!("Recording credit purchase for auto_topoff invoice {}: user {}, amount ${}, charge {}", 
          invoice.id, user.id, amount_paid_dollars, charge_id);
    
    // Record the credit purchase
    let credit_service = billing_service.get_credit_service();
    let audit_context = AuditContext::new(user.id);
    
    // For auto-topoff, we treat the paid amount as net amount (no fees)
    let zero_fee = BigDecimal::from(0);
    
    match credit_service.record_credit_purchase(
        &user.id,
        &amount_paid_dollars,  // gross_amount (what they paid)
        &zero_fee,            // fee_amount (no fees for auto-topoff)
        currency,
        charge_id,
        metadata,
        &audit_context,
    ).await {
        Ok(updated_balance) => {
            info!("Successfully processed auto_topoff credit purchase for invoice {}: user {} new balance: ${}", 
                  invoice.id, user.id, updated_balance.balance);
        },
        Err(AppError::AlreadyExists(_)) => {
            info!("Auto_topoff credit purchase for invoice {} (charge {}) was already processed (duplicate)", 
                  invoice.id, charge_id);
        },
        Err(e) => {
            error!("Failed to record auto_topoff credit purchase for invoice {}: {}", 
                   invoice.id, e);
            return Err(AppError::Payment(format!(
                "Failed to record auto_topoff credit purchase for invoice {}: {}", 
                invoice.id, e
            )));
        }
    }
    
    info!("Successfully processed invoice.payment_succeeded for auto_topoff invoice {}", invoice.id);
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
        // AlreadyExists errors (like duplicate stripe_charge_id) are permanent but should be treated as success
        AppError::AlreadyExists(_) => true,
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

