use crate::error::AppError;
use crate::db::repositories::{
    UserCreditRepository, CreditTransactionRepository,
    UserCredit, CreditTransaction, CreditTransactionStats, ModelRepository, ApiUsageRepository
};
use crate::db::repositories::api_usage_repository::{ApiUsageEntryDto, ApiUsageRecord};
use crate::models::model_pricing::ModelPricing;
use crate::models::billing::{UnifiedCreditHistoryEntry, UnifiedCreditHistoryResponse};
use crate::clients::usage_extractor::ProviderUsage;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::utils::financial_validation::{
    validate_credit_purchase_amount, validate_credit_refund_amount, 
    validate_credit_adjustment_amount, validate_balance_adjustment, normalize_cost
};
use bigdecimal::{BigDecimal, FromPrimitive, ToPrimitive};
use std::str::FromStr;
use uuid::Uuid;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use sqlx::PgPool;
use crate::db::connection::DatabasePools;
use log::{info, warn, error};

#[derive(Debug, Clone)]
pub struct CreditService {
    user_credit_repository: Arc<UserCreditRepository>,
    credit_transaction_repository: Arc<CreditTransactionRepository>,
    model_repository: Arc<ModelRepository>,
    api_usage_repository: Arc<ApiUsageRepository>,
    audit_service: Arc<AuditService>,
    db_pools: DatabasePools,
}

impl CreditService {
    pub fn new(db_pools: DatabasePools) -> Self {
        Self {
            user_credit_repository: Arc::new(UserCreditRepository::new(db_pools.user_pool.clone())),
            credit_transaction_repository: Arc::new(CreditTransactionRepository::new(db_pools.user_pool.clone())),
            model_repository: Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone()))),
            api_usage_repository: Arc::new(ApiUsageRepository::new(db_pools.user_pool.clone())),
            audit_service: Arc::new(AuditService::new(db_pools.clone())),
            db_pools: db_pools,
        }
    }

    /// Get user's current credit balance with external transaction
    pub async fn get_user_balance_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<UserCredit, AppError> {
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        // Ensure a credit record exists for the user with proper user context
        let balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, executor)
            .await?;
        
        Ok(balance)
    }

    /// Get user's current credit balance
    pub async fn get_user_balance(&self, user_id: &Uuid) -> Result<UserCredit, AppError> {
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        let balance = self.get_user_balance_with_executor(user_id, &mut tx).await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        
        Ok(balance)
    }





    /// Initiate a charge with estimated cost - creates pending api_usage and initial credit transaction
    pub async fn initiate_charge_in_transaction(
        &self,
        entry: ApiUsageEntryDto,
        estimated_cost: BigDecimal,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(String, UserCredit), AppError> {
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(entry.user_id.to_string())
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        // Validate estimated cost using financial validation utility
        validate_credit_adjustment_amount(&estimated_cost)?;
        
        // Normalize the estimated cost
        let cost = normalize_cost(&estimated_cost);
        
        // Ensure request_id is present for tracking
        let request_id = entry.request_id.clone()
            .ok_or_else(|| AppError::InvalidArgument("request_id is required for two-phase billing".to_string()))?;
        
        // Record API usage as 'pending' with estimated values
        let api_usage_record = self.api_usage_repository
            .record_usage_with_executor(entry, cost.clone(), tx)
            .await?;
        
        // Ensure user has a credit record within the transaction
        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(&api_usage_record.user_id, tx)
            .await?;

        // Check if user has sufficient credits for the estimate
        if current_balance.balance < cost {
            return Err(AppError::CreditInsufficient(
                format!("Insufficient credits. Required: {}, Available: {}", cost, current_balance.balance)
            ));
        }

        // Deduct the estimated credits within the transaction
        let negative_amount = -&cost;
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(&api_usage_record.user_id, &negative_amount, tx)
            .await?;

        // Record the initial consumption transaction
        let usage_description = format!("{} - Estimated usage", api_usage_record.service_name);
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: api_usage_record.user_id,
            transaction_type: "consumption".to_string(),
            net_amount: negative_amount,
            gross_amount: None,
            fee_amount: None,
            currency: "USD".to_string(),
            description: Some(usage_description),
            stripe_charge_id: None,
            related_api_usage_id: api_usage_record.id,
            metadata: Some(serde_json::json!({
                "phase": "initial",
                "estimated": true,
                "request_id": request_id
            })),
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, tx)
            .await?;
        
        Ok((request_id, updated_balance))
    }
    
    /// Finalize a charge with actual cost - updates api_usage to 'completed' and creates adjustment transaction
    pub async fn finalize_charge_in_transaction(
        &self,
        request_id: &str,
        final_cost: BigDecimal,
        final_usage: &ProviderUsage,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        // Validate final cost using financial validation utility
        validate_credit_adjustment_amount(&final_cost)?;
        
        // Normalize the final cost
        let final_cost = normalize_cost(&final_cost);
        
        // Get the pending api_usage record
        let existing_record = sqlx::query!(
            r#"
            SELECT id, user_id, service_name, cost, tokens_input, tokens_output,
                   cache_write_tokens, cache_read_tokens, metadata, timestamp
            FROM api_usage
            WHERE request_id = $1 AND status = 'pending'
            FOR UPDATE
            "#,
            request_id
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch pending API usage: {}", e)))?;
        
        let existing_record = existing_record
            .ok_or_else(|| AppError::NotFound(format!("No pending API usage found for request_id: {}", request_id)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(existing_record.user_id.to_string())
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        // Calculate the cost difference (can be negative for refund)
        let estimated_cost = existing_record.cost;
        let cost_delta = &final_cost - &estimated_cost;
        
        // Update the api_usage record with final values
        self.api_usage_repository.update_usage_with_executor(
            request_id,
            final_usage.prompt_tokens as i64,
            final_usage.completion_tokens as i64,
            final_usage.cache_write_tokens as i64,
            final_usage.cache_read_tokens as i64,
            final_cost.clone(),
            "completed",
            tx,
        ).await?;
        
        // Get current balance
        let current_balance = self.user_credit_repository
            .get_balance_with_executor(&existing_record.user_id, tx)
            .await?
            .ok_or_else(|| AppError::NotFound("User credit record not found".to_string()))?;
        
        let mut final_balance = current_balance.clone();
        
        // If there's a cost difference, create adjustment transaction
        if cost_delta != BigDecimal::from(0) {
            // Apply the adjustment (negative delta means refund)
            let adjustment_amount = -&cost_delta;
            final_balance = self.user_credit_repository
                .increment_balance_with_executor(&existing_record.user_id, &adjustment_amount, tx)
                .await?;
            
            // Create adjustment transaction
            let adjustment_type = if cost_delta > BigDecimal::from(0) {
                "consumption_adjustment"
            } else {
                "refund_adjustment"
            };
            
            let adjustment_desc = format!(
                "{} - Final adjustment (estimated: {}, final: {})",
                existing_record.service_name, estimated_cost, final_cost
            );
            
            let adjustment_transaction = CreditTransaction {
                id: Uuid::new_v4(),
                user_id: existing_record.user_id,
                transaction_type: adjustment_type.to_string(),
                net_amount: adjustment_amount,
                gross_amount: None,
                fee_amount: None,
                currency: "USD".to_string(),
                description: Some(adjustment_desc),
                stripe_charge_id: None,
                related_api_usage_id: Some(existing_record.id),
                metadata: Some(serde_json::json!({
                    "phase": "final",
                    "request_id": request_id,
                    "estimated_cost": estimated_cost.to_string(),
                    "final_cost": final_cost.to_string(),
                    "cost_delta": cost_delta.to_string()
                })),
                created_at: Some(Utc::now()),
                balance_after: final_balance.balance.clone(),
            };
            
            let _created_transaction = self.credit_transaction_repository
                .create_transaction_with_executor(&adjustment_transaction, &final_balance.balance, tx)
                .await?;
        }
        
        // Log audit event for credit consumption with final values
        let audit_context = crate::services::audit_service::AuditContext::new(existing_record.user_id);
        if let Err(audit_error) = self.audit_service.log_credit_consumption(
            &audit_context,
            &existing_record.user_id,
            &existing_record.service_name,
            &final_cost,
            final_usage.prompt_tokens,
            final_usage.completion_tokens,
            0, // cached_input_tokens - legacy field
            final_usage.cache_write_tokens,
            final_usage.cache_read_tokens,
            &current_balance.balance,
            &final_balance.balance,
            Some(existing_record.id),
        ).await {
            warn!("Failed to log audit event for credit consumption: {}", audit_error);
        }
        
        // Return the updated api_usage record
        let final_record = ApiUsageRecord {
            id: Some(existing_record.id),
            user_id: existing_record.user_id,
            service_name: existing_record.service_name,
            tokens_input: final_usage.prompt_tokens as i64,
            tokens_output: final_usage.completion_tokens as i64,
            cache_write_tokens: final_usage.cache_write_tokens as i64,
            cache_read_tokens: final_usage.cache_read_tokens as i64,
            cost: final_cost,
            request_id: Some(request_id.to_string()),
            metadata: existing_record.metadata,
            timestamp: existing_record.timestamp,
            provider_reported_cost: final_usage.cost.clone(),
        };
        
        Ok((final_record, final_balance))
    }

    /// Get credit transaction history for a user
    pub async fn get_transaction_history(
        &self,
        user_id: &Uuid,
        limit: Option<i64>,
        offset: Option<i64>,
        search: Option<&str>,
    ) -> Result<Vec<CreditTransaction>, AppError> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);
        
        let pool = self.credit_transaction_repository.get_pool().clone();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        let result = self.credit_transaction_repository
            .get_history_with_executor(user_id, limit, offset, search, &mut tx)
            .await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        
        Ok(result)
    }

    /// Get credit transaction statistics for a user
    pub async fn get_user_credit_stats(&self, user_id: &Uuid) -> Result<CreditStats, AppError> {
        let balance = self.get_user_balance(user_id).await?;
        
        let pool = self.credit_transaction_repository.get_pool().clone();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        let transaction_stats = self.credit_transaction_repository
            .get_transaction_stats_with_executor(user_id, &mut tx)
            .await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(CreditStats {
            user_id: *user_id,
            current_balance: balance.balance,
            total_purchased: transaction_stats.total_purchased,
            total_consumed: transaction_stats.total_consumed,
            total_refunded: transaction_stats.total_refunded,
            net_balance: transaction_stats.net_balance,
            transaction_count: transaction_stats.transaction_count,
            currency: balance.currency,
        })
    }

    /// Get comprehensive credit details for a user (balance, stats, and recent transactions)
    pub async fn get_credit_details(
        &self,
        user_id: &Uuid,
        limit: Option<i64>,
        offset: Option<i64>,
        search: Option<&str>,
    ) -> Result<CreditDetailsResponse, AppError> {
        let stats = self.get_user_credit_stats(user_id).await?;
        let transactions = self.get_transaction_history(user_id, limit, offset, search).await?;
        let total_transaction_count = self.get_transaction_count(user_id, search).await?;
        
        let limit = limit.unwrap_or(20);
        let offset = offset.unwrap_or(0);
        
        Ok(CreditDetailsResponse {
            stats,
            transactions,
            total_transaction_count,
            has_more: total_transaction_count > (limit + offset),
        })
    }

    /// Get unified credit history that combines API usage and credit transactions
    pub async fn get_unified_credit_history(
        &self,
        user_id: &Uuid,
        limit: Option<i64>,
        offset: Option<i64>,
        search: Option<&str>,
    ) -> Result<UnifiedCreditHistoryResponse, AppError> {
        let limit = limit.unwrap_or(20);
        let offset = offset.unwrap_or(0);
        
        let pool = self.credit_transaction_repository.get_pool().clone();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let search_pattern = search.map(|s| format!("%{}%", s));
        
        // Query unified history from both tables
        let rows = sqlx::query!(
            r#"
            WITH unified_history AS (
                -- API usage entries (only completed ones)
                SELECT 
                    au.id::text as entry_id,
                    (-au.cost) as price,  -- Negative for usage
                    au.timestamp as date,
                    au.service_name as model,
                    au.tokens_input as input_tokens,
                    au.tokens_output as output_tokens,
                    COALESCE(
                        (SELECT balance_after FROM credit_transactions 
                         WHERE related_api_usage_id = au.id 
                         ORDER BY created_at DESC LIMIT 1),
                        0
                    ) as balance_after,
                    COALESCE(au.service_name || ' API Usage', 'API Usage') as description,
                    'api_usage' as source_type,
                    'usage' as transaction_type
                FROM api_usage au
                WHERE au.user_id = $1 AND au.status = 'completed'
                
                UNION ALL
                
                -- Credit purchases (only purchase transactions)
                SELECT 
                    ct.id::text as entry_id,
                    COALESCE(ct.gross_amount, ct.net_amount) as price,  -- Use gross for purchases (includes fees)
                    ct.created_at as date,
                    'Credit Purchase' as model,
                    NULL::bigint as input_tokens,
                    NULL::bigint as output_tokens,
                    ct.balance_after as balance_after,
                    COALESCE(ct.description, 'Credit Purchase') as description,
                    'credit_transaction' as source_type,
                    ct.transaction_type
                FROM credit_transactions ct
                WHERE ct.user_id = $1 AND ct.transaction_type = 'purchase'
            )
            SELECT 
                entry_id,
                price,
                date,
                model,
                input_tokens,
                output_tokens,
                balance_after,
                description,
                transaction_type
            FROM unified_history
            WHERE ($2::TEXT IS NULL OR description ILIKE $2)
            ORDER BY date DESC
            LIMIT $3 OFFSET $4
            "#,
            user_id,
            search_pattern,
            limit,
            offset
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch unified credit history: {}", e)))?;

        // Count total entries for pagination (with search filter applied)
        let total_count = sqlx::query!(
            r#"
            WITH unified_history AS (
                -- API usage entries (only completed ones)
                SELECT 
                    au.id,
                    COALESCE(au.service_name || ' API Usage', 'API Usage') as description
                FROM api_usage au
                WHERE au.user_id = $1 AND au.status = 'completed'
                
                UNION ALL
                
                -- Credit purchases (only purchase transactions)
                SELECT 
                    ct.id,
                    COALESCE(ct.description, 'Credit Purchase') as description
                FROM credit_transactions ct
                WHERE ct.user_id = $1 AND ct.transaction_type = 'purchase'
            )
            SELECT COUNT(*) as count FROM unified_history
            WHERE ($2::TEXT IS NULL OR description ILIKE $2)
            "#,
            user_id,
            search_pattern
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count unified credit history: {}", e)))?;

        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let entries = rows.into_iter().map(|row| {
            UnifiedCreditHistoryEntry {
                id: row.entry_id.unwrap_or_default(),
                price: row.price.and_then(|p| p.to_f64()).unwrap_or(0.0),
                date: row.date.map(|d| d.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()).unwrap_or_default(),
                model: row.model.unwrap_or_default(),
                input_tokens: row.input_tokens,
                output_tokens: row.output_tokens,
                balance_after: row.balance_after.and_then(|b| b.to_f64()).unwrap_or(0.0),
                description: row.description.unwrap_or_default(),
                transaction_type: row.transaction_type.unwrap_or_default(),
            }
        }).collect();

        Ok(UnifiedCreditHistoryResponse {
            entries,
            total_count: total_count.count.unwrap_or(0),
            has_more: total_count.count.unwrap_or(0) > (limit + offset),
        })
    }

    /// Refund credits (for failed transactions or cancellations) - atomic operation
    pub async fn refund_credits(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        stripe_charge_id: &str,
        description: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<UserCredit, AppError> {
        // Validate refund amount using financial validation utility
        validate_credit_refund_amount(amount)?;
        
        // Normalize amount at entry point
        let amount = normalize_cost(amount);
        
        // Start a database transaction to ensure atomicity
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;

        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        // Ensure user has a credit record within the transaction
        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, &mut tx)
            .await?;

        // Validate that the refund won't result in a negative balance
        validate_balance_adjustment(&current_balance.balance, &amount, "Credit refund")?;

        // Add the refunded credits to user balance within the transaction
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, &amount, &mut tx)
            .await?;

        // Record the refund transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "refund".to_string(),
            net_amount: amount.clone(),
            gross_amount: None,
            fee_amount: None,
            currency: "USD".to_string(),
            description,
            stripe_charge_id: Some(stripe_charge_id.to_string()),
            related_api_usage_id: None,
            metadata,
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!("Atomically refunded {} credits for user {} via Stripe charge {}", amount, user_id, stripe_charge_id);
        Ok(updated_balance)
    }

    pub async fn adjust_credits_with_executor(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        description: String,
        admin_metadata: Option<serde_json::Value>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<UserCredit, AppError> {
        // Validate adjustment amount using financial validation utility
        validate_credit_adjustment_amount(amount)?;
        
        // Normalize amount at entry point
        let amount = normalize_cost(amount);
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, executor)
            .await?;

        // Validate that the adjustment won't result in a negative balance
        validate_balance_adjustment(&current_balance.balance, &amount, "Credit adjustment")?;

        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, &amount, executor)
            .await?;

        let mut metadata = admin_metadata.unwrap_or_default();
        if let Some(obj) = metadata.as_object_mut() {
            obj.insert("balance_before".to_string(), serde_json::json!(current_balance.balance));
            obj.insert("balance_after".to_string(), serde_json::json!(updated_balance.balance));
        } else {
            metadata = serde_json::json!({
                "balance_before": current_balance.balance,
                "balance_after": updated_balance.balance
            });
        }

        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "adjustment".to_string(),
            net_amount: amount.clone(),
            gross_amount: None,
            fee_amount: None,
            currency: "USD".to_string(),
            description: Some(description),
            stripe_charge_id: None,
            related_api_usage_id: None,
            metadata: Some(metadata),
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, executor)
            .await?;

        info!("Atomically adjusted {} credits for user {} (balance: {} -> {})", amount, user_id, current_balance.balance, updated_balance.balance);
        Ok(updated_balance)
    }

    /// Admin function to adjust credits (for manual adjustments) - atomic operation
    pub async fn adjust_credits(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        description: String,
        admin_metadata: Option<serde_json::Value>,
    ) -> Result<UserCredit, AppError> {
        // Start a database transaction to ensure atomicity
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;

        let updated_balance = self.adjust_credits_with_executor(
            user_id,
            amount,
            description,
            admin_metadata,
            &mut tx,
        ).await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        Ok(updated_balance)
    }

    pub async fn record_credit_purchase(
        &self,
        user_id: &Uuid,
        gross_amount: &BigDecimal,
        fee_amount: &BigDecimal,
        currency: &str,
        stripe_charge_id: &str,
        payment_metadata: serde_json::Value,
        audit_context: &AuditContext,
    ) -> Result<UserCredit, AppError> {
        // Normalize amounts at entry point
        let gross_amount = normalize_cost(gross_amount);
        let fee_amount = normalize_cost(fee_amount);
        let net_amount = &gross_amount - &fee_amount;
        
        // Validate purchase amount using financial validation utility
        validate_credit_purchase_amount(&net_amount)?;
        
        if currency.to_uppercase() != "USD" {
            return Err(AppError::InvalidArgument(
                format!("Only USD currency is supported, got: {}", currency)
            ));
        }
        
        info!("Processing credit purchase for user {}: gross {} {}, fee {}, net {}", 
              user_id, gross_amount, currency, fee_amount, net_amount);
        
        let pool = self.user_credit_repository.get_pool();
        
        // Start transaction and immediately set SERIALIZABLE isolation level to prevent race conditions
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Set SERIALIZABLE isolation level for this transaction to prevent race conditions in auto-top-off flow
        sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set SERIALIZABLE isolation level: {}", e)))?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        // Lock the user row to prevent concurrent modifications during auto-top-off
        let current_balance = sqlx::query_as!(
            UserCredit,
            r#"
            SELECT 
                user_id,
                balance,
                currency,
                free_credit_balance,
                free_credits_granted_at,
                free_credits_expires_at,
                free_credits_expired,
                created_at,
                updated_at
            FROM user_credits 
            WHERE user_id = $1 
            FOR UPDATE
            "#,
            user_id
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to lock user credits row: {}", e)))?;

        let current_balance = match current_balance {
            Some(balance) => balance,
            None => {
                // Create balance record if it doesn't exist, still within the locked transaction
                self.user_credit_repository
                    .ensure_balance_record_exists_with_executor(user_id, &mut tx)
                    .await?
            }
        };

        // Validate that the purchase won't result in a negative balance (safety check)
        validate_balance_adjustment(&current_balance.balance, &net_amount, "Credit purchase")?;

        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, &net_amount, &mut tx)
            .await?;

        let description = format!("Credit purchase via Stripe charge {}", stripe_charge_id);

        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "purchase".to_string(),
            net_amount: net_amount.clone(),
            gross_amount: Some(gross_amount.clone()),
            fee_amount: Some(fee_amount.clone()),
            currency: currency.to_string(),
            description: Some(description),
            stripe_charge_id: Some(stripe_charge_id.to_string()),
            related_api_usage_id: None,
            metadata: Some(payment_metadata),
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, &mut tx)
            .await?;

        // Commit transaction and handle both constraint violations and serialization failures
        match tx.commit().await {
            Ok(()) => {
                info!("Successfully committed credit purchase transaction for user {} via Stripe charge {}", user_id, stripe_charge_id);
            },
            Err(e) => {
                // Check if this is a database constraint violation (duplicate key)
                if let sqlx::Error::Database(db_error) = &e {
                    if db_error.code().as_deref() == Some("23505") { // PostgreSQL unique constraint violation
                        info!("Credit purchase for stripe charge {} was already recorded (duplicate constraint violation), returning success for idempotency", stripe_charge_id);
                        // Return success with current balance for idempotency - this is the expected behavior for webhook handlers
                        return Err(AppError::AlreadyExists(format!("Credit purchase for stripe charge {} was already processed", stripe_charge_id)));
                    }
                    // Handle serialization failures that can occur with SERIALIZABLE isolation
                    if db_error.code().as_deref() == Some("40001") { // PostgreSQL serialization failure
                        warn!("Serialization failure during credit purchase for user {} and charge {}: {}", user_id, stripe_charge_id, db_error);
                        return Err(AppError::Database(format!(
                            "Transaction serialization conflict during credit purchase. This may indicate concurrent auto-top-off attempts: {}", 
                            db_error
                        )));
                    }
                }
                return Err(AppError::from(e));
            }
        }

        // Log audit event after successful transaction commit
        let audit_metadata = serde_json::json!({
            "stripe_charge_id": stripe_charge_id,
            "balance_before": current_balance.balance,
            "balance_after": updated_balance.balance,
            "user_id": user_id.to_string()
        });

        if let Err(audit_error) = self.audit_service.log_credit_purchase_succeeded(
            audit_context,
            stripe_charge_id,
            &net_amount,
            currency,
            audit_metadata,
        ).await {
            warn!("Failed to log audit event for credit purchase: {}", audit_error);
        }

        info!("Successfully processed credit purchase for user {} via Stripe charge {}: {} {} added (balance: {} -> {})", 
              user_id, stripe_charge_id, net_amount, currency, current_balance.balance, updated_balance.balance);
        Ok(updated_balance)
    }


    /// Get transaction count for pagination
    pub async fn get_transaction_count(&self, user_id: &Uuid, search: Option<&str>) -> Result<i64, AppError> {
        let pool = self.credit_transaction_repository.get_pool().clone();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let search_pattern = search.map(|s| format!("%{}%", s));
        
        let result = sqlx::query!(
            r#"
            SELECT COUNT(*) as count
            FROM credit_transactions 
            WHERE user_id = $1 AND ($2::TEXT IS NULL OR description ILIKE $2)
            "#,
            user_id,
            search_pattern
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count credit transactions: {}", e)))?;

        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(result.count.unwrap_or(0))
    }

    pub async fn has_user_made_purchase(&self, user_id: &Uuid) -> Result<bool, AppError> {
        let pool = self.credit_transaction_repository.get_pool().clone();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        let has_purchase = self.credit_transaction_repository
            .has_purchase_transaction_with_executor(user_id, &mut tx)
            .await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        
        Ok(has_purchase)
    }


    
    
    
    
    /// Get access to the credit transaction repository
    pub fn get_credit_transaction_repository(&self) -> &Arc<CreditTransactionRepository> {
        &self.credit_transaction_repository
    }
    
    /// Get access to the user credit repository
    pub fn get_user_credit_repository(&self) -> &Arc<UserCreditRepository> {
        &self.user_credit_repository
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditStats {
    pub user_id: Uuid,
    pub current_balance: BigDecimal,
    pub total_purchased: BigDecimal,
    pub total_consumed: BigDecimal,
    pub total_refunded: BigDecimal,
    pub net_balance: BigDecimal,
    pub transaction_count: i64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditDetailsResponse {
    pub stats: CreditStats,
    pub transactions: Vec<CreditTransaction>,
    pub total_transaction_count: i64,
    pub has_more: bool,
}