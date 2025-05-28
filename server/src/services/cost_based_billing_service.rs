use crate::error::AppError;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use crate::db::repositories::spending_repository::{SpendingRepository, UserSpendingLimit, SpendingAlert};
use uuid::Uuid;
use log::{debug, error, info, warn};
use chrono::{DateTime, Utc, Datelike};
use std::sync::Arc;
use sqlx::PgPool;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};
use serde::{Deserialize, Serialize};
use std::str::FromStr;


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
        let buffer_amount = BigDecimal::from_str("0.01")?; // $0.01 buffer
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
            BigDecimal::from(0)
        };

        let overage_amount = if spending_limit.current_spending > spending_limit.included_allowance {
            &spending_limit.current_spending - &spending_limit.included_allowance
        } else {
            BigDecimal::from(0)
        };

        let usage_percentage = if spending_limit.included_allowance > BigDecimal::from(0) {
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
        let billing_period_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc();
        
        let billing_period_end = if now.month() == 12 {
            chrono::NaiveDate::from_ymd_opt(now.year() + 1, 1, 1)
        } else {
            chrono::NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1)
        }
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc();

        // Try to get existing spending limit using repository
        if let Some(spending_limit) = self.spending_repository.get_user_spending_limit_for_period(user_id, &billing_period_start).await? {
            return Ok(spending_limit);
        }

        // Create new spending limit based on user's subscription
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?
            .ok_or_else(|| AppError::Internal("No subscription found for user".to_string()))?;

        let plan = self.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await?;
        
        let included_allowance = BigDecimal::from_f64(plan.included_spending_monthly)
            .ok_or_else(|| AppError::Internal("Invalid included_spending_monthly".to_string()))?;

        let hard_limit_multiplier = BigDecimal::from_f64(plan.hard_limit_multiplier)
            .ok_or_else(|| AppError::Internal("Invalid hard_limit_multiplier".to_string()))?;

        let hard_limit = &included_allowance * &hard_limit_multiplier;

        // Create new UserSpendingLimit struct and use repository
        let new_limit = UserSpendingLimit {
            id: Uuid::new_v4(),
            user_id: *user_id,
            plan_id: subscription.plan_id.clone(),
            billing_period_start,
            billing_period_end,
            included_allowance: included_allowance.clone(),
            current_spending: BigDecimal::from(0),
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
        
        let usage_percentage = spending_status.usage_percentage;
        let current_spending = spending_status.current_spending;
        let billing_period_start = spending_status.next_billing_date;

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
                    self.send_spending_alert(user_id, alert_type, &current_spending, &billing_period_start).await?;
                }
            }
        }

        // Check hard limit
        if current_spending >= spending_status.hard_limit && !spending_status.services_blocked {
            self.block_services(user_id).await?;
            self.send_spending_alert(user_id, "services_blocked", &current_spending, &billing_period_start).await?;
        }

        Ok(())
    }

    /// Block AI services for user
    async fn block_services(&self, user_id: &Uuid) -> Result<(), AppError> {
        let now = Utc::now();
        let billing_period_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc();

        // Use repository instead of direct SQL
        self.spending_repository.block_services_for_period(user_id, &billing_period_start).await?;

        error!("SERVICES BLOCKED for user {} due to spending limit exceeded", user_id);
        Ok(())
    }

    /// Unblock AI services for user (manual override or new billing period)
    pub async fn unblock_services(&self, user_id: &Uuid) -> Result<(), AppError> {
        let now = Utc::now();
        let billing_period_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
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
    ) -> Result<(), AppError> {
        let threshold_amount = match alert_type {
            "75_percent" | "90_percent" => {
                let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
                let percent = if alert_type == "75_percent" { 0.75 } else { 0.90 };
                &spending_limit.included_allowance * BigDecimal::from_f64(percent).unwrap()
            },
            "limit_reached" => {
                let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
                spending_limit.included_allowance
            },
            "services_blocked" => {
                let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
                spending_limit.hard_limit
            },
            _ => BigDecimal::from(0),
        };

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
        // TODO: Implement actual notification system (email, push, in-app)
        let message = match alert_type {
            "75_percent" => format!("You've used 75% of your monthly AI allowance (${:.2})", current_spending.to_f64().unwrap_or(0.0)),
            "90_percent" => format!("Warning: 90% of your monthly AI allowance used (${:.2})", current_spending.to_f64().unwrap_or(0.0)),
            "limit_reached" => format!("Monthly allowance exceeded (${:.2}). Overage charges apply.", current_spending.to_f64().unwrap_or(0.0)),
            "services_blocked" => format!("AI services blocked. Spending limit reached (${:.2}). Please upgrade or wait for next billing cycle.", current_spending.to_f64().unwrap_or(0.0)),
            _ => "Spending notification".to_string(),
        };

        info!("[NOTIFICATION] User {}: {}", user_id, message);

        // Here you would integrate with:
        // - Email service (SendGrid, AWS SES, etc.)
        // - Push notifications (FCM, APNS)
        // - In-app notification system
        // - Slack/Discord webhooks for admin alerts

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
    ) -> Result<Vec<SpendingStatus>, AppError> {
        // Implementation for historical spending analytics
        // This would fetch multiple billing periods and return trends
        todo!("Implement spending analytics")
    }
}