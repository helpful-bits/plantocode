use crate::error::AppError;
use crate::handlers::billing::dashboard_handler::{BillingDashboardData, BillingDashboardPlanDetails};
use crate::handlers::billing::subscription_handlers::AutoTopOffSettings;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, DetailedUsageRecord};
use crate::db::repositories::subscription_repository::{SubscriptionRepository, Subscription};
use crate::db::repositories::subscription_plan_repository::{SubscriptionPlanRepository, SubscriptionPlan};
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::model_repository::ModelRepository;
use crate::services::credit_service::CreditService;
use crate::services::email_notification_service::EmailNotificationService;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::utils::error_handling::{retry_with_backoff, RetryConfig, validate_amount, validate_currency};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use log::{debug, error, info, warn};
use std::env;
use chrono::{DateTime, Utc, Duration, Datelike};
use std::sync::Arc;
use sqlx::PgPool;
use crate::db::connection::DatabasePools;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};

// Import Stripe service
use crate::services::stripe_service::{StripeService, StripeServiceError};
// Import Stripe types directly for enum matching
use stripe::InvoiceStatus;




#[derive(Clone)]
pub struct BillingService {
    db_pools: DatabasePools,
    subscription_repository: Arc<SubscriptionRepository>,
    subscription_plan_repository: Arc<SubscriptionPlanRepository>,
    api_usage_repository: Arc<ApiUsageRepository>,
    credit_service: Arc<CreditService>,
    email_notification_service: Option<Arc<EmailNotificationService>>,
    audit_service: Arc<AuditService>,
    stripe_service: Option<StripeService>,
    default_trial_days: i64,
    app_settings: crate::config::settings::AppSettings,
}

impl BillingService {
    pub fn new(
        db_pools: DatabasePools,
        app_settings: crate::config::settings::AppSettings,
    ) -> Self {
        // Create repositories with appropriate pools
        // User-specific operations use user pool (subject to RLS)
        let subscription_repository = Arc::new(SubscriptionRepository::new(db_pools.user_pool.clone()));
        let api_usage_repository = Arc::new(ApiUsageRepository::new(db_pools.user_pool.clone()));
        
        // System operations use system pool (plans, models, etc.)
        let subscription_plan_repository = Arc::new(SubscriptionPlanRepository::new(db_pools.system_pool.clone()));
        let model_repository = Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone())));
        
        // Note: CreditService handles its own pool configuration for user credit operations
        
        
        // Get default trial days from app settings
        let default_trial_days = app_settings.subscription.default_trial_days as i64;
        
        // Create credit service for pure prepaid billing
        let credit_service = Arc::new(CreditService::new(db_pools.clone()));
        
        // Create email notification service
        let email_notification_service = match EmailNotificationService::new(db_pools.clone()) {
            Ok(service) => {
                info!("Email notification service initialized successfully");
                Some(Arc::new(service))
            },
            Err(e) => {
                warn!("Failed to initialize EmailNotificationService: {}", e);
                None
            }
        };
        
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
            subscription_repository,
            subscription_plan_repository,
            api_usage_repository,
            credit_service,
            email_notification_service,
            audit_service,
            stripe_service,
            default_trial_days,
            app_settings,
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
    
    pub async fn record_ai_service_usage(
        &self,
        user_id: &Uuid,
        service_name: &str,
        tokens_input: i32,
        tokens_output: i32,
        cost: &bigdecimal::BigDecimal,
        request_id: Option<String>,
        metadata: Option<serde_json::Value>,
        processing_ms: Option<i32>,
        input_duration_ms: Option<i64>,
    ) -> Result<(), AppError> {
        let api_usage_record = self.api_usage_repository.record_usage(crate::db::repositories::api_usage_repository::ApiUsageEntryDto {
            user_id: *user_id,
            service_name: service_name.to_string(),
            tokens_input,
            tokens_output,
            cost: cost.clone(),
            request_id,
            metadata: metadata.clone(),
            processing_ms,
            input_duration_ms,
        }).await?;
        let api_usage_id = api_usage_record.id.ok_or_else(|| AppError::Database("Failed to get API usage record ID".to_string()))?;
        
        let usage_description = format!("{} - {} tokens in, {} tokens out", service_name, tokens_input, tokens_output);
        self.credit_service.consume_credits_for_usage_in_tx(
            user_id,
            cost,
            usage_description,
            Some(api_usage_id),
            metadata,
        ).await?;
        
        Ok(())
    }
    
    
    // Create a trial subscription and grant initial credits atomically
    async fn create_trial_subscription_with_credits_in_tx<'a>(
        &self, 
        user_id: &Uuid, 
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>
    ) -> Result<Subscription, AppError>
    {
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        let now = Utc::now();
        let trial_ends_at = now + Duration::days(self.default_trial_days);
        
        // Create subscription with trial period
        let subscription_id = self.subscription_repository.create_with_executor(
            user_id,
            "free", // Default plan for trial
            "trialing",
            None,
            None,
            Some(trial_ends_at),
            trial_ends_at, // Current period ends when trial ends
            tx,
        ).await?;
        
        // Grant initial trial credits (e.g., $5.00 worth of credits)
        let initial_credits = BigDecimal::from_f64(5.0).unwrap_or_else(|| BigDecimal::from(5));
        self.credit_service.adjust_credits_with_executor(
            user_id,
            &initial_credits,
            "Initial trial credits".to_string(),
            Some(serde_json::json!({"type": "trial_grant", "subscription_id": subscription_id})),
            tx,
        ).await?;
        
        // Instead of retrieving from database, construct the subscription from known data
        let subscription = Subscription {
            id: subscription_id,
            user_id: *user_id,
            stripe_customer_id: None,
            stripe_subscription_id: None,
            plan_id: "free".to_string(),
            status: "trialing".to_string(),
            cancel_at_period_end: false,
            created_at: now,
            updated_at: now,
            stripe_plan_id: "free".to_string(),
            current_period_start: now,
            current_period_end: trial_ends_at,
            trial_start: Some(now),
            trial_end: Some(trial_ends_at),
            pending_plan_id: None,
            auto_top_off_enabled: false,
            auto_top_off_threshold: None,
            auto_top_off_amount: None,
        };
        
        info!("Created trial subscription and granted initial credits for user {}", user_id);
        Ok(subscription)
    }

    
    pub async fn create_default_subscription_for_new_user(&self, user_id: &Uuid) -> Result<Subscription, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
            
        let subscription = self.create_trial_subscription_with_credits_in_tx(user_id, &mut tx).await?;
        
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            
        Ok(subscription)
    }

    // Ensure user has a subscription, create default one if missing
    pub async fn ensure_user_has_subscription(&self, user_id: &Uuid) -> Result<Subscription, AppError> {
        // First try to get existing subscription
        if let Some(existing_subscription) = self.subscription_repository.get_by_user_id(user_id).await? {
            return Ok(existing_subscription);
        }
        
        // No subscription exists, create default one
        info!("User {} has no subscription, creating default free trial subscription", user_id);
        self.create_default_subscription_for_new_user(user_id).await
    }

    // Get the database pool for use by other components
    pub fn get_db_pool(&self) -> PgPool {
        self.subscription_repository.get_pool().clone()
    }
    
    // Get the full database pools structure for use by other services
    pub fn get_db_pools(&self) -> &DatabasePools {
        &self.db_pools
    }
    
    // Get the system database pool for operations requiring vibe_manager_app role
    pub fn get_system_db_pool(&self) -> PgPool {
        self.db_pools.system_pool.clone()
    }
    
    // Get plan by ID from database
    async fn get_plan_by_id(&self, plan_id: &str) -> Result<SubscriptionPlan, AppError> {
        self.subscription_plan_repository.get_plan_by_id(plan_id).await
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
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, tx).await?
            .ok_or_else(|| AppError::NotFound(format!("No subscription found for user {}", user_id)))?;

        // Check if subscription already has a Stripe customer ID
        if let Some(ref customer_id) = subscription.stripe_customer_id {
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
            subscription.stripe_customer_id.as_deref(),
        ).await.map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;

        // Update the subscription with the customer ID within the transaction
        self.subscription_repository.set_stripe_customer_id_with_executor(&subscription.id, &customer.id, tx).await?;
        info!("Updated subscription {} with Stripe customer ID: {}", subscription.id, customer.id);

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

        // Ensure user has a subscription, create default one if missing
        let subscription = match self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(subscription) => subscription,
            None => {
                info!("User {} accessing billing portal has no subscription, creating default subscription", user_id);
                let subscription = self.create_trial_subscription_with_credits_in_tx(user_id, &mut tx).await?;
                subscription
            }
        };

        // Get or create Stripe customer ID within the transaction
        let customer_id = if let Some(existing_customer_id) = &subscription.stripe_customer_id {
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

        // Start transaction for atomic operations
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Get subscription details - create trial if none exists
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await?;
        let subscription = match subscription {
            Some(sub) => {
                // Check if subscription status is valid (active or trialing)
                match sub.status.as_str() {
                    "active" | "trialing" => sub,
                    _ => {
                        // Create a trial subscription for invalid status
                        let subscription = self.create_trial_subscription_with_credits_in_tx(user_id, &mut transaction).await?;
                        subscription
                    }
                }
            },
            None => {
                // Create a trial subscription and initial spending limit within the transaction
                let subscription = self.create_trial_subscription_with_credits_in_tx(user_id, &mut transaction).await?;
                subscription
            }
        };

        // Get plan details using system pool (not affected by user context)
        let plan = self.get_plan_by_id(&subscription.plan_id).await?;

        // Get credit balance from credit service
        let credit_balance = self.credit_service.get_user_balance_with_executor(user_id, &mut transaction).await?;
        
        // Commit transaction after all operations
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        // Build plan details
        let plan_details = BillingDashboardPlanDetails {
            plan_id: plan.id.clone(),
            name: plan.name.clone(),
            price_usd: plan.base_price_monthly.to_f64().unwrap_or(0.0),
            billing_interval: "monthly".to_string(),
        };

        // Build consolidated response with correct subscription status
        let dashboard_data = BillingDashboardData {
            plan_details,
            credit_balance_usd: credit_balance.balance.to_f64().unwrap_or(0.0),
            subscription_status: subscription.status.clone(),
            trial_ends_at: subscription.trial_end.map(|dt| dt.to_rfc3339()),
            services_blocked: credit_balance.balance <= BigDecimal::from(0),
        };

        info!("Successfully assembled billing dashboard data for user: {}", user_id);
        Ok(dashboard_data)
    }


    /// Get access to the credit service
    pub fn get_credit_service(&self) -> &Arc<CreditService> {
        &self.credit_service
    }

    /// Get access to the subscription repository
    pub fn get_subscription_repository(&self) -> &Arc<SubscriptionRepository> {
        &self.subscription_repository
    }

    /// Get access to the audit service
    pub fn get_audit_service(&self) -> &Arc<AuditService> {
        &self.audit_service
    }



    /// Create a subscription with 1-day trial using the new Stripe service
    pub async fn create_subscription_with_trial(
        &self,
        user_id: &Uuid,
        plan_id: &str,
    ) -> Result<stripe::Subscription, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Start transaction for atomic operations
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Get plan details
        let plan = self.get_plan_by_id(plan_id).await?;
        let price_id = plan.stripe_price_id_monthly.clone()
            .ok_or_else(|| AppError::Configuration(format!("No Stripe price ID for plan: {}", plan_id)))?;

        // Ensure user has subscription
        let mut subscription = match self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await? {
            Some(subscription) => subscription,
            None => self.create_trial_subscription_with_credits_in_tx(user_id, &mut transaction).await?,
        };

        // Get or create Stripe customer within transaction
        let customer_id = self._get_or_create_stripe_customer_with_executor(user_id, &mut transaction).await?;
        
        // Refresh subscription to get any updates from customer creation
        if let Some(updated_subscription) = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await? {
            subscription = updated_subscription;
        }

        // Add comprehensive metadata for subscription tracking
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("plan_id".to_string(), plan_id.to_string());
        metadata.insert("trial_days".to_string(), "1".to_string());
        metadata.insert("subscription_type".to_string(), "trial_to_paid".to_string());
        metadata.insert("created_at".to_string(), Utc::now().to_rfc3339());
        metadata.insert("source".to_string(), "billing_service".to_string());

        // Create subscription with 1-day trial
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let subscription = match stripe_service.create_subscription_with_trial(
            &idempotency_key,
            &customer_id,
            &price_id,
            Some(1), // 1-day trial
            metadata,
        ).await {
            Ok(sub) => sub,
            Err(e) => {
                let _ = transaction.rollback().await;
                return Err(AppError::External(format!("Failed to create subscription: {}", e)));
            }
        };

        // Commit transaction after successful Stripe operations
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(subscription)
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
        
        // Ensure user has subscription
        let subscription = match self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await? {
            Some(subscription) => subscription,
            None => self.create_trial_subscription_with_credits_in_tx(user_id, &mut transaction).await?,
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

        // Ensure user has subscription
        let subscription = match self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await? {
            Some(subscription) => subscription,
            None => self.create_trial_subscription_with_credits_in_tx(user_id, &mut transaction).await?,
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
            .map(|pm| match pm {
                stripe::Expandable::Id(id) => id.to_string(),
                stripe::Expandable::Object(pm_obj) => pm_obj.id.to_string(),
            });

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


    /// Comprehensive subscription synchronization from Stripe webhooks
    /// This method ensures the local database is an accurate mirror of Stripe's subscription state
    pub async fn sync_subscription_from_webhook(&self, stripe_sub: &stripe::Subscription) -> Result<(), AppError> {
        info!("Syncing subscription from webhook: {}", stripe_sub.id);
        
        // Find user by Stripe customer ID
        let user_repo = crate::db::repositories::user_repository::UserRepository::new(
            self.db_pools.system_pool.clone()
        );
        let customer_id = stripe_sub.customer.id().to_string();
        
        let user = user_repo.get_by_stripe_customer_id(&customer_id).await?;
        info!("Found user {} for customer {}", user.id, customer_id);
        
        // Start a database transaction for atomic updates
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user.id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
        
        // Find local subscription by user_id
        let mut local_subscription = self.subscription_repository.get_by_user_id_with_executor(&user.id, &mut tx).await?
            .ok_or_else(|| {
                error!("No local subscription found for user {} during webhook sync", user.id);
                AppError::Database(format!("No local subscription found for user {}", user.id))
            })?;
        
        info!("Found local subscription {} for user {}", local_subscription.id, user.id);
        
        // Extract plan ID from Stripe subscription items
        let stripe_plan_id = stripe_sub.items.data
            .first()
            .and_then(|item| item.price.as_ref())
            .map(|price| price.id.to_string())
            .unwrap_or_else(|| local_subscription.plan_id.clone());
        
        // Convert timestamps from Stripe (Unix timestamps) to DateTime<Utc>
        let current_period_start = DateTime::from_timestamp(stripe_sub.current_period_start, 0)
            .unwrap_or_else(|| local_subscription.current_period_start);
        
        let current_period_end = DateTime::from_timestamp(stripe_sub.current_period_end, 0)
            .unwrap_or_else(|| local_subscription.current_period_end);
        
        let trial_start = stripe_sub.trial_start
            .and_then(|ts| DateTime::from_timestamp(ts, 0));
        
        let trial_end = stripe_sub.trial_end
            .and_then(|ts| DateTime::from_timestamp(ts, 0));
        
        local_subscription.stripe_customer_id = Some(customer_id);
        local_subscription.stripe_subscription_id = Some(stripe_sub.id.to_string());
        local_subscription.status = match stripe_sub.status {
            stripe::SubscriptionStatus::Active => "active".to_string(),
            stripe::SubscriptionStatus::Canceled => "canceled".to_string(),
            stripe::SubscriptionStatus::Incomplete => "incomplete".to_string(),
            stripe::SubscriptionStatus::IncompleteExpired => "incomplete_expired".to_string(),
            stripe::SubscriptionStatus::PastDue => "past_due".to_string(),
            stripe::SubscriptionStatus::Trialing => "trialing".to_string(),
            stripe::SubscriptionStatus::Unpaid => "unpaid".to_string(),
            stripe::SubscriptionStatus::Paused => "paused".to_string(),
        };
        local_subscription.cancel_at_period_end = stripe_sub.cancel_at_period_end;
        local_subscription.stripe_plan_id = stripe_plan_id;
        local_subscription.current_period_start = current_period_start;
        local_subscription.current_period_end = current_period_end;
        local_subscription.trial_start = trial_start;
        local_subscription.trial_end = trial_end;
        // Auto top-off settings are not updated from Stripe webhooks, keeping existing values
        
        // Update the subscription in the database
        self.subscription_repository.update_with_executor(&local_subscription, &mut tx).await
            .map_err(|e| {
                error!("Failed to update subscription {} during webhook sync: {}", local_subscription.id, e);
                e
            })?;
        
        // Commit the transaction
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit subscription sync transaction: {}", e)))?;
        
        info!("Successfully synced subscription {} from Stripe webhook for user {}", 
              stripe_sub.id, user.id);
        
        // Log the comprehensive sync for audit purposes
        info!("Webhook sync details - Status: {}, Plan: {}, Period: {} to {}, Trial: {} to {}, Cancel at period end: {}", 
              local_subscription.status,
              local_subscription.stripe_plan_id,
              local_subscription.current_period_start.to_rfc3339(),
              local_subscription.current_period_end.to_rfc3339(),
              local_subscription.trial_start.map(|ts| ts.to_rfc3339()).unwrap_or_else(|| "none".to_string()),
              local_subscription.trial_end.map(|ts| ts.to_rfc3339()).unwrap_or_else(|| "none".to_string()),
              local_subscription.cancel_at_period_end);
        
        Ok(())
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
                // Validate critical fields that should never be missing
                let created = stripe_invoice.created
                    .ok_or_else(|| AppError::External("Invalid invoice: missing created timestamp".to_string()))?;
                
                let currency = stripe_invoice.currency
                    .ok_or_else(|| AppError::External("Invalid invoice: missing currency".to_string()))?
                    .to_string();
                
                // amount_due and amount_paid can legitimately be 0, but shouldn't be missing
                let amount_due = stripe_invoice.amount_due
                    .ok_or_else(|| AppError::External("Invalid invoice: missing amount_due".to_string()))?;
                    
                let amount_paid = stripe_invoice.amount_paid
                    .ok_or_else(|| AppError::External("Invalid invoice: missing amount_paid".to_string()))?;

                Ok(crate::models::Invoice {
                    id: stripe_invoice.id.to_string(),
                    created,
                    due_date: stripe_invoice.due_date,
                    amount_due,
                    amount_paid,
                    currency,
                    status: format!("{:?}", stripe_invoice.status.unwrap_or(InvoiceStatus::Draft)),
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
    pub async fn create_custom_credit_checkout_session(
        &self,
        user_id: &Uuid,
        amount: f64,
    ) -> Result<stripe::CheckoutSession, AppError> {
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
            stripe::Currency::USD,
            None, // No recurring interval for one-time payment
        ).await.map_err(|e| AppError::External(format!("Failed to create one-time price: {}", e)))?;

        // Create line items
        let line_items = vec![stripe::CreateCheckoutSessionLineItems {
            price: Some(price.id.to_string().parse()
                .map_err(|_| AppError::Configuration("Invalid Stripe price ID".to_string()))?),
            quantity: Some(1),
            ..Default::default()
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
            stripe::CheckoutSessionMode::Payment,
            Some(line_items),
            success_url,
            cancel_url,
            metadata,
            None, // billing_address_collection not required for credit purchases
            None, // automatic_tax not required for credit purchases
        ).await.map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;

        Ok(session)
    }


    /// Create a subscription checkout session
    pub async fn create_subscription_checkout_session(
        &self,
        user_id: &Uuid,
        plan_id: &str,
    ) -> Result<stripe::CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Get plan details
        let plan = self.get_plan_by_id(plan_id).await?;
        let price_id = plan.stripe_price_id_monthly
            .ok_or_else(|| AppError::Configuration(format!("No Stripe price ID for plan: {}", plan_id)))?;

        // Check if stripe_price_id_monthly is not empty
        if price_id.is_empty() {
            return Err(AppError::Configuration("Stripe price ID monthly is empty for plan".to_string()));
        }

        // Create line items
        let line_items = vec![stripe::CreateCheckoutSessionLineItems {
            price: Some(price_id.parse()
                .map_err(|_| AppError::Configuration("Invalid Stripe price ID".to_string()))?),
            quantity: Some(1),
            ..Default::default()
        }];

        // Add metadata for webhook fulfillment
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "subscription".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("plan_id".to_string(), plan_id.to_string());

        // Use hardcoded URLs that match the frontend expectations
        let success_url = "http://localhost:1420/billing/success";
        let cancel_url = "http://localhost:1420/billing/cancel";

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service.create_checkout_session(
            &idempotency_key,
            &customer_id,
            stripe::CheckoutSessionMode::Subscription,
            Some(line_items),
            success_url,
            cancel_url,
            metadata,
            Some(true), // billing_address_collection: required
            Some(true), // automatic_tax: enabled
        ).await.map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;

        Ok(session)
    }

    /// Get checkout session status
    pub async fn get_checkout_session_status(
        &self,
        session_id: &str,
    ) -> Result<stripe::CheckoutSession, AppError> {
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
    ) -> Result<stripe::CheckoutSession, AppError> {
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
            stripe::CheckoutSessionMode::Setup,
            None, // No line items for setup mode
            success_url,
            cancel_url,
            metadata,
            None, // billing_address_collection not applicable for setup mode
            None, // automatic_tax not applicable for setup mode
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

        // Get subscription
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await?
            .ok_or_else(|| AppError::NotFound("No subscription found for user".to_string()))?;

        // Commit transaction
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled: subscription.auto_top_off_enabled,
            threshold: subscription.auto_top_off_threshold.map(|t| t.to_f64().unwrap_or(0.0)),
            amount: subscription.auto_top_off_amount.map(|a| a.to_f64().unwrap_or(0.0)),
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

        // Get subscription
        let mut subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await?
            .ok_or_else(|| AppError::NotFound("No subscription found for user".to_string()))?;

        // Update the subscription with new auto top-off settings
        subscription.auto_top_off_enabled = enabled;
        subscription.auto_top_off_threshold = threshold;
        subscription.auto_top_off_amount = amount;

        // Save the updated subscription
        self.subscription_repository.update_with_executor(&subscription, &mut transaction).await?;

        // Commit transaction
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled: subscription.auto_top_off_enabled,
            threshold: subscription.auto_top_off_threshold.map(|t| t.to_f64().unwrap_or(0.0)),
            amount: subscription.auto_top_off_amount.map(|a| a.to_f64().unwrap_or(0.0)),
        };

        info!("Successfully updated auto top-off settings for user: {}", user_id);
        Ok(settings)
    }

    /// Perform auto top-off using customer's default payment method
    pub async fn perform_auto_top_off(&self, user_id: &Uuid, amount: &BigDecimal) -> Result<(), AppError> {
        info!("Performing auto top-off for user {} with amount {}", user_id, amount);
        
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => {
                warn!("Stripe not configured, cannot perform auto top-off for user {}", user_id);
                return Err(AppError::Configuration("Stripe not configured".to_string()));
            }
        };

        // Start transaction for atomic operations
        let mut transaction = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;

        // Get subscription
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut transaction).await?
            .ok_or_else(|| AppError::NotFound("No subscription found for user".to_string()))?;

        // Get customer ID
        let customer_id = subscription.stripe_customer_id
            .ok_or_else(|| AppError::Configuration("User has no Stripe customer ID".to_string()))?;

        // Commit transaction (no longer needed)
        transaction.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        // Create and pay invoice with Stripe for the auto top-off amount
        let amount_cents = amount.to_f64().unwrap_or(0.0) * 100.0;
        let idempotency_key = format!("auto_topoff_{}_{}", user_id, Utc::now().timestamp());
        
        // Create invoice item and invoice, then pay it
        let invoice = stripe_service.create_and_pay_invoice(
            &idempotency_key,
            &customer_id,
            amount_cents as i64,
            "USD",
            &format!("Automatic credit top-off for ${}", amount),
        ).await.map_err(|e| AppError::External(format!("Failed to create and pay auto top-off invoice: {}", e)))?;

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
        ).await?;

        info!("Successfully completed auto top-off for user {} with amount {}", user_id, amount);
        Ok(())
    }

}