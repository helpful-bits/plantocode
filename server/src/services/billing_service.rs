use crate::error::AppError;
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

        // Fetch the user's subscription and check management state
        let subscription = self.subscription_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| AppError::InvalidArgument("User has no active subscription".to_string()))?;

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
    
    
    // Get subscription details for a user
    pub async fn get_subscription_details(
        &self,
        user_id: &Uuid,
    ) -> Result<serde_json::Value, AppError> {
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
        
        let _plan = self.get_plan_by_id(&subscription.plan_id).await?;
        
        
        // COST-BASED BILLING: Get spending status instead of just usage cost
        let spending_status = self.cost_based_billing_service.get_current_spending_status(user_id).await?;
        let cost = spending_status.current_spending.to_f64().unwrap_or(0.0);
        
        // Get plan details for allowance and currency
        let plan = self.get_plan_by_id(&subscription.plan_id).await?;
        
        // Build the response matching frontend SubscriptionInfo interface
        let response = serde_json::json!({
            "plan": subscription.plan_id,
            "status": subscription.status,
            "trialEndsAt": subscription.trial_ends_at,
            "currentPeriodEndsAt": subscription.current_period_ends_at,
            "monthlySpendingAllowance": spending_status.included_allowance.to_f64().unwrap_or(0.0),
            "hardSpendingLimit": spending_status.hard_limit.to_f64().unwrap_or(0.0),
            "creditBalance": spending_status.credit_balance.to_f64().unwrap_or(0.0),
            "isTrialing": subscription.status == "trialing",
            "hasCancelled": subscription.status == "canceled",
            "nextInvoiceAmount": self.calculate_next_invoice_amount(user_id, &spending_status).await?,
            "currency": spending_status.currency,
            "pendingPlanId": subscription.pending_plan_id,
            "cancelAtPeriodEnd": subscription.cancel_at_period_end,
            "managementState": "in_sync",  // Simplified - no longer tracked
            "usage": {
                "totalCost": spending_status.current_spending.to_f64().unwrap_or(0.0),
                "usagePercentage": spending_status.usage_percentage,
                "servicesBlocked": spending_status.services_blocked
            }
        });
        
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

    /// Delete a payment method for a user
    pub async fn delete_payment_method(
        &self,
        user_id: &Uuid,
        payment_method_id: &str,
    ) -> Result<(), AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Verify the payment method belongs to the user's customer
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        let customer_payment_methods = stripe_service.list_payment_methods(&customer_id).await
            .map_err(|e| AppError::External(format!("Failed to list payment methods: {}", e)))?;

        // Check if the payment method belongs to this customer
        let payment_method_belongs_to_customer = customer_payment_methods
            .iter()
            .any(|pm| pm.id.to_string() == payment_method_id);

        if !payment_method_belongs_to_customer {
            return Err(AppError::InvalidArgument("Payment method does not belong to this customer".to_string()));
        }

        // Detach the payment method
        stripe_service.detach_payment_method(payment_method_id).await
            .map_err(|e| AppError::External(format!("Failed to detach payment method: {}", e)))?;

        info!("Successfully deleted payment method {} for user {}", payment_method_id, user_id);
        Ok(())
    }

    /// Set default payment method for a user
    pub async fn set_default_payment_method(
        &self,
        user_id: &Uuid,
        payment_method_id: &str,
    ) -> Result<(), AppError> {
        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };

        // Verify the payment method belongs to the user's customer
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        let customer_payment_methods = stripe_service.list_payment_methods(&customer_id).await
            .map_err(|e| AppError::External(format!("Failed to list payment methods: {}", e)))?;

        // Check if the payment method belongs to this customer
        let payment_method_belongs_to_customer = customer_payment_methods
            .iter()
            .any(|pm| pm.id.to_string() == payment_method_id);

        if !payment_method_belongs_to_customer {
            return Err(AppError::InvalidArgument("Payment method does not belong to this customer".to_string()));
        }

        // Set as default payment method
        stripe_service.set_default_payment_method(&customer_id, payment_method_id).await
            .map_err(|e| AppError::External(format!("Failed to set default payment method: {}", e)))?;

        info!("Successfully set payment method {} as default for user {}", payment_method_id, user_id);
        Ok(())
    }

}