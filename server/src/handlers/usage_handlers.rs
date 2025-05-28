use actix_web::{web, HttpResponse, Responder};
use chrono::{DateTime, Utc, Datelike, Timelike};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use bigdecimal::{BigDecimal, ToPrimitive};

use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::middleware::secure_auth::{UserId, UserRole, UserEmail};
use crate::models::runtime_config::AppState;

/// Response data structure for cost-based usage summary
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummaryResponse {
    current_spending: f64,
    monthly_allowance: f64,
    hard_limit: f64,
    cycle_start_date: Option<DateTime<Utc>>,
    cycle_end_date: Option<DateTime<Utc>>,
    usage_percentage: f64,
    services_blocked: bool,
    currency: String,
    trial_days_remaining: Option<i64>,
    plan_name: Option<String>,
}

/// Get cost-based usage summary for the current user
pub async fn get_usage_summary_handler(
    user_id: UserId,
    cost_billing_service: web::Data<CostBasedBillingService>,
    app_state: web::Data<AppState>,
) -> impl Responder {
    match cost_billing_service.get_current_spending_status(&user_id.0).await {
        Ok(spending_status) => {
            // Convert BigDecimal to f64
            let current_spending = spending_status.current_spending.to_f64().unwrap_or(0.0);
            let monthly_allowance = spending_status.included_allowance.to_f64().unwrap_or(0.0);
            let hard_limit = spending_status.hard_limit.to_f64().unwrap_or(0.0);
            
            // Use correct billing period dates from spending status
            let cycle_start_date = spending_status.billing_period_start;
            let cycle_end_date = spending_status.next_billing_date;
                
            // Get subscription details for plan name and trial info
            let (plan_name, trial_days_remaining) = match app_state.subscription_repository.get_by_user_id(&user_id.0).await {
                Ok(Some(subscription)) => {
                    let trial_days = if subscription.status == "trialing" {
                        if let Some(trial_ends_at) = subscription.trial_ends_at {
                            let now = Utc::now();
                            if trial_ends_at > now {
                                Some((trial_ends_at - now).num_days())
                            } else {
                                Some(0)
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    };
                    
                    // Get actual plan name from database - NO hardcoded mappings
                    let plan_name = match app_state.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await {
                        Ok(plan) => Some(plan.name),
                        Err(_) => Some(subscription.plan_id.clone()) // Fallback to plan_id if plan not found
                    };
                    
                    (plan_name, trial_days)
                },
                Ok(None) => (None, None), // No subscription = no plan name
                Err(_) => (None, None) // Error = no plan name
            };

            HttpResponse::Ok().json(UsageSummaryResponse {
                current_spending,
                monthly_allowance,
                hard_limit,
                cycle_start_date: Some(cycle_start_date),
                cycle_end_date: Some(cycle_end_date),
                usage_percentage: spending_status.usage_percentage,
                services_blocked: spending_status.services_blocked,
                currency: spending_status.currency,
                trial_days_remaining,
                plan_name,
            })
        },
        Err(e) => {
            log::error!("Failed to get spending status for user {}: {}", user_id.0, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve usage data"
            }))
        }
    }
}