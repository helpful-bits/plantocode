use crate::error::AppError;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use crate::db::repositories::spending_repository::{SpendingRepository, UserSpendingLimit, SpendingAlert};
use crate::db::repositories::{UserSpendingSummary, SpendingTrend};
use uuid::Uuid;
use log::{debug, error, info, warn};
use chrono::{DateTime, Utc, Datelike, NaiveDate, Duration};
use std::sync::Arc;
use sqlx::PgPool;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};
use serde::{Deserialize, Serialize};
use std::str::FromStr;


// Helper functions for safe operations
fn safe_bigdecimal_from_str(s: &str) -> Result<BigDecimal, AppError> {
    BigDecimal::from_str(s).map_err(AppError::from)
}

fn safe_date_from_components(year: i32, month: u32, day: u32) -> Result<NaiveDate, AppError> {
    NaiveDate::from_ymd_opt(year, month, day)
        .ok_or_else(|| AppError::Internal(format!("Invalid date components: {}-{:02}-{:02}", year, month, day)))
}

fn safe_duration_from_millis(millis: i64) -> Result<Duration, AppError> {
    Duration::try_milliseconds(millis)
        .ok_or_else(|| AppError::Internal(format!("Invalid duration from millis: {}", millis)))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingStatus {
    pub current_spending: BigDecimal,
    pub included_allowance: BigDecimal,
    pub hard_limit: BigDecimal,
    pub remaining_allowance: BigDecimal,
    pub overage_amount: BigDecimal,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub billing_period_start: DateTime<Utc>,
    pub next_billing_date: DateTime<Utc>,
    pub currency: String,
    pub alerts: Vec<SpendingAlert>,
}

#[derive(Debug, Clone)]
pub struct CostBasedBillingService {
    db_pool: PgPool,
    api_usage_repository: Arc<ApiUsageRepository>,
    subscription_repository: Arc<SubscriptionRepository>,
    subscription_plan_repository: Arc<SubscriptionPlanRepository>,
    spending_repository: Arc<SpendingRepository>,
}

impl CostBasedBillingService {
    pub fn new(
        db_pool: PgPool,
        api_usage_repository: Arc<ApiUsageRepository>,
        subscription_repository: Arc<SubscriptionRepository>,
        subscription_plan_repository: Arc<SubscriptionPlanRepository>,
        spending_repository: Arc<SpendingRepository>,
    ) -> Self {
        Self {
            db_pool,
            api_usage_repository,
            subscription_repository,
            subscription_plan_repository,
            spending_repository,
        }
    }

    /// Check if user can access AI services based on spending limits
    pub async fn check_service_access(&self, user_id: &Uuid) -> Result<bool, AppError> {
        // Get current spending status
        let spending_status = self.get_current_spending_status(user_id).await?;
        
        if spending_status.services_blocked {
            debug!("Services blocked for user {} - spending limit exceeded", user_id);
            return Ok(false);
        }

        // Check if hard limit would be exceeded with minimal additional cost
        let buffer_amount = safe_bigdecimal_from_str("0.01")?; // $0.01 buffer
        let projected_spending = &spending_status.current_spending + &buffer_amount;
        
        if projected_spending > spending_status.hard_limit {
            warn!("User {} approaching hard limit, blocking services preemptively", user_id);
            self.block_services(user_id).await?;
            return Ok(false);
        }

        Ok(true)
    }

    /// Record AI service usage and update spending in real-time
    pub async fn record_usage_and_update_spending(
        &self,
        user_id: &Uuid,
        service_name: &str,
        tokens_input: i32,
        tokens_output: i32,
        cost: &BigDecimal,
        request_id: Option<String>,
        metadata: Option<serde_json::Value>,
        processing_ms: Option<i32>,
        input_duration_ms: Option<i64>,
    ) -> Result<(), AppError> {
        // First check if services are blocked
        if !self.check_service_access(user_id).await? {
            return Err(AppError::Payment("AI services blocked due to spending limit".to_string()));
        }

        // Record the usage
        let usage_entry = crate::db::repositories::api_usage_repository::ApiUsageEntryDto {
            user_id: *user_id,
            service_name: service_name.to_string(),
            tokens_input,
            tokens_output,
            cost: cost.clone(),
            request_id,
            metadata,
            processing_ms,
            input_duration_ms,
        };

        self.api_usage_repository.record_usage(usage_entry).await?;

        // Update real-time spending
        self.update_real_time_spending(user_id, cost).await?;

        // Check spending thresholds and send alerts
        self.check_spending_thresholds(user_id).await?;

        Ok(())
    }

    /// Get current spending status for user
    pub async fn get_current_spending_status(&self, user_id: &Uuid) -> Result<SpendingStatus, AppError> {
        // Get or create current billing period spending limit
        let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
        
        // Calculate derived values
        let remaining_allowance = if spending_limit.current_spending <= spending_limit.included_allowance {
            &spending_limit.included_allowance - &spending_limit.current_spending
        } else {
            safe_bigdecimal_from_str("0")?
        };

        let overage_amount = if spending_limit.current_spending > spending_limit.included_allowance {
            &spending_limit.current_spending - &spending_limit.included_allowance
        } else {
            safe_bigdecimal_from_str("0")?
        };

        let usage_percentage = if spending_limit.included_allowance > safe_bigdecimal_from_str("0")? {
            (spending_limit.current_spending.to_f64().unwrap_or(0.0) / 
             spending_limit.included_allowance.to_f64().unwrap_or(1.0)) * 100.0
        } else {
            0.0
        };

        // Get recent alerts
        let alerts = self.get_recent_alerts(user_id, &spending_limit.billing_period_start).await?;

        Ok(SpendingStatus {
            current_spending: spending_limit.current_spending,
            included_allowance: spending_limit.included_allowance,
            hard_limit: spending_limit.hard_limit,
            remaining_allowance,
            overage_amount,
            usage_percentage,
            services_blocked: spending_limit.services_blocked,
            billing_period_start: spending_limit.billing_period_start,
            next_billing_date: spending_limit.billing_period_end,
            currency: spending_limit.currency,
            alerts,
        })
    }

    /// Update real-time spending for user
    async fn update_real_time_spending(&self, user_id: &Uuid, additional_cost: &BigDecimal) -> Result<(), AppError> {
        let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
        
        // Use repository instead of direct SQL
        self.spending_repository.update_user_spending_for_period(
            user_id, 
            additional_cost, 
            &spending_limit.billing_period_start
        ).await?;

        debug!("Updated spending for user {}: +${}", user_id, additional_cost);
        Ok(())
    }

    /// Get or create spending limit for current billing period
    async fn get_or_create_current_spending_limit(&self, user_id: &Uuid) -> Result<UserSpendingLimit, AppError> {
        let now = Utc::now();
        let billing_period_start = safe_date_from_components(now.year(), now.month(), 1)?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_start".to_string()))?
            .and_utc();
        
        let naive_next_month_date = if now.month() == 12 {
            safe_date_from_components(now.year() + 1, 1, 1)
        } else {
            safe_date_from_components(now.year(), now.month() + 1, 1)
        };
        let billing_period_end = naive_next_month_date?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_end".to_string()))?
            .and_utc();

        // Try to get existing spending limit using repository
        if let Some(spending_limit) = self.spending_repository.get_user_spending_limit_for_period(user_id, &billing_period_start).await? {
            return Ok(spending_limit);
        }

        // Create new spending limit based on user's subscription
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?
            .ok_or_else(|| AppError::Internal("No subscription found for user".to_string()))?;

        let plan = self.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await?;
        
        let included_allowance: BigDecimal = FromPrimitive::from_f64(plan.included_spending_monthly)
            .ok_or_else(|| AppError::Internal("Invalid included_spending_monthly".to_string()))?;

        let hard_limit_multiplier: BigDecimal = FromPrimitive::from_f64(plan.hard_limit_multiplier)
            .ok_or_else(|| AppError::Internal("Invalid hard_limit_multiplier".to_string()))?;

        let hard_limit: BigDecimal = &included_allowance * &hard_limit_multiplier;

        // Create new UserSpendingLimit struct and use repository
        let new_limit = UserSpendingLimit {
            id: Uuid::new_v4(),
            user_id: *user_id,
            plan_id: subscription.plan_id.clone(),
            billing_period_start,
            billing_period_end,
            included_allowance: included_allowance.clone(),
            current_spending: safe_bigdecimal_from_str("0")?,
            hard_limit: hard_limit.clone(),
            services_blocked: false,
            currency: plan.currency.clone(),
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
        };

        let result = self.spending_repository.create_or_update_user_spending_limit(&new_limit).await?;

        info!("Created new spending limit for user {}: allowance=${}, hard_limit=${}", 
              user_id, included_allowance, hard_limit);

        Ok(result)
    }

    /// Check spending thresholds and send alerts
    async fn check_spending_thresholds(&self, user_id: &Uuid) -> Result<(), AppError> {
        let spending_status = self.get_current_spending_status(user_id).await?;
        // Get the spending limit once to avoid redundant fetches in send_spending_alert
        let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
        
        let usage_percentage = spending_status.usage_percentage;
        let current_spending = spending_status.current_spending;
        let billing_period_start = spending_status.billing_period_start;

        // Check thresholds: 75%, 90%, 100% (limit reached), hard limit
        let thresholds = vec![
            (75.0, "75_percent"),
            (90.0, "90_percent"),
            (100.0, "limit_reached"),
        ];

        for (threshold_percent, alert_type) in thresholds {
            if usage_percentage >= threshold_percent {
                // Check if alert already sent for this threshold
                let existing_alerts = self.spending_repository.get_user_alerts(user_id).await?;
                let has_existing_alert = existing_alerts.iter().any(|alert| {
                    alert.alert_type == alert_type && alert.billing_period_start == billing_period_start
                });

                if !has_existing_alert {
                    self.send_spending_alert(user_id, alert_type, &current_spending, &billing_period_start, &spending_limit).await?;
                }
            }
        }

        // Check hard limit
        if current_spending >= spending_status.hard_limit && !spending_status.services_blocked {
            self.block_services(user_id).await?;
            self.send_spending_alert(user_id, "services_blocked", &current_spending, &billing_period_start, &spending_limit).await?;
        }

        Ok(())
    }

    /// Block AI services for user
    async fn block_services(&self, user_id: &Uuid) -> Result<(), AppError> {
        let now = Utc::now();
        let billing_period_start = safe_date_from_components(now.year(), now.month(), 1)?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_start".to_string()))?
            .and_utc();

        // Use repository instead of direct SQL
        self.spending_repository.block_services_for_period(user_id, &billing_period_start).await?;

        error!("SERVICES BLOCKED for user {} due to spending limit exceeded", user_id);
        Ok(())
    }

    /// Unblock AI services for user (manual override or new billing period)
    pub async fn unblock_services(&self, user_id: &Uuid) -> Result<(), AppError> {
        let now = Utc::now();
        let billing_period_start = safe_date_from_components(now.year(), now.month(), 1)?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_start".to_string()))?
            .and_utc();

        // Use repository instead of direct SQL
        self.spending_repository.unblock_services_for_period(user_id, &billing_period_start).await?;

        info!("Services unblocked for user {}", user_id);
        Ok(())
    }

    /// Send spending alert
    async fn send_spending_alert(
        &self,
        user_id: &Uuid,
        alert_type: &str,
        current_spending: &BigDecimal,
        billing_period_start: &DateTime<Utc>,
        user_spending_limit: &UserSpendingLimit,
    ) -> Result<(), AppError> {
        let threshold_amount = match alert_type {
            "75_percent" | "90_percent" => {
                let percent = if alert_type == "75_percent" { 0.75 } else { 0.90 };
                let percent_decimal: BigDecimal = FromPrimitive::from_f64(percent)
                    .ok_or_else(|| AppError::Internal("Invalid percent value".to_string()))?;
                Ok::<BigDecimal, AppError>(&user_spending_limit.included_allowance * &percent_decimal)
            },
            "limit_reached" => {
                Ok::<BigDecimal, AppError>(user_spending_limit.included_allowance.clone())
            },
            "services_blocked" => {
                Ok::<BigDecimal, AppError>(user_spending_limit.hard_limit.clone())
            },
            _ => Ok::<BigDecimal, AppError>(safe_bigdecimal_from_str("0")?),
        }?;

        let alert = SpendingAlert {
            id: Uuid::new_v4(),
            user_id: *user_id,
            alert_type: alert_type.to_string(),
            threshold_amount: threshold_amount.clone(),
            current_spending: current_spending.clone(),
            billing_period_start: *billing_period_start,
            alert_sent_at: Utc::now(),
            acknowledged: false,
        };
        
        self.spending_repository.create_spending_alert(&alert).await?;

        warn!("Spending alert sent to user {}: {} at ${} (threshold: ${})", 
              user_id, alert_type, current_spending, threshold_amount);

        // TODO: Send actual notification (email, in-app, etc.)
        self.send_alert_notification(user_id, alert_type, current_spending, &threshold_amount).await?;

        Ok(())
    }

    /// Get recent alerts for user
    async fn get_recent_alerts(&self, user_id: &Uuid, billing_period_start: &DateTime<Utc>) -> Result<Vec<SpendingAlert>, AppError> {
        let alerts = self.spending_repository
            .get_user_alerts(user_id)
            .await?
            .into_iter()
            .filter(|alert| alert.billing_period_start == *billing_period_start)
            .take(10)
            .collect();

        Ok(alerts)
    }

    /// Send notification to user about spending alert
    async fn send_alert_notification(
        &self,
        user_id: &Uuid,
        alert_type: &str,
        current_spending: &BigDecimal,
        threshold_amount: &BigDecimal,
    ) -> Result<(), AppError> {
        // Get user email for notification
        let user_repo = crate::db::repositories::UserRepository::new(self.db_pool.clone());
        let user = user_repo.get_by_id(user_id).await?;

        // Get spending status for usage percentage and currency
        let spending_status = self.get_current_spending_status(user_id).await?;

        // Use email notification service to queue the notification
        let email_service = crate::services::email_notification_service::EmailNotificationService::new(self.db_pool.clone())?;
        
        email_service.queue_spending_alert(
            user_id,
            &user.email,
            alert_type,
            current_spending,
            threshold_amount,
            spending_status.usage_percentage,
            &spending_status.currency,
        ).await?;

        // Also log for immediate visibility
        let message = match alert_type {
            "75_percent" => format!("You've used 75% of your monthly AI allowance (${:.2})", current_spending.to_f64().unwrap_or(0.0)),
            "90_percent" => format!("Warning: 90% of your monthly AI allowance used (${:.2})", current_spending.to_f64().unwrap_or(0.0)),
            "limit_reached" => format!("Monthly allowance exceeded (${:.2}). Overage charges apply.", current_spending.to_f64().unwrap_or(0.0)),
            "services_blocked" => format!("AI services blocked. Spending limit reached (${:.2}). Please upgrade or wait for next billing cycle.", current_spending.to_f64().unwrap_or(0.0)),
            _ => "Spending notification".to_string(),
        };

        info!("[NOTIFICATION] User {}: {}", user_id, message);

        Ok(())
    }

    /// Reset spending for new billing period (called by billing cycle job)
    pub async fn reset_billing_period(&self, user_id: &Uuid) -> Result<(), AppError> {
        // Archive current period and create new one
        let _new_spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
        info!("Reset billing period for user {}", user_id);
        Ok(())
    }

    /// Get spending analytics for user
    pub async fn get_spending_analytics(
        &self,
        user_id: &Uuid,
        months_back: i32,
    ) -> Result<SpendingAnalytics, AppError> {
        let spending_period_repo = crate::db::repositories::SpendingPeriodRepository::new(self.db_pool.clone());
        
        // Get historical spending trends
        let trends = spending_period_repo.get_spending_trends(user_id, months_back).await?;
        
        // Get user spending summary
        let summary = spending_period_repo.get_user_spending_summary(user_id).await?;
        
        // Calculate monthly averages and forecasts
        let monthly_average = if summary.total_periods > 0 {
            summary.total_spending.clone() / BigDecimal::from(summary.total_periods)
        } else {
            safe_bigdecimal_from_str("0")?
        };

        // Get current spending status
        let current_status = self.get_current_spending_status(user_id).await?;

        // Calculate projected spending for rest of current month
        let now = chrono::Utc::now();
        let days_in_month = {
            let start_of_month = safe_date_from_components(now.year(), now.month(), 1)?;
            let next_month = if now.month() == 12 {
                safe_date_from_components(now.year() + 1, 1, 1)?
            } else {
                safe_date_from_components(now.year(), now.month() + 1, 1)?
            };
            next_month.signed_duration_since(start_of_month).num_days().abs() as f64
        };
        
        let days_elapsed = now.day() as f64;
        let days_remaining = days_in_month - days_elapsed;
        
        let daily_average = if days_elapsed > 0.0 {
            current_status.current_spending.to_f64().unwrap_or(0.0) / days_elapsed
        } else {
            0.0
        };
        
        let projected_month_end = current_status.current_spending.to_f64().unwrap_or(0.0) + 
            (daily_average * days_remaining);

        // Determine spending trend (increasing, decreasing, stable)
        let spending_trend = if trends.len() >= 2 {
            let recent_spending = trends.last().map(|t| t.total_spending.to_f64().unwrap_or(0.0)).unwrap_or(0.0);
            let previous_spending = trends.get(trends.len() - 2).map(|t| t.total_spending.to_f64().unwrap_or(0.0)).unwrap_or(0.0);
            
            if recent_spending > previous_spending * 1.1 {
                "increasing".to_string()
            } else if recent_spending < previous_spending * 0.9 {
                "decreasing".to_string()
            } else {
                "stable".to_string()
            }
        } else {
            "insufficient_data".to_string()
        };

        // Calculate cost efficiency metrics
        let cost_per_request = if summary.total_requests > 0 {
            summary.total_spending.to_f64().unwrap_or(0.0) / summary.total_requests as f64
        } else {
            0.0
        };

        let cost_per_token = if summary.total_tokens_input + summary.total_tokens_output > 0 {
            summary.total_spending.to_f64().unwrap_or(0.0) / 
            (summary.total_tokens_input + summary.total_tokens_output) as f64
        } else {
            0.0
        };

        Ok(SpendingAnalytics {
            user_id: *user_id,
            period_months: months_back,
            current_status: current_status.clone(),
            summary,
            trends,
            monthly_average,
            projected_month_end_spending: FromPrimitive::from_f64(projected_month_end)
                .unwrap_or_else(|| safe_bigdecimal_from_str("0").unwrap_or_else(|_| BigDecimal::from(0))),
            spending_trend,
            cost_per_request,
            cost_per_token,
            days_until_limit: if daily_average > 0.0 {
                Some(((current_status.hard_limit.to_f64().unwrap_or(0.0) - 
                       current_status.current_spending.to_f64().unwrap_or(0.0)) / daily_average) as i32)
            } else {
                None
            },
            generated_at: chrono::Utc::now(),
        })
    }

    /// Get spending forecast for user
    pub async fn get_spending_forecast(
        &self,
        user_id: &Uuid,
        months_ahead: i32,
    ) -> Result<SpendingForecast, AppError> {
        let analytics = self.get_spending_analytics(user_id, 6).await?; // Use 6 months of history
        
        let mut monthly_forecasts = Vec::new();
        let current_monthly_rate = analytics.monthly_average.to_f64().unwrap_or(0.0);
        
        // Simple linear forecast based on historical average
        // In production, this could use more sophisticated forecasting algorithms
        for month in 1..=months_ahead {
            let forecast_amount = current_monthly_rate * (1.0 + (analytics.spending_trend_factor() * month as f64));
            
            monthly_forecasts.push(MonthlyForecast {
                month_offset: month,
                projected_spending: FromPrimitive::from_f64(forecast_amount)
                    .unwrap_or_else(|| safe_bigdecimal_from_str("0").unwrap_or_else(|_| BigDecimal::from(0))),
                confidence_level: self.calculate_forecast_confidence(&analytics.trends),
            });
        }

        let total_forecast = monthly_forecasts.iter()
            .fold(safe_bigdecimal_from_str("0").unwrap_or_else(|_| BigDecimal::from(0)), |acc, f| acc + &f.projected_spending);

        Ok(SpendingForecast {
            user_id: *user_id,
            months_ahead,
            total_projected_spending: total_forecast,
            monthly_forecasts,
            based_on_months: 6,
            confidence_level: self.calculate_forecast_confidence(&analytics.trends),
            generated_at: chrono::Utc::now(),
        })
    }

    /// Calculate confidence level for forecasts based on data consistency
    fn calculate_forecast_confidence(&self, trends: &[crate::db::repositories::SpendingTrend]) -> f64 {
        if trends.len() < 3 {
            return 0.3; // Low confidence with limited data
        }

        // Calculate variance in spending to determine confidence
        let amounts: Vec<f64> = trends.iter()
            .map(|t| t.total_spending.to_f64().unwrap_or(0.0))
            .collect();
        
        let mean = amounts.iter().sum::<f64>() / amounts.len() as f64;
        let variance = amounts.iter()
            .map(|&x| (x - mean).powi(2))
            .sum::<f64>() / amounts.len() as f64;
        
        let coefficient_of_variation = if mean > 0.0 {
            variance.sqrt() / mean
        } else {
            1.0
        };

        // Higher variance = lower confidence
        (1.0 - coefficient_of_variation.min(1.0)).max(0.1)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingAnalytics {
    pub user_id: Uuid,
    pub period_months: i32,
    pub current_status: SpendingStatus,
    pub summary: UserSpendingSummary,
    pub trends: Vec<SpendingTrend>,
    pub monthly_average: BigDecimal,
    pub projected_month_end_spending: BigDecimal,
    pub spending_trend: String, // "increasing", "decreasing", "stable"
    pub cost_per_request: f64,
    pub cost_per_token: f64,
    pub days_until_limit: Option<i32>,
    pub generated_at: DateTime<Utc>,
}

impl SpendingAnalytics {
    pub fn spending_trend_factor(&self) -> f64 {
        match self.spending_trend.as_str() {
            "increasing" => 0.1,
            "decreasing" => -0.05,
            _ => 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingForecast {
    pub user_id: Uuid,
    pub months_ahead: i32,
    pub total_projected_spending: BigDecimal,
    pub monthly_forecasts: Vec<MonthlyForecast>,
    pub based_on_months: i32,
    pub confidence_level: f64,
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyForecast {
    pub month_offset: i32,
    pub projected_spending: BigDecimal,
    pub confidence_level: f64,
}