use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingConfiguration {
    pub id: Uuid,
    pub config_type: String,
    pub environment: String,
    pub config_data: JsonValue,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct BillingConfigurationRepository {
    pool: PgPool,
}

impl BillingConfigurationRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Get configuration by type and environment
    pub async fn get_by_type_and_env(
        &self,
        config_type: &str,
        environment: &str,
    ) -> Result<Option<BillingConfiguration>, AppError> {
        let config = sqlx::query_as!(
            BillingConfiguration,
            r#"
            SELECT * FROM billing_configurations 
            WHERE config_type = $1 AND environment = $2 AND is_active = true
            "#,
            config_type,
            environment
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get billing configuration: {}", e)))?;

        Ok(config)
    }

    /// Get configuration by type (uses current environment)
    pub async fn get_by_type(&self, config_type: &str) -> Result<Option<BillingConfiguration>, AppError> {
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        self.get_by_type_and_env(config_type, &environment).await
    }

    /// Create or update configuration
    pub async fn create_or_update(&self, config: &BillingConfiguration) -> Result<BillingConfiguration, AppError> {
        let updated_config = sqlx::query_as!(
            BillingConfiguration,
            r#"
            INSERT INTO billing_configurations (
                id, config_type, environment, config_data, is_active, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, NOW(), NOW()
            )
            ON CONFLICT (config_type, environment) DO UPDATE SET
                config_data = EXCLUDED.config_data,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
            RETURNING *
            "#,
            config.id,
            config.config_type,
            config.environment,
            config.config_data,
            config.is_active,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create/update billing configuration: {}", e)))?;

        Ok(updated_config)
    }

    /// Get all configurations for an environment
    pub async fn get_all_for_env(&self, environment: &str) -> Result<Vec<BillingConfiguration>, AppError> {
        let configs = sqlx::query_as!(
            BillingConfiguration,
            r#"
            SELECT * FROM billing_configurations 
            WHERE environment = $1 AND is_active = true
            ORDER BY config_type ASC
            "#,
            environment
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get billing configurations: {}", e)))?;

        Ok(configs)
    }

    /// Get Stripe URLs for current environment
    pub async fn get_stripe_urls(&self) -> Result<StripeUrls, AppError> {
        let config = self.get_by_type("stripe_urls").await?;
        
        match config {
            Some(config) => {
                let urls: StripeUrls = serde_json::from_value(config.config_data)
                    .map_err(|e| AppError::Configuration(format!("Invalid stripe URLs configuration: {}", e)))?;
                Ok(urls)
            }
            None => {
                // Return default URLs if no configuration found
                Ok(StripeUrls::default())
            }
        }
    }

    /// Get email templates configuration
    pub async fn get_email_templates(&self) -> Result<EmailTemplates, AppError> {
        let config = self.get_by_type("email_templates").await?;
        
        match config {
            Some(config) => {
                let templates: EmailTemplates = serde_json::from_value(config.config_data)
                    .map_err(|e| AppError::Configuration(format!("Invalid email templates configuration: {}", e)))?;
                Ok(templates)
            }
            None => {
                Err(AppError::Configuration("Email templates configuration not found".to_string()))
            }
        }
    }

    /// Update Stripe URLs
    pub async fn update_stripe_urls(&self, urls: &StripeUrls) -> Result<(), AppError> {
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        
        let config = BillingConfiguration {
            id: Uuid::new_v4(),
            config_type: "stripe_urls".to_string(),
            environment,
            config_data: serde_json::to_value(urls)
                .map_err(|e| AppError::Configuration(format!("Failed to serialize stripe URLs: {}", e)))?,
            is_active: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.create_or_update(&config).await?;
        Ok(())
    }

    /// Deactivate configuration
    pub async fn deactivate(&self, config_type: &str, environment: &str) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE billing_configurations 
            SET is_active = false, updated_at = NOW()
            WHERE config_type = $1 AND environment = $2
            "#,
            config_type,
            environment
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to deactivate billing configuration: {}", e)))?;

        Ok(())
    }

    /// Get configuration history for auditing
    pub async fn get_history(
        &self,
        config_type: &str,
        environment: &str,
    ) -> Result<Vec<BillingConfiguration>, AppError> {
        let configs = sqlx::query_as!(
            BillingConfiguration,
            r#"
            SELECT * FROM billing_configurations 
            WHERE config_type = $1 AND environment = $2
            ORDER BY updated_at DESC
            "#,
            config_type,
            environment
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get configuration history: {}", e)))?;

        Ok(configs)
    }

}

#[derive(Debug, Serialize, Deserialize)]
pub struct StripeUrls {
    pub success_url: String,
    pub cancel_url: String,
    pub portal_return_url: String,
}

impl Default for StripeUrls {
    fn default() -> Self {
        Self {
            success_url: "https://app.vibemanager.com/account?checkout=success".to_string(),
            cancel_url: "https://app.vibemanager.com/account?checkout=canceled".to_string(),
            portal_return_url: "https://app.vibemanager.com/account".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmailTemplates {
    pub spending_alert_75: EmailTemplate,
    pub spending_alert_90: EmailTemplate,
    pub spending_limit_reached: EmailTemplate,
    pub services_blocked: EmailTemplate,
    pub invoice_created: EmailTemplate,
    pub payment_failed: EmailTemplate,
    pub credit_purchase_success: EmailTemplate,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmailTemplate {
    pub subject: String,
    pub template: String,
}

