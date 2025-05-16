use actix_web::{web, HttpResponse, get, post, HttpRequest, HttpMessage};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use chrono::Duration;
use log::{debug, error, info};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CheckoutRequest {
    pub plan: String,
}

#[derive(Debug, Serialize)]
pub struct CheckoutResponse {
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct PortalResponse {
    pub url: String,
}

/// Get subscription info for the current user
#[get("/billing/subscription")]
pub async fn get_subscription(
    req: HttpRequest,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().cloned().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Getting subscription for user: {}", user_id);
    
    // Get subscription details
    let subscription = billing_service.get_subscription_details(&user_id).await?;
    
    // Return the subscription details
    Ok(HttpResponse::Ok().json(subscription))
}

/// Create a checkout session for subscription
#[post("/billing/checkout")]
pub async fn create_checkout_session(
    req: HttpRequest,
    billing_service: web::Data<BillingService>,
    checkout_request: web::Json<CheckoutRequest>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().cloned().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Creating checkout session for user: {} with plan: {}", user_id, checkout_request.plan);
    
    // Create the checkout session
    #[cfg(feature = "stripe")]
    let url = billing_service.create_checkout_session(&user_id, &checkout_request.plan).await?;
    
    #[cfg(not(feature = "stripe"))]
    let url = "https://example.com/checkout-placeholder".to_string();
    
    // Return the checkout session URL
    Ok(HttpResponse::Ok().json(CheckoutResponse { url }))
}

/// Create a billing portal session for managing subscription
#[get("/billing/portal")]
pub async fn create_billing_portal(
    req: HttpRequest,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().cloned().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Creating billing portal for user: {}", user_id);
    
    // Create the billing portal session
    #[cfg(feature = "stripe")]
    let url = billing_service.create_billing_portal_session(&user_id).await?;
    
    #[cfg(not(feature = "stripe"))]
    let url = "https://example.com/portal-placeholder".to_string();
    
    // Return the billing portal URL
    Ok(HttpResponse::Ok().json(PortalResponse { url }))
}

/// Get API usage summary
#[get("/billing/usage")]
pub async fn get_usage_summary(
    req: HttpRequest,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().cloned().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Getting API usage for user: {}", user_id);
    
    // Get subscription details which includes usage
    let details = billing_service.get_subscription_details(&user_id).await?;
    
    // Extract just the usage part
    let usage = details.get("usage").ok_or(AppError::Internal("Failed to get usage from subscription details".to_string()))?;
    
    // Return the usage summary
    Ok(HttpResponse::Ok().json(usage))
}

/// Handle Stripe webhook events
#[post("/billing/webhook")]
pub async fn stripe_webhook(
    req: HttpRequest,
    body: web::Bytes,
    billing_service: web::Data<BillingService>,
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
        use crate::config::settings::AppSettings;
        use std::env;
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        
        // Get webhook secret from app_settings
        let app_settings = crate::config::settings::AppSettings::from_env()
            .map_err(|e| AppError::Configuration(format!("Failed to load app settings: {}", e)))?;
            
        let webhook_secret = app_settings.stripe.webhook_secret.clone();
        
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
                    if let Some(customer) = session.customer {
                        // Find user by Stripe customer ID
                        let db_pool = billing_service.get_db_pool();
                        let sub_repo = crate::db::repositories::SubscriptionRepository::new(db_pool.clone());
                        let user_repo = crate::db::repositories::UserRepository::new(db_pool);
                        
                        // Find users with this Stripe customer ID
                        if let Some(subscription_id) = session.subscription {
                            // Update user's subscription
                            let users = user_repo.find_by_stripe_customer_id(&customer.to_string()).await?;
                            
                            if let Some(user) = users.first() {
                                // Check if user already has a subscription
                                if let Some(mut subscription) = sub_repo.get_by_user_id(&user.id).await? {
                                    // Update the existing subscription
                                    subscription.stripe_customer_id = Some(customer.to_string());
                                    subscription.stripe_subscription_id = Some(subscription_id.to_string());
                                    subscription.status = "active".to_string();
                                    
                                    // Set plan based on checkout session metadata
                                    if let Some(metadata) = session.metadata {
                                        if let Some(plan) = metadata.get("plan") {
                                            subscription.plan_id = plan.to_string();
                                        }
                                    }
                                    
                                    // Update subscription in database
                                    sub_repo.update(&subscription).await?;
                                    info!("Updated subscription for user: {}", user.id);
                                } else {
                                    // Create new subscription
                                    let plan_id = session.metadata
                                        .and_then(|m| m.get("plan").map(|s| s.to_string()))
                                        .unwrap_or_else(|| "pro".to_string()); // Default to pro plan
                                    
                                    // Create subscription in database
                                    let sub_id = sub_repo.create(
                                        &user.id,
                                        &plan_id,
                                        "active",
                                        Some(&customer.to_string()),
                                        Some(&subscription_id.to_string()),
                                        None, // No trial for paid subscriptions
                                        Utc::now() + Duration::days(30), // Default to 30 days
                                    ).await?;
                                    
                                    info!("Created new subscription for user: {}", user.id);
                                }
                            }
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