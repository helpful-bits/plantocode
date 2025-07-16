use crate::error::AppError;
use crate::models::billing::{BillingDashboardData, AutoTopOffSettings, CustomerBillingInfo, TaxIdInfo, FinalCostResponse};
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
    
    
    
    // Create a simple customer billing record for credit-based billing
    async fn create_simple_customer_billing_in_tx<'a>(
        &self, 
        user_id: &Uuid, 
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>
    ) -> Result<CustomerBilling, AppError>
    {
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        let now = Utc::now();
        
        // Create simple customer billing record for credit-based billing
        let customer_billing_id = self.customer_billing_repository.create_with_executor(
            user_id,
            None, // No stripe customer ID initially
            tx,
        ).await?;
        
        // Grant initial free credits ($2.00) with expiry
        let free_credits = BigDecimal::from_str("2.00").unwrap();
        let free_credits_expires_at = now + Duration::days(30);
        
        // Update user_credits with free credits
        sqlx::query(
            "UPDATE user_credits 
             SET free_credit_balance = $2,
                 free_credits_granted_at = $3,
                 free_credits_expires_at = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1"
        )
        .bind(user_id)
        .bind(&free_credits)
        .bind(now)
        .bind(free_credits_expires_at)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to grant free credits: {}", e)))?;
        
        // Construct the customer billing record from known data
        let customer_billing = CustomerBilling {
            id: customer_billing_id,
            user_id: *user_id,
            stripe_customer_id: None,
            auto_top_off_enabled: false,
            auto_top_off_threshold: None,
            auto_top_off_amount: None,
            created_at: now,
            updated_at: now,
        };
        
        info!("Created customer billing record and granted initial free credits for user {}", user_id);
        Ok(customer_billing)
    }

    
    pub async fn create_default_customer_billing_for_new_user(&self, user_id: &Uuid) -> Result<CustomerBilling, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
            
        let customer_billing = self.create_simple_customer_billing_in_tx(user_id, &mut tx).await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            
        Ok(customer_billing)
    }

    // Ensure user has a customer billing record, create default one if missing
    pub async fn ensure_user_has_customer_billing(&self, user_id: &Uuid) -> Result<CustomerBilling, AppError> {
        // First try to get existing customer billing record
        if let Some(existing_customer_billing) = self.customer_billing_repository.get_by_user_id(user_id).await? {
            return Ok(existing_customer_billing);
        }
        
        // No customer billing record exists, create default one
        info!("User {} has no customer billing record, creating default credit-based billing", user_id);
        self.create_default_customer_billing_for_new_user(user_id).await
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
    
    
    
    // Get or create a Stripe customer for a user within a transaction
    async fn _get_or_create_stripe_customer_with_executor(
        &self,
        user_id: &Uuid,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<String, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Fetch the user's billing info within the transaction
        let customer_billing = self.customer_billing_repository.get_by_user_id_with_executor(user_id, tx).await?
            .ok_or_else(|| AppError::NotFound(format!("No customer billing record found for user {}", user_id)))?;

        // Check if customer billing already has a Stripe customer ID
        if let Some(ref customer_id) = customer_billing.stripe_customer_id {
            return Ok(customer_id.clone());
        }

        // Get user details from database using system pool (not affected by transaction)
        let user = crate::db::repositories::user_repository::UserRepository::new(
            self.db_pools.system_pool.clone()
        ).get_by_id(user_id).await?;

        // Create a new Stripe customer
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let customer = stripe_service.create_or_get_customer(
            &idempotency_key,
            user_id,
            &user.email,
            user.full_name.as_deref(),
            customer_billing.stripe_customer_id.as_deref(),
        ).await.map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;

        // Update the customer billing with the customer ID within the transaction
        self.customer_billing_repository.set_stripe_customer_id_with_executor(&customer_billing.id, &customer.id, tx).await?;
        info!("Updated customer billing {} with Stripe customer ID: {}", customer_billing.id, customer.id);

        Ok(customer.id.to_string())
    }
    
    // Create billing portal session with state locking
    pub async fn create_billing_portal_session(
        &self,
        user_id: &Uuid,
    ) -> Result<String, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Start database transaction for atomic state management
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Ensure user has customer billing, create default one if missing
        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(customer_billing) => customer_billing,
            None => {
                info!("User {} accessing billing portal has no customer billing, creating default customer billing", user_id);
                let customer_billing = self.create_simple_customer_billing_in_tx(user_id, &mut tx).await?;
                customer_billing
            }
        };

        // Get or create Stripe customer ID within the transaction
        let customer_id = if let Some(existing_customer_id) = &customer_billing.stripe_customer_id {
            existing_customer_id.clone()
        } else {
            self._get_or_create_stripe_customer_with_executor(user_id, &mut tx).await?
        };

        // Create portal session
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = match stripe_service.create_billing_portal_session(
            &idempotency_key,
            &customer_id,
            &self.app_settings.stripe.portal_return_url,
        ).await {
            Ok(session) => session,
            Err(e) => {
                let _ = tx.rollback().await;
                return Err(AppError::External(format!("Failed to create billing portal session: {}", e)));
            }
        };

        // Commit the transaction after successful portal session creation
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit portal session transaction: {}", e)))?;

        info!("Created billing portal session for user {} and set management state to portal_active", user_id);

        Ok(session.url)
    }
    
    
    // Get consolidated billing dashboard data
    pub async fn get_billing_dashboard_data(&self, user_id: &Uuid) -> Result<BillingDashboardData, AppError> {
        debug!("Fetching billing dashboard data for user: {}", user_id);

        // Get credit balance and billing readiness concurrently
        let (credit_balance, billing_readiness) = tokio::join!(
            self.credit_service.get_user_balance(user_id),
            self._check_billing_readiness(user_id)
        );

        let credit_balance = credit_balance?;
        let (is_payment_method_required, is_billing_info_required) = billing_readiness.unwrap_or((false, false));
        
        // Calculate total balance
        let total_balance = &credit_balance.balance + &credit_balance.free_credit_balance;
        
        // Build response with readiness flags
        let dashboard_data = BillingDashboardData {
            credit_balance_usd: credit_balance.balance.to_f64().unwrap_or(0.0),
            free_credit_balance_usd: credit_balance.free_credit_balance.to_f64().unwrap_or(0.0),
            free_credits_expires_at: credit_balance.free_credits_expires_at,
            services_blocked: total_balance <= BigDecimal::from(0),
            is_payment_method_required,
            is_billing_info_required,
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
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Ensure user has customer billing
        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(customer_billing) => customer_billing,
            None => self.create_simple_customer_billing_in_tx(user_id, &mut tx).await?,
        };
        
        let customer_id = self._get_or_create_stripe_customer_with_executor(user_id, &mut tx).await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        
        Ok(customer_id)
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
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Start transaction for atomic customer operations
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Ensure user has customer billing
        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(customer_billing) => customer_billing,
            None => self.create_simple_customer_billing_in_tx(user_id, &mut tx).await?,
        };

        // Get customer ID within transaction
        let customer_id = self._get_or_create_stripe_customer_with_executor(user_id, &mut tx).await?;

        // Commit transaction after customer operations
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

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



    /// List invoices for a user with pagination
    pub async fn list_invoices_for_user(
        &self,
        user_id: Uuid,
        limit: i32,
        starting_after: Option<String>,
    ) -> Result<crate::models::ListInvoicesResponse, AppError> {
        debug!("Listing invoices for user: {}", user_id);

        // Check if user has a Stripe customer ID - if not, return empty list
        let customer_id = match self.get_customer_billing_repository().get_by_user_id(&user_id).await? {
            Some(billing) => match billing.stripe_customer_id {
                Some(id) => id,
                None => {
                    debug!("User {} has no Stripe customer ID, returning empty invoice list", user_id);
                    return Ok(crate::models::ListInvoicesResponse {
                        total_invoices: 0,
                        invoices: vec![],
                        has_more: false,
                    });
                }
            },
            None => {
                debug!("User {} has no customer billing record, returning empty invoice list", user_id);
                return Ok(crate::models::ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // Get the Stripe service
        let stripe_service = match self.stripe_service.as_ref() {
            Some(service) => service,
            None => {
                debug!("Stripe service not configured, returning empty invoice list");
                return Ok(crate::models::ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // List invoices from Stripe with pagination
        let invoices_list = match stripe_service.list_invoices_with_filter(
            &customer_id,
            None, // No status filter
            Some(limit as u64),
            starting_after.as_deref(),
        ).await {
            Ok(list) => list,
            Err(e) => {
                warn!("Failed to list invoices from Stripe for user {}: {:?}", user_id, e);
                // Return empty list instead of error for better UX
                return Ok(crate::models::ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // Convert Stripe invoices to our Invoice model
        let invoices: Result<Vec<crate::models::Invoice>, AppError> = invoices_list.data
            .into_iter()
            .map(|stripe_invoice| {
                Ok(crate::models::Invoice {
                    id: stripe_invoice.id.to_string(),
                    created: stripe_invoice.created,
                    due_date: stripe_invoice.due_date,
                    amount_due: stripe_invoice.amount_due,
                    amount_paid: stripe_invoice.amount_paid,
                    currency: stripe_invoice.currency,
                    status: format!("{:?}", stripe_invoice.status).to_lowercase(),
                    invoice_pdf_url: stripe_invoice.invoice_pdf,
                })
            })
            .collect();
            
        let invoices = invoices?;

        // Use Stripe's native has_more flag
        let has_more = invoices_list.has_more;

        Ok(crate::models::ListInvoicesResponse {
            total_invoices: invoices.len() as i32,
            invoices,
            has_more,
        })
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
        metadata.insert("fee_amount".to_string(), fee_amount.to_string());
        metadata.insert("net_amount".to_string(), net_amount.to_string());
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

        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
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
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
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
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Update auto top-off settings using repository method
        self.customer_billing_repository.update_auto_top_off_settings(
            user_id,
            enabled,
            threshold.clone(),
            amount.clone(),
        ).await?;

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
        let estimated_cost = crate::services::cost_resolver::CostResolver::resolve(estimated_usage, &model);
        
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
    
    /// Finalize an API charge with actual usage
    pub async fn finalize_api_charge(
        &self,
        request_id: &str,
        user_id: &Uuid,
        final_usage: ProviderUsage,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!("Finalizing API charge for request: {}", request_id);
        
        // Get model for final cost calculation
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(
            Arc::new(self.db_pools.system_pool.clone())
        ));
        
        let model = model_repository
            .find_by_id_with_provider(&final_usage.model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", final_usage.model_id)))?;
        
        // Use CostResolver to calculate final cost
        let final_cost = crate::services::cost_resolver::CostResolver::resolve(final_usage.clone(), &model);
        
        // Start transaction
        let pool = self.credit_service.get_user_credit_repository().get_pool();
        let mut tx = pool.begin().await.map_err(AppError::from)?;
        
        // Set RLS context using user_id within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Finalize charge with credit service
        let (api_usage_record, user_credit) = self.credit_service
            .finalize_charge_in_transaction(request_id, final_cost, &final_usage, &mut tx)
            .await?;
        
        // Commit transaction
        tx.commit().await.map_err(AppError::from)?;
        
        info!("Successfully finalized charge for request {} - user {} for model {} (cost: {})", 
              request_id, api_usage_record.user_id, api_usage_record.service_name, api_usage_record.cost);
        
        // After successful billing, check and trigger auto top-off if needed
        if let Err(e) = self.check_and_trigger_auto_top_off(&api_usage_record.user_id).await {
            warn!("Auto top-off check failed for user {}: {}", api_usage_record.user_id, e);
        }
        
        Ok((api_usage_record, user_credit))
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
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
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
        
        // Spawn async task to perform auto top-off
        let billing_service = self.clone();
        let user_id_clone = *user_id;
        let amount_clone = amount.clone();
        
        tokio::spawn(async move {
            let result = billing_service.perform_auto_top_off(&user_id_clone, &amount_clone).await;
            
            match result {
                Ok(()) => {
                    info!("Auto top-off completed successfully for user {}", user_id_clone);
                }
                Err(e) => {
                    warn!("Auto top-off failed for user {}: {}", user_id_clone, e);
                }
            }
        });
        
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
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
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

        debug!("Auto top-off execution flow: step 8 - preparing Stripe invoice creation");
        // Create and pay invoice with Stripe for the auto top-off amount
        let amount_cents = (amount.clone() * BigDecimal::from(100)).to_i64().unwrap_or(0);
        let idempotency_key = format!("auto_topoff_{}_{}", user_id, Utc::now().timestamp());
        debug!("Auto top-off execution flow: step 8 - invoice parameters prepared: amount_cents={}, idempotency_key={}", amount_cents, idempotency_key);
        
        debug!("Auto top-off execution flow: step 9 - creating and paying Stripe invoice");
        // Create invoice item and invoice, then pay it
        let invoice = stripe_service.create_and_pay_invoice(
            &idempotency_key,
            &customer_id,
            amount_cents as i64,
            "USD",
            &format!("Automatic credit top-off for ${}", amount),
        ).await.map_err(|e| {
            warn!("Auto top-off execution flow: FAILED at step 9 - Stripe invoice creation/payment failed for user {}: {}", user_id, e);
            AppError::External(format!("Failed to create and pay auto top-off invoice: {}", e))
        })?;
        info!("Auto top-off execution flow: step 9 completed - Stripe invoice created successfully: {} - relying on webhooks for credit fulfillment", invoice.id);

        info!("Auto top-off execution flow: COMPLETED SUCCESSFULLY - user {} auto top-off invoice created with amount {} - webhooks will handle credit fulfillment", user_id, amount);
        Ok(())
    }

    /// Get customer billing information for display
    pub async fn get_customer_billing_info(&self, user_id: &Uuid) -> Result<Option<CustomerBillingInfo>, AppError> {
        // Check if user has made a purchase - if not, no billing info needed
        let has_purchased = self.credit_service.has_user_made_purchase(user_id).await?;
        if !has_purchased {
            return Ok(None);
        }

        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Ok(None), // Return None instead of error for better UX
        };

        // Get Stripe customer ID - return None if not found instead of creating
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(billing) => billing,
            None => {
                let _ = tx.rollback().await;
                return Ok(None);
            }
        };

        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let customer_id = match customer_billing.stripe_customer_id {
            Some(id) => id,
            None => return Ok(None),
        };

        // Fetch customer and tax IDs from Stripe concurrently
        let (customer_result, tax_ids_result) = tokio::join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.get_customer_tax_ids(&customer_id)
        );

        let customer = match customer_result {
            Ok(customer) => customer,
            Err(_) => return Ok(None), // Gracefully handle Stripe errors
        };

        // Process tax IDs, ignore errors for better UX
        let tax_ids = tax_ids_result
            .unwrap_or_default()
            .into_iter()
            .map(|tax_id| TaxIdInfo {
                r#type: tax_id.r#type,
                value: tax_id.value,
                country: tax_id.country,
            })
            .collect();

        Ok(Some(CustomerBillingInfo {
            customer_name: customer.name.clone(),
            customer_email: customer.email,
            phone: customer.phone,
            tax_exempt: customer.tax_exempt,
            tax_ids,
            address_line1: customer.address.as_ref().and_then(|a| a.line1.clone()),
            address_line2: customer.address.as_ref().and_then(|a| a.line2.clone()),
            address_city: customer.address.as_ref().and_then(|a| a.city.clone()),
            address_state: customer.address.as_ref().and_then(|a| a.state.clone()),
            address_postal_code: customer.address.as_ref().and_then(|a| a.postal_code.clone()),
            address_country: customer.address.as_ref().and_then(|a| a.country.clone()),
            has_billing_info: customer.name.is_some(),
        }))
    }


    /// Check billing readiness requirements for a user
    async fn _check_billing_readiness(&self, user_id: &Uuid) -> Result<(bool, bool), AppError> {
        // Check if user has made a purchase - if not, no billing requirements
        let has_purchased = self.credit_service.has_user_made_purchase(user_id).await?;
        if !has_purchased {
            return Ok((false, false));
        }

        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Get or create Stripe customer ID
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Fetch customer and payment methods concurrently
        let (customer, payment_methods) = tokio::try_join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.list_payment_methods(&customer_id)
        ).map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        // Check payment method requirements
        let has_default_payment_method = customer.invoice_settings
            .as_ref()
            .and_then(|settings| settings.default_payment_method.as_ref())
            .is_some();
        let has_any_payment_methods = !payment_methods.is_empty();
        let is_payment_method_required = !has_default_payment_method || !has_any_payment_methods;

        // Check billing information requirements
        let is_billing_info_required = customer.name.is_none() || 
            customer.address.is_none() || 
            customer.address.as_ref().map_or(true, |addr| {
                addr.line1.is_none() || 
                addr.city.is_none() || 
                addr.postal_code.is_none() || 
                addr.country.is_none()
            });

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




    /// Store final cost for later retrieval by desktop clients
    /// This allows desktop clients to poll for final streaming costs after post-stream billing completes
    
    /// Store final streaming cost in Redis for desktop client retrieval
    pub async fn store_streaming_final_cost(
        &self,
        request_id: &str,
        final_cost_data: &FinalCostResponse,
    ) -> Result<(), AppError> {
        info!("Storing final streaming cost in Redis for desktop retrieval: request_id={}, cost=${:.4}", 
              request_id, final_cost_data.final_cost.unwrap_or(0.0));
        
        // Check if Redis is available
        if let Some(redis_client) = &self.redis_client {
            use redis::AsyncCommands;
            
            // Serialize to JSON
            let json_data = serde_json::to_string(&final_cost_data)
                .map_err(|e| AppError::Internal(format!("Failed to serialize cost data: {}", e)))?;
            
            // Store in Redis with 5 minute TTL
            let redis_key = format!("streaming_cost:{}", request_id);
            let ttl_seconds = 300; // 5 minutes
            
            let mut conn = redis_client.as_ref().clone();
            match conn.set_ex::<_, _, ()>(&redis_key, json_data, ttl_seconds).await {
                Ok(_) => {
                    info!("Final cost successfully stored in Redis: request_id={}, cost=${:.4}", 
                          request_id, final_cost_data.final_cost.unwrap_or(0.0));
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to store cost in Redis: {}", e);
                    Err(AppError::Internal(format!("Redis storage failed: {}", e)))
                }
            }
        } else {
            warn!("Redis not configured, cannot store final streaming cost");
            // Don't fail the billing if Redis is not available
            Ok(())
        }
    }

    /// Retrieve final streaming cost by request_id for desktop clients
    pub async fn get_final_streaming_cost(
        &self,
        request_id: &str,
    ) -> Result<Option<FinalCostResponse>, AppError> {
        info!("Retrieving final streaming cost from Redis: request_id={}", request_id);
        
        // Check if Redis is available
        if let Some(redis_client) = &self.redis_client {
            use redis::AsyncCommands;
            
            let redis_key = format!("streaming_cost:{}", request_id);
            let mut conn = redis_client.as_ref().clone();
            
            match conn.get::<_, Option<String>>(&redis_key).await {
                Ok(Some(json_data)) => {
                    // Deserialize the cost data
                    match serde_json::from_str::<FinalCostResponse>(&json_data) {
                        Ok(cost_data) => {
                            info!("Final cost retrieved from Redis: request_id={}, cost=${:.4}", 
                                  request_id, cost_data.final_cost.unwrap_or(0.0));
                            Ok(Some(cost_data))
                        }
                        Err(e) => {
                            error!("Failed to deserialize cost data from Redis: {}", e);
                            Err(AppError::Internal(format!("Failed to parse cost data: {}", e)))
                        }
                    }
                }
                Ok(None) => {
                    info!("No final cost found in Redis for request_id={}", request_id);
                    Ok(None)
                }
                Err(e) => {
                    error!("Failed to retrieve cost from Redis: {}", e);
                    Err(AppError::Internal(format!("Redis retrieval failed: {}", e)))
                }
            }
        } else {
            warn!("Redis not configured, cannot retrieve final streaming cost");
            Ok(None)
        }
    }

}