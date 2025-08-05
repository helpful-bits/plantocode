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
use std::str::FromStr;
use crate::stripe_types::*;
use crate::stripe_types::enums::*;
use serde::{Deserialize, Serialize};
use crate::db::repositories::user_repository::User;

/// Payment completion context for different payment types
#[derive(Debug)]
enum PaymentCompletionContext {
    CreditPurchase {
        payment_intent: PaymentIntent,
        user_id: Uuid,
    },
    AutoTopOff {
        payment_intent: PaymentIntent,
        user: User,
    },
}

/// Unified payment completion processor that handles all payment types
/// Consolidates duplicated logic from process_credit_purchase, process_auto_topoff_payment, and handle_invoice_payment_succeeded
async fn process_payment_completion(
    context: PaymentCompletionContext,
    billing_service: &BillingService,
    email_service: Option<&crate::services::email_notification_service::EmailNotificationService>,
) -> Result<(), AppError> {
    match context {
        PaymentCompletionContext::CreditPurchase { payment_intent, user_id } => {
            info!("Processing credit purchase for PaymentIntent: {}", payment_intent.id);
            
            // Extract charge ID using latest_charge (Expandable)
            let charge_id = match &payment_intent.latest_charge {
                Some(expandable_charge) => {
                    match expandable_charge {
                        Expandable::Id(charge_id) => charge_id.clone(),
                        Expandable::Object(charge) => charge.id.clone()
                    }
                },
                None => {
                    return Err(AppError::InvalidArgument("Missing charge ID in payment intent".to_string()));
                }
            };
            
            // Extract amounts from metadata instead of fetching from Stripe
            let metadata = &payment_intent.metadata.as_ref()
                .ok_or_else(|| AppError::InvalidArgument("Missing metadata in payment intent".to_string()))?;
                
            let gross_amount_str = metadata.get("gross_amount")
                .ok_or_else(|| AppError::InvalidArgument("Missing gross_amount in metadata".to_string()))?;
            let platform_fee_str = metadata.get("platform_fee")
                .ok_or_else(|| AppError::InvalidArgument("Missing platform_fee in metadata".to_string()))?;
            
            let gross_amount = std::str::FromStr::from_str(gross_amount_str)
                .map_err(|_| AppError::InvalidArgument("Invalid gross_amount format".to_string()))?;
            let platform_fee = std::str::FromStr::from_str(platform_fee_str)
                .map_err(|_| AppError::InvalidArgument("Invalid platform_fee format".to_string()))?;
            
            let currency = metadata.get("currency")
                .map(|c| c.to_string())
                .unwrap_or_else(|| "USD".to_string());
            
            // Create metadata for credit purchase
            let metadata_json = serde_json::to_value(&payment_intent.metadata)
                .map_err(|e| AppError::InvalidArgument(format!("Failed to serialize metadata: {}", e)))?;
            
            // Record credit purchase
            let credit_service = billing_service.get_credit_service();
            let audit_context = AuditContext::new(user_id);
            
            record_credit_transaction(
                &credit_service,
                &user_id,
                &gross_amount,
                &platform_fee,
                &currency,
                &charge_id,
                metadata_json,
                &audit_context,
                &format!("credit purchase for payment intent {}", payment_intent.id),
            ).await?;
            
            // Send email notification for credit purchases
            if let Some(email_service) = email_service {
                send_credit_purchase_email(email_service, billing_service, &user_id, &gross_amount, &platform_fee).await;
            }
        },
        
        PaymentCompletionContext::AutoTopOff { payment_intent, user } => {
            info!("Processing auto top-off for PaymentIntent: {}", payment_intent.id);
            
            // Extract charge ID using latest_charge (same as credit purchase)
            let charge_id = match &payment_intent.latest_charge {
                Some(expandable_charge) => {
                    match expandable_charge {
                        Expandable::Id(charge_id) => charge_id.clone(),
                        Expandable::Object(charge) => charge.id.clone()
                    }
                },
                None => {
                    return Err(AppError::InvalidArgument("Missing charge data in payment intent".to_string()));
                }
            };
            
            // Common charge processing
            let (gross_amount, fee_amount, currency) = fetch_charge_amounts(billing_service, &charge_id).await?;
            
            // Create metadata for auto top-off
            let metadata = serde_json::json!({
                "payment_intent_id": payment_intent.id,
                "charge_id": charge_id,
                "customer_id": payment_intent.customer,
                "payment_type": "auto_topoff",
                "amount_charged_cents": payment_intent.amount,
                "currency": payment_intent.currency,
                "processed_via": "payment_intent.succeeded_webhook"
            });
            
            // Record credit purchase
            let credit_service = billing_service.get_credit_service();
            let audit_context = AuditContext::new(user.id);
            
            record_credit_transaction(
                &credit_service,
                &user.id,
                &gross_amount,
                &fee_amount,
                &currency,
                &charge_id,
                metadata,
                &audit_context,
                &format!("auto top-off for payment intent {}", payment_intent.id),
            ).await?;
            
            // No email for auto top-off
        },
    }
    
    Ok(())
}

/// Unified charge amount fetching - consolidates duplicated charge fetching logic
async fn fetch_charge_amounts(
    billing_service: &BillingService,
    charge_id: &str,
) -> Result<(BigDecimal, BigDecimal, String), AppError> {
    let stripe_service = billing_service.get_stripe_service()
        .map_err(|e| AppError::Configuration(format!("Failed to get stripe service: {}", e)))?;
    
    let charge = stripe_service.get_charge(charge_id).await
        .map_err(|e| AppError::External(format!("Failed to fetch charge data: {}", e)))?;
    
    let gross_amount = BigDecimal::from(charge.amount) / BigDecimal::from(100);
    let fee_amount = match &charge.balance_transaction {
        Some(balance_transaction) => BigDecimal::from(balance_transaction.fee) / BigDecimal::from(100),
        None => {
            warn!("No balance transaction found for charge {} - using zero fee", charge_id);
            BigDecimal::from(0)
        }
    };
    
    Ok((gross_amount, fee_amount, charge.currency))
}

/// Unified credit transaction recording - consolidates duplicated recording logic
async fn record_credit_transaction(
    credit_service: &crate::services::credit_service::CreditService,
    user_id: &Uuid,
    gross_amount: &BigDecimal,
    fee_amount: &BigDecimal,
    currency: &str,
    charge_id: &str,
    metadata: serde_json::Value,
    audit_context: &AuditContext,
    description: &str,
) -> Result<(), AppError> {
    match credit_service.record_credit_purchase(
        user_id,
        gross_amount,
        fee_amount,
        currency,
        charge_id,
        metadata,
        audit_context,
    ).await {
        Ok(updated_balance) => {
            info!("Successfully processed {} - user {} new balance: ${}", 
                  description, user_id, updated_balance.balance);
        },
        Err(AppError::AlreadyExists(_)) => {
            info!("{} was already processed (duplicate)", description);
            return Ok(());
        },
        Err(e) => {
            error!("Failed to record {}: {}", description, e);
            return Err(AppError::Payment(format!("Failed to record {}: {}", description, e)));
        }
    };
    Ok(())
}

/// Send credit purchase email notification
async fn send_credit_purchase_email(
    email_service: &crate::services::email_notification_service::EmailNotificationService,
    billing_service: &BillingService,
    user_id: &Uuid,
    gross_amount: &BigDecimal,
    fee_amount: &BigDecimal,
) {
    let net_amount = gross_amount - fee_amount;
    let user_repo = crate::db::repositories::user_repository::UserRepository::new(billing_service.get_system_db_pool());
    
    if let Ok(user) = user_repo.get_by_id(user_id).await {
        if let Err(e) = email_service.send_credit_purchase_notification(
            user_id,
            &user.email,
            &net_amount,
            "USD",
        ).await {
            warn!("Failed to send credit purchase confirmation email to user {}: {}", user_id, e);
        }
    }
}


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
            
            let should_retry = !e.is_permanent();
            
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
        EVENT_CHECKOUT_SESSION_COMPLETED => {
            info!("Processing checkout session completed: {}", event.id);
            let session: CheckoutSession = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse checkout session: {}", e)))?;
            handle_checkout_session_completed(&session, billing_service, &email_service).await?;
        },
        EVENT_PAYMENT_INTENT_SUCCEEDED => {
            info!("Processing payment intent succeeded: {}", event.id);
            let payment_intent: PaymentIntent = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse payment intent: {}", e)))?;
            
            let payment_type = payment_intent.metadata.as_ref()
                .and_then(|metadata| metadata.get("type"))
                .map(|t| t.as_str())
                .unwrap_or("unknown");
            
            info!("Payment intent {} type: {} - processing", payment_intent.id, payment_type);
            
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
                        .map(|v| v.clone()).unwrap_or_else(|| "unknown".to_string());
                    let amount = payment_intent.metadata.as_ref()
                        .and_then(|metadata| metadata.get("amount")
                            .or_else(|| metadata.get("credit_amount")))
                        .map(|v| v.clone()).unwrap_or_else(|| "unknown".to_string());
                    
                    let payment_intent_id = payment_intent.id.clone();
                    let customer_id = payment_intent.customer.clone();
                    
                    info!("Processing credit purchase for payment intent {} - user_id: {}, amount: {}", 
                          payment_intent_id, user_id_str, amount);
                    
                    let user_id = match Uuid::parse_str(&user_id_str) {
                        Ok(uuid) => uuid,
                        Err(e) => {
                            error!("Invalid user_id UUID format in payment intent {}: '{}' - {}", 
                                   payment_intent_id, user_id_str, e);
                            return Err(AppError::InvalidArgument(format!("Invalid user_id UUID: {}", e)));
                        }
                    };
                    
                    let context = PaymentCompletionContext::CreditPurchase {
                        payment_intent,
                        user_id,
                    };
                    
                    match process_payment_completion(context, billing_service, None).await {
                        Ok(_) => {
                            info!("Successfully processed credit purchase for payment intent {} - user_id: {}, amount: {}", 
                                  payment_intent_id, user_id_str, amount);
                        },
                        Err(e) => {
                            error!("Failed to process credit purchase for payment intent {} - user_id: {}, amount: {} - Error: {}", 
                                   payment_intent_id, user_id_str, amount, e);
                            crate::utils::admin_alerting::send_payment_processing_error_alert(
                                &payment_intent_id,
                                &customer_id.unwrap_or_else(|| "unknown".to_string()),
                                &format!("{}", e),
                            ).await;
                            return Err(e);
                        }
                    }
                },
                "auto_topoff" => {
                    let payment_intent_id = payment_intent.id.clone();
                    let customer_id_for_error = payment_intent.customer.clone();
                    
                    info!("Processing auto top-off for payment intent {} (PRIMARY handler)", payment_intent_id);
                    
                    let customer_id = payment_intent.customer.as_ref()
                        .ok_or_else(|| AppError::InvalidArgument("No customer ID in payment intent".to_string()))?;
                    
                    let user_repo = UserRepository::new(billing_service.get_system_db_pool());
                    let user = user_repo.get_by_stripe_customer_id(customer_id).await?;
                    
                    let context = PaymentCompletionContext::AutoTopOff {
                        payment_intent,
                        user,
                    };
                    
                    match process_payment_completion(context, billing_service, None).await {
                        Ok(_) => {
                            info!("Successfully processed auto top-off for payment intent {}", payment_intent_id);
                        },
                        Err(e) => {
                            error!("Failed to process auto top-off for payment intent {}: {}", payment_intent_id, e);
                            crate::utils::admin_alerting::send_payment_processing_error_alert(
                                &payment_intent_id,
                                &customer_id_for_error.unwrap_or_else(|| "unknown".to_string()),
                                &format!("{}", e),
                            ).await;
                            return Err(e);
                        }
                    }
                },
                _ => {
                    let payment_intent_id = payment_intent.id.clone();
                    
                    warn!("Unknown payment type '{}' for payment intent {} - attempting credit purchase processing", payment_type, payment_intent_id);
                    
                    if let Some(user_id_str) = payment_intent.metadata.as_ref()
                        .and_then(|metadata| metadata.get("user_id"))
                        .map(|v| v.as_str()) {
                        
                        if let Ok(user_id) = Uuid::parse_str(user_id_str) {
                            let context = PaymentCompletionContext::CreditPurchase {
                                payment_intent,
                                user_id,
                            };
                            
                            match process_payment_completion(context, billing_service, None).await {
                                Ok(_) => {
                                    info!("Successfully processed unknown payment type as credit purchase for payment intent {}", payment_intent_id);
                                },
                                Err(e) => {
                                    warn!("Failed to process unknown payment type for payment intent {}: {} - continuing webhook processing", payment_intent_id, e);
                                }
                            }
                        } else {
                            warn!("Invalid user_id in unknown payment type for payment intent {}: {}", payment_intent_id, user_id_str);
                        }
                    } else {
                        warn!("No user_id found in metadata for unknown payment type payment intent {}", payment_intent_id);
                    }
                }
            }
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
        // Handle invoice created and finalized events
        EVENT_INVOICE_CREATED | EVENT_INVOICE_FINALIZED => {
            let invoice_id = event.data.get("object").and_then(|o| o.get("id")).and_then(|id| id.as_str()).unwrap_or("unknown");
            let metadata = event.data.get("object").and_then(|o| o.get("metadata"));
            let is_auto_topoff = metadata.and_then(|m| m.get("type")).and_then(|t| t.as_str()) == Some("auto_topoff");
            
            if is_auto_topoff {
                info!("Processing auto top-off invoice event: {} for invoice: {}", event.type_, invoice_id);
            } else {
                info!("Processing regular invoice event: {} for invoice: {}", event.type_, invoice_id);
            }
            
            // Only alert for $0 invoices that aren't expected
            if event.type_ == EVENT_INVOICE_FINALIZED {
                if let Some(amount_due) = event.data.get("object").and_then(|o| o.get("amount_due")).and_then(|a| a.as_i64()) {
                    if amount_due == 0 {
                        error!("ALERT: $0 invoice detected! Event ID: {} - Invoice ID: {}", event.id, invoice_id);
                        
                        // Send admin alert for $0 invoice
                        let alerting_service = crate::utils::admin_alerting::AdminAlertingService::new();
                        let alert = crate::utils::admin_alerting::AdminAlert::new(
                            crate::utils::admin_alerting::AlertSeverity::Critical,
                            crate::utils::admin_alerting::AlertType::PaymentProcessingError,
                            "Unexpected $0 Invoice Detected".to_string(),
                            format!("A $0 invoice was finalized (Event: {}, Invoice: {}). Please investigate in Stripe Dashboard.", event.id, invoice_id),
                        );
                        alerting_service.send_alert(alert).await;
                    }
                }
            }
        },
        // Handle invoice paid events - process credits for auto top-off
        EVENT_INVOICE_PAID => {
            let invoice: Invoice = serde_json::from_value(event.data["object"].clone())
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse invoice: {}", e)))?;
            
            info!("Processing invoice paid event for invoice: {}", invoice.id);
            
            // Check if this is an auto top-off invoice
            let is_auto_topoff = invoice.metadata.as_ref()
                .and_then(|m| m.get("type"))
                .map(|t| t == "auto_topoff")
                .unwrap_or(false);
            
            if is_auto_topoff {
                info!("Processing auto top-off invoice payment: {}", invoice.id);
                
                // Extract customer ID from invoice
                let customer_id = invoice.customer.as_ref()
                    .ok_or_else(|| AppError::InvalidArgument("Invoice missing customer ID".to_string()))?;
                
                // Find user by Stripe customer ID
                let user_repository = UserRepository::new(billing_service.get_system_db_pool());
                let user = user_repository.get_by_stripe_customer_id(customer_id).await?;
                
                info!("Found user {} for auto top-off invoice {}", user.id, invoice.id);
                
                // Extract payment details from invoice
                let amount_cents = invoice.amount_paid;
                let gross_amount = BigDecimal::from(amount_cents) / BigDecimal::from(100);
                let fee_amount = BigDecimal::from(0); // Invoices don't have separate fee tracking
                let currency = invoice.currency.clone();
                
                // Create credit transaction for auto top-off
                let credit_service = billing_service.get_credit_service();
                let audit_context = AuditContext::new(user.id);
                
                let metadata = serde_json::json!({
                    "currency": currency.to_uppercase(),
                    "invoice_id": invoice.id,
                    "customer_id": customer_id,
                    "payment_type": "auto_topoff",
                    "processed_via": "invoice.paid_webhook",
                    "amount_paid_cents": amount_cents
                });
                
                let description = format!("Credit purchase via Stripe invoice {}", invoice.id);
                
                // Use the helper function instead of calling record_credit_purchase directly
                record_credit_transaction(
                    &credit_service,
                    &user.id,
                    &gross_amount,
                    &fee_amount,
                    &currency.to_uppercase(),
                    &invoice.id, // Use invoice ID instead of charge ID
                    metadata,
                    &audit_context,
                    &description,
                ).await?;
                
                info!("Successfully processed auto top-off invoice {} for user {} - added ${} credits", 
                      invoice.id, user.id, gross_amount);
            } else {
                info!("Invoice {} is not an auto top-off, skipping credit processing", invoice.id);
            }
        }
        _ => {
            info!("Ignoring Stripe event type: {} - handled by Customer Portal", event.type_);
        }
    }
    
    Ok(HttpResponse::Ok().finish())
}

// ========================================
// SIMPLIFIED WEBHOOK EVENT HANDLERS
// ========================================




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
                
                // Extract user_id from metadata for checkout session credit purchase
                let user_id_str = payment_intent.metadata.as_ref()
                    .and_then(|metadata| metadata.get("user_id"))
                    .map(|v| v.as_str())
                    .ok_or_else(|| AppError::InvalidArgument("Missing user_id in payment intent metadata".to_string()))?;
                
                let user_id = Uuid::parse_str(user_id_str)
                    .map_err(|e| AppError::InvalidArgument(format!("Invalid user_id UUID: {}", e)))?;
                
                let context = PaymentCompletionContext::CreditPurchase {
                    payment_intent,
                    user_id,
                };
                
                process_payment_completion(context, billing_service, Some(email_service)).await?;
            }
        },
        CheckoutSessionMode::Setup => {
            info!("Setup mode checkout session completed successfully: {}", session.id);
            
            // Retrieve setup intent ID from the session
            if let Some(setup_intent_id) = session.setup_intent.as_ref() {
                let stripe_service = billing_service.get_stripe_service()?;
                let setup_intent = stripe_service.get_setup_intent(setup_intent_id).await
                    .map_err(|e| AppError::External(format!("Failed to retrieve setup intent: {}", e)))?;
                
                // Process the saved payment method
                billing_service.process_saved_payment_method(&setup_intent).await?;
                info!("Successfully processed saved payment method from setup intent: {}", setup_intent_id);
            } else {
                warn!("Setup mode session {} has no setup_intent ID", session.id);
            }
        },
    }
    
    Ok(())
}


