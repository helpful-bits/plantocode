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
    pub current_spending: String,
    pub included_allowance: String,
    pub remaining_allowance: String,
    pub overage_amount: String,
    pub credit_balance: String,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub hard_limit: String,
    pub next_billing_date: String,
    pub currency: String,
    pub alerts: Vec<SpendingAlertResponse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingAlertResponse {
    pub id: String,
    pub alert_type: String,
    pub threshold_amount: String,
    pub current_spending: String,
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
    
    // Convert BigDecimal to String for JSON response
    let response = SpendingStatusResponse {
        current_spending: spending_status.current_spending.to_string(),
        included_allowance: spending_status.included_allowance.to_string(),
        remaining_allowance: spending_status.remaining_allowance.to_string(),
        overage_amount: spending_status.overage_amount.to_string(),
        credit_balance: spending_status.credit_balance.to_string(),
        usage_percentage: spending_status.usage_percentage,
        services_blocked: spending_status.services_blocked,
        hard_limit: spending_status.hard_limit.to_string(),
        next_billing_date: spending_status.next_billing_date.to_rfc3339(),
        currency: spending_status.currency,
        alerts: spending_status.alerts.into_iter().map(|alert| SpendingAlertResponse {
            id: alert.id.to_string(),
            alert_type: alert.alert_type,
            threshold_amount: alert.threshold_amount.to_string(),
            current_spending: alert.current_spending.to_string(),
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
        monthly_allowance: String,
        hard_limit: String,
        current_spending: String,
        services_blocked: bool,
    }
    
    let response = UpdateLimitsResponse {
        success: true,
        message: "Spending limits updated successfully".to_string(),
        updated_limits: UpdatedLimitsInfo {
            monthly_allowance: current_limit.included_allowance.to_string(),
            hard_limit: current_limit.hard_limit.to_string(),
            current_spending: current_limit.current_spending.to_string(),
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
    
    // Get comprehensive spending analytics
    let analytics = billing_service.get_cost_based_billing_service()
        .get_spending_analytics(&user_id.0, 12).await?;
    
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SpendingHistoryEntry {
        period: String,
        total_cost: String,
        total_tokens_input: i64,
        total_tokens_output: i64,
        request_count: i32,
        services_used: Vec<String>,
        plan_id: String,
    }
    
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SpendingHistoryResponse {
        total_periods: usize,
        total_spending: String,
        monthly_breakdown: Vec<SpendingHistoryEntry>,
        currency: String,
        monthly_average: String,
        projected_month_end: String,
        spending_trend: String,
        cost_per_request: f64,
        cost_per_token: f64,
        days_until_limit: Option<i32>,
    }
    
    // Convert spending trends to monthly breakdown
    let monthly_breakdown: Vec<SpendingHistoryEntry> = analytics.trends.into_iter().map(|trend| {
        SpendingHistoryEntry {
            period: trend.period_start.format("%Y-%m").to_string(),
            total_cost: trend.total_spending.to_string(),
            total_tokens_input: 0, // Would need to be calculated from api_usage
            total_tokens_output: 0, // Would need to be calculated from api_usage
            request_count: trend.total_requests,
            services_used: vec!["AI Services".to_string()], // Simplified
            plan_id: trend.plan_id,
        }
    }).collect();
    
    let response = SpendingHistoryResponse {
        total_periods: monthly_breakdown.len(),
        total_spending: analytics.summary.total_spending.to_string(),
        monthly_breakdown,
        currency: analytics.current_status.currency,
        monthly_average: analytics.monthly_average.to_string(),
        projected_month_end: analytics.projected_month_end_spending.to_string(),
        spending_trend: analytics.spending_trend,
        cost_per_request: analytics.cost_per_request.parse().unwrap_or(0.0),
        cost_per_token: analytics.cost_per_token.parse().unwrap_or(0.0),
        days_until_limit: analytics.days_until_limit,
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get spending analytics for user
#[get("/analytics")]
pub async fn get_spending_analytics(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting spending analytics for user: {}", user_id.0);
    
    let analytics = billing_service.get_cost_based_billing_service()
        .get_spending_analytics(&user_id.0, 6).await?;
    
    Ok(HttpResponse::Ok().json(analytics))
}

/// Get spending forecast for user
#[get("/forecast")]
pub async fn get_spending_forecast(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting spending forecast for user: {}", user_id.0);
    
    let forecast = billing_service.get_cost_based_billing_service()
        .get_spending_forecast(&user_id.0, 3).await?;
    
    Ok(HttpResponse::Ok().json(forecast))
}