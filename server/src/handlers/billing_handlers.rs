use actix_web::{web, HttpResponse, get, post, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use crate::models::runtime_config::AppState;
use sqlx::PgPool;
use log::{debug, error, info};
use crate::middleware::secure_auth::UserId;
use chrono::{DateTime, Utc, Duration};
use bigdecimal::{BigDecimal, ToPrimitive};
use uuid::Uuid;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct CheckoutRequest {
    pub plan: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResponse {
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalResponse {
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanLimits {
    pub monthly_allowance: f64,
    pub overage_rate: f64,
    pub hard_limit_multiplier: f64,
    pub models: Vec<String>,
    pub support: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDetails {
    pub name: String,
    pub price: String,
    pub period: String,
    pub features: Vec<String>,
    pub limits: PlanLimits,
}

/// Get subscription info for the current user
#[get("/subscription")]
pub async fn get_subscription(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting subscription for user: {}", user_id.0);
    
    // Get subscription details
    let subscription = billing_service.get_subscription_details(&user_id.0).await?;
    
    // Return the subscription details
    Ok(HttpResponse::Ok().json(subscription))
}

/// Create a checkout session for subscription
#[post("/checkout")]
pub async fn create_checkout_session(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    checkout_request: web::Json<CheckoutRequest>,
) -> Result<HttpResponse, AppError> {
    debug!("Creating checkout session for user: {} with plan: {}", user_id.0, checkout_request.plan);
    
    // Create the checkout session
    #[cfg(feature = "stripe")]
    let url = billing_service.create_checkout_session(&user_id.0, &checkout_request.plan).await?;
    
    #[cfg(not(feature = "stripe"))]
    let url = "https://example.com/checkout-placeholder".to_string();
    
    // Return the checkout session URL
    Ok(HttpResponse::Ok().json(CheckoutResponse { url }))
}

/// Create a billing portal session for managing subscription
#[get("/portal")]
pub async fn create_billing_portal(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Creating billing portal for user: {}", user_id.0);
    
    // Create the billing portal session
    #[cfg(feature = "stripe")]
    let url = billing_service.create_billing_portal_session(&user_id.0).await?;
    
    #[cfg(not(feature = "stripe"))]
    let url = "https://example.com/portal-placeholder".to_string();
    
    // Return the billing portal URL
    Ok(HttpResponse::Ok().json(PortalResponse { url }))
}

/// Get available subscription plans
#[get("/plans")]
pub async fn get_available_plans(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting available subscription plans");
    
    let plans = app_state.subscription_plan_repository.get_all_plans().await?;
    
    let mut response: HashMap<String, PlanDetails> = HashMap::new();
    
    for plan in plans {
        let price = if plan.base_price_monthly == 0.0 {
            "$0".to_string()
        } else {
            format!("${}", plan.base_price_monthly as i32)
        };
        
        let period = if plan.base_price_monthly == 0.0 {
            "forever".to_string()
        } else {
            "month".to_string()
        };
        
        // Extract features from JSONB - support both old and new structure
        let features = if let Some(core_features) = plan.features.get("core_features") {
            // New structure: features are in "core_features" array
            core_features
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_else(|| Vec::new())
        } else {
            // Old structure: features are in "features" array
            plan.features
                .get("features")
                .and_then(|f| f.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_else(|| Vec::new())
        };
        
        // Extract models from features - support both structures
        let models = if plan.features.get("core_features").is_some() {
            // New structure: all plans have all models, extract from core_features if mentioned
            let model_features: Vec<String> = features.iter()
                .filter(|feat| feat.contains("AI models") || feat.contains("Claude") || feat.contains("GPT") || feat.contains("Gemini"))
                .cloned()
                .collect();
            
            if model_features.is_empty() {
                // If no specific models mentioned, assume all models are available
                vec!["All AI models available".to_string()]
            } else {
                model_features
            }
        } else {
            // Old structure: models are in "models" array
            plan.features
                .get("models")
                .and_then(|m| m.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_else(|| Vec::new())
        };
        
        // Extract support level - support both structures
        let support = if plan.features.get("core_features").is_some() {
            // New structure: infer support from spending_details or use plan-based defaults
            if let Some(spending_details) = plan.features.get("spending_details") {
                if spending_details.get("overage_policy").is_some() {
                    "Enterprise".to_string()
                } else {
                    match plan.id.as_str() {
                        "free" => "Community".to_string(),
                        "pro" => "Priority".to_string(),
                        "enterprise" => "Dedicated".to_string(),
                        _ => "Standard".to_string(),
                    }
                }
            } else {
                // Fallback based on plan ID
                match plan.id.as_str() {
                    "free" => "Community".to_string(),
                    "pro" => "Priority".to_string(),
                    "enterprise" => "Dedicated".to_string(),
                    _ => "Standard".to_string(),
                }
            }
        } else {
            // Old structure: support is directly in "support" field
            plan.features
                .get("support")
                .and_then(|s| s.as_str())
                .unwrap_or("Support not specified")
                .to_string()
        };
        
        response.insert(plan.id.clone(), PlanDetails {
            name: plan.name,
            price,
            period,
            features,
            limits: PlanLimits {
                monthly_allowance: plan.included_spending_monthly,
                overage_rate: plan.overage_rate,
                hard_limit_multiplier: plan.hard_limit_multiplier,
                models,
                support,
            },
        });
    }
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get API usage summary
#[get("/usage")]
pub async fn get_usage_summary(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting API usage for user: {}", user_id.0);
    
    // Get subscription details which includes usage
    let details = billing_service.get_subscription_details(&user_id.0).await?;
    
    // Extract just the usage part
    let usage = details.get("usage").ok_or(AppError::Internal("Failed to get usage from subscription details".to_string()))?;
    
    // Return the usage summary
    Ok(HttpResponse::Ok().json(usage))
}

/// Get invoice history for user
#[get("/invoices")]
pub async fn get_invoice_history(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting invoice history for user: {}", user_id.0);
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct InvoiceHistoryEntry {
        pub id: String,
        pub amount: f64,
        pub currency: String,
        pub status: String,
        pub created_date: String,
        pub due_date: Option<String>,
        pub paid_date: Option<String>,
        pub invoice_pdf: Option<String>,
        pub description: String,
    }
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct InvoiceHistoryResponse {
        pub invoices: Vec<InvoiceHistoryEntry>,
        pub total_count: usize,
        pub has_more: bool,
    }
    
    // Get invoices from local cache/database
    let invoice_repo = crate::db::repositories::InvoiceRepository::new(billing_service.get_db_pool());
    
    let limit = 50; // Default limit
    let offset = 0; // TODO: Support pagination with query parameters
    
    let invoices = invoice_repo.get_by_user_id(&user_id.0, limit, offset).await?;
    let total_count = invoice_repo.count_by_user_id(&user_id.0).await?;
    
    let invoice_entries: Vec<InvoiceHistoryEntry> = invoices.into_iter().map(|invoice| {
        InvoiceHistoryEntry {
            id: invoice.id.clone(),
            amount: invoice.amount_due.to_f64().unwrap_or(0.0),
            currency: invoice.currency.clone(),
            status: invoice.status.clone(),
            created_date: invoice.created_at.to_rfc3339(),
            due_date: invoice.due_date.map(|d| d.to_rfc3339()),
            paid_date: invoice.paid_at.map(|d| d.to_rfc3339()),
            invoice_pdf: invoice.invoice_pdf_url.clone(),
            description: invoice.description.unwrap_or_else(|| "Monthly subscription".to_string()),
        }
    }).collect();
    
    let response = InvoiceHistoryResponse {
        invoices: invoice_entries,
        total_count: total_count as usize,
        has_more: total_count > (limit + offset) as i64,
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get payment methods for user
#[get("/payment-methods")]
pub async fn get_payment_methods(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting payment methods for user: {}", user_id.0);
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PaymentMethodInfo {
        pub id: String,
        pub type_name: String,
        pub last_four: Option<String>,
        pub brand: Option<String>,
        pub exp_month: Option<u8>,
        pub exp_year: Option<u16>,
        pub is_default: bool,
        pub created_date: String,
    }
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PaymentMethodsResponse {
        pub payment_methods: Vec<PaymentMethodInfo>,
        pub has_default: bool,
    }
    
    // Get payment methods from local cache/database
    let payment_method_repo = crate::db::repositories::PaymentMethodRepository::new(billing_service.get_db_pool());
    
    let payment_methods_db = payment_method_repo.get_by_user_id(&user_id.0).await?;
    let has_default = payment_methods_db.iter().any(|pm| pm.is_default);
    
    let payment_method_infos: Vec<PaymentMethodInfo> = payment_methods_db.into_iter().map(|pm| {
        PaymentMethodInfo {
            id: pm.id.clone(),
            type_name: pm.r#type.clone(),
            last_four: pm.card_last_four.clone(),
            brand: pm.card_brand.clone(),
            exp_month: pm.card_exp_month.map(|m| m as u8),
            exp_year: pm.card_exp_year.map(|y| y as u16),
            is_default: pm.is_default,
            created_date: pm.created_at.to_rfc3339(),
        }
    }).collect();
    
    let response = PaymentMethodsResponse {
        payment_methods: payment_method_infos,
        has_default,
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Handle Stripe webhook events
#[post("/webhook")]
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
    #[cfg(feature = "stripe")]
    {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        
        // Get webhook secret from app_state
        let webhook_secret = app_state.settings.stripe.webhook_secret.clone();
        
        // Parse the signature header
        let mut timestamp: Option<&str> = None;
        let mut signature: Option<&str> = None;
        
        for pair in stripe_signature.split(',') {
            let parts: Vec<&str> = pair.trim().split('=').collect();
            if parts.len() != 2 {
                continue;
            }
            
            match parts[0] {
                "t" => timestamp = Some(parts[1]),
                "v1" => signature = Some(parts[1]),
                _ => {}
            }
        }
        
        let timestamp = timestamp.ok_or(AppError::InvalidArgument("Missing timestamp in Stripe signature".to_string()))?;
        let signature = signature.ok_or(AppError::InvalidArgument("Missing signature in Stripe signature".to_string()))?;
        
        // Create the signed payload
        let signed_payload = format!("{}.{}", timestamp, String::from_utf8_lossy(&body));
        
        // Verify the signature
        let sig_bytes = hex::decode(signature)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid Stripe signature encoding: {}", e)))?;
        
        let mut mac = Hmac::<Sha256>::new_from_slice(webhook_secret.as_bytes())
            .map_err(|e| AppError::Internal(format!("HMAC key error: {}", e)))?;
        
        mac.update(signed_payload.as_bytes());
        
        if mac.verify_slice(&sig_bytes).is_err() {
            error!("Stripe webhook signature verification failed. Signature: {}, Timestamp: {}", signature, timestamp);
            return Err(AppError::Auth("Invalid Stripe signature".to_string()));
        }
        
        // Signature is valid, parse the event
        let event: stripe::Event = match serde_json::from_slice(&body) {
            Ok(event) => event,
            Err(e) => return Err(AppError::InvalidArgument(format!("Invalid Stripe event JSON: {}", e))),
        };
        
        // Get repositories for webhook processing
        let db_pool = billing_service.get_db_pool();
        let invoice_repo = crate::db::repositories::InvoiceRepository::new(db_pool.clone());
        let payment_method_repo = crate::db::repositories::PaymentMethodRepository::new(db_pool.clone());
        let user_repo = crate::db::repositories::UserRepository::new(db_pool.clone());
        let sub_repo = crate::db::repositories::SubscriptionRepository::new(db_pool.clone());
        let email_service = crate::services::email_notification_service::EmailNotificationService::new(db_pool.clone())?;

        // Handle different event types
        match event.type_.as_str() {
            "checkout.session.completed" => {
                info!("Checkout session completed: {}", event.id);
                if let stripe::EventObject::CheckoutSession(session) = event.data.object {
                    let db_pool = billing_service.get_db_pool();
                    let sub_repo = crate::db::repositories::SubscriptionRepository::new(db_pool.clone());
                    let user_repo = crate::db::repositories::UserRepository::new(db_pool);

                    // Primary path: Use user_id from metadata
                    if let Some(user_id_str) = session.metadata.as_ref().and_then(|m| m.get("user_id").and_then(|v| v.as_str())) {
                        if let Ok(user_uuid) = Uuid::parse_str(user_id_str) {
                            let user_option = user_repo.get_by_id(&user_uuid).await.ok();
                            if let Some(user) = user_option {
                                // Update or create subscription for this user
                                if let Some(mut db_subscription) = sub_repo.get_by_user_id(&user.id).await? {
                                    // Update existing subscription
                                    db_subscription.stripe_customer_id = session.customer.as_ref().map(|c| c.id().to_string());
                                    db_subscription.stripe_subscription_id = session.subscription.as_ref().map(|s| s.id().to_string());
                                    db_subscription.status = "active".to_string();
                                    
                                    // Update plan_id from metadata
                                    if let Some(metadata) = &session.metadata {
                                        if let Some(plan_val) = metadata.get("plan_id") {
                                            db_subscription.plan_id = plan_val.to_string();
                                        }
                                    }
                                    
                                    sub_repo.update(&db_subscription).await?;
                                    info!("Updated subscription for user: {}", user.id);
                                } else {
                                    // Create new subscription - determine plan_id more reliably
                                    let mut plan_id = session.metadata
                                        .as_ref()
                                        .and_then(|m| m.get("plan_id").map(|s| s.as_str().to_string()));

                                    // If plan_id not in metadata, try to derive from price_id in line items
                                    if plan_id.is_none() {
                                        if let Some(line_items) = &session.line_items {
                                            for line_item in &line_items.data {
                                                if let Some(price) = &line_item.price {
                                                    let price_id = price.id.as_str();
                                                    
                                                    // Map Stripe price IDs to internal plan IDs
                                                    if Some(price_id) == app_state.settings.stripe.price_id_pro.as_deref() {
                                                        plan_id = Some("pro".to_string());
                                                        break;
                                                    } else if Some(price_id) == app_state.settings.stripe.price_id_enterprise.as_deref() {
                                                        plan_id = Some("enterprise".to_string());
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // If still no plan_id, log error and use safer fallback
                                    let final_plan_id = plan_id.unwrap_or_else(|| {
                                        error!("Unable to determine plan_id from Stripe checkout session metadata or line items for user: {}", user.id);
                                        "free".to_string() // Safer fallback than "pro"
                                    });

                                    // Determine current_period_ends_at from Stripe subscription
                                    let current_period_ends_at = if let Some(subscription_ref) = &session.subscription {
                                        match subscription_ref {
                                            stripe::Expandable::Object(subscription) => {
                                                // Subscription is already expanded
                                                if let Some(period_end) = subscription.current_period_end {
                                                    DateTime::<Utc>::from_timestamp(period_end as i64, 0)
                                                        .unwrap_or(Utc::now() + Duration::days(30))
                                                } else {
                                                    Utc::now() + Duration::days(30)
                                                }
                                            },
                                            stripe::Expandable::Id(subscription_id) => {
                                                // Need to fetch the subscription
                                                let client = stripe::Client::new(app_state.settings.stripe.secret_key.clone());
                                                match stripe::Subscription::retrieve(&client, subscription_id, &[]).await {
                                                    Ok(subscription) => {
                                                        if let Some(period_end) = subscription.current_period_end {
                                                            DateTime::<Utc>::from_timestamp(period_end as i64, 0)
                                                                .unwrap_or(Utc::now() + Duration::days(30))
                                                        } else {
                                                            Utc::now() + Duration::days(30)
                                                        }
                                                    },
                                                    Err(e) => {
                                                        error!("Failed to fetch Stripe subscription {}: {}", subscription_id, e);
                                                        Utc::now() + Duration::days(30)
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        error!("No subscription reference in checkout session for user: {}", user.id);
                                        Utc::now() + Duration::days(30)
                                    };

                                    sub_repo.create(
                                        &user.id,
                                        &final_plan_id,
                                        "active",
                                        session.customer.as_ref().map(|c| c.id().as_str()),
                                        session.subscription.as_ref().map(|s| s.id().as_str()),
                                        None, // No trial for new paid subscriptions from checkout
                                        current_period_ends_at,
                                    ).await?;
                                    info!("Created new subscription via checkout for user: {} with plan: {}", user.id, final_plan_id);
                                }
                            } else {
                                error!("User with ID {} from Stripe metadata not found in database.", user_id_str);
                            }
                        } else {
                            error!("Invalid user_id format in Stripe metadata: {}", user_id_str);
                        }
                    } else {
                        // Critical case: user_id was not in metadata
                        if let Some(customer_ref) = &session.customer {
                            let stripe_customer_id_str = customer_ref.id().to_string();
                            error!("CRITICAL: Missing user_id in Stripe checkout session metadata for customer {}. Payment cannot be automatically linked.", stripe_customer_id_str);
                        } else {
                            error!("CRITICAL: Missing user_id AND customer_id in Stripe checkout session metadata. Payment cannot be linked.");
                        }
                    }
                }
            },
            "customer.subscription.updated" => {
                info!("Subscription updated: {}", event.id);
                if let stripe::EventObject::Subscription(subscription) = event.data.object {
                    if let Some(customer) = subscription.customer {
                        // Find user by Stripe customer ID
                        let db_pool = billing_service.get_db_pool();
                        let sub_repo = crate::db::repositories::SubscriptionRepository::new(db_pool.clone());
                        let user_repo = crate::db::repositories::UserRepository::new(db_pool);
                        
                        // Find users with this Stripe customer ID
                        let users = user_repo.find_by_stripe_customer_id(&customer.to_string()).await?;
                        
                        if let Some(user) = users.first() {
                            // Get current subscription
                            if let Some(mut db_subscription) = sub_repo.get_by_user_id(&user.id).await? {
                                // Update subscription status
                                db_subscription.status = subscription.status.to_string();
                                
                                // Update end date if available
                                if let Some(current_period_end) = subscription.current_period_end {
                                    let end_date = DateTime::<Utc>::from_timestamp(current_period_end as i64, 0)
                                        .unwrap_or(Utc::now() + Duration::days(30));
                                    db_subscription.current_period_ends_at = Some(end_date);
                                }
                                
                                // Update subscription in database
                                sub_repo.update(&db_subscription).await?;
                                info!("Updated subscription status for user: {}", user.id);
                            }
                        }
                    }
                }
            },
            "customer.subscription.deleted" => {
                info!("Subscription deleted: {}", event.id);
                if let stripe::EventObject::Subscription(subscription) = event.data.object {
                    if let Some(customer) = subscription.customer {
                        // Find user by Stripe customer ID
                        let db_pool = billing_service.get_db_pool();
                        let sub_repo = crate::db::repositories::SubscriptionRepository::new(db_pool.clone());
                        let user_repo = crate::db::repositories::UserRepository::new(db_pool);
                        
                        // Find users with this Stripe customer ID
                        let users = user_repo.find_by_stripe_customer_id(&customer.to_string()).await?;
                        
                        if let Some(user) = users.first() {
                            // Get current subscription
                            if let Some(mut db_subscription) = sub_repo.get_by_user_id(&user.id).await? {
                                // Mark subscription as canceled
                                db_subscription.status = "canceled".to_string();
                                
                                // Update subscription in database
                                sub_repo.update(&db_subscription).await?;
                                info!("Marked subscription as canceled for user: {}", user.id);
                            }
                        }
                    }
                }
            },
            "invoice.created" => {
                info!("Invoice created: {}", event.id);
                if let stripe::EventObject::Invoice(invoice) = event.data.object {
                    if let Some(customer) = &invoice.customer {
                        let customer_id = customer.id().to_string();
                        
                        // Find user by Stripe customer ID
                        let users = user_repo.find_by_stripe_customer_id(&customer_id).await?;
                        if let Some(user) = users.first() {
                            // Create invoice record in database
                            let invoice_record = crate::db::repositories::Invoice {
                                id: invoice.id.to_string(),
                                user_id: user.id,
                                stripe_customer_id: customer_id,
                                stripe_subscription_id: invoice.subscription.as_ref().map(|s| s.id().to_string()),
                                amount_due: bigdecimal::BigDecimal::from_f64(invoice.amount_due as f64 / 100.0).unwrap_or_default(),
                                amount_paid: bigdecimal::BigDecimal::from_f64(invoice.amount_paid as f64 / 100.0).unwrap_or_default(),
                                currency: invoice.currency.to_string().to_uppercase(),
                                status: invoice.status.as_ref().map(|s| s.as_str()).unwrap_or("unknown").to_string(),
                                invoice_pdf_url: invoice.invoice_pdf.clone(),
                                hosted_invoice_url: invoice.hosted_invoice_url.clone(),
                                billing_reason: invoice.billing_reason.as_ref().map(|r| r.as_str().to_string()),
                                description: invoice.description.clone(),
                                period_start: invoice.period_start.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                                period_end: invoice.period_end.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                                due_date: invoice.due_date.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                                created_at: chrono::DateTime::from_timestamp(invoice.created as i64, 0).unwrap_or_default(),
                                finalized_at: invoice.status_transitions.finalized_at.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                                paid_at: invoice.status_transitions.paid_at.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                                voided_at: invoice.status_transitions.voided_at.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                                updated_at: chrono::Utc::now(),
                            };
                            
                            invoice_repo.create_or_update(&invoice_record).await?;
                            
                            // Queue invoice notification email
                            if let Some(due_date) = invoice_record.due_date {
                                email_service.queue_invoice_notification(
                                    &user.id,
                                    &user.email,
                                    &invoice.id,
                                    &invoice_record.amount_due,
                                    &due_date,
                                    &invoice_record.currency,
                                    invoice_record.hosted_invoice_url.as_deref(),
                                ).await?;
                            }
                            
                            info!("Created invoice record for user: {}", user.id);
                        }
                    }
                }
            },
            "invoice.payment_succeeded" => {
                info!("Invoice payment succeeded: {}", event.id);
                if let stripe::EventObject::Invoice(invoice) = event.data.object {
                    invoice_repo.update_status(
                        &invoice.id,
                        "paid",
                        invoice.status_transitions.paid_at.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten(),
                        None,
                    ).await?;
                }
            },
            "invoice.payment_failed" => {
                info!("Invoice payment failed: {}", event.id);
                if let stripe::EventObject::Invoice(invoice) = event.data.object {
                    if let Some(customer) = &invoice.customer {
                        // Find user and send payment failure notification
                        let users = user_repo.find_by_stripe_customer_id(&customer.id().to_string()).await?;
                        if let Some(user) = users.first() {
                            let amount = bigdecimal::BigDecimal::from_f64(invoice.amount_due as f64 / 100.0).unwrap_or_default();
                            let retry_date = invoice.next_payment_attempt.map(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()).flatten();
                            
                            email_service.queue_payment_failed_notification(
                                &user.id,
                                &user.email,
                                &invoice.id,
                                &amount,
                                &invoice.currency.to_string().to_uppercase(),
                                retry_date.as_ref(),
                            ).await?;
                        }
                    }
                }
            },
            "payment_method.attached" => {
                info!("Payment method attached: {}", event.id);
                if let stripe::EventObject::PaymentMethod(payment_method) = event.data.object {
                    if let Some(customer) = &payment_method.customer {
                        let customer_id = customer.id().to_string();
                        
                        // Find user by customer ID
                        let users = user_repo.find_by_stripe_customer_id(&customer_id).await?;
                        if let Some(user) = users.first() {
                            // Create payment method record
                            let pm_record = crate::db::repositories::PaymentMethod {
                                id: payment_method.id.to_string(),
                                user_id: user.id,
                                stripe_customer_id: customer_id,
                                r#type: payment_method.type_.as_str().to_string(),
                                card_brand: payment_method.card.as_ref().map(|c| c.brand.as_str().to_string()),
                                card_last_four: payment_method.card.as_ref().map(|c| c.last4.clone()),
                                card_exp_month: payment_method.card.as_ref().map(|c| c.exp_month as i32),
                                card_exp_year: payment_method.card.as_ref().map(|c| c.exp_year as i32),
                                card_country: payment_method.card.as_ref().and_then(|c| c.country.clone()),
                                card_funding: payment_method.card.as_ref().map(|c| c.funding.as_str().to_string()),
                                is_default: false, // Will be updated if it becomes default
                                created_at: chrono::DateTime::from_timestamp(payment_method.created as i64, 0).unwrap_or_default(),
                                updated_at: chrono::Utc::now(),
                            };
                            
                            payment_method_repo.create_or_update(&pm_record).await?;
                            info!("Created payment method record for user: {}", user.id);
                        }
                    }
                }
            },
            "payment_method.detached" => {
                info!("Payment method detached: {}", event.id);
                if let stripe::EventObject::PaymentMethod(payment_method) = event.data.object {
                    if let Some(customer) = &payment_method.customer {
                        let users = user_repo.find_by_stripe_customer_id(&customer.id().to_string()).await?;
                        if let Some(user) = users.first() {
                            payment_method_repo.delete(&payment_method.id, &user.id).await?;
                            info!("Deleted payment method record for user: {}", user.id);
                        }
                    }
                }
            },
            _ => {
                // Log other events but take no action
                info!("Received unhandled Stripe event type: {}", event.type_);
            }
        }
    }
    
    // Return success
    Ok(HttpResponse::Ok().finish())
}