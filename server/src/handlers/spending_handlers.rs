use actix_web::{web, HttpResponse, get, post, put};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::AppError;
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::middleware::secure_auth::UserId;
use log::{debug, error};
use bigdecimal::ToPrimitive;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingStatusResponse {
    pub current_spending: f64,
    pub included_allowance: f64,
    pub remaining_allowance: f64,
    pub overage_amount: f64,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub hard_limit: f64,
    pub next_billing_date: String,
    pub currency: String,
    pub alerts: Vec<SpendingAlertResponse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingAlertResponse {
    pub id: String,
    pub alert_type: String,
    pub threshold_amount: f64,
    pub current_spending: f64,
    pub alert_sent_at: String,
    pub acknowledged: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpendingLimitsRequest {
    pub monthly_spending_limit: Option<f64>,
    pub hard_limit: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcknowledgeAlertRequest {
    pub alert_id: String,
}

/// Get current spending status for user
#[get("/status")]
pub async fn get_spending_status(
    user_id: UserId,
    cost_billing_service: web::Data<CostBasedBillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting spending status for user: {}", user_id.0);
    
    // Get spending status from cost-based billing service
    let spending_status = cost_billing_service.get_current_spending_status(&user_id.0).await?;
    
    // Convert BigDecimal to f64 for JSON response
    let response = SpendingStatusResponse {
        current_spending: spending_status.current_spending.to_f64().unwrap_or(0.0),
        included_allowance: spending_status.included_allowance.to_f64().unwrap_or(0.0),
        remaining_allowance: spending_status.remaining_allowance.to_f64().unwrap_or(0.0),
        overage_amount: spending_status.overage_amount.to_f64().unwrap_or(0.0),
        usage_percentage: spending_status.usage_percentage,
        services_blocked: spending_status.services_blocked,
        hard_limit: spending_status.hard_limit.to_f64().unwrap_or(0.0),
        next_billing_date: spending_status.next_billing_date.to_rfc3339(),
        currency: spending_status.currency,
        alerts: spending_status.alerts.into_iter().map(|alert| SpendingAlertResponse {
            id: alert.id.to_string(),
            alert_type: alert.alert_type,
            threshold_amount: alert.threshold_amount.to_f64().unwrap_or(0.0),
            current_spending: alert.current_spending.to_f64().unwrap_or(0.0),
            alert_sent_at: alert.alert_sent_at.to_rfc3339(),
            acknowledged: alert.acknowledged,
        }).collect(),
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Check if services are accessible for user
#[get("/access")]
pub async fn check_service_access(
    user_id: UserId,
    cost_billing_service: web::Data<CostBasedBillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Checking service access for user: {}", user_id.0);
    
    let has_access = cost_billing_service.check_service_access(&user_id.0).await?;
    
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AccessResponse {
        has_access: bool,
        message: String,
    }
    
    let response = if has_access {
        AccessResponse {
            has_access: true,
            message: "Services available".to_string(),
        }
    } else {
        AccessResponse {
            has_access: false,
            message: "Services blocked due to spending limit".to_string(),
        }
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Update user spending limits
#[put("/limits")]
pub async fn update_spending_limits(
    user_id: UserId,
    cost_billing_service: web::Data<CostBasedBillingService>,
    request: web::Json<UpdateSpendingLimitsRequest>,
) -> Result<HttpResponse, AppError> {
    debug!("Updating spending limits for user: {}", user_id.0);
    
    error!("Update spending limits not yet implemented");
    Err(AppError::Internal("Feature not yet implemented".to_string()))
}

/// Acknowledge a spending alert
#[post("/alerts/acknowledge")]
pub async fn acknowledge_alert(
    user_id: UserId,
    cost_billing_service: web::Data<CostBasedBillingService>,
    request: web::Json<AcknowledgeAlertRequest>,
) -> Result<HttpResponse, AppError> {
    debug!("Acknowledging alert {} for user: {}", request.alert_id, user_id.0);
    
    let alert_id = Uuid::parse_str(&request.alert_id)
        .map_err(|_| AppError::InvalidArgument("Invalid alert ID format".to_string()))?;
    
    error!("Acknowledge alert not yet implemented");
    Err(AppError::Internal("Feature not yet implemented".to_string()))
}

/// Get spending history for user
#[get("/history")]
pub async fn get_spending_history(
    user_id: UserId,
    cost_billing_service: web::Data<CostBasedBillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting spending history for user: {}", user_id.0);
    
    
    #[derive(Serialize)]
    struct HistoryResponse {
        message: String,
    }
    
    let response = HistoryResponse {
        message: "Spending history feature coming soon".to_string(),
    };
    
    Ok(HttpResponse::Ok().json(response))
}