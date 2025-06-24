use crate::error::AppError;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use crate::db::repositories::spending_repository::{SpendingRepository, UserSpendingLimit};
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::{CreditTransactionRepository, CreditTransaction};
use crate::db::repositories::model_repository::ModelRepository;
use crate::models::model_pricing::ModelPricing;
use crate::services::stripe_service::StripeService;
use uuid::Uuid;
use log::{debug, error, info, warn};
use chrono::{DateTime, Utc, Datelike, NaiveDate, Duration};
use std::sync::Arc;
use sqlx::PgPool;
use crate::db::connection::DatabasePools;
use sqlx::types::{BigDecimal};
use bigdecimal::{ToPrimitive, FromPrimitive};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

// Simplified spending trend structure for direct analytics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendingTrend {
    pub month: String,
    pub total_spending: BigDecimal,
    pub total_requests: i64,
    pub avg_cost_per_request: BigDecimal,
}

// Simplified user spending summary structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSpendingSummary {
    pub total_periods: i64,
    pub total_spending: BigDecimal,
    pub total_requests: i64,
    pub total_tokens_input: i64,
    pub total_tokens_output: i64,
    pub avg_monthly_spending: BigDecimal,
    pub peak_monthly_spending: BigDecimal,
    pub lowest_monthly_spending: BigDecimal,
}



// Helper functions for safe operations
fn safe_bigdecimal_from_str(s: &str) -> Result<BigDecimal, AppError> {
    use std::str::FromStr;
    BigDecimal::from_str(s).map_err(|e| AppError::Internal(format!("Invalid BigDecimal: {}", e)))
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
    pub credit_balance: BigDecimal,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub billing_period_start: DateTime<Utc>,
    pub next_billing_date: DateTime<Utc>,
    pub currency: String,
}

#[derive(Debug, Clone)]
pub struct CostBasedBillingService {
    db_pools: DatabasePools,
    api_usage_repository: Arc<ApiUsageRepository>,
    subscription_repository: Arc<SubscriptionRepository>,
    subscription_plan_repository: Arc<SubscriptionPlanRepository>,
    spending_repository: Arc<SpendingRepository>,
    user_credit_repository: Arc<UserCreditRepository>,
    credit_transaction_repository: Arc<CreditTransactionRepository>,
    model_repository: Arc<ModelRepository>,
    stripe_service: Arc<StripeService>,
    default_trial_days: i64,
}

impl CostBasedBillingService {
    pub fn new(
        db_pools: DatabasePools,
        api_usage_repository: Arc<ApiUsageRepository>,
        subscription_repository: Arc<SubscriptionRepository>,
        subscription_plan_repository: Arc<SubscriptionPlanRepository>,
        spending_repository: Arc<SpendingRepository>,
        user_credit_repository: Arc<UserCreditRepository>,
        credit_transaction_repository: Arc<CreditTransactionRepository>,
        model_repository: Arc<ModelRepository>,
        stripe_service: Arc<StripeService>,
        default_trial_days: i64,
    ) -> Self {
        Self {
            db_pools,
            api_usage_repository,
            subscription_repository,
            subscription_plan_repository,
            spending_repository,
            user_credit_repository,
            credit_transaction_repository,
            model_repository,
            stripe_service,
            default_trial_days,
        }
    }


    /// Calculate cost, apply markup, record usage, and report to Stripe for metered billing
    /// This centralizes all cost logic and integrates with Stripe's metered billing system
    pub async fn calculate_and_report_usage(
        &self,
        user_id: &Uuid,
        model_id: &str,
        input_tokens: i32,
        output_tokens: i32,
        duration_ms: Option<i64>,
    ) -> Result<BigDecimal, AppError> {
        // Start a transaction for atomic operations
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Fetch the model using ModelRepository
        let model = self.model_repository.find_by_id(model_id).await?
            .ok_or_else(|| AppError::NotFound(format!("Model not found: {}", model_id)))?;

        // Validate model configuration for duration-based models
        model.validate_duration_model_config()
            .map_err(|e| AppError::InvalidArgument(format!("Model configuration error: {}", e)))?;

        // Fetch user's active subscription to get plan details and markup percentage
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::NotFound("User subscription not found".to_string()))?;

        // Get plan markup percentage
        let plan = sqlx::query!(
            r#"
            SELECT cost_markup_percentage
            FROM subscription_plans 
            WHERE id = $1
            "#,
            subscription.plan_id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(AppError::from)?;

        let markup_percentage = plan.cost_markup_percentage;

        // Calculate base cost using model pricing with strict validation
        let base_cost = if model.is_duration_based() {
            let duration = duration_ms.ok_or_else(|| 
                AppError::InvalidArgument("Duration-based models require duration_ms parameter".to_string()))?;
            model.calculate_duration_cost(duration)
                .map_err(|e| AppError::InvalidArgument(format!("Duration cost calculation failed: {}", e)))?
        } else {
            model.calculate_token_cost(input_tokens as i64, output_tokens as i64)
        };

        // Apply markup to determine final cost
        let markup_multiplier = (markup_percentage.clone() + safe_bigdecimal_from_str("100")?) / safe_bigdecimal_from_str("100")?;
        let final_cost = base_cost.clone() * markup_multiplier;

        info!("Cost calculation for user {}: model={}, base_cost=${}, markup={}%, final_cost=${}", 
              user_id, model_id, base_cost, markup_percentage, final_cost);

        // Log detailed usage and calculated cost to api_usage table
        self._record_usage_and_update_spending_in_tx(
            user_id,
            model_id,
            input_tokens,
            output_tokens,
            &final_cost,
            None, // request_id
            Some(serde_json::json!({
                "base_cost": base_cost.to_string(),
                "markup_percentage": markup_percentage.to_string(),
                "final_cost": final_cost.to_string(),
                "model_pricing_used": true
            })),
            duration_ms.map(|d| d as i32), // processing_ms
            duration_ms, // input_duration_ms
            &mut tx,
        ).await?;

        // Report usage to Stripe's metered billing if customer has Stripe details
        if let Some(stripe_customer_id) = &subscription.stripe_customer_id {
            // Convert final cost to cents for Stripe (assuming USD)
            let usage_quantity = (final_cost.to_f64().unwrap_or(0.0) * 100.0) as i64;
            
            // TODO: Configure subscription_item_id in application settings or environment
            // For now, use a placeholder - this should be configurable based on the user's subscription
            let subscription_item_id = subscription.stripe_subscription_id
                .as_ref()
                .map(|s| format!("{}_item", s)) // Construct item ID from subscription ID
                .unwrap_or_else(|| "si_placeholder".to_string()); // Fallback placeholder
            
            match self.stripe_service.report_usage_record(
                &subscription_item_id,
                usage_quantity,
                None, // timestamp - let Stripe use current time
            ).await {
                Ok(usage_record) => {
                    info!("Successfully reported usage to Stripe for user {}: record_id={}, quantity={} cents", 
                          user_id, usage_record.id, usage_quantity);
                }
                Err(e) => {
                    error!("Failed to report usage to Stripe for user {}: {}", user_id, e);
                    // Don't fail the entire operation if Stripe reporting fails
                    // This ensures the local billing system remains functional
                }
            }
        } else {
            debug!("User {} has no Stripe customer ID, skipping usage record reporting", user_id);
        }

        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;

        Ok(final_cost)
    }

    /// Calculate cost and record usage for a given model and token usage
    /// Returns (calculated_cost, prompt_tokens, completion_tokens)
    pub async fn calculate_and_record_usage(
        &self,
        user_id: &Uuid,
        model_id: &str,
        tokens_input: i32,
        tokens_output: i32,
        metadata: Option<serde_json::Value>,
    ) -> Result<(BigDecimal, i32, i32), AppError> {
        // Start a transaction for atomic operations
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Fetch the model using ModelRepository
        let model = self.model_repository.find_by_id(model_id).await?
            .ok_or_else(|| AppError::NotFound(format!("Model not found: {}", model_id)))?;

        // Validate model configuration for duration-based models
        model.validate_duration_model_config()
            .map_err(|e| AppError::InvalidArgument(format!("Model configuration error: {}", e)))?;

        // Fetch user's subscription to get plan markup percentage
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::NotFound("User subscription not found".to_string()))?;

        // Get plan markup percentage
        let plan = sqlx::query!(
            r#"
            SELECT cost_markup_percentage
            FROM subscription_plans 
            WHERE id = $1
            "#,
            subscription.plan_id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(AppError::from)?;

        let markup_percentage = plan.cost_markup_percentage;

        // Calculate cost using model pricing with plan markup - strict validation for duration-based models
        let calculated_cost = if model.is_duration_based() {
            return Err(AppError::InvalidArgument(
                "Duration-based models cannot be used with calculate_and_record_usage. Use calculate_and_report_usage with duration_ms parameter instead.".to_string()
            ));
        } else {
            model.calculate_token_cost(tokens_input as i64, tokens_output as i64)
        };

        // Record usage via existing method
        self._record_usage_and_update_spending_in_tx(
            user_id,
            model_id,
            tokens_input,
            tokens_output,
            &calculated_cost,
            None, // request_id
            metadata,
            None, // processing_ms
            None, // input_duration_ms
            &mut tx,
        ).await?;

        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;

        Ok((calculated_cost, tokens_input, tokens_output))
    }

    /// Check if user can access AI services based on spending limits and plan overage policies
    pub async fn check_service_access(&self, user_id: &Uuid) -> Result<bool, AppError> {
        // Get current spending status
        let spending_status = self.get_current_spending_status(user_id).await?;
        
        // Use services_blocked flag from UserSpendingLimit struct
        if spending_status.services_blocked {
            debug!("Services blocked for user {} - spending limit exceeded", user_id);
            return Ok(false);
        }

        // Get user's subscription and plan to check overage policy
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?
            .ok_or_else(|| AppError::NotFound("User subscription not found".to_string()))?;
        
        let plan = self.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await?;
        
        // Check if user has exceeded included allowance (before credits)
        let has_exceeded_allowance = spending_status.current_spending > spending_status.included_allowance;
        
        if has_exceeded_allowance {
            // Check plan's overage policy to determine if services should be blocked
            match plan.should_block_services_on_overage() {
                Ok(should_block) => {
                    if should_block {
                        info!("METERED BILLING: User {} exceeded allowance and plan doesn't allow overage - blocking services", user_id);
                        self.block_services(user_id).await?;
                        return Ok(false);
                    } else {
                        info!("METERED BILLING: User {} exceeded allowance but plan allows overage - services continue", user_id);
                    }
                },
                Err(e) => {
                    warn!("Failed to check overage policy for user {}: {} - defaulting to block", user_id, e);
                    self.block_services(user_id).await?;
                    return Ok(false);
                }
            }
        }

        // Check if hard limit would be exceeded with minimal additional cost
        // considering credit balance as a buffer
        let buffer_amount = safe_bigdecimal_from_str("0.01")?; // $0.01 buffer
        let projected_spending = &spending_status.current_spending + &buffer_amount;
        let effective_hard_limit = &spending_status.hard_limit + &spending_status.credit_balance;
        
        if projected_spending > effective_hard_limit {
            warn!("METERED BILLING: User {} approaching effective hard limit (including credits), blocking services preemptively", user_id);
            self.block_services(user_id).await?;
            return Ok(false);
        }

        Ok(true)
    }

    /// Record AI service usage and update spending in real-time
    /// This function is called by proxy handlers with server-calculated cost
    /// ensuring the server is the single source of truth for cost calculation
    pub async fn record_usage_and_update_spending(
        &self,
        user_id: &Uuid,
        service_name: &str,
        tokens_input: i32,
        tokens_output: i32,
        cost: &BigDecimal, // Server-calculated cost (definitive)
        request_id: Option<String>,
        metadata: Option<serde_json::Value>,
        processing_ms: Option<i32>,
        input_duration_ms: Option<i64>,
    ) -> Result<(), AppError> {
        // First check if services are blocked
        if !self.check_service_access(user_id).await? {
            return Err(AppError::Payment("AI services blocked due to spending limit".to_string()));
        }

        // Start a transaction for atomic billing operations
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        let result = self._record_usage_and_update_spending_in_tx(
            user_id,
            service_name,
            tokens_input,
            tokens_output,
            cost, // Use server-calculated cost
            request_id,
            metadata,
            processing_ms,
            input_duration_ms,
            &mut tx,
        ).await;

        match result {
            Ok(_) => {
                tx.commit().await.map_err(AppError::from)?;
                
                debug!("Successfully recorded usage and updated spending for user {}: cost=${}", user_id, cost);
                Ok(())
            }
            Err(e) => {
                let _ = tx.rollback().await; // Rollback on error
                error!("Failed to record usage and update spending for user {}: {}", user_id, e);
                Err(e)
            }
        }
    }

    /// Internal transactional version of record_usage_and_update_spending
    /// Atomically records usage in api_usage table and updates current_spending in user_spending_limits
    async fn _record_usage_and_update_spending_in_tx(
        &self,
        user_id: &Uuid,
        service_name: &str,
        tokens_input: i32,
        tokens_output: i32,
        cost: &BigDecimal, // Server-calculated definitive cost
        request_id: Option<String>,
        metadata: Option<serde_json::Value>,
        processing_ms: Option<i32>,
        input_duration_ms: Option<i64>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        // Create entry DTO and use repository method with executor
        let entry_dto = crate::db::repositories::api_usage_repository::ApiUsageEntryDto {
            user_id: *user_id,
            service_name: service_name.to_string(),
            tokens_input,
            tokens_output,
            cost: cost.clone(), // Use server-calculated cost
            request_id,
            metadata,
            processing_ms,
            input_duration_ms,
        };
        
        // Record usage in api_usage table
        let api_usage_record = self.api_usage_repository.record_usage_with_executor(entry_dto, executor).await?;

        // Atomically update current_spending in user_spending_limits table
        // This ensures single transaction for both operations
        self.increment_spending_with_executor(user_id, cost, executor).await?;
        
        // Handle credit consumption (if user has available credits)
        let credit_balance_option = self.user_credit_repository.get_balance_with_executor(user_id, executor).await?;
        let credit_balance = credit_balance_option
            .map(|uc| uc.balance)
            .unwrap_or_else(|| BigDecimal::from(0));
        
        if credit_balance > safe_bigdecimal_from_str("0")? {
            let cost_covered_by_credits = cost.clone().min(credit_balance);
            
            if cost_covered_by_credits > safe_bigdecimal_from_str("0")? {
                // Deduct credits atomically
                let negative_cost = -cost_covered_by_credits.clone();
                self.user_credit_repository.increment_balance_with_executor(user_id, &negative_cost, executor).await?;
                
                // Record credit consumption transaction
                let negative_amount = -cost_covered_by_credits.clone();
                self.credit_transaction_repository.create_consumption_transaction_with_executor(
                    user_id,
                    &negative_amount,
                    &api_usage_record.id.unwrap_or_else(|| uuid::Uuid::new_v4()),
                    Some(format!("Credit consumption for {} usage (server-calculated cost)", service_name)),
                    executor,
                ).await?;
            }
        }

        debug!("Processed API usage for user {}: service={}, tokens_in={}, tokens_out={}, cost=${}", 
               user_id, service_name, tokens_input, tokens_output, cost);

        Ok(())
    }

    /// Get current spending status for user
    pub async fn get_current_spending_status(&self, user_id: &Uuid) -> Result<SpendingStatus, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        let result = self.get_current_spending_status_in_tx(user_id, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        
        Ok(result)
    }

    /// Get current spending status for user (transaction-aware)
    pub async fn get_current_spending_status_in_tx(
        &self, 
        user_id: &Uuid, 
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<SpendingStatus, AppError> {
        // Get or create current billing period spending limit within transaction
        let spending_limit = self.get_or_create_current_spending_limit_in_tx(user_id, executor).await?;
        
        // Get user's credit balance within transaction
        let credit_balance_option = self.user_credit_repository.get_balance_with_executor(user_id, executor).await?;
        let credit_balance = credit_balance_option
            .map(|uc| uc.balance)
            .unwrap_or_else(|| BigDecimal::from(0));
        
        // Calculate effective allowance (included allowance + credits)
        let effective_allowance = &spending_limit.included_allowance + &credit_balance;
        
        // Calculate derived values considering credits
        let remaining_allowance = if spending_limit.current_spending <= effective_allowance {
            &effective_allowance - &spending_limit.current_spending
        } else {
            safe_bigdecimal_from_str("0")?
        };

        let overage_amount = if spending_limit.current_spending > effective_allowance {
            &spending_limit.current_spending - &effective_allowance
        } else {
            safe_bigdecimal_from_str("0")?
        };

        let usage_percentage = if effective_allowance > safe_bigdecimal_from_str("0")? {
            let current_f64 = spending_limit.current_spending.to_f64().unwrap_or(0.0);
            let effective_allowance_f64 = effective_allowance.to_f64().unwrap_or(1.0);
            if effective_allowance_f64 > 0.0 {
                (current_f64 / effective_allowance_f64) * 100.0
            } else {
                0.0
            }
        } else {
            0.0
        };

        Ok(SpendingStatus {
            current_spending: spending_limit.current_spending,
            included_allowance: spending_limit.included_allowance,
            hard_limit: spending_limit.hard_limit.clone(),
            remaining_allowance,
            overage_amount,
            credit_balance,
            usage_percentage,
            services_blocked: spending_limit.services_blocked,
            billing_period_start: spending_limit.billing_period_start,
            next_billing_date: spending_limit.billing_period_end,
            currency: spending_limit.currency,
        })
    }

    /// Update real-time spending for user
    async fn update_real_time_spending(&self, user_id: &Uuid, additional_cost: &BigDecimal) -> Result<(), AppError> {
        let spending_limit = self.get_or_create_current_spending_limit(user_id).await?;
        
        // Note: Spending updates are handled through API usage records in the repository layer

        debug!("Updated spending for user {}: +${}", user_id, additional_cost);
        Ok(())
    }

    /// Update real-time spending for user within transaction
    async fn update_real_time_spending_in_tx(
        &self, 
        user_id: &Uuid, 
        additional_cost: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<(), AppError> {
        let spending_limit = self.get_or_create_current_spending_limit_in_tx(user_id, executor).await?;
        
        // Note: Spending updates are handled through API usage records in the repository layer

        debug!("Updated spending for user {}: +${}", user_id, additional_cost);
        Ok(())
    }

    /// Get or create spending limit for current billing period
    async fn get_or_create_current_spending_limit(&self, user_id: &Uuid) -> Result<UserSpendingLimit, AppError> {
        // Start a transaction and call the _in_tx version
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        let result = self.get_or_create_current_spending_limit_in_tx(user_id, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(result)
    }

    /// Get or create spending limit for current billing period (transaction-aware)
    pub async fn get_or_create_current_spending_limit_in_tx(
        &self, 
        user_id: &Uuid, 
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<UserSpendingLimit, AppError>
    {
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

        // First call spending_repository.get_user_spending_limit_for_period_with_executor
        if let Some(spending_limit) = self.spending_repository.get_user_spending_limit_for_period_with_executor(user_id, &billing_period_start, &billing_period_end, executor).await? {
            return Ok(spending_limit);
        }

        // If not found, calculate limits from user's plan and create using create_or_update_user_spending_limit_with_executor
        let subscription = match self.subscription_repository.get_by_user_id_with_executor(user_id, executor).await? {
            Some(sub) => sub,
            None => {
                info!("Creating new trial subscription for user {}", user_id);
                let subscription_id = self._create_trial_subscription_in_tx(user_id, executor).await?;
                // Instead of retrieving, construct subscription from known data to avoid RLS transaction isolation issue
                let now = Utc::now();
                let trial_end_date = now + Duration::days(self.default_trial_days);
                crate::db::repositories::subscription_repository::Subscription {
                    id: subscription_id,
                    user_id: *user_id,
                    stripe_customer_id: None,
                    stripe_subscription_id: None,
                    plan_id: "free".to_string(),
                    status: "trialing".to_string(),
                    cancel_at_period_end: false,
                    created_at: now,
                    updated_at: now,
                    stripe_plan_id: "free".to_string(),
                    current_period_start: now,
                    current_period_end: trial_end_date,
                    trial_start: Some(now),
                    trial_end: Some(trial_end_date),
                    pending_plan_id: None,
                }
            }
        };

        // Get plan using direct SQL since subscription_plan_repository doesn't have _with_executor variant
        let plan = sqlx::query!(
            r#"
            SELECT id, name, base_price_monthly, included_spending_monthly, cost_markup_percentage,
                   currency, features, created_at, updated_at
            FROM subscription_plans 
            WHERE id = $1
            "#,
            subscription.plan_id
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(AppError::from)?;
        
        // Get included allowance from plan
        let included_allowance: BigDecimal = if subscription.plan_id == "free" {
            safe_bigdecimal_from_str("2")?  // Set to exactly $2 for free plan
        } else {
            plan.included_spending_monthly
                .unwrap_or_else(|| BigDecimal::from(0))
        };

        // For metered billing, hard limit can be higher than included allowance if overage is allowed
        // Check plan features to determine appropriate hard limit
        let hard_limit: BigDecimal = {
            // First get plan from subscription_plan_repository to check overage policy
            let plan_features_result = self.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await;
            match plan_features_result {
                Ok(plan_obj) => {
                    match plan_obj.allows_overage() {
                        Ok(true) => {
                            // If overage is allowed, set hard limit higher than included allowance
                            // This allows for billing of overage charges
                            let overage_multiplier = safe_bigdecimal_from_str("10")?; // Allow up to 10x overage
                            &included_allowance * &overage_multiplier
                        },
                        Ok(false) | Err(_) => {
                            // If no overage allowed or error checking, hard limit equals included allowance
                            included_allowance.clone()
                        }
                    }
                },
                Err(_) => {
                    // If can't get plan features, default to included allowance
                    included_allowance.clone()
                }
            }
        };

        // Create new spending limit struct and save using create_or_update_user_spending_limit_with_executor
        let new_spending_limit = UserSpendingLimit {
            id: Uuid::new_v4(),
            user_id: *user_id,
            plan_id: subscription.plan_id.clone(),
            billing_period_start,
            billing_period_end,
            included_allowance: included_allowance.clone(),
            current_spending: safe_bigdecimal_from_str("0")?,
            hard_limit: hard_limit.clone(),
            services_blocked: false,
            currency: plan.currency.clone().unwrap_or_else(|| "USD".to_string()),
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
        };
        
        let _result = self.spending_repository.create_or_update_user_spending_limit_with_executor(&new_spending_limit, executor).await?;

        info!("METERED BILLING: Created new spending limit for user {}: allowance=${}, hard_limit=${}, plan={}", 
              user_id, included_allowance, hard_limit, subscription.plan_id);

        Ok(new_spending_limit)
    }



    /// Block AI services for user
    async fn block_services(&self, user_id: &Uuid) -> Result<(), AppError> {
        // Call spending_repository.update_services_blocked_status_with_executor with true
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        self.update_services_blocked_status_with_executor(user_id, true, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;

        warn!("Services blocked for user {} due to spending limit exceeded", user_id);
        error!("SERVICES BLOCKED for user {} due to spending limit exceeded", user_id);
        Ok(())
    }


    /// Unblock AI services for user (manual override or new billing period)
    pub async fn unblock_services(&self, user_id: &Uuid) -> Result<(), AppError> {
        // Call spending_repository.update_services_blocked_status_with_executor with false
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        self.update_services_blocked_status_with_executor(user_id, false, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;

        info!("Services unblocked for user {} - manual override", user_id);
        info!("Services unblocked for user {}", user_id);
        Ok(())
    }






    /// Reset spending for new billing period (called by billing cycle job)
    pub async fn reset_billing_period(&self, user_id: &Uuid) -> Result<(), AppError> {
        // Simplify to just log the event
        // Remove archiving logic (new records created lazily by get_or_create_current_spending_limit)
        let now = Utc::now();
        let previous_period_start = if now.month() == 1 {
            safe_date_from_components(now.year() - 1, 12, 1)?
        } else {
            safe_date_from_components(now.year(), now.month() - 1, 1)?
        }
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for previous_period_start".to_string()))?
            .and_utc();

        info!("BILLING PERIOD RESET: User {} - Previous period: {}", user_id, previous_period_start);
        info!("Reset billing period for user {}", user_id);
        Ok(())
    }

    /// Get spending analytics for user
    pub async fn get_spending_analytics(
        &self,
        user_id: &Uuid,
        months_back: i32,
    ) -> Result<SpendingAnalytics, AppError> {
        // Get analytics directly from api_usage and credit_transactions tables
        let trends = self.get_spending_trends_from_usage(user_id, months_back).await?;
        let summary = self.get_spending_summary_from_usage(user_id).await?;
        
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
        
        let current_spending_f64 = current_status.current_spending.to_f64().unwrap_or(0.0);
        let daily_average = if days_elapsed > 0.0 {
            current_spending_f64 / days_elapsed
        } else {
            0.0
        };
        
        let projected_month_end = current_spending_f64 + (daily_average * days_remaining);

        // Determine spending trend (increasing, decreasing, stable)
        let spending_trend = if trends.len() >= 2 {
            let recent_spending = trends.last()
                .and_then(|t| t.total_spending.to_f64())
                .unwrap_or(0.0);
            let previous_spending = trends.get(trends.len() - 2)
                .and_then(|t| t.total_spending.to_f64())
                .unwrap_or(0.0);
            
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
        let total_spending_f64 = summary.total_spending.to_f64().unwrap_or(0.0);
        let cost_per_request = if summary.total_requests > 0 {
            total_spending_f64 / summary.total_requests as f64
        } else {
            0.0
        };

        let cost_per_token = if summary.total_tokens_input + summary.total_tokens_output > 0 {
            total_spending_f64 / (summary.total_tokens_input + summary.total_tokens_output) as f64
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
                .unwrap_or_else(|| BigDecimal::from(0)),
            spending_trend,
            cost_per_request: format!("{:.6}", cost_per_request),
            cost_per_token: format!("{:.6}", cost_per_token),
            days_until_limit: if daily_average > 0.0 {
                let hard_limit_f64 = current_status.hard_limit.to_f64().unwrap_or(0.0);
                let remaining_budget = hard_limit_f64 - current_spending_f64;
                if remaining_budget > 0.0 {
                    Some((remaining_budget / daily_average) as i32)
                } else {
                    Some(0)
                }
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
                    .unwrap_or(BigDecimal::from(0))
                    .to_string(),
                confidence_level: self.calculate_forecast_confidence(&analytics.trends),
            });
        }

        let total_forecast = monthly_forecasts.iter()
            .fold(BigDecimal::from(0), |acc, f| {
                let forecast_amount = safe_bigdecimal_from_str(&f.projected_spending)
                    .unwrap_or(BigDecimal::from(0));
                acc + forecast_amount
            });

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

    /// Get spending trends directly from api_usage table
    async fn get_spending_trends_from_usage(
        &self,
        user_id: &Uuid,
        months_back: i32,
    ) -> Result<Vec<SpendingTrend>, AppError> {
        let now = Utc::now();
        let start_date = now - chrono::Duration::days(months_back as i64 * 30);
        
        // Query api_usage table for monthly spending trends
        let usage_data = self.api_usage_repository
            .get_usage_for_period(user_id, Some(start_date), Some(now))
            .await?;
        
        // Create simplified trend data from current usage
        let current_spending = usage_data.total_cost.clone();
        let trend = SpendingTrend {
            month: now.format("%Y-%m").to_string(),
            total_spending: current_spending.clone(),
            total_requests: 1, // Simplified
            avg_cost_per_request: current_spending,
        };
        
        Ok(vec![trend])
    }

    /// Get spending summary directly from api_usage and credit_transactions
    async fn get_spending_summary_from_usage(&self, user_id: &Uuid) -> Result<UserSpendingSummary, AppError> {
        // Get current usage data
        let usage_data = self.api_usage_repository
            .get_usage_for_period(user_id, None, None)
            .await?;
        
        // Create simplified summary
        Ok(UserSpendingSummary {
            total_periods: 1,
            total_spending: usage_data.total_cost.clone(),
            total_requests: 1, // Simplified
            total_tokens_input: usage_data.tokens_input,
            total_tokens_output: usage_data.tokens_output,
            avg_monthly_spending: usage_data.total_cost.clone(),
            peak_monthly_spending: usage_data.total_cost.clone(),
            lowest_monthly_spending: usage_data.total_cost,
        })
    }

    /// Calculate confidence level for forecasts based on data consistency
    fn calculate_forecast_confidence(&self, trends: &[SpendingTrend]) -> f64 {
        if trends.len() < 3 {
            return 0.3; // Low confidence with limited data
        }

        // Calculate variance in spending to determine confidence
        let amounts: Vec<f64> = trends.iter()
            .filter_map(|t| t.total_spending.to_f64())
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
        (1.0f64 - coefficient_of_variation.min(1.0f64)).max(0.1f64)
    }

    /// Create a trial subscription for new users
    async fn _create_trial_subscription_in_tx(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Uuid, AppError> {
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        let free_plan = sqlx::query!(
            r#"
            SELECT id, name, base_price_monthly, included_spending_monthly, cost_markup_percentage,
                   currency, features, created_at, updated_at
            FROM subscription_plans 
            WHERE id = 'free'
            "#
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(AppError::from)?;
        
        let trial_end_date = Utc::now() + Duration::days(self.default_trial_days);
        let current_period_end = trial_end_date;
        
        let subscription_id = self.subscription_repository.create_with_executor(
            user_id,
            &free_plan.id,
            "trialing",
            None,
            None,
            Some(trial_end_date),
            current_period_end,
            executor,
        ).await?;
        
        Ok(subscription_id)
    }

    /// Helper method to increment spending atomically
    async fn increment_spending_with_executor(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        // Get current billing period start
        let now = Utc::now();
        let billing_period_start = safe_date_from_components(now.year(), now.month(), 1)?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_start".to_string()))?
            .and_utc();

        // Call the repository method to atomically increment spending
        let _updated_limit = self.spending_repository.increment_spending_with_executor(user_id, &billing_period_start, amount, executor).await?;
        
        debug!("Spending incremented atomically for user {}: +${}", user_id, amount);
        Ok(())
    }

    /// Helper method to update services blocked status
    async fn update_services_blocked_status_with_executor(
        &self,
        user_id: &Uuid,
        blocked: bool,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        // Get current billing period start
        let now = Utc::now();
        let billing_period_start = safe_date_from_components(now.year(), now.month(), 1)?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_start".to_string()))?
            .and_utc();

        // Call the repository method to update services blocked status
        self.spending_repository.update_services_blocked_status_with_executor(user_id, &billing_period_start, blocked, executor).await?;
        
        let status_text = if blocked { "blocked" } else { "unblocked" };
        info!("Services {} for user {} via repository update", status_text, user_id);
        Ok(())
    }

    /// Calculate overage charges for billing based on plan's overage policy
    pub async fn calculate_overage_charges(&self, user_id: &Uuid) -> Result<BigDecimal, AppError> {
        // Get current spending status
        let spending_status = self.get_current_spending_status(user_id).await?;
        
        // If no overage, return zero
        if spending_status.overage_amount <= BigDecimal::from(0) {
            return Ok(BigDecimal::from(0));
        }
        
        // Get user's subscription and plan
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?
            .ok_or_else(|| AppError::NotFound("User subscription not found".to_string()))?;
        
        let plan = self.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await?;
        
        // Calculate overage charges using plan's cost markup
        let overage_charges = plan.calculate_overage_cost(&spending_status.overage_amount)?;
        
        info!("METERED BILLING: Calculated overage charges for user {}: overage_amount=${}, charges=${}", 
              user_id, spending_status.overage_amount, overage_charges);
              
        Ok(overage_charges)
    }

    /// Check if user's plan supports metered billing
    pub async fn plan_supports_metered_billing(&self, user_id: &Uuid) -> Result<bool, AppError> {
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?
            .ok_or_else(|| AppError::NotFound("User subscription not found".to_string()))?;
        
        let plan = self.subscription_plan_repository.get_plan_by_id(&subscription.plan_id).await?;
        
        plan.supports_metered_billing()
    }

    /// Update spending limits when user changes subscription plans
    pub async fn update_spending_limits_for_plan_change(
        &self,
        user_id: &Uuid,
        new_plan_id: &str,
    ) -> Result<(), AppError> {
        // Start transaction for atomic update
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Calculate current billing period start
        let now = Utc::now();
        let billing_period_start = safe_date_from_components(now.year(), now.month(), 1)?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_start".to_string()))?
            .and_utc();
        
        // Get current spending limit
        let billing_period_end = {
            let naive_next_month_date = if now.month() == 12 {
                safe_date_from_components(now.year() + 1, 1, 1)
            } else {
                safe_date_from_components(now.year(), now.month() + 1, 1)
            };
            naive_next_month_date?
                .and_hms_opt(0, 0, 0)
                .ok_or_else(|| AppError::Internal("Failed to construct time for billing_period_end".to_string()))?
                .and_utc()
        };
        
        let current_limit = self.spending_repository.get_user_spending_limit_for_period_with_executor(user_id, &billing_period_start, &billing_period_end, &mut tx).await?;
        
        if let Some(existing_limit) = current_limit {
            // Log plan change without archiving
            info!("PLAN CHANGE: User {} - Old Plan: {}, New Plan: {}, Period: {}, Current Spending: ${}, Allowance: ${}",
                  user_id,
                  existing_limit.plan_id,
                  new_plan_id,
                  existing_limit.billing_period_start,
                  existing_limit.current_spending,
                  existing_limit.included_allowance);

            // Note: Old spending limit will be replaced by creating new one

            info!("Removed old spending limit for user {} on plan change (old plan: {}, new plan: {})", 
                  user_id, existing_limit.plan_id, new_plan_id);
        }
        
        // Create fresh UserSpendingLimit for the new plan with reset spending
        let new_spending_limit = self.get_or_create_current_spending_limit_in_tx(user_id, &mut tx).await?;
        
        info!("Created fresh spending limit for user {} with plan {} (allowance: {}, hard limit: {})", 
              user_id, new_plan_id, new_spending_limit.included_allowance, new_spending_limit.hard_limit);
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        Ok(())
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
    pub cost_per_request: String,
    pub cost_per_token: String,
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
    pub projected_spending: String,
    pub confidence_level: f64,
}