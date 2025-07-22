use crate::error::AppError;
use crate::models::billing::{BillingDashboardData, AutoTopOffSettings, CustomerBillingInfo, TaxIdInfo};
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, DetailedUsageRecord, ApiUsageEntryDto, ApiUsageRecord};
use crate::db::repositories::UserCredit;
use crate::db::repositories::customer_billing_repository::{CustomerBillingRepository, CustomerBilling};
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::models::model_pricing::ModelPricing;
use crate::clients::usage_extractor::ProviderUsage;
use crate::services::credit_service::CreditService;
use crate::services::audit_service::AuditService;
use crate::services::cost_resolver::CostResolver;
use crate::db::repositories::settings_repository::SettingsRepository;
use crate::db::repositories::user_repository::UserRepository;
use uuid::Uuid;
use log::{debug, error, info, warn};
use std::env;
use chrono::{DateTime, Utc, Duration};
use std::sync::Arc;
use sqlx::PgPool;
use crate::db::connection::DatabasePools;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};
use std::str::FromStr;

// Import Stripe service
use crate::services::stripe_service::StripeService;
// Import custom Stripe types
use crate::stripe_types::*;
use serde::{Serialize, Deserialize};

#[derive(Clone)]
pub struct BillingService {
    db_pools: DatabasePools,
    customer_billing_repository: Arc<CustomerBillingRepository>,
    api_usage_repository: Arc<ApiUsageRepository>,
    credit_service: Arc<CreditService>,
    audit_service: Arc<AuditService>,
    settings_repository: Arc<SettingsRepository>,
    stripe_service: Option<StripeService>,
    default_signup_credits: f64,
    app_settings: crate::config::settings::AppSettings,
    redis_client: Option<Arc<redis::aio::ConnectionManager>>,
}

impl BillingService {
    pub fn new(
        db_pools: DatabasePools,
        app_settings: crate::config::settings::AppSettings,
    ) -> Self {
        // Create repositories with appropriate pools
        // User-specific operations use user pool (subject to RLS)
        let customer_billing_repository = Arc::new(CustomerBillingRepository::new(db_pools.user_pool.clone()));
        let api_usage_repository = Arc::new(ApiUsageRepository::new(db_pools.user_pool.clone()));
        
        // System operations use system pool (plans, models, etc.)
        let model_repository = Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone())));
        
        // Note: CreditService handles its own pool configuration for user credit operations
        
        
        // Get default signup credits from app settings
        let default_signup_credits = app_settings.billing.default_signup_credits;
        
        // Create credit service for pure prepaid billing
        let credit_service = Arc::new(CreditService::new(db_pools.clone()));
        
        
        // Create audit service
        let audit_service = Arc::new(AuditService::new(db_pools.clone()));
        
        // Create settings repository for database-driven configuration
        let settings_repository = Arc::new(SettingsRepository::new(db_pools.system_pool.clone()));
        
        // Initialize Stripe service for BillingService if environment variables are set
        let stripe_service = match (
            env::var("STRIPE_SECRET_KEY"),
            env::var("STRIPE_WEBHOOK_SECRET"), 
            env::var("STRIPE_PUBLISHABLE_KEY")
        ) {
            (Ok(secret_key), Ok(webhook_secret), Ok(publishable_key)) => {
                Some(StripeService::new(secret_key, webhook_secret, publishable_key))
            },
            _ => {
                warn!("Stripe environment variables not set, Stripe functionality disabled");
                None
            }
        };
        
        Self {
            db_pools: db_pools.clone(),
            customer_billing_repository,
            api_usage_repository,
            credit_service,
            audit_service,
            settings_repository,
            stripe_service,
            default_signup_credits,
            app_settings,
            redis_client: None, // Will be set asynchronously
        }
    }
    
    /// Set Redis client for caching final costs
    pub fn set_redis_client(&mut self, redis_client: Arc<redis::aio::ConnectionManager>) {
        self.redis_client = Some(redis_client);
        info!("Redis client set for billing service");
    }
    
    pub async fn check_service_access(
        &self,
        user_id: &Uuid,
        _model_id: &str,
    ) -> Result<bool, AppError> {
        let user_balance = self.credit_service.get_user_balance(user_id).await?;
        
        // Check sum of paid balance and free credit balance
        let total_balance = &user_balance.balance + &user_balance.free_credit_balance;
        
        if total_balance <= BigDecimal::from(0) {
            return Err(AppError::CreditInsufficient("No credits available. Please purchase credits to continue using AI services.".to_string()));
        }

        // Check billing readiness for users who have made purchases
        let (is_payment_method_required, is_billing_info_required) = self._check_billing_readiness(user_id).await?;
        
        if is_payment_method_required {
            return Err(AppError::PaymentMethodRequired("A payment method is required to continue using services. Please add a payment method.".to_string()));
        }
        
        if is_billing_info_required {
            return Err(AppError::BillingAddressRequired("Complete billing information is required to continue using services. Please update your billing information.".to_string()));
        }

        Ok(true)
    }
    
    
    
    

    // Get the database pool for use by other components
    pub fn get_db_pool(&self) -> PgPool {
        self.customer_billing_repository.get_pool().clone()
    }
    
    // Get the full database pools structure for use by other services
    pub fn get_db_pools(&self) -> &DatabasePools {
        &self.db_pools
    }
    
    // Get the system database pool for operations requiring vibe_manager_app role
    pub fn get_system_db_pool(&self) -> PgPool {
        self.db_pools.system_pool.clone()
    }
    
    
    
    
    // Create billing portal session with state locking
    pub async fn create_billing_portal_session(
        &self,
        user_id: &Uuid,
    ) -> Result<String, AppError> {
        let stripe_service = self.get_stripe_service()?;
        
        // This is now much simpler. The function below handles all logic.
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service.create_billing_portal_session(
            &idempotency_key,
            &customer_id,
            &self.app_settings.stripe.portal_return_url,
        ).await.map_err(|e| AppError::External(format!("Failed to create billing portal session: {}", e)))?;
        
        info!("Created billing portal session for user {}", user_id);
        Ok(session.url)
    }
    
    
    // Get consolidated billing dashboard data
    pub async fn get_billing_dashboard_data(&self, user_id: &Uuid) -> Result<BillingDashboardData, AppError> {
        debug!("Fetching billing dashboard data for user: {}", user_id);

        // Get credit balance, billing readiness, and customer billing info concurrently
        let (credit_balance_res, billing_readiness_res, customer_billing_info_res) = tokio::join!(
            self.credit_service.get_user_balance(user_id),
            self._check_billing_readiness(user_id),
            self.get_customer_billing_info(user_id)
        );

        let credit_balance = credit_balance_res?;

        let usage_limit_usd = self.default_signup_credits;
        let free_credit_balance_usd = credit_balance.free_credit_balance.to_f64().unwrap_or(0.0);
        let current_usage = (usage_limit_usd - free_credit_balance_usd).max(0.0);

        let (is_payment_method_required, is_billing_info_required) = match billing_readiness_res {
            Ok(readiness) => readiness,
            Err(e) => {
                warn!("Could not check billing readiness for user {}: {}. Defaulting to not required to avoid blocking user.", user_id, e);
                (false, false)
            }
        };

        let customer_billing_info = customer_billing_info_res?;
        
        // Calculate total balance
        let total_balance = &credit_balance.balance + &credit_balance.free_credit_balance;
        
        // Build response with readiness flags and customer billing info
        let dashboard_data = BillingDashboardData {
            credit_balance_usd: credit_balance.balance.to_f64().unwrap_or(0.0),
            free_credit_balance_usd: credit_balance.free_credit_balance.to_f64().unwrap_or(0.0),
            free_credits_expires_at: credit_balance.free_credits_expires_at,
            services_blocked: total_balance <= BigDecimal::from(0),
            is_payment_method_required,
            is_billing_info_required,
            customer_billing_info,
            usage_limit_usd,
            current_usage,
        };

        info!("Successfully assembled billing dashboard data for user: {}", user_id);
        Ok(dashboard_data)
    }


    /// Get access to the credit service
    pub fn get_credit_service(&self) -> &Arc<CreditService> {
        &self.credit_service
    }

    /// Get access to the customer billing repository
    pub fn get_customer_billing_repository(&self) -> &Arc<CustomerBillingRepository> {
        &self.customer_billing_repository
    }

    /// Get access to the audit service
    pub fn get_audit_service(&self) -> &Arc<AuditService> {
        &self.audit_service
    }




    /// Get Stripe publishable key for frontend
    pub fn get_stripe_publishable_key(&self) -> Result<String, AppError> {
        match &self.stripe_service {
            Some(service) => Ok(service.get_publishable_key().to_string()),
            None => Err(AppError::Configuration("Stripe not configured".to_string())),
        }
    }


    /// Get or create Stripe customer for a user (public method for handlers)
    pub async fn get_or_create_stripe_customer(&self, user_id: &Uuid) -> Result<String, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // 1. Check local DB first
        if let Some(customer_billing) = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            if let Some(stripe_id) = customer_billing.stripe_customer_id {
                tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
                return Ok(stripe_id);
            }
        }

        // 2. If not found locally, search Stripe
        let stripe_service = self.get_stripe_service()?;
        if let Some(customer) = stripe_service.search_customer_by_user_id(user_id).await
            .map_err(|e| AppError::External(format!("Failed to search for Stripe customer: {}", e)))? {
            self.customer_billing_repository.upsert_stripe_customer_id_with_executor(user_id, &customer.id, &mut tx).await?;
            tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            return Ok(customer.id);
        }

        // 3. If not found on Stripe, create a new Stripe customer
        let user_repo = UserRepository::new(self.db_pools.system_pool.clone());
        let user = user_repo.get_by_id(user_id).await?;
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let new_customer = stripe_service.create_customer(
            &idempotency_key,
            user_id,
            &user.email,
            user.full_name.as_deref(),
        ).await.map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;
        
        // 4. Upsert the new customer ID into our DB
        self.customer_billing_repository.upsert_stripe_customer_id_with_executor(user_id, &new_customer.id, &mut tx).await?;
        
        tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        
        Ok(new_customer.id)
    }

    /// Get access to the StripeService for advanced operations
    pub fn get_stripe_service(&self) -> Result<&StripeService, AppError> {
        match &self.stripe_service {
            Some(service) => Ok(service),
            None => Err(AppError::Configuration("Stripe not configured".to_string())),
        }
    }

    /// Get detailed payment methods with default flag
    pub async fn get_detailed_payment_methods(
        &self,
        user_id: &Uuid,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let stripe_service = self.get_stripe_service()?;
        
        // Get or create Stripe customer
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Concurrently fetch customer details and payment methods
        let (customer, payment_methods) = tokio::try_join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.list_payment_methods(&customer_id)
        ).map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        // Get the default payment method ID from customer
        let default_payment_method_id = customer.invoice_settings
            .as_ref()
            .and_then(|settings| settings.default_payment_method.as_ref())
            .map(|pm| pm.to_string());

        // Build response with isDefault flag
        let detailed_methods: Vec<serde_json::Value> = payment_methods
            .into_iter()
            .map(|pm| {
                let is_default = default_payment_method_id
                    .as_ref()
                    .map(|default_id| *default_id == pm.id.to_string())
                    .unwrap_or(false);

                serde_json::json!({
                    "id": pm.id,
                    "type": format!("{:?}", pm.type_),
                    "card": pm.card.as_ref().map(|card| serde_json::json!({
                        "brand": card.brand,
                        "last4": card.last4,
                        "expMonth": card.exp_month,
                        "expYear": card.exp_year,
                    })),
                    "created": pm.created,
                    "isDefault": is_default
                })
            })
            .collect();

        Ok(detailed_methods)
    }




    /// Create a custom credit purchase checkout session
    pub async fn create_credit_purchase_checkout_session(
        &self,
        user_id: &Uuid,
        amount: &str,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Parse amount string to BigDecimal for validation
        let amount_decimal = BigDecimal::parse_bytes(amount.as_bytes(), 10)
            .ok_or_else(|| AppError::InvalidArgument("Invalid amount format".to_string()))?;
        
        // Validate amount
        if amount_decimal <= BigDecimal::from(0) || amount_decimal > BigDecimal::from(10000) {
            return Err(AppError::InvalidArgument("Amount must be between $0.01 and $10,000.00".to_string()));
        }

        // Calculate fee and net amounts
        let (fee_amount, net_amount) = Self::_calculate_fee_and_net(&amount_decimal);
        
        // Create price_data object instead of creating Product/Price
        let product_name = format!("${} Credit Top-up", amount_decimal);
        let amount_cents = (amount_decimal.clone() * BigDecimal::from(100)).to_i64().unwrap_or(0);
        
        let price_data = serde_json::json!({
            "currency": "usd",
            "unit_amount": amount_cents,
            "product_data": {
                "name": product_name
            }
        });

        // Add metadata for webhook fulfillment
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "credit_purchase".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("gross_amount".to_string(), amount_decimal.to_string());
        metadata.insert("currency".to_string(), "USD".to_string());

        // Use hardcoded URLs that match the frontend expectations
        // Include session ID placeholder in success URL for payment verification
        let success_url = "http://localhost:1420/account?billing_success=true&session_id={CHECKOUT_SESSION_ID}";
        let cancel_url = "http://localhost:1420/billing/cancel";

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service.create_checkout_session(
            &idempotency_key,
            &customer_id,
            user_id,
            CHECKOUT_SESSION_MODE_PAYMENT,
            None, // No line_items when using price_data
            success_url,
            cancel_url,
            metadata,
            None, // billing_address_collection not required for credit purchases
            None, // automatic_tax not required for credit purchases
            Some(true), // invoice_creation_enabled
            Some(price_data), // Pass price_data directly
        ).await.map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;

        Ok(session)
    }



    /// Get checkout session status
    pub async fn get_checkout_session_status(
        &self,
        session_id: &str,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        
        let session = stripe_service.get_checkout_session(session_id).await
            .map_err(|e| AppError::External(format!("Failed to retrieve checkout session: {}", e)))?;

        Ok(session)
    }

    pub async fn get_detailed_usage(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<Vec<DetailedUsageRecord>, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        let usage_records = self.api_usage_repository.get_detailed_usage(user_id, start_date, end_date, &mut tx).await?;

        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(usage_records)
    }

    /// Calculate fee and net amount based on tiered pricing
    fn _calculate_fee_and_net(gross_amount: &BigDecimal) -> (BigDecimal, BigDecimal) {
        let fee_percentage = if gross_amount < &BigDecimal::from(30) {
            BigDecimal::from_str("0.20").unwrap() // 20% fee
        } else if gross_amount < &BigDecimal::from(300) {
            BigDecimal::from_str("0.10").unwrap() // 10% fee
        } else {
            BigDecimal::from_str("0.05").unwrap() // 5% fee
        };
        
        let fee_amount = gross_amount * fee_percentage;
        let net_amount = gross_amount - &fee_amount;
        
        (fee_amount, net_amount)
    }

    /// Create a setup checkout session for payment method addition
    pub async fn create_setup_checkout_session(
        &self,
        user_id: &Uuid,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Add metadata for setup payment method
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "setup_payment_method".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());

        // Use hardcoded URLs for setup payment method
        let success_url = "http://localhost:1420/billing/payment-method/success";
        let cancel_url = "http://localhost:1420/billing/payment-method/cancel";

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service.create_checkout_session(
            &idempotency_key,
            &customer_id,
            user_id,
            CHECKOUT_SESSION_MODE_SETUP,
            None, // No line items for setup mode
            success_url,
            cancel_url,
            metadata,
            None, // billing_address_collection not applicable for setup mode
            None, // automatic_tax not applicable for setup mode
            None, // invoice_creation_enabled not applicable for setup mode
            None, // price_data not applicable for setup mode
        ).await.map_err(|e| AppError::External(format!("Failed to create setup checkout session: {}", e)))?;

        Ok(session)
    }

    /// Get auto top-off settings for a user
    pub async fn get_auto_top_off_settings(&self, user_id: &Uuid) -> Result<AutoTopOffSettings, AppError> {
        debug!("Getting auto top-off settings for user: {}", user_id);
        
        // Start transaction for atomic operations
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Get customer billing
        let customer_billing = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::NotFound("No customer billing record found for user".to_string()))?;

        // Commit transaction
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled: customer_billing.auto_top_off_enabled,
            threshold: customer_billing.auto_top_off_threshold.map(|t| t.to_string()),
            amount: customer_billing.auto_top_off_amount.map(|a| a.to_string()),
        };

        info!("Successfully retrieved auto top-off settings for user: {}", user_id);
        Ok(settings)
    }

    /// Update auto top-off settings for a user
    pub async fn update_auto_top_off_settings(
        &self,
        user_id: &Uuid,
        enabled: bool,
        threshold: Option<BigDecimal>,
        amount: Option<BigDecimal>,
    ) -> Result<AutoTopOffSettings, AppError> {
        debug!("Updating auto top-off settings for user: {}", user_id);
        
        // Start transaction for atomic operations
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Update auto top-off settings directly within the transaction to ensure RLS context
        sqlx::query!(
            r#"
            INSERT INTO customer_billing 
            (id, user_id, stripe_customer_id, auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount, created_at, updated_at)
            VALUES 
            (gen_random_uuid(), $1, NULL, $2, $3, $4, now(), now())
            ON CONFLICT (user_id) DO UPDATE
            SET auto_top_off_enabled = EXCLUDED.auto_top_off_enabled,
                auto_top_off_threshold = EXCLUDED.auto_top_off_threshold,
                auto_top_off_amount = EXCLUDED.auto_top_off_amount,
                updated_at = now()
            "#,
            user_id,
            enabled,
            threshold,
            amount
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update auto top-off settings: {}", e)))?;

        // Commit transaction
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled,
            threshold: threshold.map(|t| t.to_string()),
            amount: amount.map(|a| a.to_string()),
        };

        info!("Successfully updated auto top-off settings for user: {}", user_id);
        Ok(settings)
    }
    
    /// Estimate streaming cost for UI display only - does not charge the user
    pub async fn estimate_streaming_cost(
        &self,
        model_id: &str,
        input_tokens: i64,
        output_tokens: i64,
        cache_write_tokens: i64,
        cache_read_tokens: i64,
    ) -> Result<BigDecimal, AppError> {
        // Get model pricing information
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(
            Arc::new(self.db_pools.system_pool.clone())
        ));
        
        let model = model_repository
            .find_by_id_with_provider(model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;
        
        // Create ProviderUsage for cost calculation
        let usage = ProviderUsage::new(
            input_tokens as i32,
            output_tokens as i32,
            cache_write_tokens as i32,
            cache_read_tokens as i32,
            model_id.to_string()
        );
        
        // Validate usage data
        usage.validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;
        
        // Calculate total cost using server-side pricing logic with full token breakdown
        let total_cost = model.calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;
        
        Ok(total_cost)
    }

    /// Initiate an API charge with estimated cost
    pub async fn initiate_api_charge(
        &self,
        entry: ApiUsageEntryDto,
    ) -> Result<(String, UserCredit), AppError> {
        debug!("Initiating API charge with estimates for user: {}", entry.user_id);
        
        // Ensure request_id is present
        let request_id = entry.request_id.as_ref()
            .ok_or_else(|| AppError::InvalidArgument("request_id is required for two-phase billing".to_string()))?;
        
        // Get model for cost estimation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(
            Arc::new(self.db_pools.system_pool.clone())
        ));
        
        let model = model_repository
            .find_by_id_with_provider(&entry.service_name)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", entry.service_name)))?;
        
        // Create ProviderUsage for estimated cost calculation
        let estimated_usage = ProviderUsage::new(
            entry.tokens_input as i32,
            entry.tokens_output as i32,
            entry.cache_write_tokens as i32,
            entry.cache_read_tokens as i32,
            entry.service_name.clone()
        );
        
        // Validate usage data
        estimated_usage.validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;
        
        // Use CostResolver to calculate estimated cost
        let estimated_cost = crate::services::cost_resolver::CostResolver::resolve(estimated_usage, &model)?;
        
        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Initiate charge with credit service
        let (request_id, user_credit) = self.credit_service
            .initiate_charge_in_transaction(entry, estimated_cost, &mut tx)
            .await?;
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        info!("Successfully initiated charge for request {}", request_id);
        Ok((request_id, user_credit))
    }

    /// Finalize an API charge with actual usage and metadata
    pub async fn finalize_api_charge_with_metadata(
        &self,
        request_id: &str,
        user_id: &Uuid,
        final_usage: ProviderUsage,
        metadata: Option<serde_json::Value>,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!("Finalizing API charge with metadata for request: {}", request_id);
        
        // Get model for final cost calculation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(
            Arc::new(self.db_pools.system_pool.clone())
        ));
        
        let model = model_repository
            .find_by_id_with_provider(&final_usage.model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", final_usage.model_id)))?;
        
        // Use CostResolver to calculate final cost
        let final_cost = crate::services::cost_resolver::CostResolver::resolve(final_usage.clone(), &model)?;
        
        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Set RLS context using user_id within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Finalize charge with credit service, passing metadata
        let (api_usage_record, user_credit) = self.credit_service
            .finalize_charge_in_transaction_with_metadata(request_id, final_cost, &final_usage, metadata, &mut tx)
            .await?;
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        info!("Successfully finalized charge with metadata for request {} - user {} for model {} (cost: {})", 
              request_id, api_usage_record.user_id, api_usage_record.service_name, api_usage_record.cost);
        
        // After successful billing, check and trigger auto top-off if needed
        if let Err(e) = self.check_and_trigger_auto_top_off(&api_usage_record.user_id).await {
            warn!("Auto top-off check failed for user {}: {}", api_usage_record.user_id, e);
        }
        
        
        Ok((api_usage_record, user_credit))
    }
    
    /// Mark an API charge as failed, ensuring no cost is billed to the user.
    /// This is used for provider-side errors where the user should not be charged.
    pub async fn fail_api_charge(
        &self,
        request_id: &str,
        user_id: &Uuid,
        error_message: &str,
    ) -> Result<(), AppError> {
        debug!("Failing API charge for request: {}", request_id);
        
        // Create metadata to indicate failure
        let metadata = serde_json::json!({
            "status": "failed",
            "error": error_message,
            "streaming": true,
        });

        // Use the existing finalize_charge_in_transaction_with_metadata method
        // but with zero cost and zero usage to mark as failed
        let zero_usage = ProviderUsage::new(0, 0, 0, 0, "unknown".to_string());
        
        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Set RLS context
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Call the credit service to finalize with zero cost
        // The credit service should be updated to check metadata.status == "failed" and set the appropriate status
        let _ = self.credit_service
            .finalize_charge_in_transaction_with_metadata(
                request_id,
                BigDecimal::from(0),
                &zero_usage,
                Some(metadata),
                &mut tx
            )
            .await?;
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        info!("Successfully marked charge as failed for request {}", request_id);
        Ok(())
    }
    
    /// Record API usage with pre-resolved cost (simplified billing flow)
    /// This method takes a cost that has already been resolved by the CostResolver
    pub async fn charge_for_api_usage(
        &self,
        entry: ApiUsageEntryDto,
        final_cost: BigDecimal,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!("Processing API usage with pre-resolved cost for user: {}", entry.user_id);
        
        // Start a database transaction to ensure atomicity
        let mut tx = self.db_pools.user_pool.begin().await.map_err(AppError::from)?;
        
        // Set RLS context for the transaction - matches existing service pattern
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(entry.user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Auth(format!("Failed to set RLS context: {}", e)))?;
        
        // Create API usage record
        let api_usage_record = self.api_usage_repository.record_usage_with_executor(entry, final_cost.clone(), &mut tx).await?;
        
        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;
        
        // Deduct credits from user balance
        let user_credit = self.credit_service
            .adjust_credits(&api_usage_record.user_id, &(-final_cost.clone()), format!("API usage: {}", api_usage_record.service_name), None)
            .await?;
        
        info!("Successfully billed user {} for API usage: {} (cost: {})", 
              api_usage_record.user_id, api_usage_record.service_name, final_cost);
        
        // After successful billing, check and trigger auto top-off if needed
        // Don't fail the API call if auto top-off fails - just log the error
        if let Err(e) = self.check_and_trigger_auto_top_off(&api_usage_record.user_id).await {
            warn!("Auto top-off check failed for user {}: {}", api_usage_record.user_id, e);
        }
        
        Ok((api_usage_record, user_credit))
    }
    
    /// Check if auto top-off should be triggered and execute it if needed
    pub async fn check_and_trigger_auto_top_off(&self, user_id: &Uuid) -> Result<(), AppError> {
        debug!("Checking auto top-off conditions for user: {}", user_id);
        
        // Start transaction to check user's billing settings and balance atomically
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Get customer billing settings
        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(billing) => billing,
            None => {
                debug!("No customer billing record found for user {}, skipping auto top-off check", user_id);
                let _ = tx.rollback().await;
                return Ok(());
            }
        };
        
        // Check if auto top-off is enabled and properly configured
        if !customer_billing.auto_top_off_enabled {
            debug!("Auto top-off is disabled for user {}", user_id);
            let _ = tx.rollback().await;
            return Ok(());
        }
        
        let threshold = match customer_billing.auto_top_off_threshold {
            Some(t) => t,
            None => {
                debug!("Auto top-off threshold not set for user {}", user_id);
                let _ = tx.rollback().await;
                return Ok(());
            }
        };
        
        let amount = match customer_billing.auto_top_off_amount {
            Some(a) => a,
            None => {
                debug!("Auto top-off amount not set for user {}", user_id);
                let _ = tx.rollback().await;
                return Ok(());
            }
        };
        
        // Get current credit balance
        let current_balance = self.credit_service.get_user_balance_with_executor(user_id, &mut tx).await?;
        
        // Check if balance is below threshold
        if current_balance.balance >= threshold {
            debug!("User {} balance ({}) is above threshold ({}), no top-off needed", 
                   user_id, current_balance.balance, threshold);
            let _ = tx.rollback().await;
            return Ok(());
        }
        
        // Commit transaction since we're done with database reads
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        
        info!("User {} balance ({}) is below threshold ({}), triggering auto top-off of {}", 
              user_id, current_balance.balance, threshold, amount);
        
        // Perform auto top-off directly
        self.perform_auto_top_off(user_id, &amount).await?;
        
        Ok(())
    }
    
    /// Perform auto top-off using customer's default payment method
    pub async fn perform_auto_top_off(&self, user_id: &Uuid, amount: &BigDecimal) -> Result<(), AppError> {
        info!("Starting auto top-off process for user {} with amount {}", user_id, amount);
        debug!("Auto top-off execution flow: step 1 - validating Stripe service availability");
        
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => {
                debug!("Auto top-off execution flow: step 2 - Stripe service validated successfully");
                service
            },
            None => {
                warn!("Auto top-off execution flow: FAILED at step 2 - Stripe not configured for user {}", user_id);
                return Err(AppError::Configuration("Stripe not configured".to_string()));
            }
        };

        debug!("Auto top-off execution flow: step 3 - starting database transaction");
        // Start transaction for atomic operations
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 3 - database transaction failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to begin transaction: {}", e))
            })?;

        debug!("Auto top-off execution flow: step 4 - setting user context for RLS");
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 4 - setting user context failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Acquire PostgreSQL advisory lock for this user's auto top-off
        let lock_acquired = sqlx::query_scalar::<_, bool>(
            "SELECT pg_try_advisory_xact_lock(hashtext($1))"
        )
        .bind(format!("auto_top_off_{}", user_id))
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to acquire advisory lock: {}", e)))?;

        if !lock_acquired {
            info!("Auto top-off already in progress for user {} on another instance, skipping", user_id);
            let _ = tx.rollback().await;
            return Ok(());
        }

        debug!("Auto top-off execution flow: step 5 - fetching customer billing record");
        // Get customer billing
        let customer_billing = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| {
                warn!("Auto top-off execution flow: FAILED at step 5 - no customer billing record found for user {}", user_id);
                AppError::NotFound("No customer billing record found for user".to_string())
            })?;
        debug!("Auto top-off execution flow: step 5 completed - customer billing record retrieved successfully");

        debug!("Auto top-off execution flow: step 6 - validating Stripe customer ID");
        // Get customer ID
        let customer_id = customer_billing.stripe_customer_id
            .ok_or_else(|| {
                warn!("Auto top-off execution flow: FAILED at step 6 - user {} has no Stripe customer ID", user_id);
                AppError::Configuration("User has no Stripe customer ID".to_string())
            })?;
        debug!("Auto top-off execution flow: step 6 completed - Stripe customer ID validated: {}", customer_id);

        debug!("Auto top-off execution flow: step 7 - committing database transaction");
        // Commit transaction (no longer needed)
        tx.commit().await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 7 - transaction commit failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to commit transaction: {}", e))
            })?;
        debug!("Auto top-off execution flow: step 7 completed - transaction committed successfully");

        debug!("Auto top-off execution flow: step 8 - fetching full Stripe customer object");
        // Fetch full Stripe Customer object
        let customer = stripe_service.get_customer(&customer_id).await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 8 - failed to fetch Stripe customer for user {}: {}", user_id, e);
                AppError::External(format!("Failed to fetch Stripe customer: {}", e))
            })?;
        
        debug!("Auto top-off execution flow: step 9 - determining payment method");
        // Extract default payment method ID from customer
        let payment_method_id = if let Some(invoice_settings) = customer.invoice_settings {
            if let Some(default_payment_method) = invoice_settings.default_payment_method {
                info!("Using customer's default payment method: {}", default_payment_method);
                default_payment_method
            } else {
                debug!("No default payment method set, listing available payment methods");
                let payment_methods = stripe_service.list_payment_methods(&customer_id).await
                    .map_err(|e| {
                        warn!("Failed to list payment methods for user {}: {}", user_id, e);
                        AppError::External(format!("Failed to list payment methods: {}", e))
                    })?;
                
                if payment_methods.is_empty() {
                    warn!("No payment methods available for user {}", user_id);
                    return Err(AppError::PaymentMethodRequired("No payment methods available for auto top-off".to_string()));
                }
                
                info!("Using first available payment method: {}", payment_methods[0].id);
                payment_methods[0].id.clone()
            }
        } else {
            debug!("No invoice settings found, listing available payment methods");
            let payment_methods = stripe_service.list_payment_methods(&customer_id).await
                .map_err(|e| {
                    warn!("Failed to list payment methods for user {}: {}", user_id, e);
                    AppError::External(format!("Failed to list payment methods: {}", e))
                })?;
            
            if payment_methods.is_empty() {
                warn!("No payment methods available for user {}", user_id);
                return Err(AppError::PaymentMethodRequired("No payment methods available for auto top-off".to_string()));
            }
            
            info!("Using first available payment method: {}", payment_methods[0].id);
            payment_methods[0].id.clone()
        };

        debug!("Auto top-off execution flow: step 10 - preparing payment intent creation");
        // Generate idempotency key
        let amount_cents = (amount.clone() * BigDecimal::from(100)).to_i64().unwrap_or(0);
        let idempotency_key = format!("auto_topoff_{}_{}_{}", user_id, amount_cents, Utc::now().timestamp_nanos());
        debug!("Auto top-off execution flow: step 10 - payment intent parameters prepared: amount_cents={}, idempotency_key={}", amount_cents, idempotency_key);
        
        debug!("Auto top-off execution flow: step 11 - creating and confirming payment intent");
        // Create and confirm payment intent
        let payment_intent = stripe_service.create_and_confirm_payment_intent(
            &idempotency_key,
            &customer_id,
            &payment_method_id,
            amount_cents as i64,
            "usd",
            &format!("Automatic credit top-off for ${}", amount),
        ).await.map_err(|e| {
            warn!("Auto top-off execution flow: FAILED at step 11 - payment intent creation failed for user {}: {}", user_id, e);
            AppError::External(format!("Failed to create payment intent for auto top-off: {}", e))
        })?;
        info!("Auto top-off execution flow: step 11 completed - payment intent created and confirmed successfully: {} - relying on webhooks for credit fulfillment", payment_intent.id);

        info!("Auto top-off execution flow: COMPLETED SUCCESSFULLY - user {} auto top-off payment intent created with amount {} - webhooks will handle credit fulfillment", user_id, amount);
        Ok(())
    }

    /// Get customer billing information for display
    pub async fn get_customer_billing_info(&self, user_id: &Uuid) -> Result<Option<CustomerBillingInfo>, AppError> {
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Ok(None),
        };

        // This function is now strictly read-only regarding our database.
        let mut tx = self.db_pools.user_pool.begin().await.map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)").bind(user_id.to_string()).execute(&mut *tx).await.map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
        
        let maybe_stripe_id = if let Some(billing) = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            billing.stripe_customer_id
        } else {
            None
        };
        tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let customer_id = if let Some(id) = maybe_stripe_id {
            id
        } else {
            // If not found locally, search Stripe without writing to DB
            if let Some(customer) = stripe_service.search_customer_by_user_id(user_id).await
                .map_err(|e| AppError::External(format!("Failed to search for Stripe customer: {}", e)))? {
                customer.id
            } else {
                return Ok(None); // No Stripe customer exists for this user.
            }
        };

        // Fetch full customer object from Stripe
        let customer = stripe_service.get_customer(&customer_id).await.map_err(|e| {
            error!("Failed to fetch customer {} from Stripe: {:?}", customer_id, e);
            AppError::from(e)
        })?;

        Ok(Some(CustomerBillingInfo::from(&customer)))
    }


    /// Check billing readiness requirements for a user
    async fn _check_billing_readiness(&self, user_id: &Uuid) -> Result<(bool, bool), AppError> {
        if !self.credit_service.has_user_made_purchase(user_id).await? {
            return Ok((false, false));
        }

        let stripe_service = self.get_stripe_service()?;
        
        // Read-only lookup for stripe_customer_id
        let customer_id = {
            let mut tx = self.db_pools.user_pool.begin().await.map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
            sqlx::query("SELECT set_config('app.current_user_id', $1, true)").bind(user_id.to_string()).execute(&mut *tx).await.map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
            let maybe_id = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await?.and_then(|b| b.stripe_customer_id);
            tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            
            if let Some(id) = maybe_id {
                id
            } else if let Some(customer) = stripe_service.search_customer_by_user_id(user_id).await
                .map_err(|e| AppError::External(format!("Failed to search for Stripe customer: {}", e)))? {
                customer.id
            } else {
                // No stripe customer, so no readiness requirements apply.
                return Ok((false, false));
            }
        };

        let (customer, payment_methods) = tokio::try_join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.list_payment_methods(&customer_id)
        ).map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        let has_default_payment_method = customer.invoice_settings.as_ref().and_then(|s| s.default_payment_method.as_ref()).is_some();
        let has_any_payment_methods = !payment_methods.is_empty();
        let is_payment_method_required = !has_default_payment_method || !has_any_payment_methods;
        let is_billing_address_complete = customer.address.as_ref().map_or(false, |addr| addr.line1.is_some() && addr.city.is_some() && addr.postal_code.is_some() && addr.country.is_some());
        let is_shipping_address_complete = customer.shipping.as_ref().and_then(|s| s.address.as_ref()).map_or(false, |addr| addr.line1.is_some() && addr.city.is_some() && addr.postal_code.is_some() && addr.country.is_some());
        let is_billing_info_required = customer.name.is_none() || (!is_billing_address_complete && !is_shipping_address_complete);
        Ok((is_payment_method_required, is_billing_info_required))
    }

    /// Calculate cost for streaming tokens using server-side model pricing
    pub async fn calculate_streaming_cost(
        &self,
        model_id: &str,
        input_tokens: i64,
        output_tokens: i64,
        cache_write_tokens: i64,
        cache_read_tokens: i64,
    ) -> Result<BigDecimal, AppError> {
        // Get model pricing information
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(
            Arc::new(self.db_pools.system_pool.clone())
        ));
        
        let model = model_repository
            .find_by_id_with_provider(model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;
        
        // Create ProviderUsage for the new calculate_total_cost method
        let usage = crate::clients::usage_extractor::ProviderUsage::new(
            input_tokens as i32,
            output_tokens as i32,
            cache_write_tokens as i32,
            cache_read_tokens as i32,
            model_id.to_string()
        );
        
        // Validate usage data
        usage.validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;
        
        // Calculate total cost using server-side pricing logic
        let total_cost = model.calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;
        
        Ok(total_cost)
    }





    /// Process a saved payment method from a completed SetupIntent
    /// This method handles setup mode checkout sessions where a payment method was added
    pub async fn process_saved_payment_method(&self, setup_intent: &crate::stripe_types::SetupIntent) -> Result<(), AppError> {
        info!("Processing saved payment method from setup intent: {}", setup_intent.id);
        
        // Check if setup intent status is "succeeded"
        if !matches!(setup_intent.status, crate::stripe_types::setup_intent::SetupIntentStatus::Succeeded) {
            warn!("Setup intent {} is not in succeeded status: {:?}", setup_intent.id, setup_intent.status);
            return Err(AppError::InvalidArgument(format!("Setup intent is not in succeeded status: {:?}", setup_intent.status)));
        }
        
        // Extract customer ID from setup_intent
        let customer_id = setup_intent.customer.as_ref()
            .ok_or_else(|| AppError::InvalidArgument("Setup intent has no customer ID".to_string()))?;
        
        // Extract payment method ID from setup_intent
        let payment_method_id = setup_intent.payment_method.as_ref()
            .ok_or_else(|| AppError::InvalidArgument("Setup intent has no payment method ID".to_string()))?;
        
        info!("Setup intent {} - customer: {}, payment method: {}", setup_intent.id, customer_id, payment_method_id);
        
        // Get stripe service
        let stripe_service = self.get_stripe_service()?;
        
        // Set the payment method as default for the customer
        let idempotency_key = format!("set_default_pm_{}_{}", setup_intent.id, payment_method_id);
        stripe_service.set_default_payment_method(&idempotency_key, customer_id, payment_method_id).await
            .map_err(|e| AppError::External(format!("Failed to set default payment method: {}", e)))?;
        
        info!("Successfully set payment method {} as default for customer {}", payment_method_id, customer_id);
        
        // Find the user via user_repository.get_by_stripe_customer_id
        let user_repository = crate::db::repositories::user_repository::UserRepository::new(self.get_system_db_pool());
        let user = user_repository.get_by_stripe_customer_id(customer_id).await
            .map_err(|e| AppError::NotFound(format!("Could not find user for customer {}: {}", customer_id, e)))?;
        
        info!("Found user {} for customer {} in setup intent {}", user.id, customer_id, setup_intent.id);
        
        // Log detailed audit event
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("setup_intent_id".to_string(), setup_intent.id.clone());
        metadata.insert("payment_method_id".to_string(), payment_method_id.clone());
        metadata.insert("customer_id".to_string(), customer_id.clone());
        metadata.insert("event_type".to_string(), "payment_method_added".to_string());
        
        let audit_context = crate::services::audit_service::AuditContext::new(user.id);
        let audit_event = crate::services::audit_service::AuditEvent::new(
            "payment_method_added",
            "billing"
        )
        .with_entity_id(setup_intent.id.clone())
        .with_metadata(serde_json::to_value(metadata).unwrap_or_default());
        
        self.audit_service.log_event(&audit_context, audit_event).await?;
        
        info!("Successfully processed saved payment method for setup intent {} - user {} now has default payment method {}", 
              setup_intent.id, user.id, payment_method_id);
        
        Ok(())
    }

}