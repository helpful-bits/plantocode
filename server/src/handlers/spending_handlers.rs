use actix_web::{web, HttpResponse, get, post, put};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use log::debug;
use bigdecimal::{ToPrimitive, BigDecimal, FromPrimitive};

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
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting spending status for user: {}", user_id.0);
    
    // Get spending status from billing service
    let spending_status = billing_service.get_spending_status(&user_id.0).await?;
    
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
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Checking service access for user: {}", user_id.0);
    
    let has_access = billing_service.check_service_access(&user_id.0, "").await?;
    
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
    billing_service: web::Data<BillingService>,
    request: web::Json<UpdateSpendingLimitsRequest>,
) -> Result<HttpResponse, AppError> {
    debug!("Updating spending limits for user: {}", user_id.0);
    
    // Get current spending status to find the current billing period
    let current_status = billing_service.get_spending_status(&user_id.0).await?;
    
    // Get spending repository
    let spending_repo = crate::db::repositories::spending_repository::SpendingRepository::new(
        billing_service.get_db_pool()
    );
    
    let mut current_limit = spending_repo
        .get_user_spending_limit_for_period(&user_id.0, &current_status.billing_period_start)
        .await?
        .ok_or_else(|| AppError::Internal("No spending limit found for current period".to_string()))?;
    
    // Update limits based on request
    let mut updated = false;
    
    if let Some(monthly_limit) = request.monthly_spending_limit {
        if monthly_limit > 0.0 {
            current_limit.included_allowance = BigDecimal::from_f64(monthly_limit)
                .ok_or_else(|| AppError::InvalidArgument("Invalid monthly spending limit".to_string()))?;
            updated = true;
            debug!("Updated monthly spending limit to {} for user {}", monthly_limit, user_id.0);
        }
    }
    
    if let Some(hard_limit) = request.hard_limit {
        if hard_limit > 0.0 {
            current_limit.hard_limit = BigDecimal::from_f64(hard_limit)
                .ok_or_else(|| AppError::InvalidArgument("Invalid hard limit".to_string()))?;
            updated = true;
            debug!("Updated hard limit to {} for user {}", hard_limit, user_id.0);
        }
    }
    
    if !updated {
        return Err(AppError::InvalidArgument("No valid limits provided for update".to_string()));
    }
    
    // Validate that hard limit is greater than or equal to monthly limit
    if current_limit.hard_limit < current_limit.included_allowance {
        return Err(AppError::InvalidArgument("Hard limit cannot be less than monthly allowance".to_string()));
    }
    
    // Update the spending limit in database
    current_limit.updated_at = Some(chrono::Utc::now());
    spending_repo.create_or_update_user_spending_limit(&current_limit).await?;
    
    // Check if services should be unblocked (if current spending is now below new hard limit)
    if current_limit.services_blocked && current_limit.current_spending < current_limit.hard_limit {
        billing_service.get_cost_based_billing_service().unblock_services(&user_id.0).await?;
        debug!("Unblocked services for user {} due to increased spending limits", user_id.0);
    }
    
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct UpdateLimitsResponse {
        success: bool,
        message: String,
        updated_limits: UpdatedLimitsInfo,
    }
    
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct UpdatedLimitsInfo {
        monthly_allowance: f64,
        hard_limit: f64,
        current_spending: f64,
        services_blocked: bool,
    }
    
    let response = UpdateLimitsResponse {
        success: true,
        message: "Spending limits updated successfully".to_string(),
        updated_limits: UpdatedLimitsInfo {
            monthly_allowance: current_limit.included_allowance.to_f64().unwrap_or(0.0),
            hard_limit: current_limit.hard_limit.to_f64().unwrap_or(0.0),
            current_spending: current_limit.current_spending.to_f64().unwrap_or(0.0),
            services_blocked: current_limit.services_blocked,
        },
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Acknowledge a spending alert
#[post("/alerts/acknowledge")]
pub async fn acknowledge_alert(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    request: web::Json<AcknowledgeAlertRequest>,
) -> Result<HttpResponse, AppError> {
    debug!("Acknowledging alert {} for user: {}", request.alert_id, user_id.0);
    
    let alert_id = Uuid::parse_str(&request.alert_id)
        .map_err(|_| AppError::InvalidArgument("Invalid alert ID format".to_string()))?;
    
    // Use spending repository to acknowledge the alert
    let spending_repo = crate::db::repositories::spending_repository::SpendingRepository::new(
        billing_service.get_db_pool()
    );
    
    spending_repo.acknowledge_alert(&alert_id).await?;
    
    debug!("Successfully acknowledged alert {} for user {}", alert_id, user_id.0);
    
    #[derive(serde::Serialize)]
    struct AcknowledgeResponse {
        success: bool,
        message: String,
    }
    
    Ok(HttpResponse::Ok().json(AcknowledgeResponse {
        success: true,
        message: "Alert acknowledged successfully".to_string(),
    }))
}

/// Get spending history for user
#[get("/history")]
pub async fn get_spending_history(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting spending history for user: {}", user_id.0);
    
    // Get historical spending data from API usage repository
    let api_usage_repo = crate::db::repositories::api_usage_repository::ApiUsageRepository::new(
        billing_service.get_db_pool()
    );
    
    // Get spending data for the last 6 months
    let six_months_ago = chrono::Utc::now() - chrono::Duration::days(180);
    let usage_data = api_usage_repo.get_usage_for_period(&user_id.0, Some(six_months_ago), None).await?;
    
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SpendingHistoryEntry {
        period: String,
        total_cost: f64,
        total_tokens_input: i64,
        total_tokens_output: i64,
        request_count: i64,
        services_used: Vec<String>,
    }
    
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SpendingHistoryResponse {
        total_periods: usize,
        total_spending: f64,
        monthly_breakdown: Vec<SpendingHistoryEntry>,
        currency: String,
    }
    
    // Group usage by month and create history entries
    let mut monthly_breakdown = Vec::new();
    let mut total_spending = 0.0;
    
    // For now, create a single entry for the current period
    let current_period = chrono::Utc::now().format("%Y-%m").to_string();
    let total_cost = usage_data.total_cost.to_f64().unwrap_or(0.0);
    total_spending += total_cost;
    
    // Extract unique services from usage data
    let services_used = vec!["AI Completion".to_string()]; // Simplified for now
    
    monthly_breakdown.push(SpendingHistoryEntry {
        period: current_period,
        total_cost,
        total_tokens_input: usage_data.tokens_input,
        total_tokens_output: usage_data.tokens_output,
        request_count: 1, // ApiUsageReport doesn't track request count, using default
        services_used,
    });
    
    let response = SpendingHistoryResponse {
        total_periods: monthly_breakdown.len(),
        total_spending,
        monthly_breakdown,
        currency: "USD".to_string(),
    };
    
    Ok(HttpResponse::Ok().json(response))
}