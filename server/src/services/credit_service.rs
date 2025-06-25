use crate::error::AppError;
use crate::db::repositories::{
    UserCreditRepository, CreditTransactionRepository,
    UserCredit, CreditTransaction, CreditTransactionStats, ModelRepository, ApiUsageRepository
};
use crate::db::repositories::api_usage_repository::{ApiUsageEntryDto, ApiUsageRecord};
use crate::models::model_pricing::ModelPricing;
use crate::services::audit_service::{AuditService, AuditContext};
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
}

impl CreditService {
    pub fn new(db_pools: DatabasePools) -> Self {
        Self {
            user_credit_repository: Arc::new(UserCreditRepository::new(db_pools.user_pool.clone())),
            credit_transaction_repository: Arc::new(CreditTransactionRepository::new(db_pools.user_pool.clone())),
            model_repository: Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone()))),
            api_usage_repository: Arc::new(ApiUsageRepository::new(db_pools.user_pool.clone())),
            audit_service: Arc::new(AuditService::new(db_pools.clone())),
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


    /// Atomically check balance and consume credits for usage in a transaction
    pub async fn consume_credits_for_usage_in_tx(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        usage_description: String,
        api_usage_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> Result<UserCredit, AppError> {
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

        // Check if user has sufficient credits
        if current_balance.balance < *amount {
            return Err(AppError::CreditInsufficient(
                format!("Insufficient credits. Required: {}, Available: {}", amount, current_balance.balance)
            ));
        }

        // Deduct the credits within the transaction
        let negative_amount = -amount;
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, &negative_amount, &mut tx)
            .await?;

        // Record the consumption transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "consumption".to_string(),
            amount: negative_amount,
            currency: "USD".to_string(),
            description: Some(usage_description),
            stripe_charge_id: None,
            related_api_usage_id: api_usage_id,
            metadata,
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, &mut tx)
            .await?;

        // Store balance for auto top-off check
        let final_balance_for_check = updated_balance.balance.clone();

        // Commit the transaction first
        tx.commit().await.map_err(AppError::from)?;

        // Check auto top-off after successful credit consumption (outside transaction)
        // Spawn background task to handle auto top-off to avoid blocking the current operation
        let user_id_for_task = *user_id;
        tokio::spawn(async move {
            // Auto top-off check will be triggered via BillingService when integrated
            // For now, we'll just log when balance gets low
            if final_balance_for_check <= BigDecimal::from(1) {
                info!("User {} has low balance ({}), auto top-off check should be triggered", 
                      user_id_for_task, final_balance_for_check);
            }
        });

        info!("Atomically consumed {} credits for user {} (pure prepaid model)", amount, user_id);
        Ok(updated_balance)
    }



    /// Get credit transaction history for a user
    pub async fn get_transaction_history(
        &self,
        user_id: &Uuid,
        limit: Option<i64>,
        offset: Option<i64>,
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
            .get_history_with_executor(user_id, limit, offset, &mut tx)
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
    ) -> Result<CreditDetailsResponse, AppError> {
        let stats = self.get_user_credit_stats(user_id).await?;
        let transactions = self.get_transaction_history(user_id, limit, offset).await?;
        let total_transaction_count = self.get_transaction_count(user_id).await?;
        
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
        let _ = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, &mut tx)
            .await?;

        // Add the refunded credits to user balance within the transaction
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, &mut tx)
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
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, executor)
            .await?;

        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, executor)
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

    pub async fn process_credit_purchase_from_payment_intent(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        currency: &str,
        payment_intent: &stripe::PaymentIntent,
        audit_context: &AuditContext,
    ) -> Result<UserCredit, AppError> {
        // Strict validation for required metadata fields
        let metadata = &payment_intent.metadata;
        
        // Validate user_id exists and matches
        let metadata_user_id = metadata.get("user_id")
            .ok_or_else(|| AppError::InvalidArgument("Missing required 'user_id' in payment intent metadata".to_string()))?;
        
        let parsed_user_id = Uuid::parse_str(metadata_user_id)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid user_id format in payment intent metadata: {}", e)))?;
        
        if &parsed_user_id != user_id {
            return Err(AppError::InvalidArgument(format!(
                "User ID mismatch: expected {}, got {} in payment intent metadata", 
                user_id, parsed_user_id
            )));
        }
        
        // Validate amount exists in metadata and matches
        let metadata_amount = metadata.get("amount")
            .ok_or_else(|| AppError::InvalidArgument("Missing required 'amount' in payment intent metadata".to_string()))?;
        
        let parsed_amount = BigDecimal::from_str(metadata_amount)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid amount format in payment intent metadata: {}", e)))?;
        
        if &parsed_amount != amount {
            return Err(AppError::InvalidArgument(format!(
                "Amount mismatch: expected {}, got {} in payment intent metadata", 
                amount, parsed_amount
            )));
        }
        
        // Validate currency exists in metadata and matches
        let metadata_currency = metadata.get("currency")
            .ok_or_else(|| AppError::InvalidArgument("Missing required 'currency' in payment intent metadata".to_string()))?;
        
        if metadata_currency.to_uppercase() != currency.to_uppercase() {
            return Err(AppError::InvalidArgument(format!(
                "Currency mismatch: expected {}, got {} in payment intent metadata", 
                currency, metadata_currency
            )));
        }
        
        if currency.to_uppercase() != "USD" {
            return Err(AppError::InvalidArgument(
                format!("Only USD currency is supported, got: {}", currency)
            ));
        }
        
        info!("Processing credit purchase for user {}: {} {} (all metadata validation passed)", user_id, amount, currency);
        
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let current_balance = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, &mut tx)
            .await?;

        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, &mut tx)
            .await?;

        let description = format!("Credit purchase via PaymentIntent {}", payment_intent.id);

        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "purchase".to_string(),
            amount: amount.clone(),
            currency: currency.to_string(),
            description: Some(description),
            stripe_charge_id: Some(payment_intent.id.to_string()),
            related_api_usage_id: None,
            metadata: Some(serde_json::json!({
                "payment_intent_id": payment_intent.id.to_string(),
                "balance_before": current_balance.balance,
                "balance_after": updated_balance.balance
            })),
            created_at: Some(Utc::now()),
            balance_after: updated_balance.balance.clone(),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &updated_balance.balance, &mut tx)
            .await?;

        tx.commit().await.map_err(AppError::from)?;

        // Log audit event after successful transaction commit
        let audit_metadata = serde_json::json!({
            "payment_intent_id": payment_intent.id.to_string(),
            "balance_before": current_balance.balance,
            "balance_after": updated_balance.balance,
            "user_id": user_id.to_string()
        });

        if let Err(audit_error) = self.audit_service.log_credit_purchase_succeeded(
            audit_context,
            &payment_intent.id.to_string(),
            amount,
            currency,
            audit_metadata,
        ).await {
            warn!("Failed to log audit event for credit purchase: {}", audit_error);
        }

        info!("Successfully processed credit purchase for user {} via PaymentIntent {}: {} {} added (balance: {} -> {})", 
              user_id, payment_intent.id, amount, currency, current_balance.balance, updated_balance.balance);
        Ok(updated_balance)
    }


    /// Get transaction count for pagination
    pub async fn get_transaction_count(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let pool = self.credit_transaction_repository.get_pool().clone();
        let mut tx = pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let result = sqlx::query!(
            r#"
            SELECT COUNT(*) as count
            FROM credit_transactions 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count credit transactions: {}", e)))?;

        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(result.count.unwrap_or(0))
    }

    /// Calculate cost for a given model and token usage
    pub async fn calculate_cost(
        &self,
        model_id: &str,
        input_tokens: i32,
        output_tokens: i32,
    ) -> Result<BigDecimal, AppError> {
        // Get model with provider information
        let model_with_provider = self.model_repository
            .find_by_id_with_provider(model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;

        // Calculate cost using ModelPricing trait
        let cost = model_with_provider.calculate_token_cost(input_tokens as i64, output_tokens as i64);
        
        Ok(cost)
    }

    /// Atomically record usage and bill credits in a single transaction
    pub async fn record_and_bill_api_usage(&self, mut entry: ApiUsageEntryDto) -> Result<(BigDecimal, ApiUsageRecord), AppError> {
        // Start transaction
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(entry.user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        // Get model details and calculate cost
        let model_with_provider = self.model_repository
            .find_by_id_with_provider(&entry.service_name)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", entry.service_name)))?;
        
        let cost = model_with_provider.calculate_token_cost(entry.tokens_input as i64, entry.tokens_output as i64);
        entry.cost = cost.clone();
        
        // Record API usage first
        let api_usage_record = self.api_usage_repository
            .record_usage_with_executor(entry, &mut tx)
            .await?;
        
        // Consume credits with reference to the API usage record (inline to use existing transaction)
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
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        Ok((cost, api_usage_record))
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