use crate::error::AppError;
use crate::handlers::billing::dashboard_handler::BillingDashboardData;
use crate::handlers::billing::subscription_handlers::AutoTopOffSettings;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, DetailedUsageRecord, ApiUsageEntryDto, ApiUsageRecord};
use crate::db::repositories::UserCredit;
use crate::db::repositories::customer_billing_repository::{CustomerBillingRepository, CustomerBilling};
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::model_repository::ModelRepository;
use crate::services::credit_service::CreditService;
use crate::services::audit_service::AuditService;
use uuid::Uuid;
use log::{debug, info, warn};
use std::env;
use chrono::{DateTime, Utc, Duration};
use std::sync::Arc;
use std::collections::HashSet;
use tokio::sync::Mutex;
use sqlx::PgPool;
use crate::db::connection::DatabasePools;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};

// Import Stripe service
use crate::services::stripe_service::StripeService;
// Import custom Stripe types
use crate::stripe_types::*;




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
    top_off_in_progress: Arc<Mutex<HashSet<Uuid>>>,
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
            top_off_in_progress: Arc::new(Mutex::new(HashSet::new())),
        }
    }
    
    pub async fn check_service_access(
        &self,
        user_id: &Uuid,
        _model_id: &str,
    ) -> Result<bool, AppError> {
        let user_balance = self.credit_service.get_user_balance(user_id).await?;
        
        if user_balance.balance > BigDecimal::from(0) {
            Ok(true)
        } else {
            Err(AppError::CreditInsufficient("No credits available. Please purchase credits to continue using AI services.".to_string()))
        }
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
        
        // Grant initial credits (default $5.00)
        let initial_credits = BigDecimal::from_f64(5.0).unwrap_or_else(|| BigDecimal::from(5));
        self.credit_service.adjust_credits_with_executor(
            user_id,
            &initial_credits,
            "Initial signup credits".to_string(),
            Some(serde_json::json!({"type": "signup_grant", "customer_billing_id": customer_billing_id})),
            tx,
        ).await?;
        
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
        
        info!("Created customer billing record and granted initial credits for user {}", user_id);
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

        // Fetch the user's subscription within the transaction
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

        // Get credit balance from credit service
        let credit_balance = self.credit_service.get_user_balance(user_id).await?;
        
        // Build simplified response
        let dashboard_data = BillingDashboardData {
            credit_balance_usd: credit_balance.balance.to_f64().unwrap_or(0.0),
            services_blocked: credit_balance.balance <= BigDecimal::from(0),
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
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Ensure user has customer billing
        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut transaction).await? {
            Some(customer_billing) => customer_billing,
            None => self.create_simple_customer_billing_in_tx(user_id, &mut transaction).await?,
        };
        
        let customer_id = self._get_or_create_stripe_customer_with_executor(user_id, &mut transaction).await?;
        
        transaction.commit().await
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
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Ensure user has customer billing
        let customer_billing = match self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut transaction).await? {
            Some(customer_billing) => customer_billing,
            None => self.create_simple_customer_billing_in_tx(user_id, &mut transaction).await?,
        };

        // Get customer ID within transaction
        let customer_id = self._get_or_create_stripe_customer_with_executor(user_id, &mut transaction).await?;

        // Commit transaction after customer operations
        transaction.commit().await
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
        offset: i32,
    ) -> Result<crate::models::ListInvoicesResponse, AppError> {
        debug!("Listing invoices for user: {}", user_id);

        // Ensure user has subscription and Stripe customer
        let customer_id = self.get_or_create_stripe_customer(&user_id).await?;

        // Get the Stripe service
        let stripe_service = self.stripe_service.as_ref()
            .ok_or_else(|| AppError::Internal("Stripe service not configured".to_string()))?;

        // Get total count from Stripe first without limit to know the actual total
        let all_stripe_invoices = stripe_service.list_invoices_with_filter(
            &customer_id,
            None, // No status filter
            None, // Get all invoices to count them
            None, // No cursor-based pagination for now
        ).await
            .map_err(|e| AppError::External(format!("Failed to list invoices from Stripe: {:?}", e)))?;

        let total_invoices = all_stripe_invoices.len() as i32;

        // List invoices from Stripe with pagination
        let stripe_invoices = stripe_service.list_invoices_with_filter(
            &customer_id,
            None, // No status filter
            Some((limit + offset) as u64), // Get more than needed to handle offset
            None, // No cursor-based pagination for now
        ).await
            .map_err(|e| AppError::External(format!("Failed to list invoices from Stripe: {:?}", e)))?;

        // Convert Stripe invoices to our Invoice model
        let invoices: Result<Vec<crate::models::Invoice>, AppError> = stripe_invoices
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
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

        // Fix has_more logic to correctly reflect if there are more invoices beyond current page
        let has_more = total_invoices > (offset + limit);

        Ok(crate::models::ListInvoicesResponse {
            invoices,
            total_invoices,
            has_more,
        })
    }


    /// Create a custom credit purchase checkout session
    pub async fn create_credit_purchase_checkout_session(
        &self,
        user_id: &Uuid,
        amount: f64,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Validate amount
        if amount <= 0.0 || amount > 10000.0 {
            return Err(AppError::InvalidArgument("Amount must be between $0.01 and $10,000.00".to_string()));
        }

        // Create one-time price/product for custom amount
        let product_name = format!("${:.2} Credit Top-up", amount);
        let amount_cents = (amount * 100.0) as i64;
        
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let (product, price) = stripe_service.create_product_and_price(
            &format!("{}_product", idempotency_key),
            &product_name,
            amount_cents,
            "usd",
            None, // No recurring interval for one-time payment
        ).await.map_err(|e| AppError::External(format!("Failed to create one-time price: {}", e)))?;

        // Create line items
        let line_items = vec![crate::stripe_types::checkout_session::CreateCheckoutSessionLineItems {
            price: Some(price.id.to_string()),
            quantity: Some(1),
        }];

        // Add metadata for webhook fulfillment
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "credit_purchase".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("amount".to_string(), amount.to_string());
        metadata.insert("currency".to_string(), "USD".to_string());

        // Use hardcoded URLs that match the frontend expectations
        let success_url = "http://localhost:1420/billing/success";
        let cancel_url = "http://localhost:1420/billing/cancel";

        let session = stripe_service.create_checkout_session(
            &format!("{}_session", idempotency_key),
            &customer_id,
            CHECKOUT_SESSION_MODE_PAYMENT,
            Some(line_items),
            success_url,
            cancel_url,
            metadata,
            None, // billing_address_collection not required for credit purchases
            None, // automatic_tax not required for credit purchases
            Some(true), // invoice_creation_enabled
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
            CHECKOUT_SESSION_MODE_SETUP,
            None, // No line items for setup mode
            success_url,
            cancel_url,
            metadata,
            None, // billing_address_collection not applicable for setup mode
            None, // automatic_tax not applicable for setup mode
            None, // invoice_creation_enabled not applicable for setup mode
        ).await.map_err(|e| AppError::External(format!("Failed to create setup checkout session: {}", e)))?;

        Ok(session)
    }

    /// Get auto top-off settings for a user
    pub async fn get_auto_top_off_settings(&self, user_id: &Uuid) -> Result<AutoTopOffSettings, AppError> {
        debug!("Getting auto top-off settings for user: {}", user_id);
        
        // Start transaction for atomic operations
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Get customer billing
        let customer_billing = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut transaction).await?
            .ok_or_else(|| AppError::NotFound("No customer billing record found for user".to_string()))?;

        // Commit transaction
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled: customer_billing.auto_top_off_enabled,
            threshold: customer_billing.auto_top_off_threshold.map(|t| t.to_f64().unwrap_or(0.0)),
            amount: customer_billing.auto_top_off_amount.map(|a| a.to_f64().unwrap_or(0.0)),
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
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
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
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled,
            threshold: threshold.map(|t| t.to_f64().unwrap_or(0.0)),
            amount: amount.map(|a| a.to_f64().unwrap_or(0.0)),
        };

        info!("Successfully updated auto top-off settings for user: {}", user_id);
        Ok(settings)
    }

    /// Record API usage, bill credits, and trigger auto-top-off if needed
    /// This is a wrapper around credit_service.record_and_bill_usage that adds auto top-off functionality
    pub async fn charge_for_api_usage(
        &self,
        entry: ApiUsageEntryDto,
    ) -> Result<(ApiUsageRecord, UserCredit), AppError> {
        debug!("Processing API usage and checking auto top-off for user: {}", entry.user_id);
        
        // First, record the API usage and bill credits using the existing credit service
        let (api_usage_record, user_credit) = self.credit_service.record_and_bill_usage(entry).await?;
        
        info!("Successfully billed user {} for API usage: {} (cost: {})", 
              api_usage_record.user_id, api_usage_record.service_name, api_usage_record.cost);
        
        // After successful billing, check and trigger auto top-off if needed
        // Don't fail the API call if auto top-off fails - just log the error
        if let Err(e) = self.check_and_trigger_auto_top_off(&api_usage_record.user_id).await {
            warn!("Auto top-off check failed for user {}: {}", api_usage_record.user_id, e);
        }
        
        Ok((api_usage_record, user_credit))
    }
    
    /// Check if auto top-off should be triggered and execute it if needed
    async fn check_and_trigger_auto_top_off(&self, user_id: &Uuid) -> Result<(), AppError> {
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
        
        // Check if auto top-off is already in progress for this user
        {
            let mut in_progress = self.top_off_in_progress.lock().await;
            if in_progress.contains(user_id) {
                info!("Auto top-off already in progress for user {}, skipping", user_id);
                return Ok(());
            }
            // Add user to in-progress set
            in_progress.insert(*user_id);
        }
        
        // Spawn async task to perform auto top-off
        let billing_service = self.clone();
        let user_id_clone = *user_id;
        let amount_clone = amount.clone();
        
        tokio::spawn(async move {
            let result = billing_service.perform_auto_top_off(&user_id_clone, &amount_clone).await;
            
            // Always remove user from in-progress set when done
            {
                let mut in_progress = billing_service.top_off_in_progress.lock().await;
                in_progress.remove(&user_id_clone);
            }
            
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
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 3 - database transaction failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to begin transaction: {}", e))
            })?;

        debug!("Auto top-off execution flow: step 4 - setting user context for RLS");
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 4 - setting user context failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        debug!("Auto top-off execution flow: step 5 - fetching customer billing record");
        // Get customer billing
        let customer_billing = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut transaction).await?
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
        transaction.commit().await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 7 - transaction commit failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to commit transaction: {}", e))
            })?;
        debug!("Auto top-off execution flow: step 7 completed - transaction committed successfully");

        debug!("Auto top-off execution flow: step 8 - preparing Stripe invoice creation");
        // Create and pay invoice with Stripe for the auto top-off amount
        let amount_cents = amount.to_f64().unwrap_or(0.0) * 100.0;
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
        info!("Auto top-off execution flow: step 9 completed - Stripe invoice created and paid successfully: {}", invoice.id);

        debug!("Auto top-off execution flow: step 10 - adding credits to user account");
        // If successful, add credits to the user's account
        self.credit_service.adjust_credits(
            user_id,
            amount,
            format!("Auto top-off via Stripe invoice {}", invoice.id),
            Some(serde_json::json!({
                "type": "auto_top_off",
                "stripe_invoice_id": invoice.id.to_string(),
                "amount": amount.to_f64().unwrap_or(0.0)
            })),
        ).await.map_err(|e| {
            warn!("Auto top-off execution flow: FAILED at step 10 - credit adjustment failed for user {}: {}", user_id, e);
            e
        })?;
        info!("Auto top-off execution flow: step 10 completed - credits added successfully to user {} account", user_id);

        info!("Auto top-off execution flow: COMPLETED SUCCESSFULLY - user {} topped off with amount {}", user_id, amount);
        Ok(())
    }

}