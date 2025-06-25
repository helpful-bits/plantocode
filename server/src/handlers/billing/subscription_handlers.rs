use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use crate::models::runtime_config::AppState;
use log::{debug, info};
use chrono::{DateTime, Utc};
use bigdecimal::{BigDecimal, FromPrimitive};

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
    
    Ok(HttpResponse::Ok().json(plans))
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
    
    if query.start_date >= query.end_date {
        return Err(AppError::BadRequest("start_date must be before end_date".to_string()));
    }
    
    let usage_records = billing_service.get_detailed_usage(&user_id.0, query.start_date, query.end_date).await?;
    
    info!("Successfully retrieved {} usage records for user: {}", usage_records.len(), user_id.0);
    
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

// ========================================
// AUTO TOP-OFF HANDLERS
// ========================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoTopOffSettings {
    pub enabled: bool,
    pub threshold: Option<f64>,
    pub amount: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAutoTopOffRequest {
    pub enabled: bool,
    pub threshold: Option<f64>,
    pub amount: Option<f64>,
}

/// Get auto top-off settings for the user
#[get("/auto-top-off-settings")]
pub async fn get_auto_top_off_settings_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting auto top-off settings for user: {}", user_id.0);
    
    let settings = billing_service.get_auto_top_off_settings(&user_id.0).await?;
    
    info!("Successfully retrieved auto top-off settings for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(settings))
}

/// Update auto top-off settings for the user
#[post("/auto-top-off-settings")]
pub async fn update_auto_top_off_settings_handler(
    user_id: UserId,
    request: web::Json<UpdateAutoTopOffRequest>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Updating auto top-off settings for user: {}", user_id.0);
    
    // Validate the request
    if request.enabled {
        if let Some(threshold) = request.threshold {
            if threshold <= 0.0 || threshold > 1000.0 {
                return Err(AppError::BadRequest("Auto top-off threshold must be between $0.01 and $1000.00".to_string()));
            }
        } else {
            return Err(AppError::BadRequest("Auto top-off threshold is required when auto top-off is enabled".to_string()));
        }
        
        if let Some(amount) = request.amount {
            if amount <= 0.0 || amount > 1000.0 {
                return Err(AppError::BadRequest("Auto top-off amount must be between $0.01 and $1000.00".to_string()));
            }
        } else {
            return Err(AppError::BadRequest("Auto top-off amount is required when auto top-off is enabled".to_string()));
        }
    }
    
    let settings = billing_service.update_auto_top_off_settings(
        &user_id.0,
        request.enabled,
        request.threshold.map(|t| BigDecimal::from_f64(t).unwrap_or_default()),
        request.amount.map(|a| BigDecimal::from_f64(a).unwrap_or_default()),
    ).await?;
    
    info!("Successfully updated auto top-off settings for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(settings))
}

