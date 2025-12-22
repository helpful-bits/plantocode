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
    pub(crate) db_pools: DatabasePools,
    pub(crate) customer_billing_repository: Arc<CustomerBillingRepository>,
    pub(crate) api_usage_repository: Arc<ApiUsageRepository>,
    pub(crate) credit_service: Arc<CreditService>,
    pub(crate) audit_service: Arc<AuditService>,
    pub(crate) settings_repository: Arc<SettingsRepository>,
    pub(crate) stripe_service: Option<StripeService>,
    pub(crate) app_settings: crate::config::settings::AppSettings,
    pub(crate) redis_client: Option<Arc<redis::aio::ConnectionManager>>,
    pub(crate) pending_charge_manager:
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
}
