use crate::error::AppError;
use crate::handlers::billing::dashboard_handler::{BillingDashboardData, BillingDashboardPlanDetails, BillingDashboardSpendingDetails};
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::{SubscriptionRepository, Subscription};
use crate::db::repositories::subscription_plan_repository::{SubscriptionPlanRepository, SubscriptionPlan};
use crate::db::repositories::spending_repository::SpendingRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::services::email_notification_service::EmailNotificationService;
use crate::services::audit_service::{AuditService, AuditContext};
use crate::utils::error_handling::{retry_with_backoff, RetryConfig, validate_amount, validate_currency};
use crate::utils::stripe_currency_utils::{generate_idempotency_key, validate_stripe_amount_matches};
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

// Invoice response structures
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceSummary {
    pub total_amount: f64,
    pub paid_amount: f64,
    pub outstanding_amount: f64,
    pub overdue_amount: f64,
    pub currency: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceHistoryResponse {
    pub invoices: Vec<serde_json::Value>,
    pub summary: InvoiceSummary,
    pub total_count: usize,
    pub has_more: bool,
}

// Subscription details response structures
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionDetailsResponse {
    pub plan: String,
    pub plan_name: Option<String>,
    pub status: String,
    pub trial_ends_at: Option<DateTime<Utc>>,
    pub current_period_ends_at: Option<DateTime<Utc>>,
    pub monthly_spending_allowance: Option<f64>,
    pub hard_spending_limit: Option<f64>,
    pub is_trialing: bool,
    pub has_cancelled: bool,
    pub next_invoice_amount: Option<f64>,
    pub currency: String,
    pub usage: UsageInfo,
    pub credit_balance: f64,
    pub pending_plan_id: Option<String>,
    pub cancel_at_period_end: bool,
    pub management_state: String,
    pub subscription_id: Option<String>,
    pub customer_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub total_cost: f64,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub monthly_limit: Option<f64>,
    pub hard_limit: Option<f64>,
    pub remaining_allowance: Option<f64>,
}


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
        let spending_repository = Arc::new(SpendingRepository::new(db_pools.user_pool.clone()));
        let credit_transaction_repository = Arc::new(CreditTransactionRepository::new(db_pools.user_pool.clone()));
        
        // System operations use system pool (including credit balance checks for billing)
        let subscription_plan_repository = Arc::new(SubscriptionPlanRepository::new(db_pools.system_pool.clone()));
        let user_credit_repository = Arc::new(UserCreditRepository::new(db_pools.system_pool.clone()));
        
        
        // Create cost-based billing service with dual pools
        let cost_based_billing_service = Arc::new(CostBasedBillingService::new(
            db_pools.clone(),
            api_usage_repository.clone(),
            subscription_repository.clone(),
            subscription_plan_repository.clone(),
            spending_repository,
            user_credit_repository,
            credit_transaction_repository,
        ));
        
        // Create email notification service
        let email_notification_service = match EmailNotificationService::new(db_pools.system_pool.clone()) {
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
        let audit_service = Arc::new(AuditService::new(db_pools.system_pool.clone()));
        
        // Get default trial days from app settings
        let default_trial_days = app_settings.subscription.default_trial_days as i64;
        
        // Initialize Stripe service if environment variables are set
        let stripe_service = match (
            env::var("STRIPE_SECRET_KEY"),
            env::var("STRIPE_WEBHOOK_SECRET"), 
            env::var("STRIPE_PUBLISHABLE_KEY")
        ) {
            (Ok(secret_key), Ok(webhook_secret), Ok(publishable_key)) => {
                info!("Initializing Stripe service with async-stripe 0.41.0");
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
                    if let Some(trial_ends_at) = subscription.trial_ends_at {
                        if trial_ends_at < Utc::now() {
                            debug!("Trial expired for user {}", user_id);
                            return Err(AppError::Payment("Trial period has expired".to_string()));
                        }
                    }
                }
                
                if let Some(current_period_ends_at) = subscription.current_period_ends_at {
                    if current_period_ends_at < Utc::now() {
                        debug!("Subscription expired for user {}", user_id);
                        return Err(AppError::Payment("Subscription has expired".to_string()));
                    }
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
        
        // Fetch the created subscription to return it
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, tx).await?
            .ok_or_else(|| AppError::Internal("Failed to retrieve newly created subscription".to_string()))?;
        
        info!("Created trial subscription and initial spending limit for user {}", user_id);
        Ok(subscription)
    }

    
    // Create a default free trial subscription for a new user (public method)
    pub async fn create_default_subscription_for_new_user(&self, user_id: &Uuid) -> Result<Subscription, AppError> {
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
            
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
    
    // Get the system database pool for operations requiring vibe_manager_app role
    pub fn get_system_db_pool(&self) -> PgPool {
        self.db_pools.system_pool.clone()
    }
    
    // Get plan by ID from database
    async fn get_plan_by_id(&self, plan_id: &str) -> Result<SubscriptionPlan, AppError> {
        self.subscription_plan_repository.get_plan_by_id(plan_id).await
    }
    
    
    // Get or create a Stripe customer for a user (internal method)
    async fn get_or_create_stripe_customer_internal(&self, user_id: &Uuid) -> Result<String, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Check if user already has a subscription with a Stripe customer ID
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?;
        
        if let Some(ref sub) = subscription {
            if let Some(ref customer_id) = sub.stripe_customer_id {
                return Ok(customer_id.clone());
            }
        }

        // Get user details from database
        let user = crate::db::repositories::user_repository::UserRepository::new(
            self.db_pools.system_pool.clone()
        ).get_by_id(user_id).await?;

        // Create a new Stripe customer
        let customer = stripe_service.create_or_get_customer(
            user_id,
            &user.email,
            user.full_name.as_deref(),
            subscription.as_ref().and_then(|s| s.stripe_customer_id.as_deref()),
        ).await.map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;

        // Update the subscription with the customer ID
        if let Some(mut sub) = subscription {
            sub.stripe_customer_id = Some(customer.id.to_string());
            self.subscription_repository.update(&sub).await?;
        }

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

        // Ensure user has a subscription, create default one if missing
        let subscription = match self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await? {
            Some(subscription) => subscription,
            None => {
                info!("User {} accessing billing portal has no subscription, creating default subscription", user_id);
                // Commit current transaction and start fresh for subscription creation
                tx.commit().await
                    .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
                
                // Create default subscription
                let subscription = self.create_default_subscription_for_new_user(user_id).await?;
                
                // Start new transaction for portal creation
                tx = self.db_pools.user_pool.begin().await
                    .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
                
                subscription
            }
        };

        // Portal access is now simplified without state tracking

        // Get customer ID
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Create portal session
        let session = match stripe_service.create_billing_portal_session(
            &customer_id,
            &self.app_settings.stripe.success_url,
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
    
    
    // Get subscription details for a user (legacy method for backward compatibility)
    pub async fn get_subscription_details(
        &self,
        user_id: &Uuid,
    ) -> Result<serde_json::Value, AppError> {
        // Use the new method and convert to JSON for backward compatibility
        let response = self.get_subscription_details_for_client(user_id).await?;
        Ok(serde_json::to_value(response)?)
    }

    // Get subscription details for client with structured response
    pub async fn get_subscription_details_for_client(
        &self,
        user_id: &Uuid,
    ) -> Result<SubscriptionDetailsResponse, AppError> {
        // Get subscription
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?;
        
        let subscription = match subscription {
            Some(sub) => sub,
            None => {
                // Create a trial subscription and initial spending limit first
                let mut tx = self.get_db_pool().begin().await.map_err(AppError::from)?;
                let subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut tx).await?;
                tx.commit().await.map_err(AppError::from)?;
                subscription
            }
        };
        
        // COST-BASED BILLING: Get spending status instead of just usage cost
        let spending_status = self.cost_based_billing_service.get_current_spending_status(user_id).await?;
        
        // Get plan details for allowance and currency
        let plan = self.get_plan_by_id(&subscription.plan_id).await?;
        
        // Calculate next invoice amount
        let next_invoice_amount = self.calculate_next_invoice_amount(user_id, &spending_status).await?;
        
        // Build the structured response
        let response = SubscriptionDetailsResponse {
            plan: subscription.plan_id.clone(),
            plan_name: Some(plan.name.clone()),
            status: subscription.status.clone(),
            trial_ends_at: subscription.trial_ends_at,
            current_period_ends_at: subscription.current_period_ends_at,
            monthly_spending_allowance: Some(plan.included_spending_monthly.to_f64().unwrap_or(0.0)),
            hard_spending_limit: Some(spending_status.hard_limit.to_f64().unwrap_or(0.0)),
            is_trialing: subscription.status == "trialing",
            has_cancelled: subscription.status == "canceled",
            next_invoice_amount,
            currency: spending_status.currency.clone(),
            usage: UsageInfo {
                total_cost: spending_status.current_spending.to_f64().unwrap_or(0.0),
                usage_percentage: spending_status.usage_percentage,
                services_blocked: spending_status.services_blocked,
                monthly_limit: Some(plan.included_spending_monthly.to_f64().unwrap_or(0.0)),
                hard_limit: Some(spending_status.hard_limit.to_f64().unwrap_or(0.0)),
                remaining_allowance: Some(spending_status.remaining_allowance.to_f64().unwrap_or(0.0)),
            },
            credit_balance: spending_status.credit_balance.to_f64().unwrap_or(0.0),
            pending_plan_id: subscription.pending_plan_id.clone(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            management_state: "in_sync".to_string(),
            subscription_id: subscription.stripe_subscription_id.clone(),
            customer_id: subscription.stripe_customer_id.clone(),
        };
        
        Ok(response)
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

        // Calculate overage charges
        let overage_amount = if spending_status.overage_amount > BigDecimal::from(0) {
            &spending_status.overage_amount * &plan.overage_rate
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

    /// Create a PaymentIntent for purchasing credits (modern approach)
    pub async fn create_credit_payment_intent(
        &self,
        user_id: &Uuid,
        credit_pack_id: &str,
        save_payment_method: bool,
    ) -> Result<stripe::PaymentIntent, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Get credit pack details
        let credit_pack_repo = crate::db::repositories::credit_pack_repository::CreditPackRepository::new(
            self.db_pools.system_pool.clone()
        );
        let selected_pack = credit_pack_repo.get_pack_by_id(credit_pack_id).await?
            .ok_or_else(|| AppError::InvalidArgument(format!("Invalid credit pack ID: {}", credit_pack_id)))?;

        // Get or create Stripe customer
        let customer_id = self.get_or_create_stripe_customer_internal(user_id).await?;

        // Convert BigDecimal to cents for Stripe
        let amount_cents = (selected_pack.price_amount * BigDecimal::from(100)).to_i64()
            .ok_or_else(|| AppError::InvalidArgument("Invalid price amount".to_string()))?;

        // Add metadata
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "credit_purchase".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("credit_pack_id".to_string(), credit_pack_id.to_string());
        metadata.insert("credit_value".to_string(), selected_pack.value_credits.to_string());
        metadata.insert("currency".to_string(), selected_pack.currency.clone());

        let description = format!("Purchase {} credits", selected_pack.value_credits);


        // Create PaymentIntent
        let payment_intent = stripe_service.create_payment_intent(
            &customer_id,
            amount_cents,
            &selected_pack.currency,
            &description,
            metadata,
            save_payment_method,
        ).await.map_err(|e| AppError::External(format!("Failed to create credit payment intent: {}", e)))?;

        Ok(payment_intent)
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

        // Get plan details
        let plan = self.get_plan_by_id(plan_id).await?;
        let price_id = plan.stripe_price_id_monthly.clone()
            .ok_or_else(|| AppError::Configuration(format!("No Stripe price ID for plan: {}", plan_id)))?;

        // Get or create Stripe customer
        let customer_id = self.get_or_create_stripe_customer_internal(user_id).await?;

        // Add metadata
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("plan_id".to_string(), plan_id.to_string());
        metadata.insert("trial_days".to_string(), "1".to_string());


        // Create subscription with 1-day trial
        let subscription = stripe_service.create_subscription_with_trial(
            &customer_id,
            &price_id,
            Some(1), // 1-day trial
            metadata,
        ).await.map_err(|e| AppError::External(format!("Failed to create subscription: {}", e)))?;

        Ok(subscription)
    }

    /// Get Stripe publishable key for frontend
    pub fn get_stripe_publishable_key(&self) -> Result<String, AppError> {
        match &self.stripe_service {
            Some(service) => Ok(service.get_publishable_key().to_string()),
            None => Err(AppError::Configuration("Stripe not configured".to_string())),
        }
    }

    /// Get or create Stripe customer for a user (expose for handlers)
    pub async fn get_or_create_stripe_customer(&self, user_id: &Uuid) -> Result<String, AppError> {
        self.get_or_create_stripe_customer_internal(user_id).await
    }

    /// Get access to the StripeService for advanced operations
    pub fn get_stripe_service(&self) -> Result<&StripeService, AppError> {
        match &self.stripe_service {
            Some(service) => Ok(service),
            None => Err(AppError::Configuration("Stripe not configured".to_string())),
        }
    }

    /// Get consolidated billing dashboard data
    pub async fn get_billing_dashboard_data(&self, user_id: &Uuid) -> Result<BillingDashboardData, AppError> {
        debug!("Fetching billing dashboard data for user: {}", user_id);

        // Get subscription details
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?;
        let subscription = match subscription {
            Some(sub) => sub,
            None => {
                // Create a trial subscription and initial spending limit first
                let mut tx = self.get_db_pool().begin().await.map_err(AppError::from)?;
                let subscription = self.create_trial_subscription_and_limit_in_tx(user_id, &mut tx).await?;
                tx.commit().await.map_err(AppError::from)?;
                subscription
            }
        };

        // Get plan details
        let plan = self.get_plan_by_id(&subscription.plan_id).await?;

        // Get spending status
        let spending_status = self.cost_based_billing_service.get_current_spending_status(user_id).await?;

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
        };

        info!("Successfully assembled billing dashboard data for user: {}", user_id);
        Ok(dashboard_data)
    }


    /// Cancel a subscription with option to cancel at period end
    pub async fn cancel_subscription(
        &self,
        user_id: &Uuid,
        at_period_end: bool,
    ) -> Result<serde_json::Value, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Start database transaction for atomic updates
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Get user's current subscription
        let current_subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::InvalidArgument("User has no subscription".to_string()))?;

        // Check if subscription can be canceled
        if current_subscription.status == "canceled" {
            let _ = tx.rollback().await;
            return Err(AppError::InvalidArgument("Subscription is already canceled".to_string()));
        }

        // Only proceed if there's a Stripe subscription ID
        let stripe_subscription_id = current_subscription.stripe_subscription_id.as_ref()
            .ok_or_else(|| AppError::InvalidArgument("No Stripe subscription found".to_string()))?;

        // Cancel the subscription in Stripe
        let updated_stripe_subscription = match stripe_service.cancel_subscription(
            stripe_subscription_id,
            at_period_end,
        ).await {
            Ok(subscription) => subscription,
            Err(e) => {
                let _ = tx.rollback().await;
                return Err(AppError::External(format!("Failed to cancel subscription in Stripe: {}", e)));
            }
        };

        // Update local subscription record
        let mut updated_subscription = current_subscription.clone();
        if at_period_end {
            updated_subscription.cancel_at_period_end = true;
            // Status remains "active" until period ends
        } else {
            updated_subscription.status = "canceled".to_string();
            updated_subscription.cancel_at_period_end = false;
        }

        // Save the updated subscription
        if let Err(e) = self.subscription_repository.update_with_executor(&updated_subscription, &mut tx).await {
            let _ = tx.rollback().await;
            return Err(e);
        }

        // Create audit context for logging
        let audit_context = AuditContext::new(*user_id);
        
        // Log the subscription cancellation audit event
        if let Err(e) = self.audit_service.log_subscription_cancelled(
            &audit_context,
            &updated_subscription.id.to_string(),
            at_period_end,
            None, // No cancellation reason provided
            Some(serde_json::json!({
                "stripe_subscription_id": stripe_subscription_id,
                "at_period_end": at_period_end
            })),
        ).await {
            warn!("Failed to log subscription cancellation audit event: {}", e);
        }

        // Commit the transaction
        tx.commit().await
            .map_err(|e| {
                error!("Critical error: Database transaction failed after successful Stripe subscription cancellation for user {}: {}. Manual intervention required to sync database with Stripe.", user_id, e);
                AppError::Database(format!("Failed to commit transaction after successful Stripe cancellation: {}", e))
            })?;

        // Send cancellation notification email
        if let Some(email_service) = &self.email_notification_service {
            let user_repo = crate::db::repositories::user_repository::UserRepository::new(
                self.db_pools.system_pool.clone()
            );
            if let Ok(user) = user_repo.get_by_id(user_id).await {
                if let Ok(plan) = self.get_plan_by_id(&updated_subscription.plan_id).await {
                    if let Err(e) = email_service.send_subscription_cancellation_notification(
                        user_id,
                        &user.email,
                        at_period_end,
                        current_subscription.current_period_ends_at.as_ref(),
                        None, // No cancellation reason provided
                    ).await {
                        warn!("Failed to queue cancellation notification for user {}: {}", user_id, e);
                    }
                }
            }
        }

        info!("Successfully canceled subscription for user {} (at_period_end: {})", user_id, at_period_end);

        // Return updated subscription details
        self.get_subscription_details(user_id).await
    }



    /// Resume a subscription that was set to cancel at period end
    pub async fn resume_subscription(
        &self,
        user_id: &Uuid,
    ) -> Result<serde_json::Value, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Start database transaction for atomic updates
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Get user's current subscription
        let current_subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::InvalidArgument("User has no subscription".to_string()))?;

        // Check if subscription can be resumed (must be set to cancel at period end)
        if !current_subscription.cancel_at_period_end {
            let _ = tx.rollback().await;
            return Err(AppError::InvalidArgument("Subscription is not set to cancel at period end".to_string()));
        }

        if current_subscription.status == "canceled" {
            let _ = tx.rollback().await;
            return Err(AppError::InvalidArgument("Cannot resume already canceled subscription".to_string()));
        }

        // Only proceed if there's a Stripe subscription ID
        let stripe_subscription_id = current_subscription.stripe_subscription_id.as_ref()
            .ok_or_else(|| AppError::InvalidArgument("No Stripe subscription found".to_string()))?;

        // Resume the subscription in Stripe
        let updated_stripe_subscription = match stripe_service.resume_subscription(
            stripe_subscription_id,
        ).await {
            Ok(subscription) => subscription,
            Err(e) => {
                let _ = tx.rollback().await;
                return Err(AppError::External(format!("Failed to resume subscription in Stripe: {}", e)));
            }
        };

        // Update local subscription record
        let mut updated_subscription = current_subscription.clone();
        updated_subscription.cancel_at_period_end = false;
        updated_subscription.status = "active".to_string();

        // Save the updated subscription
        if let Err(e) = self.subscription_repository.update_with_executor(&updated_subscription, &mut tx).await {
            let _ = tx.rollback().await;
            return Err(e);
        }

        // Create audit context for logging
        let audit_context = AuditContext::new(*user_id);
        
        // Log the subscription resumption audit event
        if let Err(e) = self.audit_service.log_subscription_resumed_with_tx(
            &audit_context,
            &updated_subscription.id.to_string(),
            Some(serde_json::json!({
                "stripe_subscription_id": stripe_subscription_id
            })),
            &mut tx,
        ).await {
            warn!("Failed to log subscription resumption audit event: {}", e);
        }

        // Commit the transaction
        tx.commit().await
            .map_err(|e| {
                error!("Critical error: Database transaction failed after successful Stripe subscription resumption for user {}: {}. Manual intervention required to sync database with Stripe.", user_id, e);
                AppError::Database(format!("Failed to commit transaction after successful Stripe resumption: {}", e))
            })?;

        // Send resumption notification email
        if let Some(email_service) = &self.email_notification_service {
            let user_repo = crate::db::repositories::user_repository::UserRepository::new(
                self.db_pools.system_pool.clone()
            );
            if let Ok(user) = user_repo.get_by_id(user_id).await {
                if let Ok(plan) = self.get_plan_by_id(&updated_subscription.plan_id).await {
                    if let Err(e) = email_service.send_subscription_resumed_notification(
                        user_id,
                        &user.email,
                        updated_subscription.current_period_ends_at.as_ref(),
                    ).await {
                        warn!("Failed to queue resumption notification for user {}: {}", user_id, e);
                    }
                }
            }
        }

        info!("Successfully resumed subscription for user {}", user_id);

        // Return updated subscription details
        self.get_subscription_details(user_id).await
    }

    /// Reactivate a canceled subscription (creates new subscription)
    pub async fn reactivate_subscription(
        &self,
        user_id: &Uuid,
        plan_id: Option<String>,
    ) -> Result<serde_json::Value, AppError> {
        // Start database transaction for atomic updates
        let mut tx = self.db_pools.user_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Get user's current subscription
        let current_subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::InvalidArgument("User has no subscription".to_string()))?;

        // Check if subscription can be reactivated
        if current_subscription.status != "canceled" {
            let _ = tx.rollback().await;
            return Err(AppError::InvalidArgument("Only canceled subscriptions can be reactivated".to_string()));
        }

        // For reactivation, we'll create a new subscription since Stripe doesn't support reactivating canceled subscriptions
        let target_plan_id = plan_id.unwrap_or(current_subscription.plan_id);
        
        // Verify the target plan exists before creating a new subscription
        let plan_repo = self.subscription_plan_repository.clone();
        let _target_plan = plan_repo.get_plan_by_id(&target_plan_id).await?;
        
        // Create new subscription with trial
        let new_subscription = match self.create_subscription_with_trial(user_id, &target_plan_id).await {
            Ok(subscription) => subscription,
            Err(e) => {
                let _ = tx.rollback().await;
                return Err(e);
            }
        };

        // Create audit context for logging
        let audit_context = AuditContext::new(*user_id);
        
        // Log the subscription reactivation audit event
        if let Err(e) = self.audit_service.log_subscription_reactivated(
            &audit_context,
            &new_subscription.id.to_string(),
            &target_plan_id,
            Some(serde_json::json!({
                "old_subscription_id": current_subscription.id.to_string(),
                "stripe_subscription_id": new_subscription.id.to_string()
            })),
        ).await {
            warn!("Failed to log subscription reactivation audit event: {}", e);
        }

        // Commit the transaction
        tx.commit().await
            .map_err(|e| {
                error!("Critical error: Database transaction failed after successful Stripe subscription reactivation for user {}: {}. Manual intervention required to sync database with Stripe.", user_id, e);
                AppError::Database(format!("Failed to commit transaction after successful Stripe reactivation: {}", e))
            })?;

        // Send reactivation notification email
        if let Some(email_service) = &self.email_notification_service {
            // Get user email and plan details
            let user_repo = crate::db::repositories::user_repository::UserRepository::new(
                self.db_pools.system_pool.clone()
            );
            if let Ok(user) = user_repo.get_by_id(user_id).await {
                if let Ok(plan) = self.get_plan_by_id(&target_plan_id).await {
                    if let Err(e) = email_service.send_reactivation_notification(
                        user_id,
                        &user.email,
                        &plan.name,
                    ).await {
                        warn!("Failed to queue reactivation notification for user {}: {}", user_id, e);
                    }
                }
            }
        }

        info!("Successfully reactivated subscription for user {} with plan {}", user_id, target_plan_id);

        // Return updated subscription details
        self.get_subscription_details(user_id).await
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

        // Get customer ID
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

    /// Get invoice history with structured data and summary
    pub async fn get_invoice_history(
        &self,
        user_id: &Uuid,
        query: crate::handlers::billing::payment_handlers::InvoiceFilterQuery,
    ) -> Result<InvoiceHistoryResponse, AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Get customer ID
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Calculate pagination parameters for Stripe API
        let limit = Some(100u64); // Fixed limit for consistent pagination
        let starting_after = if query.offset > 0 { 
            // For simplicity, we'll use None for starting_after in this implementation
            // In a full implementation, you would need to track the last invoice ID from previous page
            None 
        } else { 
            None 
        };

        // Fetch invoices from Stripe with status filter and pagination
        let mut invoices = stripe_service.list_invoices_with_filter(&customer_id, query.status.as_deref(), limit, starting_after).await
            .map_err(|e| AppError::External(format!("Failed to get invoices: {}", e)))?;

        // Apply sorting if specified
        if let Some(sort_field) = &query.sort_field {
            let sort_desc = query.sort_direction.as_deref() == Some("desc");
            
            match sort_field.as_str() {
                "amount" => {
                    invoices.sort_by(|a, b| {
                        let amount_a = a.amount_due.unwrap_or(0);
                        let amount_b = b.amount_due.unwrap_or(0);
                        if sort_desc {
                            amount_b.cmp(&amount_a)
                        } else {
                            amount_a.cmp(&amount_b)
                        }
                    });
                }
                "created" | "createdDate" => {
                    invoices.sort_by(|a, b| {
                        let created_a = a.created.unwrap_or(0);
                        let created_b = b.created.unwrap_or(0);
                        if sort_desc {
                            created_b.cmp(&created_a)
                        } else {
                            created_a.cmp(&created_b)
                        }
                    });
                }
                "dueDate" => {
                    invoices.sort_by(|a, b| {
                        let due_a = a.due_date.unwrap_or(0);
                        let due_b = b.due_date.unwrap_or(0);
                        if sort_desc {
                            due_b.cmp(&due_a)
                        } else {
                            due_a.cmp(&due_b)
                        }
                    });
                }
                "status" => {
                    invoices.sort_by(|a, b| {
                        let status_a = a.status.as_ref().map(|s| format!("{:?}", s)).unwrap_or_default();
                        let status_b = b.status.as_ref().map(|s| format!("{:?}", s)).unwrap_or_default();
                        if sort_desc {
                            status_b.cmp(&status_a)
                        } else {
                            status_a.cmp(&status_b)
                        }
                    });
                }
                _ => {
                    // Default sort by created date descending for unknown fields
                    invoices.sort_by(|a, b| {
                        let created_a = a.created.unwrap_or(0);
                        let created_b = b.created.unwrap_or(0);
                        created_b.cmp(&created_a)
                    });
                }
            }
        } else {
            // Default sort by created date descending if no sort specified
            invoices.sort_by(|a, b| {
                let created_a = a.created.unwrap_or(0);
                let created_b = b.created.unwrap_or(0);
                created_b.cmp(&created_a)
            });
        }

        // Set summary to default zero values (server-side calculation removed)
        let summary = InvoiceSummary {
            total_amount: 0.0,
            paid_amount: 0.0,
            outstanding_amount: 0.0,
            overdue_amount: 0.0,
            currency: "usd".to_string(),
        };

        // Apply pagination
        let total_count = invoices.len();
        let offset = query.offset as usize;
        let limit = query.limit as usize;
        let has_more = offset + limit < total_count;

        let paginated_invoices: Vec<stripe::Invoice> = invoices
            .into_iter()
            .skip(offset)
            .take(limit)
            .collect();

        // Map to the expected frontend structure
        let invoice_entries: Vec<serde_json::Value> = paginated_invoices
            .into_iter()
            .map(|invoice| {
                serde_json::json!({
                    "id": invoice.id,
                    "amount": invoice.amount_due.unwrap_or(0) as f64 / 100.0,
                    "currency": invoice.currency.map(|c| c.to_string()).unwrap_or_else(|| "usd".to_string()),
                    "status": invoice.status.map(|s| format!("{:?}", s)).unwrap_or_else(|| "unknown".to_string()),
                    "createdDate": invoice.created.and_then(|timestamp| {
                        chrono::DateTime::from_timestamp(timestamp, 0)
                            .map(|dt| dt.to_rfc3339())
                    }).unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                    "dueDate": invoice.due_date.and_then(|timestamp| {
                        chrono::DateTime::from_timestamp(timestamp, 0)
                            .map(|dt| dt.to_rfc3339())
                    }),
                    "paidDate": invoice.status_transitions.as_ref()
                        .and_then(|transitions| transitions.paid_at)
                        .and_then(|timestamp| {
                            chrono::DateTime::from_timestamp(timestamp, 0)
                                .map(|dt| dt.to_rfc3339())
                        }),
                    "invoicePdf": invoice.invoice_pdf,
                    "description": invoice.description.unwrap_or_else(|| "Subscription".to_string())
                })
            })
            .collect();

        // Return structured response
        Ok(InvoiceHistoryResponse {
            invoices: invoice_entries,
            summary,
            total_count,
            has_more,
        })
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
        
        // Update ALL the enhanced synchronization fields from the Stripe subscription object
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
        local_subscription.current_period_ends_at = Some(current_period_end);
        local_subscription.trial_ends_at = trial_end;
        
        // Enhanced Stripe webhook synchronization fields
        local_subscription.stripe_plan_id = stripe_plan_id;
        local_subscription.current_period_start = current_period_start;
        local_subscription.current_period_end = current_period_end;
        local_subscription.trial_start = trial_start;
        local_subscription.trial_end = trial_end;
        // Keep existing pending_plan_id (this is managed by the application, not by Stripe directly)
        // local_subscription.pending_plan_id = local_subscription.pending_plan_id;
        
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

}