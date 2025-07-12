use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::models::billing::{BillingDashboardData, UsageSummaryQuery};
use crate::models::AuthenticatedUser;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, DetailedUsageResponse};
use chrono::{DateTime, Utc};
use log::{debug, info, error};


/// Get consolidated billing dashboard data
pub async fn get_billing_dashboard_data_handler(
    user: web::ReqData<AuthenticatedUser>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting billing dashboard data for user: {}", user.user_id);
    
    let dashboard_data = billing_service.get_billing_dashboard_data(&user.user_id).await?;
    
    info!("Successfully retrieved billing dashboard data for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(dashboard_data))
}

/// Get customer billing information for read-only display
pub async fn get_customer_billing_info_handler(
    user: web::ReqData<AuthenticatedUser>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting customer billing info for user: {}", user.user_id);
    
    let billing_info = billing_service.get_customer_billing_info(&user.user_id).await?;
    
    info!("Successfully retrieved customer billing info for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(billing_info))
}

/// Get detailed usage with pre-calculated summary totals for a date range (renamed to match frontend)
pub async fn get_detailed_usage_with_summary_handler(
    user: web::ReqData<AuthenticatedUser>,
    query: web::Query<UsageSummaryQuery>,
    api_usage_repo: web::Data<ApiUsageRepository>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting detailed usage with summary for user: {} from {} to {}", user.user_id, query.start_date, query.end_date);
    
    let usage_summary = api_usage_repo
        .get_detailed_usage_with_summary(&user.user_id, query.start_date, query.end_date)
        .await?;
    
    info!("Successfully retrieved detailed usage with summary for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(usage_summary))
}

