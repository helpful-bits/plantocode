use actix_web::{web, HttpResponse, Responder};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use crate::models::auth_jwt_claims::AuthenticatedUser;
use crate::models::runtime_config::AppSettings;

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

/// Get usage summary for the current user
pub async fn get_usage_summary_handler(
    user: AuthenticatedUser,
    pool: web::Data<PgPool>,
    app_settings: web::Data<AppSettings>
) -> impl Responder {
    let user_id = user.user_id;
    
    // Create repositories
    let api_usage_repo = ApiUsageRepository::new(pool.as_ref());
    let subscription_repo = SubscriptionRepository::new(pool.as_ref());
    let plan_repo = SubscriptionPlanRepository::new(pool.as_ref());
    
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
    
    // Get user's active subscription and plan
    let user_subscription_result = subscription_repo.get_active_subscription_for_user(&user_id).await;
    
    match user_subscription_result {
        Ok(Some(subscription)) => {
            // Get the subscription plan
            let plan_result = plan_repo.get_plan_by_id(&subscription.plan_id).await;
            
            match plan_result {
                Ok(plan) => {
                    // Get token usage for the current billing cycle
                    let usage_result = api_usage_repo.get_user_usage_between_dates(
                        &user_id, 
                        &cycle_start, 
                        &cycle_end
                    ).await;
                    
                    match usage_result {
                        Ok(usage) => {
                            // Calculate token usage
                            let total_tokens: i64 = usage.iter()
                                .map(|u| u.input_tokens + u.output_tokens)
                                .sum();
                            
                            // Calculate estimated cost based on usage
                            let cost_per_1k_tokens = plan.cost_per_1k_tokens.unwrap_or(0.002);
                            let estimated_cost = (total_tokens as f64 / 1000.0) * cost_per_1k_tokens;
                            
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
                                monthly_limit: plan.monthly_token_limit.unwrap_or(1_000_000),
                                cycle_start_date: Some(cycle_start),
                                cycle_end_date: Some(cycle_end),
                                estimated_cost,
                                currency: "USD".to_string(),
                                trial_days_remaining,
                                plan_name: Some(plan.name),
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
                    log::error!("Failed to get plan: {}", e);
                    HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to retrieve subscription plan"
                    }))
                }
            }
        },
        Ok(None) => {
            // User has no active subscription, return free tier data
            HttpResponse::Ok().json(UsageSummaryResponse {
                used_tokens: 0,
                monthly_limit: app_settings.free_tier_token_limit.unwrap_or(100_000),
                cycle_start_date: Some(cycle_start),
                cycle_end_date: Some(cycle_end),
                estimated_cost: 0.0,
                currency: "USD".to_string(),
                trial_days_remaining: None,
                plan_name: Some("Free".to_string()),
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