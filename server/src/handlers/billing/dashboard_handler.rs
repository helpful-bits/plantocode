use actix_web::{web, HttpResponse};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::models::billing::{BillingDashboardData, UsageSummaryQuery};
use crate::models::AuthenticatedUser;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, DetailedUsageResponse};
use crate::db::connection::DatabasePools;
use chrono::{DateTime, Utc};
use log::{info, error};


/// Get consolidated billing dashboard data
pub async fn get_billing_dashboard_data_handler(
    user: web::ReqData<AuthenticatedUser>,
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    
    let dashboard_data = billing_service.get_billing_dashboard_data(&user.user_id).await?;
    
    info!("Successfully retrieved billing dashboard data for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(dashboard_data))
}


/// Get detailed usage with pre-calculated summary totals for a date range (renamed to match frontend)
pub async fn get_detailed_usage_with_summary_handler(
    user: web::ReqData<AuthenticatedUser>,
    query: web::Query<UsageSummaryQuery>,
    api_usage_repo: web::Data<ApiUsageRepository>,
    db_pools: web::Data<DatabasePools>,
) -> Result<HttpResponse, AppError> {
    
    let usage_summary = api_usage_repo
        .get_detailed_usage_with_summary_with_system_pool(&user.user_id, query.start_date, query.end_date, &db_pools.system_pool)
        .await?;
    
    info!("Successfully retrieved detailed usage with summary for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(usage_summary))
}

