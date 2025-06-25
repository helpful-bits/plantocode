use crate::error::AppError;
use crate::db::repositories::{
    UserCreditRepository, CreditTransactionRepository, CreditPackRepository,
    UserCredit, CreditTransaction, CreditPack, CreditTransactionStats, ModelRepository
};
use crate::models::model_pricing::ModelPricing;
use bigdecimal::{BigDecimal, FromPrimitive};
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
    credit_pack_repository: Arc<CreditPackRepository>,
    model_repository: Arc<ModelRepository>,
}

impl CreditService {
    pub fn new(db_pools: DatabasePools) -> Self {
        Self {
            user_credit_repository: Arc::new(UserCreditRepository::new(db_pools.user_pool.clone())),
            credit_transaction_repository: Arc::new(CreditTransactionRepository::new(db_pools.user_pool.clone())),
            credit_pack_repository: Arc::new(CreditPackRepository::new(db_pools.system_pool.clone())),
            model_repository: Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool))),
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
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!("Atomically consumed {} credits for user {} (pure prepaid model)", amount, user_id);
        Ok(updated_balance)
    }


    /// Get available credit packs
    pub async fn get_available_credit_packs(&self) -> Result<Vec<CreditPack>, AppError> {
        self.credit_pack_repository
            .get_available_credit_packs()
            .await
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
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!("Atomically refunded {} credits for user {} via Stripe charge {}", amount, user_id, stripe_charge_id);
        Ok(updated_balance)
    }

    /// Admin function to adjust credits with external transaction
    pub async fn adjust_credits_with_executor(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        description: String,
        admin_metadata: Option<serde_json::Value>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<UserCredit, AppError> {
        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        // Ensure user has a credit record within the transaction
        let _ = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, executor)
            .await?;

        // Adjust the credits (can be positive or negative) within the transaction
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, executor)
            .await?;

        // Record the adjustment transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "adjustment".to_string(),
            amount: amount.clone(),
            currency: "USD".to_string(),
            description: Some(description),
            stripe_charge_id: None,
            related_api_usage_id: None,
            metadata: admin_metadata,
            created_at: Some(Utc::now()),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, executor)
            .await?;

        info!("Atomically adjusted {} credits for user {} (admin action)", amount, user_id);
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

    /// Process credit top-up purchase from payment intent
    /// This handles one-time credit purchases that supplement metered billing
    pub async fn process_credit_purchase_from_payment_intent(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        currency: &str,
        payment_intent: &stripe::PaymentIntent,
    ) -> Result<UserCredit, AppError> {
        // Validate that the currency is USD
        if currency.to_uppercase() != "USD" {
            return Err(AppError::InvalidArgument(
                format!("Only USD currency is supported, got: {}", currency)
            ));
        }
        
        info!("Processing credit top-up purchase for user {}: {} {}", user_id, amount, currency);
        
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

        // Add the credits to user balance within the transaction
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, &mut tx)
            .await?;

        // Record the top-up purchase transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "purchase".to_string(),
            amount: amount.clone(),
            currency: currency.to_string(),
            description: Some(format!("Credit top-up purchase via Stripe PaymentIntent {} (supplements metered billing)", payment_intent.id)),
            stripe_charge_id: Some(payment_intent.id.to_string()),
            related_api_usage_id: None,
            metadata: Some(serde_json::to_value(&payment_intent.metadata).unwrap_or_default()),
            created_at: Some(Utc::now()),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!("Successfully processed credit top-up purchase for user {} via PaymentIntent {}: {} {} added to balance (new system: credits supplement metered billing)", 
              user_id, payment_intent.id, amount, currency);
        Ok(updated_balance)
    }

    /// Check if a credit pack is valid and get its details
    pub async fn get_credit_pack_by_id(&self, pack_id: &str) -> Result<Option<CreditPack>, AppError> {
        self.credit_pack_repository
            .get_pack_by_id(pack_id)
            .await
    }

    /// Validate if a Stripe price ID corresponds to a configured credit pack
    pub async fn get_credit_pack_by_stripe_price_id(&self, stripe_price_id: &str) -> Result<Option<CreditPack>, AppError> {
        self.credit_pack_repository
            .get_credit_pack_by_stripe_price_id(stripe_price_id)
            .await
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

    /// Consume credits for a given cost
    pub async fn consume_credits(
        &self,
        user_id: &Uuid,
        cost: &BigDecimal,
    ) -> Result<UserCredit, AppError> {
        let usage_description = format!("AI service usage - cost: {}", cost);
        self.consume_credits_for_usage_in_tx(
            user_id,
            cost,
            usage_description,
            None, // No specific API usage ID
            None, // No additional metadata
        ).await
    }

    /// Calculate cost and consume credits atomically
    pub async fn calculate_and_consume_credits(
        &self,
        user_id: &Uuid,
        model_id: &str,
        input_tokens: i32,
        output_tokens: i32,
        duration_ms: Option<i64>,
        metadata: Option<serde_json::Value>,
    ) -> Result<BigDecimal, AppError> {
        // Get model with provider information
        let model_with_provider = self.model_repository
            .find_by_id_with_provider(model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;

        // Calculate cost using ModelPricing trait
        let cost = if let Some(duration) = duration_ms {
            model_with_provider.calculate_total_cost(input_tokens as i64, output_tokens as i64, Some(duration))
                .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?
        } else {
            model_with_provider.calculate_token_cost(input_tokens as i64, output_tokens as i64)
        };

        // Consume credits atomically
        let usage_description = format!("{} - {} tokens in, {} tokens out", model_id, input_tokens, output_tokens);
        self.consume_credits_for_usage_in_tx(
            user_id,
            &cost,
            usage_description,
            None, // No specific API usage ID
            metadata,
        ).await?;

        Ok(cost)
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