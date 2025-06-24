use crate::error::AppError;
use crate::handlers::billing::dashboard_handler::{BillingDashboardData, BillingDashboardPlanDetails, BillingDashboardSpendingDetails};
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, DetailedUsageRecord};
use crate::db::repositories::subscription_repository::{SubscriptionRepository, Subscription};
use crate::db::repositories::subscription_plan_repository::{SubscriptionPlanRepository, SubscriptionPlan};
use crate::db::repositories::spending_repository::SpendingRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::model_repository::ModelRepository;
use crate::services::cost_based_billing_service::CostBasedBillingService;
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
    cost_based_billing_service: Arc<CostBasedBillingService>,
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
        let spending_repository = Arc::new(SpendingRepository::new(db_pools.system_pool.clone()));
        let credit_transaction_repository = Arc::new(CreditTransactionRepository::new(db_pools.user_pool.clone()));
        
        // System operations use system pool (including credit balance checks for billing)
        let subscription_plan_repository = Arc::new(SubscriptionPlanRepository::new(db_pools.system_pool.clone()));
        let user_credit_repository = Arc::new(UserCreditRepository::new(db_pools.system_pool.clone()));
        let model_repository = Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone())));
        
        
        // Get default trial days from app settings
        let default_trial_days = app_settings.subscription.default_trial_days as i64;
        
        // Initialize Stripe service first before creating cost-based billing service
        let stripe_service_for_cost_billing = match (
            env::var("STRIPE_SECRET_KEY"),
            env::var("STRIPE_WEBHOOK_SECRET"), 
            env::var("STRIPE_PUBLISHABLE_KEY")
        ) {
            (Ok(secret_key), Ok(webhook_secret), Ok(publishable_key)) => {
                info!("Initializing Stripe service with async-stripe 0.41.0");
                Arc::new(StripeService::new(secret_key.clone(), webhook_secret.clone(), publishable_key.clone()))
            },
            _ => {
                warn!("Stripe environment variables not set, creating dummy service for cost-based billing");
                // Create a dummy StripeService if not configured
                Arc::new(StripeService::new("dummy".to_string(), "dummy".to_string(), "dummy".to_string()))
            }
        };

        // Create cost-based billing service with dual pools including stripe service
        let cost_based_billing_service = Arc::new(CostBasedBillingService::new(
            db_pools.clone(),
            api_usage_repository.clone(),
            subscription_repository.clone(),
            subscription_plan_repository.clone(),
            spending_repository,
            user_credit_repository,
            credit_transaction_repository,
            model_repository.clone(),
            stripe_service_for_cost_billing,
            default_trial_days,
        ));
        
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
            cost_based_billing_service,
            email_notification_service,
            audit_service,
            stripe_service,
            default_trial_days,
            app_settings,
        }
    }
    
    // COST-BASED BILLING: Check if user can access AI services based on spending limits
    pub async fn check_service_access(
        &self,
        user_id: &Uuid,
        _model_id: &str, // Model restrictions removed - all models available
    ) -> Result<bool, AppError> {
        // Get user's subscription
        let mut sub_option = self.subscription_repository.get_by_user_id(user_id).await?;
        
        if sub_option.is_none() {
            debug!("No subscription found for user {}, creating trial and initial limit", user_id);
            // Start a transaction for atomic subscription and spending limit creation
            let mut tx = self.get_db_pool().begin().await.map_err(AppError::from)?;
            
            // Set user context for RLS within the transaction
            sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
                .bind(user_id.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
            
            let new_subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut tx).await?;
            tx.commit().await.map_err(AppError::from)?;
            sub_option = Some(new_subscription);
        }
        
        let subscription = sub_option.ok_or_else(|| {
            // This error should ideally not be reached if trial creation succeeds and re-fetch works.
            // It implies failure to create or retrieve the trial subscription.
            AppError::Internal(format!("No active subscription found for user {} after attempting trial creation.", user_id))
        })?;
        
        // Check subscription status first
        match subscription.status.as_str() {
            "active" | "trialing" => {
                // Check if trial or subscription has expired
                if subscription.status == "trialing" {
                    if let Some(trial_ends_at) = subscription.trial_end {
                        if trial_ends_at < Utc::now() {
                            debug!("Trial expired for user {}", user_id);
                            return Err(AppError::Payment("Trial period has expired".to_string()));
                        }
                    }
                }
                
                let current_period_ends_at = subscription.current_period_end;
                if current_period_ends_at < Utc::now() {
                    debug!("Subscription expired for user {}", user_id);
                    return Err(AppError::Payment("Subscription has expired".to_string()));
                }
                
                // COST-BASED ACCESS CHECK: Use spending limits instead of token limits
                self.cost_based_billing_service.check_service_access(user_id).await
            },
            "canceled" | "unpaid" | "past_due" => {
                debug!("Subscription is not active for user {}: {}", user_id, subscription.status);
                Err(AppError::Payment("Subscription is not active".to_string()))
            },
            _ => {
                debug!("Unknown subscription status for user {}: {}", user_id, subscription.status);
                Err(AppError::Payment("Invalid subscription status".to_string()))
            }
        }
    }
    
    // COST-BASED BILLING: Record usage with real-time spending tracking
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
        self.cost_based_billing_service.record_usage_and_update_spending(
            user_id,
            service_name,
            tokens_input,
            tokens_output,
            cost,
            request_id,
            metadata,
            processing_ms,
            input_duration_ms,
        ).await
    }
    
    // Get current spending status for user
    pub async fn get_spending_status(&self, user_id: &Uuid) -> Result<crate::services::cost_based_billing_service::SpendingStatus, AppError> {
        self.cost_based_billing_service.get_current_spending_status(user_id).await
    }
    
    // Create a trial subscription and initial spending limit atomically
    async fn create_trial_subscription_and_limit_in_tx<'a>(
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
        
        // Create initial spending limit for the user using the same transaction
        self.cost_based_billing_service.get_or_create_current_spending_limit_in_tx(user_id, tx).await?;
        
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
        };
        
        info!("Created trial subscription and initial spending limit for user {}", user_id);
        Ok(subscription)
    }

    
    // Create a default free trial subscription for a new user (public method)
    pub async fn create_default_subscription_for_new_user(&self, user_id: &Uuid) -> Result<Subscription, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context in transaction: {}", e)))?;
            
        let subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut tx).await?;
        
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
        let customer = stripe_service.create_or_get_customer(
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
                let subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut tx).await?;
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
        let session = match stripe_service.create_billing_portal_session(
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
                        let subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut transaction).await?;
                        subscription
                    }
                }
            },
            None => {
                // Create a trial subscription and initial spending limit within the transaction
                let subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut transaction).await?;
                subscription
            }
        };

        // Get plan details using system pool (not affected by user context)
        let plan = self.get_plan_by_id(&subscription.plan_id).await?;

        // Get spending status within the same transaction context to ensure visibility
        let spending_status = self.cost_based_billing_service.get_current_spending_status_in_tx(user_id, &mut transaction).await?;
        
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

        // Build spending details
        let spending_details = BillingDashboardSpendingDetails {
            current_spending_usd: spending_status.current_spending.to_f64().unwrap_or(0.0),
            spending_limit_usd: spending_status.hard_limit.to_f64().unwrap_or(0.0),
            period_start: spending_status.billing_period_start.to_rfc3339(),
            period_end: spending_status.next_billing_date.to_rfc3339(),
        };

        // Build consolidated response
        let dashboard_data = BillingDashboardData {
            plan_details,
            spending_details,
            credit_balance_usd: spending_status.credit_balance.to_f64().unwrap_or(0.0),
            subscription_status: subscription.status.clone(),
            trial_ends_at: subscription.trial_end.map(|dt| dt.to_rfc3339()),
            services_blocked: spending_status.services_blocked,
        };

        info!("Successfully assembled billing dashboard data for user: {}", user_id);
        Ok(dashboard_data)
    }

    /// Calculate the next invoice amount based on overage and subscription
    async fn calculate_next_invoice_amount(
        &self,
        user_id: &Uuid,
        spending_status: &crate::services::cost_based_billing_service::SpendingStatus,
    ) -> Result<Option<f64>, AppError> {
        // Get user's subscription
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?;
        let subscription = match subscription {
            Some(sub) => sub,
            None => return Ok(None), // No subscription, no invoice
        };

        // Get plan details
        let plan = self.get_plan_by_id(&subscription.plan_id).await?;

        // Calculate base subscription amount (monthly price)
        let base_amount = &plan.base_price_monthly;

        // Calculate overage charges using cost markup percentage
        let overage_amount = if spending_status.overage_amount > BigDecimal::from(0) {
            &spending_status.overage_amount * &plan.cost_markup_percentage
        } else {
            BigDecimal::from(0)
        };

        // Total next invoice amount
        let total_amount = base_amount + &overage_amount;

        // Convert to f64 for return (this is acceptable here as it's for display purposes)
        let amount_f64 = total_amount.to_f64().unwrap_or(0.0);

        // Return None if amount is 0 (free plans)
        if amount_f64 <= 0.0 {
            Ok(None)
        } else {
            Ok(Some(amount_f64))
        }
    }

    /// Get access to the cost-based billing service
    pub fn get_cost_based_billing_service(&self) -> &Arc<CostBasedBillingService> {
        &self.cost_based_billing_service
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
            None => self.create_trial_subscription_and_limit_in_tx(user_id, &mut transaction).await?,
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
        let subscription = match stripe_service.create_subscription_with_trial(
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
            None => self.create_trial_subscription_and_limit_in_tx(user_id, &mut transaction).await?,
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
            None => self.create_trial_subscription_and_limit_in_tx(user_id, &mut transaction).await?,
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

        // List invoices from Stripe
        let stripe_invoices = stripe_service.list_invoices(&customer_id).await
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

        // For simplicity, assume total_invoices equals the current batch size
        // In a real implementation, you'd make a separate count query
        let total_invoices = invoices.len() as i32;
        let has_more = invoices.len() == limit as usize;

        Ok(crate::models::ListInvoicesResponse {
            invoices,
            total_invoices,
            has_more,
        })
    }

    /// Set the default payment method for a user
    pub async fn set_default_payment_method(
        &self,
        user_id: &Uuid,
        payment_method_id: &str,
    ) -> Result<stripe::Customer, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Get customer ID
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Set default payment method via Stripe service
        stripe_service.set_default_payment_method(&customer_id, payment_method_id).await
            .map_err(|e| AppError::External(format!("Failed to set default payment method: {}", e)))
    }

    /// Detach a payment method from a user
    pub async fn detach_payment_method(
        &self,
        user_id: &Uuid,
        payment_method_id: &str,
    ) -> Result<stripe::PaymentMethod, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Verify the user owns this payment method by checking their customer ID
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        let payment_methods = stripe_service.list_payment_methods(&customer_id).await
            .map_err(|e| AppError::External(format!("Failed to list payment methods: {}", e)))?;
        
        // Check if the payment method belongs to this customer
        let payment_method_exists = payment_methods.iter()
            .any(|pm| pm.id.to_string() == payment_method_id);
        
        if !payment_method_exists {
            return Err(AppError::Forbidden("Payment method does not belong to this user".to_string()));
        }

        // Detach payment method via Stripe service
        stripe_service.detach_payment_method(payment_method_id).await
            .map_err(|e| AppError::External(format!("Failed to detach payment method: {}", e)))
    }

    /// Create a credit purchase checkout session
    pub async fn create_credit_checkout_session(
        &self,
        user_id: &Uuid,
        credit_pack_id: &str,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<stripe::CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Get credit pack details
        let credit_service = crate::services::credit_service::CreditService::new(self.db_pools.clone());
        let credit_pack = credit_service.get_credit_pack_by_id(credit_pack_id).await?
            .ok_or_else(|| AppError::NotFound("Credit pack not found".to_string()))?;

        // Create line items
        let line_items = vec![stripe::CreateCheckoutSessionLineItems {
            price: Some(credit_pack.stripe_price_id.parse()
                .map_err(|_| AppError::Configuration("Invalid Stripe price ID".to_string()))?),
            quantity: Some(1),
            ..Default::default()
        }];

        // Add metadata
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "credit_purchase".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("credit_pack_id".to_string(), credit_pack_id.to_string());
        metadata.insert("credit_amount".to_string(), credit_pack.value_credits.to_string());

        let session = stripe_service.create_checkout_session(
            &customer_id,
            stripe::CheckoutSessionMode::Payment,
            Some(line_items),
            success_url,
            cancel_url,
            metadata,
        ).await.map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;

        Ok(session)
    }


    /// Create a subscription checkout session
    pub async fn create_subscription_checkout_session(
        &self,
        user_id: &Uuid,
        plan_id: &str,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<stripe::CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Get plan details
        let plan = self.get_plan_by_id(plan_id).await?;
        let price_id = plan.stripe_price_id_monthly
            .ok_or_else(|| AppError::Configuration(format!("No Stripe price ID for plan: {}", plan_id)))?;

        // Create line items
        let line_items = vec![stripe::CreateCheckoutSessionLineItems {
            price: Some(price_id.parse()
                .map_err(|_| AppError::Configuration("Invalid Stripe price ID".to_string()))?),
            quantity: Some(1),
            ..Default::default()
        }];

        // Add metadata
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "subscription".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("plan_id".to_string(), plan_id.to_string());

        let session = stripe_service.create_checkout_session(
            &customer_id,
            stripe::CheckoutSessionMode::Subscription,
            Some(line_items),
            success_url,
            cancel_url,
            metadata,
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
        success_url: &str,
        cancel_url: &str,
    ) -> Result<stripe::CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Add metadata for setup payment method
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "setup_payment_method".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());

        let session = stripe_service.create_checkout_session(
            &customer_id,
            stripe::CheckoutSessionMode::Setup,
            None, // No line items for setup mode
            success_url,
            cancel_url,
            metadata,
        ).await.map_err(|e| AppError::External(format!("Failed to create setup checkout session: {}", e)))?;

        Ok(session)
    }

}