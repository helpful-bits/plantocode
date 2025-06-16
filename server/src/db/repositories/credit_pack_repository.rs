use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditPack {
    pub id: String,
    pub name: String,
    pub value_credits: BigDecimal,  // Amount of credits user gets
    pub price_amount: BigDecimal,   // Price user pays
    pub currency: String,
    pub description: Option<String>,
    pub recommended: bool,
    pub bonus_percentage: Option<BigDecimal>,
    pub is_popular: Option<bool>,
    pub is_active: bool,
    pub display_order: i32,
    pub stripe_price_id: String,  // Environment-specific
}

#[derive(Debug, Clone)]
pub struct CreditPackRepository {
    pool: PgPool,
}

impl CreditPackRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Get all active credit packs for current environment with Stripe config
    pub async fn get_available_credit_packs(&self) -> Result<Vec<CreditPack>, AppError> {
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        
        let packs = sqlx::query!(
            r#"
            SELECT 
                cp.id,
                cp.name,
                cp.value_credits,
                cp.price_amount,
                cp.currency,
                cp.description,
                cp.recommended,
                cp.bonus_percentage,
                cp.is_popular,
                cp.is_active,
                cp.display_order,
                sc.stripe_price_id
            FROM credit_packs cp
            INNER JOIN credit_pack_stripe_config sc ON cp.id = sc.credit_pack_id
            WHERE cp.is_active = true 
                AND sc.is_active = true 
                AND sc.environment = $1
            ORDER BY cp.display_order ASC, cp.created_at ASC
            "#,
            environment
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit packs: {}", e)))?;

        let credit_packs = packs.into_iter().map(|row| CreditPack {
            id: row.id,
            name: row.name,
            value_credits: row.value_credits,
            price_amount: row.price_amount,
            currency: row.currency,
            description: row.description,
            recommended: row.recommended,
            bonus_percentage: row.bonus_percentage,
            is_popular: row.is_popular,
            is_active: row.is_active,
            display_order: row.display_order.unwrap_or(0),
            stripe_price_id: row.stripe_price_id,
        }).collect();

        Ok(credit_packs)
    }

    /// Get credit pack by ID for current environment
    pub async fn get_pack_by_id(&self, pack_id: &str) -> Result<Option<CreditPack>, AppError> {
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        
        let pack = sqlx::query!(
            r#"
            SELECT 
                cp.id,
                cp.name,
                cp.value_credits,
                cp.price_amount,
                cp.currency,
                cp.description,
                cp.recommended,
                cp.bonus_percentage,
                cp.is_popular,
                cp.is_active,
                cp.display_order,
                sc.stripe_price_id
            FROM credit_packs cp
            INNER JOIN credit_pack_stripe_config sc ON cp.id = sc.credit_pack_id
            WHERE cp.id = $1 
                AND cp.is_active = true 
                AND sc.is_active = true 
                AND sc.environment = $2
            "#,
            pack_id,
            environment
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit pack by ID: {}", e)))?;

        Ok(pack.map(|row| CreditPack {
            id: row.id,
            name: row.name,
            value_credits: row.value_credits,
            price_amount: row.price_amount,
            currency: row.currency,
            description: row.description,
            recommended: row.recommended,
            bonus_percentage: row.bonus_percentage,
            is_popular: row.is_popular,
            is_active: row.is_active,
            display_order: row.display_order.unwrap_or(0),
            stripe_price_id: row.stripe_price_id,
        }))
    }

    /// Get credit pack by Stripe price ID for current environment
    pub async fn get_credit_pack_by_stripe_price_id(&self, stripe_price_id: &str) -> Result<Option<CreditPack>, AppError> {
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        
        let pack = sqlx::query!(
            r#"
            SELECT 
                cp.id,
                cp.name,
                cp.value_credits,
                cp.price_amount,
                cp.currency,
                cp.description,
                cp.recommended,
                cp.bonus_percentage,
                cp.is_popular,
                cp.is_active,
                cp.display_order,
                sc.stripe_price_id
            FROM credit_packs cp
            INNER JOIN credit_pack_stripe_config sc ON cp.id = sc.credit_pack_id
            WHERE sc.stripe_price_id = $1 
                AND cp.is_active = true 
                AND sc.is_active = true 
                AND sc.environment = $2
            "#,
            stripe_price_id,
            environment
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get credit pack by Stripe price ID: {}", e)))?;

        Ok(pack.map(|row| CreditPack {
            id: row.id,
            name: row.name,
            value_credits: row.value_credits,
            price_amount: row.price_amount,
            currency: row.currency,
            description: row.description,
            recommended: row.recommended,
            bonus_percentage: row.bonus_percentage,
            is_popular: row.is_popular,
            is_active: row.is_active,
            display_order: row.display_order.unwrap_or(0),
            stripe_price_id: row.stripe_price_id,
        }))
    }

    /// Create a new credit pack
    pub async fn create_pack(&self, pack: &CreditPack) -> Result<CreditPack, AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        
        // Insert credit pack
        sqlx::query!(
            r#"
            INSERT INTO credit_packs (
                id, name, value_credits, price_amount, currency, description, 
                recommended, bonus_percentage, is_popular, is_active, display_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
            pack.id,
            pack.name,
            pack.value_credits,
            pack.price_amount,
            pack.currency,
            pack.description,
            pack.recommended,
            pack.bonus_percentage,
            pack.is_popular,
            pack.is_active,
            pack.display_order
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create credit pack: {}", e)))?;

        // Insert Stripe config for current environment
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        sqlx::query!(
            r#"
            INSERT INTO credit_pack_stripe_config (credit_pack_id, environment, stripe_price_id)
            VALUES ($1, $2, $3)
            "#,
            pack.id,
            environment,
            pack.stripe_price_id
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create credit pack Stripe config: {}", e)))?;

        tx.commit().await.map_err(AppError::from)?;
        
        Ok(pack.clone())
    }

    /// Update credit pack
    pub async fn update_pack(&self, pack: &CreditPack) -> Result<CreditPack, AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        
        // Update credit pack
        sqlx::query!(
            r#"
            UPDATE credit_packs SET
                name = $2,
                value_credits = $3,
                price_amount = $4,
                currency = $5,
                description = $6,
                recommended = $7,
                bonus_percentage = $8,
                is_popular = $9,
                is_active = $10,
                display_order = $11,
                updated_at = NOW()
            WHERE id = $1
            "#,
            pack.id,
            pack.name,
            pack.value_credits,
            pack.price_amount,
            pack.currency,
            pack.description,
            pack.recommended,
            pack.bonus_percentage,
            pack.is_popular,
            pack.is_active,
            pack.display_order
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update credit pack: {}", e)))?;

        // Update Stripe config for current environment
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        sqlx::query!(
            r#"
            UPDATE credit_pack_stripe_config SET
                stripe_price_id = $3
            WHERE credit_pack_id = $1 AND environment = $2
            "#,
            pack.id,
            environment,
            pack.stripe_price_id
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update credit pack Stripe config: {}", e)))?;

        tx.commit().await.map_err(AppError::from)?;
        
        Ok(pack.clone())
    }

    /// Deactivate credit pack
    pub async fn deactivate_pack(&self, pack_id: &str) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE credit_packs SET
                is_active = false,
                updated_at = NOW()
            WHERE id = $1
            "#,
            pack_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to deactivate credit pack: {}", e)))?;

        Ok(())
    }
}