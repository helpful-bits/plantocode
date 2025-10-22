use crate::clients::usage_extractor::ProviderUsage;
use crate::db::connection::DatabasePools;
use crate::db::repositories::UserCredit;
use crate::db::repositories::api_usage_repository::{
    ApiUsageEntryDto, ApiUsageRecord, ApiUsageRepository, DetailedUsageRecord,
};
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::customer_billing_repository::{
    CustomerBilling, CustomerBillingRepository,
};
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::db::repositories::settings_repository::SettingsRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::user_repository::UserRepository;
use crate::error::AppError;
use crate::models::billing::{
    AutoTopOffSettings, BillingDashboardData, CustomerBillingInfo, Invoice, ListInvoicesResponse,
    TaxIdInfo,
};
use crate::models::model_pricing::ModelPricing;
use crate::services::audit_service::AuditService;
use crate::services::cost_resolver::CostResolver;
use crate::services::credit_service::CreditService;
use bigdecimal::{BigDecimal, FromPrimitive, ToPrimitive};
use chrono::{DateTime, Duration, Utc};
use log::{debug, error, info, warn};
use sqlx::PgPool;
use std::env;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

// Import Stripe service
use crate::services::stripe_service::StripeService;
// Import custom Stripe types
use crate::stripe_types::*;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct BillingService {
    db_pools: DatabasePools,
    customer_billing_repository: Arc<CustomerBillingRepository>,
    api_usage_repository: Arc<ApiUsageRepository>,
    credit_service: Arc<CreditService>,
    audit_service: Arc<AuditService>,
    settings_repository: Arc<SettingsRepository>,
    stripe_service: Option<StripeService>,
    app_settings: crate::config::settings::AppSettings,
    redis_client: Option<Arc<redis::aio::ConnectionManager>>,
    pending_charge_manager:
        Option<Arc<crate::services::pending_charge_manager::PendingChargeManager>>,
}

impl BillingService {
    pub fn new(
        db_pools: DatabasePools,
        app_settings: crate::config::settings::AppSettings,
    ) -> Self {
        // Create repositories with appropriate pools
        // User-specific operations use user pool (subject to RLS)
        let customer_billing_repository =
            Arc::new(CustomerBillingRepository::new(db_pools.user_pool.clone()));
        let api_usage_repository = Arc::new(ApiUsageRepository::new(db_pools.user_pool.clone()));

        // System operations use system pool (plans, models, etc.)
        let model_repository =
            Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone())));

        // Note: CreditService handles its own pool configuration for user credit operations

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
            env::var("STRIPE_PUBLISHABLE_KEY"),
        ) {
            (Ok(secret_key), Ok(webhook_secret), Ok(publishable_key)) => {
                let service = StripeService::new(secret_key, webhook_secret, publishable_key);
                // Stripe-managed billing emails policy
                // Billing emails: Stripe-managed receipts/invoices are enabled; ensure Stripe Dashboard email settings are on and Customers have an email.
                info!(
                    "Billing emails: Stripe-managed receipts/invoices are enabled; ensure Stripe Dashboard email settings are on and Customers have an email."
                );
                Some(service)
            }
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
            app_settings,
            redis_client: None,           // Will be set asynchronously
            pending_charge_manager: None, // Will be set asynchronously
        }
    }

    pub fn set_redis_client(
        &mut self,
        conn: Arc<redis::aio::ConnectionManager>,
        default_ttl_ms: u64,
    ) {
        self.redis_client = Some(conn.clone());
        self.pending_charge_manager = Some(Arc::new(
            crate::services::pending_charge_manager::PendingChargeManager::new(
                conn,
                default_ttl_ms,
            ),
        ));
        info!(
            "Redis client set for billing service with default TTL: {}ms",
            default_ttl_ms
        );
    }

    fn get_pending_manager(
        &self,
    ) -> Result<&crate::services::pending_charge_manager::PendingChargeManager, AppError> {
        self.pending_charge_manager
            .as_deref()
            .ok_or_else(|| AppError::Internal("PendingChargeManager not configured".to_string()))
    }

    async fn compute_reserve_margin(
        &self,
        amount: &BigDecimal,
        task_type: Option<&str>,
    ) -> Result<BigDecimal, AppError> {
        // SIMPLE APPROACH: Fixed $1.20 reserve for high-variance tasks
        if let Some(task_type) = task_type {
            // Convert to lowercase for case-insensitive matching
            let task_type_lower = task_type.to_lowercase();

            // Check for high-variance operations that need fixed reserve
            if task_type_lower.contains("web_search")
                || task_type_lower.contains("websearch")
                || task_type_lower == "video_analysis"
                || task_type_lower == "videoanalysis"
            {
                // Fixed $1.20 USD reserve for these high-variance operations
                info!(
                    "Using fixed $1.20 reserve for high-variance task: {}",
                    task_type
                );
                return Ok(BigDecimal::from_str("1.20").unwrap());
            }
        }

        // Try billing_adjustment_limits first (max_amount_usd, max_percentage)
        if let Some(config_value) = self
            .settings_repository
            .get_config_value("billing_adjustment_limits")
            .await?
        {
            if let (Some(max_amount_usd), Some(max_percentage)) = (
                config_value
                    .get("max_amount_usd")
                    .and_then(|v| v.as_str())
                    .and_then(|s| BigDecimal::from_str(s).ok()),
                config_value.get("max_percentage").and_then(|v| v.as_f64()),
            ) {
                let percentage_margin = amount
                    * BigDecimal::from_str(&(max_percentage / 100.0).to_string())
                        .unwrap_or_else(|_| BigDecimal::from_str("0.0").unwrap());
                let margin = percentage_margin.min(max_amount_usd);
                return Ok(margin.max(BigDecimal::from(0)));
            }
        }

        // Fall back to billing_reservation_buffer_multiplier (default 1.5)
        let multiplier = match self
            .settings_repository
            .get_config_value("billing_reservation_buffer_multiplier")
            .await?
        {
            Some(config_value) => config_value
                .as_f64()
                .and_then(|f| BigDecimal::from_str(&f.to_string()).ok())
                .unwrap_or_else(|| BigDecimal::from_str("1.5").unwrap()),
            None => BigDecimal::from_str("1.5").unwrap(),
        };

        let margin = amount * (multiplier - BigDecimal::from(1));
        Ok(margin.max(BigDecimal::from(0)))
    }

    async fn get_reservation_ttl_ms(&self) -> u64 {
        match self
            .settings_repository
            .get_config_value("billing_reservation_ttl_seconds")
            .await
        {
            Ok(Some(config_value)) => {
                config_value
                    .as_u64()
                    .map(|s| s * 1000) // Convert seconds to milliseconds
                    .unwrap_or(900_000) // Default 15 minutes
            }
            _ => 900_000, // Default 15 minutes
        }
    }

    pub async fn reconcile_timed_out_pending_charges(&self) -> Result<usize, AppError> {
        debug!("Starting reconciliation of timed-out pending charges");

        // Query pending api_usage with pending_timeout_at < now LIMIT 500
        let now = chrono::Utc::now();
        let records = sqlx::query!(
            r#"
            SELECT request_id, user_id
            FROM api_usage
            WHERE status = 'pending'
            AND pending_timeout_at < $1
            LIMIT 500
            "#,
            now
        )
        .fetch_all(&self.db_pools.user_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to query timed-out charges: {}", e)))?;

        let mut processed = 0;
        for record in records {
            if let Some(request_id) = record.request_id {
                let user_id = record.user_id;
                info!(
                    "Reconciling timed-out pending charge: {} for user {}",
                    request_id, user_id
                );

                // Call fail_api_charge to refund and release reservation
                if let Err(e) = self
                    .fail_api_charge(&request_id, &user_id, "Timed out")
                    .await
                {
                    warn!("Failed to reconcile timed-out charge {}: {}", request_id, e);
                } else {
                    processed += 1;
                }
            }
        }

        if processed > 0 {
            info!("Reconciled {} timed-out pending charges", processed);
        }

        Ok(processed)
    }

    pub fn spawn_pending_reconciliation(self: Arc<Self>) {
        tokio::spawn(async move {
            let interval = std::time::Duration::from_secs(60);
            loop {
                if let Err(e) = self.reconcile_timed_out_pending_charges().await {
                    warn!("reconcile_timed_out_pending_charges error: {}", e);
                }
                tokio::time::sleep(interval).await;
            }
        });
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
            return Err(AppError::CreditInsufficient(
                "No credits available. Please purchase credits to continue using AI services."
                    .to_string(),
            ));
        }

        // Check billing readiness for users who have made purchases
        let (is_payment_method_required, is_billing_info_required) =
            self._check_billing_readiness(user_id).await?;

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

    // Get the system database pool for operations requiring plantocode role
    pub fn get_system_db_pool(&self) -> PgPool {
        self.db_pools.system_pool.clone()
    }

    // Create billing portal session with state locking
    pub async fn create_billing_portal_session(&self, user_id: &Uuid) -> Result<String, AppError> {
        let stripe_service = self.get_stripe_service()?;

        // This is now much simpler. The function below handles all logic.
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service
            .create_billing_portal_session(
                &idempotency_key,
                &customer_id,
                &self.app_settings.stripe.portal_return_url,
            )
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to create billing portal session: {}", e))
            })?;

        info!("Created billing portal session for user {}", user_id);
        Ok(session.url)
    }

    // Get consolidated billing dashboard data
    pub async fn get_billing_dashboard_data(
        &self,
        user_id: &Uuid,
    ) -> Result<BillingDashboardData, AppError> {
        debug!("Fetching billing dashboard data for user: {}", user_id);

        // Get credit balance, billing readiness, and customer billing info concurrently
        let (credit_balance_res, billing_readiness_res, customer_billing_info_res) = tokio::join!(
            self.credit_service.get_user_balance(user_id),
            self._check_billing_readiness(user_id),
            self.get_customer_billing_info(user_id)
        );

        let credit_balance = credit_balance_res?;

        // Get the free credits amount from database configuration
        let usage_limit_usd = match self.settings_repository.get_free_credits_amount().await {
            Ok(amount) => amount.to_f64().unwrap_or(2.0),
            Err(e) => {
                warn!(
                    "Failed to get free credits amount from database, using fallback: {}",
                    e
                );
                2.0 // Fallback to $2.00 if database read fails
            }
        };
        let free_credit_balance_usd = credit_balance.free_credit_balance.to_f64().unwrap_or(0.0);
        let current_usage = (usage_limit_usd - free_credit_balance_usd).max(0.0);

        let (is_payment_method_required, is_billing_info_required) = match billing_readiness_res {
            Ok(readiness) => readiness,
            Err(e) => {
                warn!(
                    "Could not check billing readiness for user {}: {}. Defaulting to not required to avoid blocking user.",
                    user_id, e
                );
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

        info!(
            "Successfully assembled billing dashboard data for user: {}",
            user_id
        );
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
        // 1. Check local DB first - use short-lived transaction
        let existing_stripe_id = {
            let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(
                &self.db_pools.user_pool,
                3,
                150,
            )
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

            sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
                .bind(user_id.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Database(format!("Failed to set user context in transaction: {}", e))
                })?;

            let customer_billing = self
                .customer_billing_repository
                .get_by_user_id_with_executor(user_id, &mut tx)
                .await?;
            let stripe_id = customer_billing.and_then(|cb| cb.stripe_customer_id);

            tx.commit()
                .await
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            stripe_id
        };

        // 2. If found in DB, verify it still exists in Stripe
        if let Some(ref stripe_id) = existing_stripe_id {
            let stripe_service = self.get_stripe_service()?;
            match stripe_service.get_customer(stripe_id).await {
                Ok(customer) => {
                    // Check if customer is deleted (though this shouldn't happen with current Stripe API behavior)
                    if !customer.deleted.unwrap_or(false) {
                        // Customer exists and is not deleted, we're good
                        return Ok(stripe_id.clone());
                    }
                    warn!(
                        "Stripe customer {} is marked as deleted for user {}. Will create a new one.",
                        stripe_id, user_id
                    );
                }
                Err(e) => {
                    // Check error type
                    let error_str = e.to_string();

                    // When a customer is deleted, Stripe returns a minimal object that fails to parse
                    // because it's missing required fields like 'created'
                    if error_str.contains("missing field") && error_str.contains("created") {
                        warn!(
                            "Stripe customer {} is deleted (parsing failed due to missing fields) for user {}. Will create a new one.",
                            stripe_id, user_id
                        );
                    } else if error_str.contains("No such customer")
                        || error_str.contains("resource_missing")
                    {
                        warn!(
                            "Stripe customer {} does not exist for user {}. Will create a new one.",
                            stripe_id, user_id
                        );
                    } else {
                        // Some other error, propagate it
                        return Err(AppError::External(format!(
                            "Failed to verify Stripe customer: {}",
                            e
                        )));
                    }
                }
            }
            // If we reach here, the customer was deleted/missing - continue to create new one
        }

        // 3. Search Stripe for existing customer by user_id
        let stripe_service = self.get_stripe_service()?;
        if let Some(customer) = stripe_service
            .search_customer_by_user_id(user_id)
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to search for Stripe customer: {}", e))
            })?
        {
            // Start new transaction for upsert
            let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(
                &self.db_pools.user_pool,
                3,
                150,
            )
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

            sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
                .bind(user_id.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Database(format!("Failed to set user context in transaction: {}", e))
                })?;

            self.customer_billing_repository
                .upsert_stripe_customer_id_with_executor(user_id, &customer.id, &mut tx)
                .await?;
            tx.commit()
                .await
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            return Ok(customer.id);
        }

        // 3. Create a new Stripe customer
        let user_repo = UserRepository::new(self.db_pools.system_pool.clone());
        let user = user_repo.get_by_id(user_id).await?;
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let new_customer = stripe_service
            .create_customer(
                &idempotency_key,
                user_id,
                &user.email,
                user.full_name.as_deref(),
            )
            .await
            .map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;

        info!(
            "Created new Stripe customer {} for user {} (replacing: {:?})",
            new_customer.id, user_id, existing_stripe_id
        );

        // 4. Start new transaction for upsert after Stripe API call
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        self.customer_billing_repository
            .upsert_stripe_customer_id_with_executor(user_id, &new_customer.id, &mut tx)
            .await?;

        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(new_customer.id)
    }

    /// Get access to the StripeService for advanced operations
    pub fn get_stripe_service(&self) -> Result<&StripeService, AppError> {
        match &self.stripe_service {
            Some(service) => Ok(service),
            None => Err(AppError::Configuration("Stripe not configured".to_string())),
        }
    }

    /// Get credit purchase fee tiers from database configuration
    pub async fn get_credit_purchase_fee_tiers(
        &self,
    ) -> Result<crate::models::billing::FeeTierConfig, AppError> {
        self.settings_repository
            .get_credit_purchase_fee_tiers()
            .await
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
        )
        .map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        // Get the default payment method ID from customer
        let default_payment_method_id = customer
            .invoice_settings
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

        // CRITICAL: Validate billing setup before allowing credit purchases
        info!(
            "Validating billing setup for credit purchase - user: {}",
            user_id
        );
        let (is_payment_method_required, is_billing_info_required) =
            self._check_billing_readiness(user_id).await?;

        if is_payment_method_required {
            warn!(
                "Credit purchase blocked - payment method required for user: {}",
                user_id
            );
            return Err(AppError::PaymentMethodRequired(
                "A payment method is required before purchasing credits. Please add a payment method in your billing settings.".to_string()
            ));
        }

        if is_billing_info_required {
            warn!(
                "Credit purchase blocked - billing info required for user: {}",
                user_id
            );
            return Err(AppError::BillingAddressRequired(
                "Complete billing information is required before purchasing credits. Please update your billing information.".to_string()
            ));
        }

        info!(
            "Billing setup validated successfully for credit purchase - user: {}",
            user_id
        );

        // Parse amount string to BigDecimal for validation
        let amount_decimal = BigDecimal::parse_bytes(amount.as_bytes(), 10)
            .ok_or_else(|| AppError::InvalidArgument("Invalid amount format".to_string()))?;

        // Validate amount is positive
        if amount_decimal <= BigDecimal::from(0) {
            return Err(AppError::InvalidArgument(
                "Amount must be greater than 0".to_string(),
            ));
        }

        // Get max credit purchase amount from configuration
        // Key: 'billing_max_credit_purchase' in application_configurations table
        let max_amount = match self
            .settings_repository
            .get_config_value("billing_max_credit_purchase")
            .await?
        {
            Some(config_value) => {
                // Try to parse the config value as a number
                if let Some(num) = config_value.as_f64() {
                    BigDecimal::from_str(&num.to_string())
                        .unwrap_or_else(|_| BigDecimal::from(1000))
                } else if let Some(str_val) = config_value.as_str() {
                    BigDecimal::from_str(str_val).unwrap_or_else(|_| BigDecimal::from(1000))
                } else {
                    BigDecimal::from(1000) // Default if config format is unexpected
                }
            }
            None => BigDecimal::from(1000), // Default if not configured
        };

        if amount_decimal > max_amount {
            return Err(AppError::InvalidArgument(format!(
                "Amount exceeds maximum allowed: {}",
                max_amount
            )));
        }

        // Get fee tiers from database to validate against minimum tier
        let fee_tiers = self
            .settings_repository
            .get_credit_purchase_fee_tiers()
            .await?;

        // Find the minimum amount across all tiers
        let min_tier_amount = fee_tiers
            .tiers
            .iter()
            .map(|tier| &tier.min)
            .min()
            .ok_or_else(|| AppError::Configuration("No fee tiers configured".to_string()))?;

        // Validate against the minimum tier amount from configuration
        if &amount_decimal < min_tier_amount {
            return Err(AppError::InvalidArgument(format!(
                "Amount must be at least {} credits",
                min_tier_amount
            )));
        }

        // Note: We don't check Stripe's minimum here - let Stripe return its own error
        // This allows proper handling of different minimums per currency

        // Get the appropriate tier for this amount
        let tier = fee_tiers.get_tier_for_amount(&amount_decimal)?;

        // Calculate fee and net amounts using the tier's fee rate
        let fee_amount = &amount_decimal * &tier.fee_rate;
        let net_amount = &amount_decimal - &fee_amount;

        // Convert to cents with consistent rounding
        let gross_amount_cents = (amount_decimal.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let fee_amount_cents = (fee_amount.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let net_amount_cents = gross_amount_cents - fee_amount_cents; // Ensure net + fee = gross

        // Create two line items: one for credits, one for processing fee
        let mut line_items = Vec::new();

        // Credits line item with tax configuration
        let credits_line = crate::stripe_types::checkout_session::CreateCheckoutSessionLineItems {
            price: None,
            price_data: Some(serde_json::json!({
                "currency": "usd",
                "unit_amount": net_amount_cents,
                "tax_behavior": "exclusive",
                "product_data": {
                    "name": "Top-up Credits"
                    // Note: tax_code removed from product_data - handled by automatic tax
                }
            })),
            quantity: Some(1),
        };
        line_items.push(credits_line);

        // Processing fee line item with tax configuration
        let fee_line = crate::stripe_types::checkout_session::CreateCheckoutSessionLineItems {
            price: None,
            price_data: Some(serde_json::json!({
                "currency": "usd",
                "unit_amount": fee_amount_cents,
                "tax_behavior": "exclusive",
                "product_data": {
                    "name": "Processing fee"
                    // Note: tax_code removed from product_data - handled by automatic tax
                }
            })),
            quantity: Some(1),
        };
        line_items.push(fee_line);

        // Add metadata for webhook fulfillment
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "credit_purchase".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert(
            "gross_amount_cents".to_string(),
            gross_amount_cents.to_string(),
        );
        metadata.insert(
            "platform_fee_cents".to_string(),
            fee_amount_cents.to_string(),
        );
        metadata.insert("net_amount_cents".to_string(), net_amount_cents.to_string());
        metadata.insert("gross_amount".to_string(), amount_decimal.to_string());
        metadata.insert("platform_fee".to_string(), fee_amount.to_string());
        metadata.insert("net_amount".to_string(), net_amount.to_string());
        metadata.insert("currency".to_string(), "USD".to_string());

        let success_url = format!(
            "{}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            &self.app_settings.website_base_url
        );
        let cancel_url = format!("{}/billing/cancel", &self.app_settings.website_base_url);

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service
            .create_checkout_session(
                &idempotency_key,
                &customer_id,
                user_id,
                CHECKOUT_SESSION_MODE_PAYMENT,
                Some(line_items),
                &success_url,
                &cancel_url,
                metadata,
                Some(true), // billing_address_collection required for tax compliance
                Some(true), // automatic_tax enabled for proper tax calculation
                Some(true), // invoice_creation_enabled
                Some(true), // tax_id_collection_enabled for B2B customers
                Some(true), // customer_update_address to persist billing addresses
                            // Rely on Stripe to email receipts/invoices for this Checkout Session; no manual customer email is sent.
            )
            .await
            .map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;

        Ok(session)
    }

    /// Get checkout session status
    pub async fn get_checkout_session_status(
        &self,
        session_id: &str,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;

        let mut session = stripe_service
            .get_checkout_session(session_id)
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to retrieve checkout session: {}", e))
            })?;

        // Check if the payment is complete but webhook hasn't been processed yet
        if session.status.as_deref() == Some("complete")
            && session.payment_status.as_deref() == Some("paid")
        {
            if let Some(pi_id) = &session.payment_intent {
                let payment_intent_id = pi_id.to_string();
                let payment_intent = stripe_service
                    .get_payment_intent(&payment_intent_id)
                    .await?;

                // Extract charge ID based on Expandable enum
                let charge_id = match &payment_intent.latest_charge {
                    Some(crate::stripe_types::Expandable::Id(id)) => id.clone(),
                    Some(crate::stripe_types::Expandable::Object(charge)) => charge.id.clone(),
                    None => return Ok(session), // No charge yet
                };

                let credit_repo =
                    CreditTransactionRepository::new(self.db_pools.system_pool.clone());
                let transactions = credit_repo
                    .get_transactions_by_stripe_charge(&charge_id)
                    .await?;
                if transactions.is_empty() {
                    // Webhook hasn't been processed yet. Tell the client to keep polling.
                    session.payment_status = Some("processing".to_string());
                }
            }
        }

        Ok(session)
    }

    pub async fn get_detailed_usage(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<Vec<DetailedUsageRecord>, AppError> {
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        let usage_records = self
            .api_usage_repository
            .get_detailed_usage(user_id, start_date, end_date, &mut tx)
            .await?;

        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(usage_records)
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

        let success_url = format!(
            "{}/billing/payment-method/success",
            &self.app_settings.website_base_url
        );
        let cancel_url = format!(
            "{}/billing/payment-method/cancel",
            &self.app_settings.website_base_url
        );

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service
            .create_checkout_session(
                &idempotency_key,
                &customer_id,
                user_id,
                CHECKOUT_SESSION_MODE_SETUP,
                None, // No line items for setup mode
                &success_url,
                &cancel_url,
                metadata,
                None, // billing_address_collection not applicable for setup mode
                None, // automatic_tax not applicable for setup mode
                None, // invoice_creation_enabled not applicable for setup mode
                None, // tax_id_collection not applicable for setup mode
                None, // customer_update_address not applicable for setup mode
            )
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to create setup checkout session: {}", e))
            })?;

        Ok(session)
    }

    /// Get auto top-off settings for a user
    pub async fn get_auto_top_off_settings(
        &self,
        user_id: &Uuid,
    ) -> Result<AutoTopOffSettings, AppError> {
        debug!("Getting auto top-off settings for user: {}", user_id);

        // Start transaction for atomic operations
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Get customer billing
        let customer_billing = self
            .customer_billing_repository
            .get_by_user_id_with_executor(user_id, &mut tx)
            .await?
            .ok_or_else(|| {
                AppError::NotFound("No customer billing record found for user".to_string())
            })?;

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled: customer_billing.auto_top_off_enabled,
            threshold: customer_billing
                .auto_top_off_threshold
                .map(|t| t.to_string()),
            amount: customer_billing.auto_top_off_amount.map(|a| a.to_string()),
        };

        info!(
            "Successfully retrieved auto top-off settings for user: {}",
            user_id
        );
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

        // CRITICAL: Validate billing setup before allowing auto top-off to be enabled
        if enabled {
            info!(
                "Validating billing setup for auto top-off configuration - user: {}",
                user_id
            );
            let (is_payment_method_required, is_billing_info_required) =
                self._check_billing_readiness(user_id).await?;

            if is_payment_method_required {
                warn!(
                    "Auto top-off configuration blocked - payment method required for user: {}",
                    user_id
                );
                return Err(AppError::PaymentMethodRequired(
                    "A payment method is required before enabling auto top-off. Please add a payment method in your billing settings.".to_string()
                ));
            }

            if is_billing_info_required {
                warn!(
                    "Auto top-off configuration blocked - billing info required for user: {}",
                    user_id
                );
                return Err(AppError::BillingAddressRequired(
                    "Complete billing information is required before enabling auto top-off. Please update your billing information.".to_string()
                ));
            }

            info!(
                "Billing setup validated successfully for auto top-off configuration - user: {}",
                user_id
            );
        }

        // Start transaction for atomic operations
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

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
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled,
            threshold: threshold.map(|t| t.to_string()),
            amount: amount.map(|a| a.to_string()),
        };

        info!(
            "Successfully updated auto top-off settings for user: {}",
            user_id
        );
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
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

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
            model_id.to_string(),
        );

        // Validate usage data
        usage
            .validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;

        // Calculate total cost using server-side pricing logic with full token breakdown
        let total_cost = model
            .calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;

        Ok(total_cost)
    }

    /// Initiate an API charge with estimated cost
    pub async fn initiate_api_charge(
        &self,
        entry: ApiUsageEntryDto,
    ) -> Result<(String, UserCredit), AppError> {
        debug!(
            "Initiating API charge with estimates for user: {}",
            entry.user_id
        );

        // Extract needed values before moving entry
        let user_id = entry.user_id;
        let request_id = entry
            .request_id
            .as_ref()
            .ok_or_else(|| {
                AppError::InvalidArgument(
                    "request_id is required for two-phase billing".to_string(),
                )
            })?
            .clone();

        // Get model for cost estimation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

        let model = model_repository
            .find_by_id_with_provider(&entry.service_name)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!("Model '{}' not found", entry.service_name))
            })?;

        // Create ProviderUsage for estimated cost calculation
        let estimated_usage = ProviderUsage::new(
            entry.tokens_input as i32,
            entry.tokens_output as i32,
            entry.cache_write_tokens as i32,
            entry.cache_read_tokens as i32,
            entry.service_name.clone(),
        );

        // Validate usage data
        estimated_usage
            .validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;

        // Use CostResolver to calculate estimated cost
        let estimated_cost =
            crate::services::cost_resolver::CostResolver::resolve(estimated_usage, &model)?;

        // NEW: Start a transaction for atomic reservation + initiation
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&pool, 3, 150)
            .await
            .map_err(|e| AppError::Database(format!("Failed to start transaction: {}", e)))?;

        // Set RLS context for the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // NEW: Load user balances with FOR UPDATE lock
        let user_balance = sqlx::query!(
            r#"
            SELECT balance, free_credit_balance 
            FROM user_credits 
            WHERE user_id = $1 
            FOR UPDATE
            "#,
            user_id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to lock user credits: {}", e)))?;

        let total_available = user_balance.balance + user_balance.free_credit_balance;

        // NEW: Reserve overage margin if Redis is configured
        let reserved = if let Some(manager) = &self.pending_charge_manager {
            // Extract task_type from metadata if available
            let task_type = entry
                .metadata
                .as_ref()
                .and_then(|m| m.get("task_type"))
                .and_then(|t| t.as_str());

            // Compute reserve margin with task type for high-variance operations
            let reserve_margin = self
                .compute_reserve_margin(&estimated_cost, task_type)
                .await?;

            if reserve_margin > BigDecimal::from(0) {
                let ttl_ms = self.get_reservation_ttl_ms().await;

                // Attempt reservation
                let reservation_success = manager
                    .reserve_overage(
                        &user_id.to_string(),
                        &request_id,
                        &reserve_margin,
                        &total_available,
                        Some(ttl_ms / 1000), // Convert ms to seconds
                    )
                    .await?;

                if !reservation_success {
                    // Rollback and fail fast
                    tx.rollback().await.ok();

                    // Provide clear error message based on task type
                    let error_msg = if let Some(task_type) = task_type {
                        let task_type_lower = task_type.to_lowercase();
                        if task_type_lower.contains("web_search")
                            || task_type_lower.contains("websearch")
                        {
                            format!(
                                "Insufficient credits. Web search requires at least $1.20 available. Your balance: ${:.2}",
                                total_available
                            )
                        } else if task_type_lower == "video_analysis"
                            || task_type_lower == "videoanalysis"
                        {
                            format!(
                                "Insufficient credits. Video analysis requires at least $1.20 available. Your balance: ${:.2}",
                                total_available
                            )
                        } else {
                            format!(
                                "Insufficient credits for this operation. Required: ${:.2}, Available: ${:.2}",
                                reserve_margin, total_available
                            )
                        }
                    } else {
                        format!(
                            "Insufficient credits for this operation. Required: ${:.2}, Available: ${:.2}",
                            reserve_margin, total_available
                        )
                    };

                    return Err(AppError::CreditInsufficient(error_msg));
                }

                info!(
                    "Reserved {} (masked) for user {} request {}",
                    if reserve_margin > BigDecimal::from(1000) {
                        ">1000"
                    } else {
                        "<1000"
                    },
                    user_id,
                    request_id
                );
                true
            } else {
                false
            }
        } else {
            warn!("Redis not configured for pending charge reservations");
            false
        };

        // Proceed with existing logic for deducting estimated cost and creating api_usage record
        // BUT: Wrap it in error handling that releases reservation on failure
        let result = async {
            // existing credit deduction and api_usage insertion logic here
            // This uses the transaction (&mut *tx)
            self.credit_service
                .initiate_charge_in_transaction(entry, estimated_cost, &mut tx)
                .await
        }
        .await;

        match result {
            Ok(data) => {
                // Commit transaction
                tx.commit()
                    .await
                    .map_err(|e| AppError::Database(format!("Failed to commit: {}", e)))?;
                info!("Successfully initiated charge for request {}", data.0);
                Ok(data)
            }
            Err(e) => {
                // Release reservation on error
                if reserved {
                    if let Some(manager) = &self.pending_charge_manager {
                        if let Err(release_err) = manager
                            .release_reservation(&user_id.to_string(), &request_id)
                            .await
                        {
                            warn!("Failed to release reservation on error: {}", release_err);
                        }
                    }
                }
                tx.rollback().await.ok();
                Err(e)
            }
        }
    }

    /// Finalize an API charge with actual usage and metadata
    pub async fn finalize_api_charge_with_metadata(
        &self,
        request_id: &str,
        user_id: &Uuid,
        final_usage: ProviderUsage,
        metadata: Option<serde_json::Value>,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!(
            "Finalizing API charge with metadata for request: {}",
            request_id
        );

        // Get model for final cost calculation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

        let model = model_repository
            .find_by_id_with_provider(&final_usage.model_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!("Model '{}' not found", final_usage.model_id))
            })?;

        // Use CostResolver to calculate final cost
        let final_cost =
            crate::services::cost_resolver::CostResolver::resolve(final_usage.clone(), &model)?;

        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&pool, 3, 150)
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set RLS context using user_id within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Finalize charge with credit service, passing metadata
        let (api_usage_record, user_credit) = self
            .credit_service
            .finalize_charge_in_transaction_with_metadata(
                request_id,
                final_cost,
                &final_usage,
                metadata,
                &mut tx,
            )
            .await?;

        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;

        info!(
            "Successfully finalized charge with metadata for request {} - user {} for model {} (cost: {})",
            request_id,
            api_usage_record.user_id,
            api_usage_record.service_name,
            api_usage_record.cost
        );

        // Release Redis reservation after successful finalization
        if let Some(manager) = &self.pending_charge_manager {
            if let Err(e) = manager
                .release_reservation(&user_id.to_string(), request_id)
                .await
            {
                warn!("Failed to release reservation after finalization: {}", e);
            } else {
                debug!(
                    "Released reservation for request {} after finalization",
                    request_id
                );
            }
        }

        // After successful billing, check and trigger auto top-off if needed
        if let Err(e) = self
            .check_and_trigger_auto_top_off(&api_usage_record.user_id)
            .await
        {
            warn!(
                "Auto top-off check failed for user {}: {}",
                api_usage_record.user_id, e
            );
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
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&pool, 3, 150)
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set RLS context
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Call the credit service to finalize with zero cost
        // The credit service should be updated to check metadata.status == "failed" and set the appropriate status
        let _ = self
            .credit_service
            .finalize_charge_in_transaction_with_metadata(
                request_id,
                BigDecimal::from(0),
                &zero_usage,
                Some(metadata),
                &mut tx,
            )
            .await?;

        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;

        info!(
            "Successfully marked charge as failed for request {}",
            request_id
        );

        // Release Redis reservation after marking as failed
        if let Some(manager) = &self.pending_charge_manager {
            if let Err(e) = manager
                .release_reservation(&user_id.to_string(), request_id)
                .await
            {
                warn!("Failed to release reservation after failure: {}", e);
            } else {
                debug!(
                    "Released reservation for request {} after failure",
                    request_id
                );
            }
        }

        Ok(())
    }

    /// Record API usage with pre-resolved cost (simplified billing flow)
    /// This method takes a cost that has already been resolved by the CostResolver
    pub async fn charge_for_api_usage(
        &self,
        entry: ApiUsageEntryDto,
        final_cost: BigDecimal,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!(
            "Processing API usage with pre-resolved cost for user: {}",
            entry.user_id
        );

        // Start a database transaction to ensure atomicity
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set RLS context for the transaction - matches existing service pattern
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(entry.user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Auth(format!("Failed to set RLS context: {}", e)))?;

        // Ensure user has a credit record
        let _ = self
            .credit_service
            .get_user_credit_repository()
            .ensure_balance_record_exists_with_executor(&entry.user_id, &mut tx)
            .await?;

        // Deduct credits from user balance using the proper priority method
        // This method already checks for sufficient balance internally
        let (user_credit, from_free, from_paid) = self
            .credit_service
            .get_user_credit_repository()
            .deduct_credits_with_priority(&entry.user_id, &final_cost, &mut tx)
            .await?;

        debug!(
            "Deducted {} total: {} from free credits, {} from paid credits",
            final_cost, from_free, from_paid
        );

        // Create API usage record after successful deduction
        let api_usage_record = self
            .api_usage_repository
            .record_usage_with_executor(entry, final_cost.clone(), &mut tx)
            .await?;

        // Create a credit transaction record for audit trail
        let transaction =
            crate::db::repositories::credit_transaction_repository::CreditTransaction {
                id: uuid::Uuid::new_v4(),
                user_id: api_usage_record.user_id,
                transaction_type: "consumption".to_string(),
                net_amount: -final_cost.clone(),
                gross_amount: None,
                fee_amount: None,
                currency: "USD".to_string(),
                description: Some(format!("API usage: {}", api_usage_record.service_name)),
                stripe_charge_id: None,
                related_api_usage_id: api_usage_record.id,
                metadata: api_usage_record.metadata.clone(),
                created_at: Some(chrono::Utc::now()),
                balance_after: user_credit.balance.clone(),
            };

        self.credit_service
            .get_credit_transaction_repository()
            .create_transaction_with_executor(&transaction, &mut tx)
            .await?;

        // Commit the transaction
        tx.commit().await.map_err(AppError::from)?;

        info!(
            "Successfully billed user {} for API usage: {} (cost: {})",
            api_usage_record.user_id, api_usage_record.service_name, final_cost
        );

        // After successful billing, check and trigger auto top-off if needed
        // Don't fail the API call if auto top-off fails - just log the error
        if let Err(e) = self
            .check_and_trigger_auto_top_off(&api_usage_record.user_id)
            .await
        {
            warn!(
                "Auto top-off check failed for user {}: {}",
                api_usage_record.user_id, e
            );
        }

        Ok((api_usage_record, user_credit))
    }

    /// Check if auto top-off should be triggered and execute it if needed
    pub async fn check_and_trigger_auto_top_off(&self, user_id: &Uuid) -> Result<(), AppError> {
        debug!("Checking auto top-off conditions for user: {}", user_id);

        // Start transaction to check user's billing settings and balance atomically
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Get customer billing settings
        let customer_billing = match self
            .customer_billing_repository
            .get_by_user_id_with_executor(user_id, &mut tx)
            .await?
        {
            Some(billing) => billing,
            None => {
                debug!(
                    "No customer billing record found for user {}, skipping auto top-off check",
                    user_id
                );
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
        let current_balance = self
            .credit_service
            .get_user_balance_with_executor(user_id, &mut tx)
            .await?;

        // Check if balance is below threshold
        if current_balance.balance >= threshold {
            debug!(
                "User {} balance ({}) is above threshold ({}), no top-off needed",
                user_id, current_balance.balance, threshold
            );
            let _ = tx.rollback().await;
            return Ok(());
        }

        // Commit transaction since we're done with database reads
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        info!(
            "User {} balance ({}) is below threshold ({}), triggering auto top-off of {}",
            user_id, current_balance.balance, threshold, amount
        );

        // Perform auto top-off with USD (enforced for off-session auto top-offs)
        self.perform_auto_top_off(user_id, &amount).await?;

        Ok(())
    }

    /// Perform auto top-off using customer's default payment method
    pub async fn perform_auto_top_off(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
    ) -> Result<(), AppError> {
        info!(
            "Starting auto top-off process for user {} with amount {}",
            user_id, amount
        );
        debug!("Auto top-off execution flow: step 1 - validating Stripe service availability");

        // CRITICAL: Validate billing setup before allowing auto top-off
        info!(
            "Validating billing setup for auto top-off - user: {}",
            user_id
        );
        let (is_payment_method_required, is_billing_info_required) =
            self._check_billing_readiness(user_id).await?;

        if is_payment_method_required {
            warn!(
                "Auto top-off blocked - payment method required for user: {}",
                user_id
            );
            return Err(AppError::PaymentMethodRequired(
                "Auto top-off failed: A payment method is required. Please add a payment method in your billing settings.".to_string()
            ));
        }

        if is_billing_info_required {
            warn!(
                "Auto top-off blocked - billing info required for user: {}",
                user_id
            );
            return Err(AppError::BillingAddressRequired(
                "Auto top-off failed: Complete billing information is required. Please update your billing information.".to_string()
            ));
        }

        info!(
            "Billing setup validated successfully for auto top-off - user: {}",
            user_id
        );
        debug!("Auto top-off execution flow: step 1.5 - billing validation completed successfully");

        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => {
                debug!(
                    "Auto top-off execution flow: step 2 - Stripe service validated successfully"
                );
                service
            }
            None => {
                warn!(
                    "Auto top-off execution flow: FAILED at step 2 - Stripe not configured for user {}",
                    user_id
                );
                return Err(AppError::Configuration("Stripe not configured".to_string()));
            }
        };

        debug!("Auto top-off execution flow: step 3 - starting database transaction");
        // Start transaction for atomic operations
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150).await
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
        let lock_acquired =
            sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(hashtext($1))")
                .bind(format!("auto_top_off_{}", user_id))
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Database(format!("Failed to acquire advisory lock: {}", e))
                })?;

        if !lock_acquired {
            info!(
                "Auto top-off already in progress for user {} on another instance, skipping",
                user_id
            );
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
        debug!(
            "Auto top-off execution flow: step 5 completed - customer billing record retrieved successfully"
        );

        debug!("Auto top-off execution flow: step 6 - validating Stripe customer ID");
        // Get customer ID
        let customer_id = customer_billing.stripe_customer_id.ok_or_else(|| {
            warn!(
                "Auto top-off execution flow: FAILED at step 6 - user {} has no Stripe customer ID",
                user_id
            );
            AppError::Configuration("User has no Stripe customer ID".to_string())
        })?;
        debug!(
            "Auto top-off execution flow: step 6 completed - Stripe customer ID validated: {}",
            customer_id
        );

        debug!("Auto top-off execution flow: step 7 - committing database transaction");
        // Commit transaction (no longer needed)
        tx.commit().await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 7 - transaction commit failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to commit transaction: {}", e))
            })?;
        debug!(
            "Auto top-off execution flow: step 7 completed - transaction committed successfully"
        );

        debug!(
            "Auto top-off execution flow: step 8 - ensuring customer has default payment method"
        );
        // Check if customer has a default payment method set - fetch customer for this check only
        let customer = stripe_service.get_customer(&customer_id).await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 8 - failed to fetch Stripe customer for user {}: {}", user_id, e);
                AppError::External(format!("Failed to fetch Stripe customer: {}", e))
            })?;

        let has_default_payment_method = customer
            .invoice_settings
            .as_ref()
            .and_then(|settings| settings.default_payment_method.as_ref())
            .is_some();

        if !has_default_payment_method {
            debug!("No default payment method set, finding and setting one");
            let payment_methods = stripe_service
                .list_payment_methods(&customer_id)
                .await
                .map_err(|e| {
                    warn!("Failed to list payment methods for user {}: {}", user_id, e);
                    AppError::External(format!("Failed to list payment methods: {}", e))
                })?;

            if payment_methods.is_empty() {
                warn!("No payment methods available for user {}", user_id);
                return Err(AppError::PaymentMethodRequired(
                    "No payment methods available for auto top-off".to_string(),
                ));
            }

            // Set the first available payment method as default
            let payment_method_id = &payment_methods[0].id;
            info!("Setting default payment method: {}", payment_method_id);

            let set_default_key = format!(
                "set_default_pm_auto_topoff_{}_{}",
                customer_id, payment_method_id
            );
            stripe_service
                .set_default_payment_method(&set_default_key, &customer_id, payment_method_id)
                .await
                .map_err(|e| {
                    warn!(
                        "Failed to set default payment method for user {}: {}",
                        user_id, e
                    );
                    AppError::External(format!("Failed to set default payment method: {}", e))
                })?;

            info!("Successfully set default payment method for auto top-off");
        } else {
            info!("Customer already has default payment method set");
        }

        debug!("Auto top-off execution flow: step 10 - preparing payment intent creation");

        // Get fee tiers to calculate the fee
        let fee_tiers = self
            .settings_repository
            .get_credit_purchase_fee_tiers()
            .await
            .map_err(|e| AppError::Configuration(format!("Failed to get fee tiers: {}", e)))?;
        let tier = fee_tiers
            .get_tier_for_amount(&amount)
            .map_err(|e| AppError::Configuration(format!("Failed to get fee tier: {}", e)))?;

        // Calculate fee and net amounts using the tier's fee rate
        let fee_amount = amount.clone() * &tier.fee_rate;
        let net_amount = amount.clone() - &fee_amount;

        // Convert to cents with consistent rounding
        let gross_amount_cents = (amount.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let fee_amount_cents = (fee_amount.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let net_amount_cents = gross_amount_cents - fee_amount_cents; // Ensure net + fee = gross

        // Generate idempotency key
        let idempotency_key = format!(
            "auto_topoff_{}_{}_{}",
            user_id,
            gross_amount_cents,
            Utc::now().timestamp_nanos()
        );
        debug!(
            "Auto top-off execution flow: step 10 - payment intent parameters prepared: gross_amount_cents={}, fee_cents={}, net_cents={}, idempotency_key={}",
            gross_amount_cents, fee_amount_cents, net_amount_cents, idempotency_key
        );

        debug!(
            "Auto top-off execution flow: step 10.5 - cleaning up pending invoice items in different currencies"
        );
        // Clean up pending invoice items that don't match USD currency
        // This prevents the "cannot combine currencies" error
        match stripe_service
            .cleanup_pending_invoice_items_except_currency(&customer_id, "usd")
            .await
        {
            Ok(removed_count) => {
                if removed_count > 0 {
                    info!(
                        "Cleaned up {} pending invoice items in non-USD currencies for customer {}",
                        removed_count, customer_id
                    );
                }
            }
            Err(e) => {
                warn!(
                    "Failed to clean up mismatched currency invoice items for customer {}: {}",
                    customer_id, e
                );
                // Fall back to cleaning all items if the selective cleanup fails
                if let Err(e2) = stripe_service
                    .cleanup_all_pending_invoice_items(&customer_id)
                    .await
                {
                    warn!("Failed to clean up all pending invoice items: {}", e2);
                }
            }
        }

        debug!(
            "Auto top-off execution flow: step 11 - creating invoice for auto top-off with currency: USD"
        );

        // Create metadata for the invoice with fee information
        let metadata = serde_json::json!({
            "user_id": user_id.to_string(),
            "gross_amount_cents": gross_amount_cents.to_string(),
            "platform_fee_cents": fee_amount_cents.to_string(),
            "net_amount_cents": net_amount_cents.to_string(),
            "gross_amount": amount.to_string(),
            "platform_fee": fee_amount.to_string(),
            "net_amount": net_amount.to_string(),
            "currency": "USD"
        });

        // Create an invoice for auto top-off using USD (enforced for off-session auto top-offs)
        // Pass both net and fee amounts for proper breakdown
        let invoice = stripe_service.create_invoice_for_auto_topoff(
            &idempotency_key,
            &customer_id,
            net_amount_cents as i64,
            fee_amount_cents as i64,
            "usd",
            "Automatic credit top-off",
            Some(metadata),
            ).await.map_err(|e| {
            warn!("Auto top-off execution flow: FAILED at step 11 - invoice creation failed for user {} with currency USD: {}", 
                  user_id, e);
            AppError::External(format!("Failed to create invoice for auto top-off: {}", e))
        })?;
        info!(
            "Auto top-off execution flow: step 11 completed - invoice created and finalized successfully in USD: {} - payment intent: {} - relying on webhooks for credit fulfillment",
            invoice.id,
            match &invoice.payment_intent {
                Some(crate::stripe_types::Expandable::Id(id)) => id.as_str(),
                Some(crate::stripe_types::Expandable::Object(pi)) => &pi.id,
                None => "none",
            }
        );

        // Stripe will email invoice/receipt per account settings; manual customer emails are disabled.
        info!(
            "Auto top-off execution flow: COMPLETED SUCCESSFULLY - user {} auto top-off invoice created in USD with amount {} - webhooks will handle credit fulfillment",
            user_id, amount
        );
        Ok(())
    }

    /// Get customer billing information for display
    pub async fn get_customer_billing_info(
        &self,
        user_id: &Uuid,
    ) -> Result<Option<CustomerBillingInfo>, AppError> {
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Ok(None),
        };

        // This function is now strictly read-only regarding our database.
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let maybe_stripe_id = if let Some(billing) = self
            .customer_billing_repository
            .get_by_user_id_with_executor(user_id, &mut tx)
            .await?
        {
            billing.stripe_customer_id
        } else {
            None
        };
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let customer_id = if let Some(id) = maybe_stripe_id {
            id
        } else {
            // If not found locally, search Stripe without writing to DB
            if let Some(customer) = stripe_service
                .search_customer_by_user_id(user_id)
                .await
                .map_err(|e| {
                    AppError::External(format!("Failed to search for Stripe customer: {}", e))
                })?
            {
                customer.id
            } else {
                return Ok(None); // No Stripe customer exists for this user.
            }
        };

        // Fetch full customer object from Stripe
        let customer = stripe_service
            .get_customer(&customer_id)
            .await
            .map_err(|e| {
                error!(
                    "Failed to fetch customer {} from Stripe: {:?}",
                    customer_id, e
                );
                AppError::from(e)
            })?;

        Ok(Some(CustomerBillingInfo::from(&customer)))
    }

    /// Check billing readiness requirements for a user
    /// ALWAYS validates actual billing completeness regardless of purchase history
    async fn _check_billing_readiness(&self, user_id: &Uuid) -> Result<(bool, bool), AppError> {
        let stripe_service = self.get_stripe_service()?;

        // Read-only lookup for stripe_customer_id
        let customer_id = {
            let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(
                &self.db_pools.user_pool,
                3,
                150,
            )
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
            sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
                .bind(user_id.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
            let maybe_id = self
                .customer_billing_repository
                .get_by_user_id_with_executor(user_id, &mut tx)
                .await?
                .and_then(|b| b.stripe_customer_id);
            tx.commit()
                .await
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

            if let Some(id) = maybe_id {
                id
            } else if let Some(customer) = stripe_service
                .search_customer_by_user_id(user_id)
                .await
                .map_err(|e| {
                    AppError::External(format!("Failed to search for Stripe customer: {}", e))
                })?
            {
                customer.id
            } else {
                // No Stripe customer exists - both payment method and billing info are required
                return Ok((true, true));
            }
        };

        let (customer, payment_methods) = tokio::try_join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.list_payment_methods(&customer_id)
        )
        .map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        let has_default_payment_method = customer
            .invoice_settings
            .as_ref()
            .and_then(|s| s.default_payment_method.as_ref())
            .is_some();
        let has_any_payment_methods = !payment_methods.is_empty();
        let is_payment_method_required = !has_default_payment_method || !has_any_payment_methods;
        let is_billing_address_complete = customer.address.as_ref().map_or(false, |addr| {
            addr.line1.is_some()
                && addr.city.is_some()
                && addr.postal_code.is_some()
                && addr.country.is_some()
        });
        let is_shipping_address_complete = customer
            .shipping
            .as_ref()
            .and_then(|s| s.address.as_ref())
            .map_or(false, |addr| {
                addr.line1.is_some()
                    && addr.city.is_some()
                    && addr.postal_code.is_some()
                    && addr.country.is_some()
            });
        let is_billing_info_required = customer.name.is_none()
            || (!is_billing_address_complete && !is_shipping_address_complete);
        Ok((is_payment_method_required, is_billing_info_required))
    }

    /// List invoices for a user with pagination
    pub async fn list_invoices_for_user(
        &self,
        user_id: Uuid,
        limit: i32,
        starting_after: Option<String>,
    ) -> Result<ListInvoicesResponse, AppError> {
        debug!("Listing invoices for user: {}", user_id);

        // Get customer ID for the user
        let customer_id = match self.get_or_create_stripe_customer(&user_id).await {
            Ok(id) => id,
            Err(_) => {
                // If no Stripe customer, return empty list
                return Ok(ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // Get the Stripe service
        let stripe_service = self.get_stripe_service()?;

        // List invoices from Stripe
        let invoices_json = match stripe_service
            .list_invoices(&customer_id, Some(limit as u64), starting_after.as_deref())
            .await
        {
            Ok(json) => json,
            Err(e) => {
                warn!(
                    "Failed to list invoices from Stripe for user {}: {:?}",
                    user_id, e
                );
                return Ok(ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // Parse the JSON response
        let empty_vec = Vec::new();
        let data_array = invoices_json
            .get("data")
            .and_then(|d| d.as_array())
            .unwrap_or(&empty_vec);

        let has_more = invoices_json
            .get("has_more")
            .and_then(|h| h.as_bool())
            .unwrap_or(false);

        // Convert Stripe invoices to our Invoice model
        let mut invoices = Vec::new();
        for invoice_json in data_array {
            let currency = invoice_json
                .get("currency")
                .and_then(|v| v.as_str())
                .unwrap_or("usd")
                .to_string();

            let amount_paid = invoice_json
                .get("amount_paid")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            // Determine the amount to display in USD
            let amount_paid_display = if currency != "usd" {
                // For non-USD invoices, fetch the PaymentIntent with expanded balance_transaction
                if let Some(payment_intent_id) = invoice_json
                    .get("payment_intent")
                    .and_then(|pi| pi.as_str())
                {
                    match stripe_service.get_payment_intent(payment_intent_id).await {
                        Ok(payment_intent) => {
                            // Try to extract the USD amount from the balance transaction
                            if let Some(latest_charge) = payment_intent.latest_charge {
                                // Check if the charge is expanded (not just an ID)
                                if let Expandable::Object(charge) = latest_charge {
                                    // Check if balance_transaction is present on the charge
                                    if let Some(balance_transaction) = charge.balance_transaction {
                                        // balance_transaction.amount is in USD cents (gross charge)
                                        format!("{:.2}", balance_transaction.amount as f64 / 100.0)
                                    } else {
                                        // Fallback to original amount
                                        format!("{:.2}", amount_paid as f64 / 100.0)
                                    }
                                } else {
                                    // Charge is not expanded, fallback to original amount
                                    format!("{:.2}", amount_paid as f64 / 100.0)
                                }
                            } else {
                                format!("{:.2}", amount_paid as f64 / 100.0)
                            }
                        }
                        Err(_) => {
                            // Fallback to original amount if PaymentIntent fetch fails
                            format!("{:.2}", amount_paid as f64 / 100.0)
                        }
                    }
                } else {
                    format!("{:.2}", amount_paid as f64 / 100.0)
                }
            } else {
                // For USD invoices, use the original amount_paid
                format!("{:.2}", amount_paid as f64 / 100.0)
            };

            let invoice = Invoice {
                id: invoice_json
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                created: invoice_json
                    .get("created")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                due_date: invoice_json.get("due_date").and_then(|v| v.as_i64()),
                amount_paid_display,
                amount_paid,
                currency,
                status: invoice_json
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                invoice_pdf_url: invoice_json
                    .get("invoice_pdf")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            };
            invoices.push(invoice);
        }

        info!(
            "Successfully retrieved {} invoices for user {}",
            invoices.len(),
            user_id
        );

        Ok(ListInvoicesResponse {
            total_invoices: invoices.len() as i32,
            invoices,
            has_more,
        })
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
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

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
            model_id.to_string(),
        );

        // Validate usage data
        usage
            .validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;

        // Calculate total cost using server-side pricing logic
        let total_cost = model
            .calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;

        Ok(total_cost)
    }

    /// Process a saved payment method from a completed SetupIntent
    /// This method handles setup mode checkout sessions where a payment method was added
    pub async fn process_saved_payment_method(
        &self,
        setup_intent: &crate::stripe_types::SetupIntent,
    ) -> Result<(), AppError> {
        info!(
            "Processing saved payment method from setup intent: {}",
            setup_intent.id
        );

        // Check if setup intent status is "succeeded"
        if !matches!(
            setup_intent.status,
            crate::stripe_types::setup_intent::SetupIntentStatus::Succeeded
        ) {
            warn!(
                "Setup intent {} is not in succeeded status: {:?}",
                setup_intent.id, setup_intent.status
            );
            return Err(AppError::InvalidArgument(format!(
                "Setup intent is not in succeeded status: {:?}",
                setup_intent.status
            )));
        }

        // Extract customer ID from setup_intent
        let customer_id = setup_intent.customer.as_ref().ok_or_else(|| {
            AppError::InvalidArgument("Setup intent has no customer ID".to_string())
        })?;

        // Extract payment method ID from setup_intent
        let payment_method_id = setup_intent.payment_method.as_ref().ok_or_else(|| {
            AppError::InvalidArgument("Setup intent has no payment method ID".to_string())
        })?;

        info!(
            "Setup intent {} - customer: {}, payment method: {}",
            setup_intent.id, customer_id, payment_method_id
        );

        // Get stripe service
        let stripe_service = self.get_stripe_service()?;

        // Set the payment method as default for the customer
        let idempotency_key = format!("set_default_pm_{}_{}", setup_intent.id, payment_method_id);
        stripe_service
            .set_default_payment_method(&idempotency_key, customer_id, payment_method_id)
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to set default payment method: {}", e))
            })?;

        info!(
            "Successfully set payment method {} as default for customer {}",
            payment_method_id, customer_id
        );

        // Find the user via user_repository.get_by_stripe_customer_id
        let user_repository = crate::db::repositories::user_repository::UserRepository::new(
            self.get_system_db_pool(),
        );
        let user = user_repository
            .get_by_stripe_customer_id(customer_id)
            .await
            .map_err(|e| {
                AppError::NotFound(format!(
                    "Could not find user for customer {}: {}",
                    customer_id, e
                ))
            })?;

        info!(
            "Found user {} for customer {} in setup intent {}",
            user.id, customer_id, setup_intent.id
        );

        // Log detailed audit event
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("setup_intent_id".to_string(), setup_intent.id.clone());
        metadata.insert("payment_method_id".to_string(), payment_method_id.clone());
        metadata.insert("customer_id".to_string(), customer_id.clone());
        metadata.insert("event_type".to_string(), "payment_method_added".to_string());

        let audit_context = crate::services::audit_service::AuditContext::new(user.id);
        let audit_event =
            crate::services::audit_service::AuditEvent::new("payment_method_added", "billing")
                .with_entity_id(setup_intent.id.clone())
                .with_metadata(serde_json::to_value(metadata).unwrap_or_default());

        self.audit_service
            .log_event(&audit_context, audit_event)
            .await?;

        info!(
            "Successfully processed saved payment method for setup intent {} - user {} now has default payment method {}",
            setup_intent.id, user.id, payment_method_id
        );

        Ok(())
    }
}
