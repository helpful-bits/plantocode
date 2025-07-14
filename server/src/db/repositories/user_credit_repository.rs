use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCredit {
    pub user_id: Uuid,
    pub balance: BigDecimal,
    pub currency: String,
    pub free_credit_balance: BigDecimal,
    pub free_credits_granted_at: Option<DateTime<Utc>>,
    pub free_credits_expires_at: Option<DateTime<Utc>>,
    pub free_credits_expired: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug)]
pub struct UserCreditRepository {
    pool: PgPool,
}

impl UserCreditRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Get the current credit balance for a user
    pub async fn get_balance(&self, user_id: &Uuid) -> Result<Option<UserCredit>, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.get_balance_with_executor(user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn get_balance_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Option<UserCredit>, AppError> {
        let result = sqlx::query_as!(
            UserCredit,
            r#"
            SELECT user_id, balance, currency, free_credit_balance, free_credits_granted_at, 
                   free_credits_expires_at, free_credits_expired, created_at, updated_at
            FROM user_credits 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user credit balance: {}", e)))?;

        Ok(result)
    }

    /// Update the credit balance for a user
    pub async fn update_balance(&self, user_id: &Uuid, new_balance: &BigDecimal) -> Result<UserCredit, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.update_balance_with_executor(user_id, new_balance, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn update_balance_with_executor(
        &self,
        user_id: &Uuid,
        new_balance: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<UserCredit, AppError> {
        let result = sqlx::query_as!(
            UserCredit,
            r#"
            UPDATE user_credits 
            SET balance = $2, updated_at = NOW()
            WHERE user_id = $1
            RETURNING user_id, balance, currency, free_credit_balance, free_credits_granted_at, 
                      free_credits_expires_at, free_credits_expired, created_at, updated_at
            "#,
            user_id,
            new_balance
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update user credit balance: {}", e)))?;

        Ok(result)
    }

    /// Atomically increment or decrement the credit balance
    pub async fn increment_balance(&self, user_id: &Uuid, amount_change: &BigDecimal) -> Result<UserCredit, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.increment_balance_with_executor(user_id, amount_change, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn increment_balance_with_executor(
        &self,
        user_id: &Uuid,
        amount_change: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<UserCredit, AppError> {
        let result = sqlx::query_as!(
            UserCredit,
            r#"
            UPDATE user_credits 
            SET balance = balance + $2, updated_at = NOW()
            WHERE user_id = $1 AND balance + $2 >= 0
            RETURNING user_id, balance, currency, free_credit_balance, free_credits_granted_at, 
                      free_credits_expires_at, free_credits_expired, created_at, updated_at
            "#,
            user_id,
            amount_change
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to increment user credit balance: {}", e)))?;

        match result {
            Some(user_credit) => Ok(user_credit),
            None => Err(AppError::CreditInsufficient("Insufficient credits for this operation".to_string())),
        }
    }

    /// Ensure a balance record exists for a user, creating one if it doesn't exist
    pub async fn ensure_balance_record_exists(&self, user_id: &Uuid) -> Result<UserCredit, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.ensure_balance_record_exists_with_executor(user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn ensure_balance_record_exists_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<UserCredit, AppError> {
        // First try to insert, ignore if already exists
        sqlx::query!(
            r#"
            INSERT INTO user_credits (user_id, balance, currency, free_credit_balance, 
                                      free_credits_expired, created_at, updated_at)
            VALUES ($1, 0.0000, 'USD', 0.0000, false, NOW(), NOW())
            ON CONFLICT (user_id) DO NOTHING
            "#,
            user_id
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to insert user credit record: {}", e)))?;

        // Then select the record
        let result = sqlx::query_as!(
            UserCredit,
            r#"
            SELECT user_id, balance, currency, free_credit_balance, free_credits_granted_at, 
                   free_credits_expires_at, free_credits_expired, created_at, updated_at
            FROM user_credits 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to select user credit record: {}", e)))?;

        Ok(result)
    }

    /// Get balance for multiple users (admin function)
    pub async fn get_balances_for_users(&self, user_ids: &[Uuid]) -> Result<Vec<UserCredit>, AppError> {
        let result = sqlx::query_as!(
            UserCredit,
            r#"
            SELECT user_id, balance, currency, free_credit_balance, free_credits_granted_at, 
                   free_credits_expires_at, free_credits_expired, created_at, updated_at
            FROM user_credits 
            WHERE user_id = ANY($1)
            ORDER BY updated_at DESC
            "#,
            user_ids
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user credit balances: {}", e)))?;

        Ok(result)
    }

    /// Check if user has sufficient credits for a given amount
    pub async fn has_sufficient_credits(&self, user_id: &Uuid, required_amount: &BigDecimal) -> Result<bool, AppError> {
        let balance = self.get_balance(user_id).await?;
        
        match balance {
            Some(user_credit) => Ok(&user_credit.balance >= required_amount),
            None => Ok(false), // No credit record means no credits
        }
    }

    pub async fn has_sufficient_credits_with_executor(
        &self,
        user_id: &Uuid,
        required_amount: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<bool, AppError> {
        let balance = self.get_balance_with_executor(user_id, executor).await?;
        
        match balance {
            Some(user_credit) => Ok(&user_credit.balance >= required_amount),
            None => Ok(false), // No credit record means no credits
        }
    }

    /// Expire free credits for all users where expiry date has passed
    pub async fn expire_free_credits(&self) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"
            UPDATE user_credits 
            SET free_credit_balance = 0.0000, 
                free_credits_expired = true, 
                updated_at = NOW()
            WHERE free_credits_expires_at < NOW() 
            AND free_credits_expired = false
            "#
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }
    
    /// Deduct credits with priority: free credits first, then paid balance
    pub async fn deduct_credits_with_priority(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<(UserCredit, BigDecimal, BigDecimal), AppError> {
        // Get current balance
        let current = self.get_balance_with_executor(user_id, executor).await?
            .ok_or_else(|| AppError::NotFound("User credit record not found".to_string()))?;
        
        let mut remaining_to_deduct = amount.clone();
        let mut from_free = BigDecimal::from(0);
        let mut from_paid = BigDecimal::from(0);
        
        // First, deduct from free credits if available and not expired
        if current.free_credit_balance > BigDecimal::from(0) && !current.free_credits_expired {
            if let Some(expires_at) = current.free_credits_expires_at {
                if expires_at > Utc::now() {
                    // Free credits are valid
                    if current.free_credit_balance >= remaining_to_deduct {
                        // Can deduct entirely from free credits
                        from_free = remaining_to_deduct.clone();
                        remaining_to_deduct = BigDecimal::from(0);
                    } else {
                        // Deduct what we can from free credits
                        from_free = current.free_credit_balance.clone();
                        remaining_to_deduct -= &from_free;
                    }
                }
            }
        }
        
        // Then deduct remaining from paid balance
        if remaining_to_deduct > BigDecimal::from(0) {
            if current.balance >= remaining_to_deduct {
                from_paid = remaining_to_deduct;
            } else {
                return Err(AppError::CreditInsufficient(
                    format!("Insufficient credits. Required: {}, Available: {} (paid) + {} (free)", 
                            amount, current.balance, current.free_credit_balance)
                ));
            }
        }
        
        // Update balances
        let new_free_balance = &current.free_credit_balance - &from_free;
        let new_paid_balance = &current.balance - &from_paid;
        
        let updated = sqlx::query_as!(
            UserCredit,
            r#"
            UPDATE user_credits 
            SET balance = $2, 
                free_credit_balance = $3,
                updated_at = NOW()
            WHERE user_id = $1
            RETURNING user_id, balance, currency, free_credit_balance, free_credits_granted_at, 
                      free_credits_expires_at, free_credits_expired, created_at, updated_at
            "#,
            user_id,
            new_paid_balance,
            new_free_balance
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update user credit balance: {}", e)))?;
        
        Ok((updated, from_free, from_paid))
    }
}