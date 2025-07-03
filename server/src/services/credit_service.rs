use crate::error::AppError;
use crate::db::repositories::{
    UserCreditRepository, CreditTransactionRepository,
    UserCredit, CreditTransaction, CreditTransactionStats, ModelRepository, ApiUsageRepository
};
use crate::db::repositories::api_usage_repository::{ApiUsageEntryDto, ApiUsageRecord};
use crate::models::model_pricing::ModelPricing;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::utils::financial_validation::{
    validate_credit_purchase_amount, validate_credit_refund_amount, 
    validate_credit_adjustment_amount, validate_balance_adjustment, normalized
};
use bigdecimal::{BigDecimal, FromPrimitive};
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

    /// Refund credits (for failed transactions or cancellations) - atomic operation
    pub async fn refund_credits(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        stripe_charge_id: &str,
        description: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<UserCredit, AppError> {
        // Normalize amount at entry point
        let amount = normalized(amount);
        
        // Validate refund amount using financial validation utility
        validate_credit_refund_amount(&amount)?;
        
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
            amount: amount.clone(),
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
        // Normalize amount at entry point
        let amount = normalized(amount);
        
        // Validate adjustment amount using financial validation utility
        validate_credit_adjustment_amount(&amount)?;
        
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
            amount: amount.clone(),
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
        amount: &BigDecimal,
        currency: &str,
        stripe_charge_id: &str,
        payment_metadata: serde_json::Value,
        audit_context: &AuditContext,
    ) -> Result<UserCredit, AppError> {
        // Normalize amount at entry point
        let amount = normalized(amount);
        
        // Validate purchase amount using financial validation utility
        validate_credit_purchase_amount(&amount)?;
        
        if currency.to_uppercase() != "USD" {
            return Err(AppError::InvalidArgument(
                format!("Only USD currency is supported, got: {}", currency)
            ));
        }
        
        info!("Processing credit purchase for user {}: {} {}", user_id, amount, currency);
        
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
        validate_balance_adjustment(&current_balance.balance, &amount, "Credit purchase")?;

        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, &amount, &mut tx)
            .await?;

        let description = format!("Credit purchase via Stripe charge {}", stripe_charge_id);

        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "purchase".to_string(),
            amount: amount.clone(),
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
            Ok(()) => {},
            Err(e) => {
                // Check if this is a database constraint violation (duplicate key)
                if let sqlx::Error::Database(db_error) = &e {
                    if db_error.code().as_deref() == Some("23505") { // PostgreSQL unique constraint violation
                        info!("Credit purchase for stripe charge {} was already recorded (constraint violation)", stripe_charge_id);
                        return Ok(self.get_user_balance(user_id).await?);
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
            &amount,
            currency,
            audit_metadata,
        ).await {
            warn!("Failed to log audit event for credit purchase: {}", audit_error);
        }

        info!("Successfully processed credit purchase for user {} via Stripe charge {}: {} {} added (balance: {} -> {})", 
              user_id, stripe_charge_id, amount, currency, current_balance.balance, updated_balance.balance);
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


    /// Record API usage and bill credits atomically in a single transaction
    pub async fn record_and_bill_usage(&self, entry: ApiUsageEntryDto) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        // Start transaction
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        let result = self._record_and_bill_in_transaction(entry, &mut tx).await?;
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        Ok(result)
    }
    
    /// Record API usage and bill credits with a pre-resolved cost
    /// This method is used by the billing service after centralized cost resolution
    pub async fn record_and_bill_usage_with_cost(
        &self, 
        entry: ApiUsageEntryDto, 
        resolved_cost: BigDecimal
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        // Start transaction
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(entry.user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        // Normalize the resolved cost
        let cost = normalized(&resolved_cost);
        
        // Record API usage first
        let api_usage_record = self.api_usage_repository
            .record_usage_with_executor(entry, cost.clone(), &mut tx)
            .await?;
        
        // Consume credits with reference to the API usage record
        let usage_description = format!("{} - {} tokens in, {} tokens out", 
            api_usage_record.service_name, api_usage_record.tokens_input, api_usage_record.tokens_output);
        
        // Ensure user has a credit record within the transaction
        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(&api_usage_record.user_id, &mut tx)
            .await?;

        // Check if user has sufficient credits
        if current_balance.balance < cost {
            return Err(AppError::CreditInsufficient(
                format!("Insufficient credits. Required: {}, Available: {}", cost, current_balance.balance)
            ));
        }

        // Deduct the credits within the transaction
        let negative_amount = -&cost;
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(&api_usage_record.user_id, &negative_amount, &mut tx)
            .await?;

        // Record the consumption transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: api_usage_record.user_id,
            transaction_type: "consumption".to_string(),
            amount: negative_amount,
            currency: "USD".to_string(),
            description: Some(usage_description),
            stripe_charge_id: None,
            related_api_usage_id: api_usage_record.id,
            metadata: api_usage_record.metadata.clone(),
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, &mut tx)
            .await?;
        
        // Log audit event for credit consumption
        let audit_context = crate::services::audit_service::AuditContext::new(api_usage_record.user_id);
        if let Err(audit_error) = self.audit_service.log_credit_consumption(
            &audit_context,
            &api_usage_record.user_id,
            &api_usage_record.service_name,
            &cost,
            api_usage_record.tokens_input as i32,
            api_usage_record.tokens_output as i32,
            0, // cached_input_tokens - legacy field, use 0
            api_usage_record.cache_write_tokens as i32,
            api_usage_record.cache_read_tokens as i32,
            &current_balance.balance,
            &updated_balance.balance,
            api_usage_record.id,
        ).await {
            warn!("Failed to log audit event for credit consumption: {}", audit_error);
        }
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        Ok((api_usage_record, updated_balance))
    }
    
    /// Private helper for recording and billing within an existing transaction
    async fn _record_and_bill_in_transaction(
        &self,
        entry: ApiUsageEntryDto,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(entry.user_id.to_string())
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        // Extract token counts and provider cost from metadata before moving entry
        let tokens_input = entry.tokens_input;
        let cache_write_tokens = entry.cache_write_tokens;
        let cache_read_tokens = entry.cache_read_tokens;
        let tokens_output = entry.tokens_output;
        let model_id = entry.service_name.clone();
        
        // Note: This method provides fallback cost resolution for backward compatibility
        // The preferred entry point is now BillingService.charge_for_api_usage which uses centralized resolution
        
        // Get model details for validation
        let model_with_provider = self.model_repository
            .find_by_id_with_provider(&model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;
        
        // Calculate cost using secure cached token pricing with overflow protection
        let input_cost = model_with_provider.calculate_input_cost(
            tokens_input,
            cache_write_tokens, 
            cache_read_tokens
        ).map_err(|e| AppError::InvalidArgument(format!("Input cost calculation failed: {}", e)))?;
        
        // Calculate output cost separately with validation
        let output_cost = if let Some(rate) = model_with_provider.get_output_cost_per_million_tokens() {
            // Validate output token count
            if tokens_output < 0 || tokens_output > 1_000_000_000 {
                return Err(AppError::InvalidArgument(
                    format!("Invalid output token count: {}. Must be between 0 and 1,000,000,000", tokens_output)
                ));
            }
            
            // Validate pricing bounds
            let min_price = BigDecimal::from_str("0.000001")
                .map_err(|e| AppError::InvalidArgument(format!("Failed to parse minimum price: {}", e)))?;
            let max_price = BigDecimal::from(1000);
            
            if rate < min_price || rate > max_price {
                return Err(AppError::InvalidArgument(
                    format!("Output pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price)
                ));
            }
            
            let million = BigDecimal::from(1_000_000);
            let output_tokens_bd = BigDecimal::from(tokens_output);
            
            // Check for potential overflow before multiplication
            let product = &rate * &output_tokens_bd;
            if product > (max_price.clone() * million.clone()) {
                return Err(AppError::InvalidArgument(
                    "Output cost calculation would overflow maximum allowed cost".to_string()
                ));
            }
            
            product / &million
        } else {
            BigDecimal::from(0)
        };
        
        // Use calculated cost
        let cost = &input_cost + &output_cost;
        
        // Validate total cost with overflow protection
        let max_cost = BigDecimal::from(1000);
        if cost > max_cost {
            return Err(AppError::InvalidArgument(
                "Combined token cost would exceed maximum allowed cost".to_string()
            ));
        }
        
        // Ensure cost is positive
        if cost < BigDecimal::from(0) {
            return Err(AppError::InvalidArgument(
                "Calculated cost cannot be negative".to_string()
            ));
        }
        
        // Normalize cost at usage entry point
        let cost = normalized(&cost);
        
        // Record API usage first
        let api_usage_record = self.api_usage_repository
            .record_usage_with_executor(entry, cost.clone(), tx)
            .await?;
        
        // Consume credits with reference to the API usage record
        let usage_description = format!("{} - {} tokens in, {} tokens out", 
            api_usage_record.service_name, api_usage_record.tokens_input, api_usage_record.tokens_output);
        
        // Ensure user has a credit record within the transaction
        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(&api_usage_record.user_id, tx)
            .await?;

        // Check if user has sufficient credits
        if current_balance.balance < cost {
            return Err(AppError::CreditInsufficient(
                format!("Insufficient credits. Required: {}, Available: {}", cost, current_balance.balance)
            ));
        }

        // Deduct the credits within the transaction
        let negative_amount = -&cost;
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(&api_usage_record.user_id, &negative_amount, tx)
            .await?;

        // Record the consumption transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: api_usage_record.user_id,
            transaction_type: "consumption".to_string(),
            amount: negative_amount,
            currency: "USD".to_string(),
            description: Some(usage_description),
            stripe_charge_id: None,
            related_api_usage_id: api_usage_record.id,
            metadata: api_usage_record.metadata.clone(),
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, tx)
            .await?;
        
        // Log audit event for credit consumption with cached token data (async, non-blocking)
        let audit_context = crate::services::audit_service::AuditContext::new(api_usage_record.user_id);
        if let Err(audit_error) = self.audit_service.log_credit_consumption(
            &audit_context,
            &api_usage_record.user_id,
            &api_usage_record.service_name,
            &cost,
            tokens_input as i32,
            tokens_output as i32,
            0, // cached_input_tokens - legacy field, use 0
            cache_write_tokens as i32,
            cache_read_tokens as i32,
            &current_balance.balance,
            &updated_balance.balance,
            api_usage_record.id,
        ).await {
            warn!("Failed to log audit event for credit consumption: {}", audit_error);
        }
        
        Ok((api_usage_record, updated_balance))
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