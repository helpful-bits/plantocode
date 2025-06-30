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
pub struct BillingDashboardData {
    pub credit_balance_usd: f64,
    pub services_blocked: bool,
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

