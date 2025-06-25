use actix_web::{web, HttpResponse, get};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use crate::models::runtime_config::AppState;
use crate::db::repositories::subscription_plan_repository::PlanFeatures;
use log::{debug, error};
use bigdecimal::ToPrimitive;
use chrono::{DateTime, Utc};

// ========================================
// SUBSCRIPTION MANAGEMENT HANDLERS
// ========================================

/// Get API usage summary
#[get("/usage")]
pub async fn get_usage_summary(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting API usage for user: {}", user_id.0);
    
    // Get consolidated billing dashboard data
    let dashboard_data = billing_service.get_billing_dashboard_data(&user_id.0).await?;
    
    // Return consolidated billing dashboard data
    Ok(HttpResponse::Ok().json(dashboard_data))
}

// ========================================
// SUBSCRIPTION PLAN HANDLERS
// ========================================


/// Get available subscription plans - using subscription_plan_repository and returning Vec<SubscriptionPlan>
#[get("/subscription-plans")]
pub async fn get_available_plans(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting available subscription plans");
    
    let plans = app_state.subscription_plan_repository.get_all_plans().await?;
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ClientSubscriptionPlan {
        pub id: String,
        pub name: String,
        pub description: String,
        pub weekly_price: String,
        pub monthly_price: String,
        pub yearly_price: String,
        pub currency: String,
        pub trial_days: i32,
        pub features: Vec<String>,
        pub active: bool,
        pub recommended: bool,
        pub stripe_weekly_price_id: Option<String>,
        pub stripe_monthly_price_id: Option<String>,
        pub stripe_yearly_price_id: Option<String>,
        pub created_at: Option<chrono::DateTime<chrono::Utc>>,
        pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let client_plans: Result<Vec<ClientSubscriptionPlan>, AppError> = plans.into_iter().map(|plan| {
        // Get typed features (fallback to defaults if parsing fails)
        let typed_features = plan.get_typed_features().unwrap_or_else(|e| {
            error!("Failed to parse features for plan '{}': {}", plan.id, e);
            PlanFeatures {
                core_features: vec!["Basic features".to_string()],
                support_level: "Standard".to_string(),
                api_access: false,
                analytics_level: "Basic".to_string(),
            }
        });
        
        Ok(ClientSubscriptionPlan {
            id: plan.id.clone(),
            name: plan.name.clone(),
            description: plan.description.unwrap_or_else(|| format!("{} subscription plan", plan.name)),
            weekly_price: plan.base_price_weekly.to_string(),
            monthly_price: plan.base_price_monthly.to_string(),
            yearly_price: plan.base_price_yearly.to_string(),
            currency: plan.currency.clone(),
            trial_days: app_state.settings.subscription.default_trial_days as i32,
            features: typed_features.core_features,
            active: plan.active,
            recommended: plan.id == "pro",
            stripe_weekly_price_id: plan.stripe_price_id_weekly,
            stripe_monthly_price_id: plan.stripe_price_id_monthly,
            stripe_yearly_price_id: plan.stripe_price_id_yearly,
            created_at: None,
            updated_at: None,
        })
    }).collect();
    
    Ok(HttpResponse::Ok().json(client_plans?))
}

#[derive(Debug, Deserialize)]
pub struct DetailedUsageQuery {
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
}

#[get("/usage/details")]
pub async fn get_detailed_usage(
    user_id: UserId,
    query: web::Query<DetailedUsageQuery>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting detailed usage for user: {} from {} to {}", user_id.0, query.start_date, query.end_date);
    
    let usage_records = billing_service.get_detailed_usage(&user_id.0, query.start_date, query.end_date).await?;
    
    Ok(HttpResponse::Ok().json(usage_records))
}

/// Get current user's subscription plan with cost markup information
#[get("/current-plan")]
pub async fn get_current_plan(
    user_id: UserId,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting current plan for user: {}", user_id.0);
    
    // Get user's current subscription
    let subscription = app_state.subscription_repository
        .get_by_user_id(&user_id.0)
        .await?
        .ok_or_else(|| AppError::NotFound("No active subscription found".to_string()))?;
    
    // Get the plan details
    let plan = app_state.subscription_plan_repository
        .get_plan_by_id(&subscription.plan_id)
        .await?;
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CurrentPlanResponse {
        pub plan_id: String,
        pub plan_name: String,
        pub monthly_price: f64,
        pub status: String,
    }
    
    let response = CurrentPlanResponse {
        plan_id: plan.id.clone(),
        plan_name: plan.name.clone(),
        monthly_price: plan.get_monthly_price_float(),
        status: subscription.status.clone(),
    };
    
    Ok(HttpResponse::Ok().json(response))
}

