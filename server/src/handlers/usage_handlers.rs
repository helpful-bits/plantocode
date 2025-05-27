use actix_web::{web, HttpResponse, Responder};
use chrono::{DateTime, Utc, Duration, Datelike, Timelike};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use serde_json::Value;

use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use crate::middleware::secure_auth::{UserId, UserRole, UserEmail};
use crate::models::runtime_config::AppState;

/// Response data structure for usage summary
#[derive(Serialize, Deserialize)]
pub struct UsageSummaryResponse {
    used_tokens: i64,
    monthly_limit: i64,
    cycle_start_date: Option<DateTime<Utc>>,
    cycle_end_date: Option<DateTime<Utc>>,
    estimated_cost: f64,
    currency: String,
    trial_days_remaining: Option<i64>,
    plan_name: Option<String>,
}

#[derive(Debug, Clone)]
struct SubscriptionPlanData {
    id: String,
    name: String,
    features: Value,
    monthly_token_limit: Option<i64>,
}

/// Get usage summary for the current user
pub async fn get_usage_summary_handler(
    user_id: UserId,
    pool: web::Data<PgPool>,
    app_state: web::Data<AppState>
) -> impl Responder {
    let user_id = user_id.0.to_string();
    
    // Create repositories
    let api_usage_repo = ApiUsageRepository::new(pool.get_ref().clone());
    let subscription_repo = SubscriptionRepository::new(pool.get_ref().clone());
    let plan_repo = SubscriptionPlanRepository::new(pool.get_ref().clone());
    
    // Get current date and calculate cycle dates
    let now = Utc::now();
    let cycle_start = now.with_day(1).unwrap().with_hour(0).unwrap()
        .with_minute(0).unwrap().with_second(0).unwrap().with_nanosecond(0).unwrap();
    
    // Calculate next month for cycle end
    let cycle_end = if now.month() == 12 {
        Utc::now().with_year(now.year() + 1).unwrap()
            .with_month(1).unwrap().with_day(1).unwrap()
            .with_hour(0).unwrap().with_minute(0).unwrap()
            .with_second(0).unwrap().with_nanosecond(0).unwrap()
    } else {
        Utc::now().with_month(now.month() + 1).unwrap()
            .with_day(1).unwrap().with_hour(0).unwrap()
            .with_minute(0).unwrap().with_second(0).unwrap()
            .with_nanosecond(0).unwrap()
    };
    
    // Get user's active subscription
    let user_subscription_result = match Uuid::parse_str(&user_id) {
        Ok(uuid) => subscription_repo.get_by_user_id(&uuid).await,
        Err(e) => {
            log::error!("Failed to parse user ID to UUID: {}", e);
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid user ID format"
            }));
        }
    };
    
    match user_subscription_result {
        Ok(Some(subscription)) => {
            // Get the subscription plan details
            let plan_result = plan_repo.get_plan_by_id(&subscription.plan_id).await;

            match plan_result {
                Ok(db_plan) => {
                    let current_plan_data = SubscriptionPlanData {
                        id: db_plan.id.clone(),
                        name: db_plan.name.clone(),
                        features: db_plan.features.clone(),
                        monthly_token_limit: Some(db_plan.monthly_tokens),
                    };
                    // Get token usage for the current billing cycle
                    let usage_result = match Uuid::parse_str(&user_id) {
                        Ok(uuid) => api_usage_repo.get_usage_for_period(
                            &uuid,
                            Some(cycle_start),
                            Some(cycle_end)
                        ).await,
                        Err(e) => {
                            log::error!("Failed to parse user ID to UUID for usage: {}", e);
                            return HttpResponse::BadRequest().json(serde_json::json!({
                                "error": "Invalid user ID format"
                            }));
                        }
                    };
                    
                    match usage_result {
                        Ok(usage_report) => {
                            // Calculate token usage
                            let total_tokens: i64 = usage_report.tokens_input + usage_report.tokens_output;
                            
                            // Use actual recorded cost instead of recalculating
                            let estimated_cost = usage_report.total_cost.to_string().parse::<f64>().unwrap_or(0.0);
                            
                            // Calculate trial days remaining if applicable
                            let trial_days_remaining = if subscription.is_trial {
                                if let Some(trial_ends_at) = subscription.trial_ends_at {
                                    if trial_ends_at > now {
                                        Some((trial_ends_at - now).num_days() as i64)
                                    } else {
                                        Some(0)
                                    }
                                } else {
                                    None
                                }
                            } else {
                                None
                            };
                            
                            // Build response
                            HttpResponse::Ok().json(UsageSummaryResponse {
                                used_tokens: total_tokens,
                                monthly_limit: current_plan_data.monthly_token_limit.unwrap_or(0),
                                cycle_start_date: Some(cycle_start),
                                cycle_end_date: Some(cycle_end),
                                estimated_cost,
                                currency: "USD".to_string(),
                                trial_days_remaining,
                                plan_name: Some(current_plan_data.name),
                            })
                        },
                        Err(e) => {
                            log::error!("Failed to get user usage: {}", e);
                            HttpResponse::InternalServerError().json(serde_json::json!({
                                "error": "Failed to retrieve usage data"
                            }))
                        }
                    }
                },
                Err(e) => {
                    log::error!("Failed to get plan {}: {}", subscription.plan_id, e);
                    return HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to retrieve subscription plan"
                    }));
                }
            }
        },
        Ok(None) => {
            let free_plan = match plan_repo.get_plan_by_id("free").await {
                Ok(plan) => plan,
                Err(_) => {
                    log::error!("Free plan not found in database");
                    return HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Free plan configuration missing"
                    }));
                }
            };
            
            HttpResponse::Ok().json(UsageSummaryResponse {
                used_tokens: 0,
                monthly_limit: free_plan.monthly_tokens,
                cycle_start_date: Some(cycle_start),
                cycle_end_date: Some(cycle_end),
                estimated_cost: 0.0,
                currency: "USD".to_string(),
                trial_days_remaining: None,
                plan_name: Some(free_plan.name),
            })
        },
        Err(e) => {
            log::error!("Failed to get user subscription: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve subscription data"
            }))
        }
    }
}