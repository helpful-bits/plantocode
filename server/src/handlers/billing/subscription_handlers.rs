use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use crate::models::runtime_config::AppState;
use crate::db::repositories::subscription_plan_repository::{PlanFeatures, SpendingDetails};
use log::{debug, info, error};
use uuid::Uuid;
use bigdecimal::{BigDecimal, ToPrimitive};
use std::collections::HashMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSubscriptionPlan {
    pub id: String,
    pub name: String,
    pub monthly_price: BigDecimal,
    pub yearly_price: BigDecimal,
    pub currency: String,
    pub trial_days: i32,
    pub features: Vec<String>,
    pub recommended: bool,
    pub active: bool,
}

// ========================================
// SUBSCRIPTION MANAGEMENT HANDLERS
// ========================================

/// Get subscription info for the current user
#[get("/subscription")]
pub async fn get_subscription(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting subscription for user: {}", user_id.0);
    
    // Get subscription details using the new structured method
    let subscription = billing_service.get_subscription_details_for_client(&user_id.0).await?;
    
    // Return the subscription details
    Ok(HttpResponse::Ok().json(subscription))
}





#[derive(Debug, Deserialize)]
pub struct CancelSubscriptionRequest {
    #[serde(default = "default_at_period_end")]
    pub at_period_end: bool,
}

#[derive(Debug, Deserialize)]
pub struct ResumeSubscriptionRequest {
    // No fields needed for resuming - we just resume the existing subscription
}

#[derive(Debug, Deserialize)]
pub struct ReactivateSubscriptionRequest {
    pub plan_id: Option<String>,
}


fn default_proration_behavior() -> String {
    "create_prorations".to_string()
}

fn default_at_period_end() -> bool {
    true
}

fn parse_proration_behavior(behavior: &str) -> Result<crate::services::stripe_service::ProrationBehavior, AppError> {
    match behavior.to_lowercase().as_str() {
        "create_prorations" => Ok(crate::services::stripe_service::ProrationBehavior::CreateProrations),
        "none" => Ok(crate::services::stripe_service::ProrationBehavior::None),
        "always_invoice" => Ok(crate::services::stripe_service::ProrationBehavior::AlwaysInvoice),
        _ => Err(AppError::InvalidArgument(format!("Invalid proration behavior: {}", behavior))),
    }
}

fn parse_billing_cycle_anchor(anchor: Option<&str>) -> Result<Option<crate::services::stripe_service::BillingCycleAnchor>, AppError> {
    match anchor {
        Some("now") => Ok(Some(crate::services::stripe_service::BillingCycleAnchor::Now)),
        Some("unchanged") => Ok(Some(crate::services::stripe_service::BillingCycleAnchor::Unchanged)),
        None => Ok(None),
        Some(other) => Err(AppError::InvalidArgument(format!("Invalid billing cycle anchor: {}", other))),
    }
}





/// Cancel a subscription for a user
pub async fn cancel_subscription(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<CancelSubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Canceling subscription for user: {} (at_period_end: {})", user_id.0, req.at_period_end);
    
    let updated_subscription = billing_service.cancel_subscription(
        &user_id.0,
        req.at_period_end,
    ).await?;
    
    info!("Successfully canceled subscription for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(updated_subscription))
}

/// Resume a subscription that was set to cancel at period end
pub async fn resume_subscription(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    _req: web::Json<ResumeSubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Resuming subscription for user: {}", user_id.0);
    
    let updated_subscription = billing_service.resume_subscription(
        &user_id.0,
    ).await?;
    
    info!("Successfully resumed subscription for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(updated_subscription))
}

/// Reactivate a subscription for a user (creates new subscription)
pub async fn reactivate_subscription(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<ReactivateSubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Recreating subscription for user: {}", user_id.0);
    
    let updated_subscription = billing_service.reactivate_subscription(
        &user_id.0,
        req.plan_id.clone(),
    ).await?;
    
    info!("Successfully reactivated subscription for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(updated_subscription))
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

// ========================================
// SUBSCRIPTION PLAN HANDLERS
// ========================================

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

/// Get available subscription plans - using subscription_plan_repository and returning Vec<SubscriptionPlan>
#[get("/plans")]
pub async fn get_available_plans(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting available subscription plans");
    
    let plans = app_state.subscription_plan_repository.get_all_plans().await?;
    
    let client_plans: Result<Vec<ClientSubscriptionPlan>, AppError> = plans.into_iter().map(|plan| {
        // Get typed features (fallback to defaults if parsing fails)
        let typed_features = plan.get_typed_features().unwrap_or_else(|e| {
            error!("Failed to parse features for plan '{}': {}", plan.id, e);
            PlanFeatures {
                core_features: vec!["Basic features".to_string()],
                allowed_models: vec!["basic".to_string()],
                support_level: "Standard".to_string(),
                api_access: false,
                analytics_level: "Basic".to_string(),
                spending_details: SpendingDetails {
                    overage_policy: "none".to_string(),
                    hard_cutoff: true,
                },
            }
        });
        
        Ok(ClientSubscriptionPlan {
            id: plan.id.clone(),
            name: plan.name.clone(),
            monthly_price: plan.base_price_monthly.clone(),
            yearly_price: plan.base_price_yearly.clone(),
            currency: plan.currency.clone(),
            trial_days: app_state.settings.subscription.default_trial_days as i32,
            features: typed_features.core_features,
            recommended: plan.plan_tier == 1, // Pro plan is recommended
            active: true, // All plans in database are considered active
        })
    }).collect();
    
    Ok(HttpResponse::Ok().json(client_plans?))
}

// ========================================
// SUBSCRIPTION CREATION HANDLERS
// ========================================

#[derive(Debug, Deserialize)]
pub struct CreateSubscriptionIntentRequest {
    pub plan_id: String,
    pub trial_days: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionIntentResponse {
    pub subscription_id: String,
    pub client_secret: Option<String>, // For SetupIntent or PaymentIntent
    pub publishable_key: String,
    pub status: String,
    pub trial_end: Option<String>,
}

/// Create a subscription with SetupIntent for trial (modern embedded payment flow)
/// Fixed client secret retrieval to prioritize subscription.pending_setup_intent.client_secret
#[post("/subscriptions/create-with-intent")]
pub async fn create_subscription_with_intent(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<CreateSubscriptionIntentRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Creating subscription with intent for plan: {} for user: {}", req.plan_id, user_id.0);
    
    let subscription = billing_service.create_subscription_with_trial(
        &user_id.0,
        &req.plan_id,
    ).await?;
    
    let publishable_key = billing_service.get_stripe_publishable_key()?;
    
    // Fixed client secret retrieval logic - prioritize pending_setup_intent first
    let client_secret = subscription.pending_setup_intent
        .and_then(|setup_intent| match setup_intent {
            stripe::Expandable::Id(_) => None,
            stripe::Expandable::Object(setup_intent_obj) => setup_intent_obj.client_secret,
        })
        .or_else(|| {
            // Fallback to payment_intent.client_secret from latest_invoice
            subscription.latest_invoice
                .and_then(|invoice| match invoice {
                    stripe::Expandable::Id(_) => None,
                    stripe::Expandable::Object(invoice_obj) => {
                        invoice_obj.payment_intent.and_then(|pi| match pi {
                            stripe::Expandable::Id(_) => None,
                            stripe::Expandable::Object(pi_obj) => pi_obj.client_secret,
                        })
                    }
                })
        });
    
    let response = SubscriptionIntentResponse {
        subscription_id: subscription.id.to_string(),
        client_secret,
        publishable_key,
        status: format!("{:?}", subscription.status),
        trial_end: subscription.trial_end.and_then(|t| {
            chrono::DateTime::from_timestamp(t, 0)
                .map(|dt| dt.to_rfc3339())
        }),
    };
    
    info!("Successfully created subscription with intent for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}