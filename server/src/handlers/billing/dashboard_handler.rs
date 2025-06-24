use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use chrono::{DateTime, Utc};
use log::{debug, info, error};

// Public structs for the billing dashboard data
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardPlanDetails {
    pub plan_id: String,
    pub name: String,
    pub price_usd: f64,
    pub billing_interval: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardSpendingDetails {
    pub current_spending_usd: f64,
    pub spending_limit_usd: f64,
    pub period_start: String,
    pub period_end: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardData {
    pub plan_details: BillingDashboardPlanDetails,
    pub spending_details: BillingDashboardSpendingDetails,
    pub credit_balance_usd: f64,
    pub subscription_status: String,
    pub trial_ends_at: Option<String>,
    pub services_blocked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageDateRange {
    pub start_date: String,
    pub end_date: String,
}

/// Get consolidated billing dashboard data
pub async fn get_billing_dashboard_data_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting billing dashboard data for user: {}", user_id.0);
    
    let dashboard_data = billing_service.get_billing_dashboard_data(&user_id.0).await?;
    
    info!("Successfully retrieved billing dashboard data for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(dashboard_data))
}

/// Get detailed usage data for a user within a date range
pub async fn get_detailed_usage(
    user_id: UserId,
    query: web::Query<UsageDateRange>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting detailed usage data for user: {} from {} to {}", user_id.0, query.start_date, query.end_date);
    
    // Parse the date strings into DateTime<Utc>
    let start_date = DateTime::parse_from_rfc3339(&query.start_date)
        .map_err(|e| AppError::BadRequest(format!("Invalid start_date format: {}", e)))?
        .with_timezone(&Utc);
    
    let end_date = DateTime::parse_from_rfc3339(&query.end_date)
        .map_err(|e| AppError::BadRequest(format!("Invalid end_date format: {}", e)))?
        .with_timezone(&Utc);
    
    // Validate date range
    if start_date >= end_date {
        return Err(AppError::BadRequest("start_date must be before end_date".to_string()));
    }
    
    // Call the billing service method
    let detailed_usage = billing_service.get_detailed_usage(&user_id.0, start_date, end_date).await?;
    
    info!("Successfully retrieved {} detailed usage records for user: {}", detailed_usage.len(), user_id.0);
    Ok(HttpResponse::Ok().json(detailed_usage))
}