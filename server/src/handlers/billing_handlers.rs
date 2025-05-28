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
            _ => {
                // Log other events but take no action
                info!("Received unhandled Stripe event type: {}", event.type_);
            }
        }
    }
    
    // Return success
    Ok(HttpResponse::Ok().finish())
}