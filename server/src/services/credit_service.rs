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
            .ensure_balance_record_exists(user_id, "USD")
            .await?;
        
        Ok(balance)
    }

    /// Check if user has sufficient credits for a given amount
    pub async fn has_sufficient_credits(&self, user_id: &Uuid, required_amount: &BigDecimal) -> Result<bool, AppError> {
        self.user_credit_repository
            .has_sufficient_credits(user_id, required_amount)
            .await
    }

    /// Consume credits for API usage (atomic operation with proper transaction handling)
    pub async fn consume_credits(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        api_usage_id: &Uuid,
        description: Option<String>,
    ) -> Result<UserCredit, AppError> {
        // Start a database transaction to ensure atomicity
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;

        // First, check and deduct credits atomically within the transaction
        let has_credits = self.user_credit_repository
            .has_sufficient_credits_with_executor(user_id, amount, &mut tx)
            .await?;
        
        if !has_credits {
            return Err(AppError::Payment(
                "Insufficient credit balance for this operation".to_string()
            ));
        }

        // Deduct the credits within the same transaction
        let negative_amount = -amount;
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, &negative_amount, &mut tx)
            .await?;

        // Record the consumption transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "consumption".to_string(),
            amount: negative_amount.clone(),
            currency: "USD".to_string(),
            description,
            stripe_charge_id: None,
            related_api_usage_id: Some(*api_usage_id),
            metadata: None,
            created_at: Some(Utc::now()),
        };

        let _created_transaction = self.credit_transaction_repository
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!("Atomically consumed {} credits for user {}", amount, user_id);
        Ok(updated_balance)
    }

    /// Add credits to user balance (for purchases) - atomic operation with validation
    pub async fn add_credits(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        stripe_charge_id: &str,
        stripe_price_id: Option<&str>,
        description: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<UserCredit, AppError> {
        // Validate against credit pack if Stripe price ID is provided
        if let Some(price_id) = stripe_price_id {
            if let Some(credit_pack) = self.credit_pack_repository
                .get_credit_pack_by_stripe_price_id(price_id)
                .await?
            {
                // Validate that the amount matches the credit pack value
                if credit_pack.value_credits != *amount {
                    return Err(AppError::Payment(
                        format!(
                            "Credit amount mismatch: expected {}, got {}",
                            credit_pack.value_credits, amount
                        )
                    ));
                }
            } else {
                return Err(AppError::Payment(
                    format!("Invalid Stripe price ID: {}", price_id)
                ));
            }
        }

        // Start a database transaction to ensure atomicity
        let pool = self.user_credit_repository.get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;

        // Ensure user has a credit record within the transaction
        let _ = self.user_credit_repository
            .ensure_balance_record_exists_with_executor(user_id, "USD", &mut tx)
            .await?;

        // Add the credits to user balance within the transaction
        let updated_balance = self.user_credit_repository
            .increment_balance_with_executor(user_id, amount, &mut tx)
            .await?;

        // Record the purchase transaction within the same transaction
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "purchase".to_string(),
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

        info!("Atomically added {} credits for user {} via Stripe charge {}", amount, user_id, stripe_charge_id);
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
        
        self.credit_transaction_repository
            .get_history(user_id, limit, offset)
            .await
    }

    /// Get credit transaction statistics for a user
    pub async fn get_user_credit_stats(&self, user_id: &Uuid) -> Result<CreditStats, AppError> {
        let balance = self.get_user_balance(user_id).await?;
        let transaction_stats = self.credit_transaction_repository
            .get_transaction_stats(user_id)
            .await?;

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
            .ensure_balance_record_exists_with_executor(user_id, "USD", &mut tx)
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
            .ensure_balance_record_exists_with_executor(user_id, "USD", &mut tx)
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
        self.credit_transaction_repository.count_transactions(user_id).await
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