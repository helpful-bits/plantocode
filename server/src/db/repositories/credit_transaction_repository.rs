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
    pub amount: BigDecimal,
    pub currency: String,
    pub description: Option<String>,
    pub stripe_charge_id: Option<String>,
    pub related_api_usage_id: Option<Uuid>,
    pub metadata: Option<JsonValue>,
    pub created_at: Option<DateTime<Utc>>,
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

    /// Create a new credit transaction
    pub async fn create_transaction(&self, transaction: &CreditTransaction) -> Result<CreditTransaction, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(transaction.user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        let result = self.create_transaction_with_executor(transaction, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
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
            (id, user_id, transaction_type, amount, currency, description, 
             stripe_charge_id, related_api_usage_id, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING id, user_id, transaction_type, amount, currency, 
                      description, stripe_charge_id, related_api_usage_id, 
                      metadata, created_at
            "#,
            transaction.id,
            transaction.user_id,
            transaction.transaction_type,
            transaction.amount,
            transaction.currency,
            transaction.description,
            transaction.stripe_charge_id,
            transaction.related_api_usage_id,
            transaction.metadata
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create credit transaction: {}", e)))?;

        Ok(result)
    }

    /// Get transaction history for a user
    pub async fn get_history(&self, user_id: &Uuid, limit: i64, offset: i64) -> Result<Vec<CreditTransaction>, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        let result = self.get_history_with_executor(user_id, limit, offset, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn get_history_with_executor(
        &self,
        user_id: &Uuid,
        limit: i64,
        offset: i64,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Vec<CreditTransaction>, AppError> {
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at
            FROM credit_transactions 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit,
            offset
        )
        .fetch_all(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit transaction history: {}", e)))?;

        Ok(results)
    }

    /// Get transactions filtered by type
    pub async fn get_transactions_by_type(&self, user_id: &Uuid, transaction_type: &str, limit: i64) -> Result<Vec<CreditTransaction>, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        let result = self.get_transactions_by_type_with_executor(user_id, transaction_type, limit, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
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
            SELECT id, user_id, transaction_type, amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at
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

    /// Get transaction summary for a user
    pub async fn get_transaction_stats(&self, user_id: &Uuid) -> Result<CreditTransactionStats, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        let result = self.get_transaction_stats_with_executor(user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn get_transaction_stats_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<CreditTransactionStats, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) as total_purchased,
                COALESCE(SUM(CASE WHEN transaction_type = 'consumption' THEN amount ELSE 0 END), 0) as total_consumed,
                COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END), 0) as total_refunded,
                COALESCE(SUM(amount), 0) as net_balance,
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

    /// Get a transaction by its ID
    pub async fn get_transaction_by_id(&self, transaction_id: &Uuid, user_id: &Uuid) -> Result<Option<CreditTransaction>, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        let result = self.get_transaction_by_id_with_executor(transaction_id, user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
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
            SELECT id, user_id, transaction_type, amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at
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

    /// Get transactions by Stripe charge ID
    pub async fn get_transactions_by_stripe_charge(&self, stripe_charge_id: &str) -> Result<Vec<CreditTransaction>, AppError> {
        let results = sqlx::query_as!(
            CreditTransaction,
            r#"
            SELECT id, user_id, transaction_type, amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at
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

    /// Get transactions linked to specific API usage
    pub async fn get_transactions_by_api_usage(&self, api_usage_id: &Uuid, user_id: &Uuid) -> Result<Vec<CreditTransaction>, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        let result = self.get_transactions_by_api_usage_with_executor(api_usage_id, user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
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
            SELECT id, user_id, transaction_type, amount, currency, 
                   description, stripe_charge_id, related_api_usage_id, 
                   metadata, created_at
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

    /// Count total transactions for a user
    pub async fn count_transactions(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let mut tx = self.pool.begin().await
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

    /// Create a consumption transaction (helper method for API usage)
    pub async fn create_consumption_transaction_with_executor(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        api_usage_id: &Uuid,
        description: Option<String>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<CreditTransaction, AppError> {
        let transaction = CreditTransaction {
            id: Uuid::new_v4(),
            user_id: *user_id,
            transaction_type: "consumption".to_string(),
            amount: amount.clone(), // Already negative when passed in
            currency: "USD".to_string(),
            description,
            stripe_charge_id: None,
            related_api_usage_id: Some(*api_usage_id),
            metadata: None,
            created_at: None, // Will be set in the database
        };

        self.create_transaction_with_executor(&transaction, executor).await
    }
}