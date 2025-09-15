use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditTransaction {
    pub id: Uuid,
    pub user_id: Uuid,
    pub transaction_type: String, // 'purchase', 'consumption', 'refund', 'adjustment', 'expiry'
    pub net_amount: BigDecimal,
    pub gross_amount: Option<BigDecimal>,
    pub fee_amount: Option<BigDecimal>,
    pub currency: String,
    pub description: Option<String>,
    pub stripe_charge_id: Option<String>,
    pub related_api_usage_id: Option<Uuid>,
    pub metadata: Option<JsonValue>,
    pub created_at: Option<DateTime<Utc>>,
    pub balance_after: BigDecimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditTransactionStats {
    pub total_purchased: BigDecimal,
    pub total_consumed: BigDecimal,
    pub total_refunded: BigDecimal,
    pub net_balance: BigDecimal,
    pub transaction_count: i64,
}

#[derive(Debug)]
pub struct CreditTransactionRepository {
    pool: PgPool,
}

impl CreditTransactionRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }


    pub async fn create_transaction_with_executor(
        &self,
        transaction: &CreditTransaction,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<CreditTransaction, AppError> {
        let result = sqlx::query_as!(
            CreditTransaction,
            r#"
            INSERT INTO credit_transactions 
            (id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, description, 
             stripe_charge_id, related_api_usage_id, metadata, balance_after, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            RETURNING id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                      description, stripe_charge_id, related_api_usage_id, 
                      metadata, created_at, balance_after
            "#,
            transaction.id,
            transaction.user_id,
            transaction.transaction_type,
            transaction.net_amount,
            transaction.gross_amount,
            transaction.fee_amount,
            transaction.currency,
            transaction.description,
            transaction.stripe_charge_id,
            transaction.related_api_usage_id,
            transaction.metadata,
            &transaction.balance_after
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create credit transaction: {}", e)))?;

        Ok(result)
    }


    pub async fn get_history_with_executor(
        &self,
        user_id: &Uuid,
        limit: i64,
        offset: i64,
        search: Option<&str>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Vec<CreditTransaction>, AppError> {
        let search_param = search.map(|s| format!("%{}%", s));
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at, balance_after
            FROM credit_transactions 
            WHERE user_id = $1 AND ($4::TEXT IS NULL OR description ILIKE $4)
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit,
            offset,
            search_param
        )
        .fetch_all(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transaction history: {}", e)))?;

        Ok(results)
    }


    pub async fn get_transactions_by_type_with_executor(
        &self,
        user_id: &Uuid,
        transaction_type: &str,
        limit: i64,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Vec<CreditTransaction>, AppError> {
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at, balance_after
            FROM credit_transactions 
            WHERE user_id = $1 AND transaction_type = $2
            ORDER BY created_at DESC
            LIMIT $3
            "#,
            user_id,
            transaction_type,
            limit
        )
        .fetch_all(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transactions by type: {}", e)))?;

        Ok(results)
    }


    pub async fn get_transaction_stats_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<CreditTransactionStats, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN net_amount ELSE 0 END), 0) as total_purchased,
                COALESCE(SUM(CASE WHEN transaction_type = 'consumption' THEN net_amount ELSE 0 END), 0) as total_consumed,
                COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN net_amount ELSE 0 END), 0) as total_refunded,
                COALESCE(SUM(net_amount), 0) as net_balance,
                COUNT(*) as transaction_count
            FROM credit_transactions 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transaction stats: {}", e)))?;

        Ok(CreditTransactionStats {
            total_purchased: result.total_purchased.unwrap_or_else(|| BigDecimal::from(0)),
            total_consumed: result.total_consumed.unwrap_or_else(|| BigDecimal::from(0)),
            total_refunded: result.total_refunded.unwrap_or_else(|| BigDecimal::from(0)),
            net_balance: result.net_balance.unwrap_or_else(|| BigDecimal::from(0)),
            transaction_count: result.transaction_count.unwrap_or(0),
        })
    }


    pub async fn get_transaction_by_id_with_executor(
        &self,
        transaction_id: &Uuid,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Option<CreditTransaction>, AppError> {
        let result = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at, balance_after
            FROM credit_transactions 
            WHERE id = $1 AND user_id = $2
            "#,
            transaction_id,
            user_id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transaction by ID: {}", e)))?;

        Ok(result)
    }

    /// Get credit transaction history for a user (standalone method for system pool)
    pub async fn get_history(
        &self,
        user_id: &Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<CreditTransaction>, AppError> {
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at, balance_after
            FROM credit_transactions 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit,
            offset
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transaction history: {}", e)))?;

        Ok(results)
    }

    /// Get credit transaction statistics for a user (standalone method for system pool)
    pub async fn get_transaction_stats(
        &self,
        user_id: &Uuid,
    ) -> Result<CreditTransactionStats, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN net_amount ELSE 0 END), 0) as total_purchased,
                COALESCE(SUM(CASE WHEN transaction_type = 'consumption' THEN net_amount ELSE 0 END), 0) as total_consumed,
                COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN net_amount ELSE 0 END), 0) as total_refunded,
                COALESCE(SUM(net_amount), 0) as net_balance,
                COUNT(*) as transaction_count
            FROM credit_transactions 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transaction stats: {}", e)))?;

        Ok(CreditTransactionStats {
            total_purchased: result.total_purchased.unwrap_or_else(|| BigDecimal::from(0)),
            total_consumed: result.total_consumed.unwrap_or_else(|| BigDecimal::from(0)),
            total_refunded: result.total_refunded.unwrap_or_else(|| BigDecimal::from(0)),
            net_balance: result.net_balance.unwrap_or_else(|| BigDecimal::from(0)),
            transaction_count: result.transaction_count.unwrap_or(0),
        })
    }

    /// Get transaction count for pagination (standalone method for system pool)
    pub async fn get_transaction_count(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT COUNT(*) as count
            FROM credit_transactions 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count credit transactions: {}", e)))?;

        Ok(result.count.unwrap_or(0))
    }

    /// Get transactions by Stripe charge ID
    pub async fn get_transactions_by_stripe_charge(&self, stripe_charge_id: &str) -> Result<Vec<CreditTransaction>, AppError> {
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at, balance_after
            FROM credit_transactions 
            WHERE stripe_charge_id = $1
            ORDER BY created_at DESC
            "#,
            stripe_charge_id
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transactions by Stripe charge: {}", e)))?;

        Ok(results)
    }


    pub async fn get_transactions_by_api_usage_with_executor(
        &self,
        api_usage_id: &Uuid,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Vec<CreditTransaction>, AppError> {
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, net_amount, gross_amount, fee_amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at, balance_after
            FROM credit_transactions 
            WHERE related_api_usage_id = $1 AND user_id = $2
            ORDER BY created_at DESC
            "#,
            api_usage_id,
            user_id
        )
        .fetch_all(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transactions by API usage: {}", e)))?;

        Ok(results)
    }


    /// Create an expiry transaction when free credits expire
    pub async fn create_expiry_transaction_with_executor(
        &self,
        user_id: &Uuid,
        expired_amount: &BigDecimal,
        combined_balance_after: &BigDecimal,
        description: Option<String>,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<CreditTransaction, AppError> {
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "expiry".to_string(),
            net_amount: -expired_amount.clone(),
            gross_amount: None,
            fee_amount: None,
            currency: "USD".to_string(),
            description: Some(description.unwrap_or_else(|| "Free credits expired".to_string())),
            stripe_charge_id: None,
            related_api_usage_id: None,
            metadata: Some(serde_json::json!({
                "expired_amount": expired_amount,
                "reason": "expiry"
            })),
            created_at: Some(Utc::now()),
            balance_after: combined_balance_after.clone(),
        };

        self.create_transaction_with_executor(&transaction, tx).await
    }

    /// Create a consumption transaction (helper method for API usage)
    pub async fn create_consumption_transaction_with_executor(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        api_usage_id: &Uuid,
        description: Option<String>,
        balance_after: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<CreditTransaction, AppError> {
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "consumption".to_string(),
            net_amount: amount.clone(), // Already negative when passed in
            gross_amount: None,
            fee_amount: None,
            currency: "USD".to_string(),
            description,
            stripe_charge_id: None,
            related_api_usage_id: Some(*api_usage_id),
            metadata: None,
            created_at: None, // Will be set in the database
            balance_after: balance_after.clone(),
        };

        self.create_transaction_with_executor(&transaction, executor).await
    }

    pub async fn has_purchase_transaction_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<bool, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM credit_transactions 
                WHERE user_id = $1 AND transaction_type = 'purchase'
            ) as has_purchase
            "#,
            user_id
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to check purchase transactions: {}", e)))?;

        Ok(result.has_purchase.unwrap_or(false))
    }
}