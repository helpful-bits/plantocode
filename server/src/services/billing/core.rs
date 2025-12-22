use crate::clients::usage_extractor::ProviderUsage;
use crate::db::repositories::api_usage_repository::{ApiUsageEntryDto, ApiUsageRecord};
use crate::db::repositories::UserCredit;
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::Utc;
use log::{debug, info, warn};
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

impl BillingService {
    pub(crate) fn get_pending_manager(
        &self,
    ) -> Result<&crate::services::pending_charge_manager::PendingChargeManager, AppError> {
        self.pending_charge_manager
            .as_deref()
            .ok_or_else(|| AppError::Internal("PendingChargeManager not configured".to_string()))
    }

    pub(crate) async fn compute_reserve_margin(
        &self,
        amount: &BigDecimal,
        task_type: Option<&str>,
    ) -> Result<BigDecimal, AppError> {
        // SIMPLE APPROACH: Fixed $1.20 reserve for high-variance tasks
        if let Some(task_type) = task_type {
            // Convert to lowercase for case-insensitive matching
            let task_type_lower = task_type.to_lowercase();

            // Check for high-variance operations that need fixed reserve
            if task_type_lower.contains("web_search")
                || task_type_lower.contains("websearch")
                || task_type_lower == "video_analysis"
                || task_type_lower == "videoanalysis"
            {
                // Fixed $1.20 USD reserve for these high-variance operations
                info!(
                    "Using fixed $1.20 reserve for high-variance task: {}",
                    task_type
                );
                return Ok(BigDecimal::from_str("1.20").unwrap());
            }
        }

        // Try billing_adjustment_limits first (max_amount_usd, max_percentage)
        if let Some(config_value) = self
            .settings_repository
            .get_config_value("billing_adjustment_limits")
            .await?
        {
            if let (Some(max_amount_usd), Some(max_percentage)) = (
                config_value
                    .get("max_amount_usd")
                    .and_then(|v| v.as_str())
                    .and_then(|s| BigDecimal::from_str(s).ok()),
                config_value.get("max_percentage").and_then(|v| v.as_f64()),
            ) {
                let percentage_margin = amount
                    * BigDecimal::from_str(&(max_percentage / 100.0).to_string())
                        .unwrap_or_else(|_| BigDecimal::from_str("0.0").unwrap());
                let margin = percentage_margin.min(max_amount_usd);
                return Ok(margin.max(BigDecimal::from(0)));
            }
        }

        // Fall back to billing_reservation_buffer_multiplier (default 1.5)
        let multiplier = match self
            .settings_repository
            .get_config_value("billing_reservation_buffer_multiplier")
            .await?
        {
            Some(config_value) => config_value
                .as_f64()
                .and_then(|f| BigDecimal::from_str(&f.to_string()).ok())
                .unwrap_or_else(|| BigDecimal::from_str("1.5").unwrap()),
            None => BigDecimal::from_str("1.5").unwrap(),
        };

        let margin = amount * (multiplier - BigDecimal::from(1));
        Ok(margin.max(BigDecimal::from(0)))
    }

    pub(crate) async fn get_reservation_ttl_ms(&self) -> u64 {
        match self
            .settings_repository
            .get_config_value("billing_reservation_ttl_seconds")
            .await
        {
            Ok(Some(config_value)) => {
                config_value
                    .as_u64()
                    .map(|s| s * 1000) // Convert seconds to milliseconds
                    .unwrap_or(900_000) // Default 15 minutes
            }
            _ => 900_000, // Default 15 minutes
        }
    }

    pub async fn reconcile_timed_out_pending_charges(&self) -> Result<usize, AppError> {
        debug!("Starting reconciliation of timed-out pending charges");

        // Query pending api_usage with pending_timeout_at < now LIMIT 500
        let now = chrono::Utc::now();
        let records = sqlx::query!(
            r#"
            SELECT request_id, user_id
            FROM api_usage
            WHERE status = 'pending'
            AND pending_timeout_at < $1
            LIMIT 500
            "#,
            now
        )
        .fetch_all(&self.db_pools.user_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to query timed-out charges: {}", e)))?;

        let mut processed = 0;
        for record in records {
            if let Some(request_id) = record.request_id {
                let user_id = record.user_id;
                info!(
                    "Reconciling timed-out pending charge: {} for user {}",
                    request_id, user_id
                );

                // Call fail_api_charge to refund and release reservation
                if let Err(e) = self
                    .fail_api_charge(&request_id, &user_id, "Timed out")
                    .await
                {
                    warn!("Failed to reconcile timed-out charge {}: {}", request_id, e);
                } else {
                    processed += 1;
                }
            }
        }

        if processed > 0 {
            info!("Reconciled {} timed-out pending charges", processed);
        }

        Ok(processed)
    }

    pub fn spawn_pending_reconciliation(self: Arc<Self>) {
        tokio::spawn(async move {
            let interval = std::time::Duration::from_secs(60);
            loop {
                if let Err(e) = self.reconcile_timed_out_pending_charges().await {
                    warn!("reconcile_timed_out_pending_charges error: {}", e);
                }
                tokio::time::sleep(interval).await;
            }
        });
    }

    pub async fn check_service_access(
        &self,
        user_id: &Uuid,
        _model_id: &str,
    ) -> Result<bool, AppError> {
        let user_balance = self.credit_service.get_user_balance(user_id).await?;

        // Check sum of paid balance and free credit balance
        let total_balance = &user_balance.balance + &user_balance.free_credit_balance;

        if total_balance <= BigDecimal::from(0) {
            return Err(AppError::CreditInsufficient(
                "No credits available. Please purchase credits to continue using AI services."
                    .to_string(),
            ));
        }

        // Check billing readiness for users who have made purchases
        let (is_payment_method_required, is_billing_info_required) =
            self._check_billing_readiness(user_id).await?;

        if is_payment_method_required {
            return Err(AppError::PaymentMethodRequired("A payment method is required to continue using services. Please add a payment method.".to_string()));
        }

        if is_billing_info_required {
            return Err(AppError::BillingAddressRequired("Complete billing information is required to continue using services. Please update your billing information.".to_string()));
        }

        Ok(true)
    }

    pub async fn initiate_api_charge(
        &self,
        entry: ApiUsageEntryDto,
    ) -> Result<(String, UserCredit), AppError> {
        debug!(
            "Initiating API charge with estimates for user: {}",
            entry.user_id
        );

        // Extract needed values before moving entry
        let user_id = entry.user_id;
        let request_id = entry
            .request_id
            .as_ref()
            .ok_or_else(|| {
                AppError::InvalidArgument(
                    "request_id is required for two-phase billing".to_string(),
                )
            })?
            .clone();

        // Get model for cost estimation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

        let model = model_repository
            .find_by_id_with_provider(&entry.service_name)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!("Model '{}' not found", entry.service_name))
            })?;

        // Create ProviderUsage for estimated cost calculation
        let estimated_usage = ProviderUsage::new(
            entry.tokens_input as i32,
            entry.tokens_output as i32,
            entry.cache_write_tokens as i32,
            entry.cache_read_tokens as i32,
            entry.service_name.clone(),
        );

        // Validate usage data
        estimated_usage
            .validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;

        // Use CostResolver to calculate estimated cost
        let estimated_cost =
            crate::services::cost_resolver::CostResolver::resolve(estimated_usage, &model)?;

        // NEW: Start a transaction for atomic reservation + initiation
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&pool, 3, 150)
            .await
            .map_err(|e| AppError::Database(format!("Failed to start transaction: {}", e)))?;

        // Set RLS context for the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // NEW: Load user balances with FOR UPDATE lock
        let user_balance = sqlx::query!(
            r#"
            SELECT balance, free_credit_balance
            FROM user_credits
            WHERE user_id = $1
            FOR UPDATE
            "#,
            user_id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to lock user credits: {}", e)))?;

        let total_available = user_balance.balance + user_balance.free_credit_balance;

        // NEW: Reserve overage margin if Redis is configured
        let reserved = if let Some(manager) = &self.pending_charge_manager {
            // Extract task_type from metadata if available
            let task_type = entry
                .metadata
                .as_ref()
                .and_then(|m| m.get("task_type"))
                .and_then(|t| t.as_str());

            // Compute reserve margin with task type for high-variance operations
            let reserve_margin = self
                .compute_reserve_margin(&estimated_cost, task_type)
                .await?;

            if reserve_margin > BigDecimal::from(0) {
                let ttl_ms = self.get_reservation_ttl_ms().await;

                // Attempt reservation
                let reservation_success = manager
                    .reserve_overage(
                        &user_id.to_string(),
                        &request_id,
                        &reserve_margin,
                        &total_available,
                        Some(ttl_ms / 1000), // Convert ms to seconds
                    )
                    .await?;

                if !reservation_success {
                    // Rollback and fail fast
                    tx.rollback().await.ok();

                    // Provide clear error message based on task type
                    let error_msg = if let Some(task_type) = task_type {
                        let task_type_lower = task_type.to_lowercase();
                        if task_type_lower.contains("web_search")
                            || task_type_lower.contains("websearch")
                        {
                            format!(
                                "Insufficient credits. Web search requires at least $1.20 available. Your balance: ${:.2}",
                                total_available
                            )
                        } else if task_type_lower == "video_analysis"
                            || task_type_lower == "videoanalysis"
                        {
                            format!(
                                "Insufficient credits. Video analysis requires at least $1.20 available. Your balance: ${:.2}",
                                total_available
                            )
                        } else {
                            format!(
                                "Insufficient credits for this operation. Required: ${:.2}, Available: ${:.2}",
                                reserve_margin, total_available
                            )
                        }
                    } else {
                        format!(
                            "Insufficient credits for this operation. Required: ${:.2}, Available: ${:.2}",
                            reserve_margin, total_available
                        )
                    };

                    return Err(AppError::CreditInsufficient(error_msg));
                }

                info!(
                    "Reserved {} (masked) for user {} request {}",
                    if reserve_margin > BigDecimal::from(1000) {
                        ">1000"
                    } else {
                        "<1000"
                    },
                    user_id,
                    request_id
                );
                true
            } else {
                false
            }
        } else {
            warn!("Redis not configured for pending charge reservations");
            false
        };

        // Proceed with existing logic for deducting estimated cost and creating api_usage record
        // BUT: Wrap it in error handling that releases reservation on failure
        let result = async {
            // existing credit deduction and api_usage insertion logic here
            // This uses the transaction (&mut *tx)
            self.credit_service
                .initiate_charge_in_transaction(entry, estimated_cost, &mut tx)
                .await
        }
        .await;

        match result {
            Ok(data) => {
                // Commit transaction
                tx.commit()
                    .await
                    .map_err(|e| AppError::Database(format!("Failed to commit: {}", e)))?;
                info!("Successfully initiated charge for request {}", data.0);
                Ok(data)
            }
            Err(e) => {
                // Release reservation on error
                if reserved {
                    if let Some(manager) = &self.pending_charge_manager {
                        if let Err(release_err) = manager
                            .release_reservation(&user_id.to_string(), &request_id)
                            .await
                        {
                            warn!("Failed to release reservation on error: {}", release_err);
                        }
                    }
                }
                tx.rollback().await.ok();
                Err(e)
            }
        }
    }

    /// Finalize an API charge with actual usage and metadata
    pub async fn finalize_api_charge_with_metadata(
        &self,
        request_id: &str,
        user_id: &Uuid,
        final_usage: ProviderUsage,
        metadata: Option<serde_json::Value>,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!(
            "Finalizing API charge with metadata for request: {}",
            request_id
        );

        // Get model for final cost calculation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

        let model = model_repository
            .find_by_id_with_provider(&final_usage.model_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!("Model '{}' not found", final_usage.model_id))
            })?;

        // Use CostResolver to calculate final cost
        let final_cost =
            crate::services::cost_resolver::CostResolver::resolve(final_usage.clone(), &model)?;

        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&pool, 3, 150)
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set RLS context using user_id within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Finalize charge with credit service, passing metadata
        let (api_usage_record, user_credit) = self
            .credit_service
            .finalize_charge_in_transaction_with_metadata(
                request_id,
                final_cost,
                &final_usage,
                metadata,
                &mut tx,
            )
            .await?;

        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;

        info!(
            "Successfully finalized charge with metadata for request {} - user {} for model {} (cost: {})",
            request_id,
            api_usage_record.user_id,
            api_usage_record.service_name,
            api_usage_record.cost
        );

        // Release Redis reservation after successful finalization
        if let Some(manager) = &self.pending_charge_manager {
            if let Err(e) = manager
                .release_reservation(&user_id.to_string(), request_id)
                .await
            {
                warn!("Failed to release reservation after finalization: {}", e);
            } else {
                debug!(
                    "Released reservation for request {} after finalization",
                    request_id
                );
            }
        }

        // After successful billing, check and trigger auto top-off if needed
        if let Err(e) = self
            .check_and_trigger_auto_top_off(&api_usage_record.user_id)
            .await
        {
            warn!(
                "Auto top-off check failed for user {}: {}",
                api_usage_record.user_id, e
            );
        }

        Ok((api_usage_record, user_credit))
    }

    /// Mark an API charge as failed, ensuring no cost is billed to the user.
    /// This is used for provider-side errors where the user should not be charged.
    pub async fn fail_api_charge(
        &self,
        request_id: &str,
        user_id: &Uuid,
        error_message: &str,
    ) -> Result<(), AppError> {
        debug!("Failing API charge for request: {}", request_id);

        // Create metadata to indicate failure
        let metadata = serde_json::json!({
            "status": "failed",
            "error": error_message,
            "streaming": true,
        });

        // Use the existing finalize_charge_in_transaction_with_metadata method
        // but with zero cost and zero usage to mark as failed
        let zero_usage = ProviderUsage::new(0, 0, 0, 0, "unknown".to_string());

        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&pool, 3, 150)
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set RLS context
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Call the credit service to finalize with zero cost
        // The credit service should be updated to check metadata.status == "failed" and set the appropriate status
        let _ = self
            .credit_service
            .finalize_charge_in_transaction_with_metadata(
                request_id,
                BigDecimal::from(0),
                &zero_usage,
                Some(metadata),
                &mut tx,
            )
            .await?;

        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;

        info!(
            "Successfully marked charge as failed for request {}",
            request_id
        );

        // Release Redis reservation after marking as failed
        if let Some(manager) = &self.pending_charge_manager {
            if let Err(e) = manager
                .release_reservation(&user_id.to_string(), request_id)
                .await
            {
                warn!("Failed to release reservation after failure: {}", e);
            } else {
                debug!(
                    "Released reservation for request {} after failure",
                    request_id
                );
            }
        }

        Ok(())
    }

    /// Record API usage with pre-resolved cost (simplified billing flow)
    /// This method takes a cost that has already been resolved by the CostResolver
    pub async fn charge_for_api_usage(
        &self,
        entry: ApiUsageEntryDto,
        final_cost: BigDecimal,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!(
            "Processing API usage with pre-resolved cost for user: {}",
            entry.user_id
        );

        // Start a database transaction to ensure atomicity
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set RLS context for the transaction - matches existing service pattern
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(entry.user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Auth(format!("Failed to set RLS context: {}", e)))?;

        // Ensure user has a credit record
        let _ = self
            .credit_service
            .get_user_credit_repository()
            .ensure_balance_record_exists_with_executor(&entry.user_id, &mut tx)
            .await?;

        // Deduct credits from user balance using the proper priority method
        // This method already checks for sufficient balance internally
        let (user_credit, from_free, from_paid) = self
            .credit_service
            .get_user_credit_repository()
            .deduct_credits_with_priority(&entry.user_id, &final_cost, &mut tx)
            .await?;

        debug!(
            "Deducted {} total: {} from free credits, {} from paid credits",
            final_cost, from_free, from_paid
        );

        // Create API usage record after successful deduction
        let api_usage_record = self
            .api_usage_repository
            .record_usage_with_executor(entry, final_cost.clone(), &mut tx)
            .await?;

        // Create a credit transaction record for audit trail
        let transaction =
            crate::db::repositories::credit_transaction_repository::CreditTransaction {
                id: uuid::Uuid::new_v4(),
                user_id: api_usage_record.user_id,
                transaction_type: "consumption".to_string(),
                net_amount: -final_cost.clone(),
                gross_amount: None,
                fee_amount: None,
                currency: "USD".to_string(),
                description: Some(format!("API usage: {}", api_usage_record.service_name)),
                stripe_charge_id: None,
                related_api_usage_id: api_usage_record.id,
                metadata: api_usage_record.metadata.clone(),
                created_at: Some(chrono::Utc::now()),
                balance_after: user_credit.balance.clone(),
            };

        self.credit_service
            .get_credit_transaction_repository()
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!(
            "Successfully billed user {} for API usage: {} (cost: {})",
            api_usage_record.user_id, api_usage_record.service_name, final_cost
        );

        // After successful billing, check and trigger auto top-off if needed
        // Don't fail the API call if auto top-off fails - just log the error
        if let Err(e) = self
            .check_and_trigger_auto_top_off(&api_usage_record.user_id)
            .await
        {
            warn!(
                "Auto top-off check failed for user {}: {}",
                api_usage_record.user_id, e
            );
        }

        Ok((api_usage_record, user_credit))
    }
}
