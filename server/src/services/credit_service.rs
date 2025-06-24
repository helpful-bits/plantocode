use crate::error::AppError;
use crate::db::repositories::{
    UserCreditRepository, CreditTransactionRepository, CreditPackRepository,
    UserCredit, CreditTransaction, CreditPack, CreditTransactionStats
};
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
}

impl CreditService {
    pub fn new(db_pools: DatabasePools) -> Self {
        Self {
            user_credit_repository: Arc::new(UserCreditRepository::new(db_pools.user_pool.clone())),
            credit_transaction_repository: Arc::new(CreditTransactionRepository::new(db_pools.system_pool.clone())),
            credit_pack_repository: Arc::new(CreditPackRepository::new(db_pools.system_pool)),
        }
    }

    /// Get user's current credit balance
    pub async fn get_user_balance(&self, user_id: &Uuid) -> Result<UserCredit, AppError> {
        // Ensure a credit record exists for the user
        let balance = self.user_credit_repository
            .ensure_balance_record_exists(user_id)
            .await?;
        
        Ok(balance)
    }

    /// Check if user has sufficient credits for a given amount
    pub async fn has_sufficient_credits(&self, user_id: &Uuid, required_amount: &BigDecimal) -> Result<bool, AppError> {
        self.user_credit_repository
            .has_sufficient_credits(user_id, required_amount)
            .await
    }

    // Note: consume_credits method has been removed as part of billing system refactor
    // Credit consumption is now handled via Stripe's metered billing system
    // Usage reporting is handled by CostBasedBillingService.calculate_and_report_usage


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
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
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
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
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

        // Ensure user has a credit record within the transaction
        let _ = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, &mut tx)
            .await?;

        // Adjust the credits (can be positive or negative) within the transaction
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, &mut tx)
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
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!("Atomically adjusted {} credits for user {} (admin action)", amount, user_id);
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
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

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