use crate::error::AppError;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::{SubscriptionPlanRepository, SubscriptionPlan};
use crate::db::repositories::spending_repository::SpendingRepository;
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::utils::error_handling::{retry_with_backoff, RetryConfig, validate_amount, validate_currency};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use log::{debug, error, info, warn};
use std::env;
use chrono::{DateTime, Utc, Duration, Datelike};
use std::sync::Arc;
use sqlx::PgPool;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};

// Import Stripe crate if available
#[cfg(feature = "stripe")]
use stripe::{
    Customer, CustomerCreateParams,
    Subscription, SubscriptionCreateParams,
    SubscriptionStatus, CheckoutSession,
    CheckoutSessionCreateParams, Price, 
    PaymentLink, Client as StripeClient
};


#[derive(Debug, Clone)]
pub struct BillingService {
    subscription_repository: Arc<SubscriptionRepository>,
    subscription_plan_repository: Arc<SubscriptionPlanRepository>,
    api_usage_repository: Arc<ApiUsageRepository>,
    cost_based_billing_service: Arc<CostBasedBillingService>,
    #[cfg(feature = "stripe")]
    stripe_client: Option<StripeClient>,
    default_trial_days: i64,
    app_settings: crate::config::settings::AppSettings,
}

impl BillingService {
    pub fn new(
        db_pool: PgPool,
        app_settings: crate::config::settings::AppSettings,
    ) -> Self {
        // Create repositories
        let subscription_repository = Arc::new(SubscriptionRepository::new(db_pool.clone()));
        let subscription_plan_repository = Arc::new(SubscriptionPlanRepository::new(db_pool.clone()));
        let api_usage_repository = Arc::new(ApiUsageRepository::new(db_pool.clone()));
        let spending_repository = Arc::new(SpendingRepository::new(db_pool.clone()));
        
        // Create cost-based billing service
        let cost_based_billing_service = Arc::new(CostBasedBillingService::new(
            db_pool,
            api_usage_repository.clone(),
            subscription_repository.clone(),
            subscription_plan_repository.clone(),
            spending_repository,
        ));
        
        // Get default trial days from environment
        let default_trial_days = env::var("DEFAULT_TRIAL_DAYS")
            .unwrap_or_else(|_| "7".to_string())
            .parse::<i64>()
            .unwrap_or(7);
        
        // Initialize Stripe client if feature is enabled
        #[cfg(feature = "stripe")]
        let stripe_client = match env::var("STRIPE_SECRET_KEY") {
            Ok(key) => {
                info!("Initializing Stripe client");
                Some(StripeClient::new(key))
            },
            Err(_) => {
                warn!("STRIPE_SECRET_KEY not set, Stripe functionality disabled");
                None
            }
        };
        
        Self {
            subscription_repository,
            subscription_plan_repository,
            api_usage_repository,
            cost_based_billing_service,
            #[cfg(feature = "stripe")]
            stripe_client,
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
            debug!("No subscription found for user {}, creating trial", user_id);
            self.create_trial_subscription(user_id).await?;
            // Re-fetch the subscription after creating the trial
            sub_option = self.subscription_repository.get_by_user_id(user_id).await?;
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
    
    // Create a trial subscription for a new user
    async fn create_trial_subscription(&self, user_id: &Uuid) -> Result<(), AppError> {
        let now = Utc::now();
        let trial_ends_at = now + Duration::days(self.default_trial_days);
        
        // Create subscription with trial period
        self.subscription_repository.create(
            user_id,
            "free", // Default plan for trial
            "trialing",
            None,
            None,
            Some(trial_ends_at),
            trial_ends_at, // Current period ends when trial ends
        ).await?;
        
        info!("Created trial subscription for user {}", user_id);
        Ok(())
    }
    
    // Get the database pool for use by other components
    pub fn get_db_pool(&self) -> PgPool {
        self.subscription_repository.get_pool().clone()
    }
    
    // Get plan by ID from database
    async fn get_plan_by_id(&self, plan_id: &str) -> Result<SubscriptionPlan, AppError> {
        self.subscription_plan_repository.get_plan_by_id(plan_id).await
    }
    
    // Generate a checkout session URL for upgrading
    #[cfg(feature = "stripe")]
    pub async fn create_checkout_session(
        &self,
        user_id: &Uuid,
        plan_id: &str,
    ) -> Result<String, AppError> {
        let plan = self.get_plan_by_id(plan_id).await?;
        
        // Ensure Stripe is configured
        let stripe = match &self.stripe_client {
            Some(client) => client,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };
        
        // Get or create Stripe customer
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Get price ID for the plan from AppSettings
        let price_id = match plan_id {
            "free" => self.app_settings.stripe.price_id_free.clone(),
            "pro" => self.app_settings.stripe.price_id_pro.clone(),
            "enterprise" => self.app_settings.stripe.price_id_enterprise.clone(),
            _ => None,
        }.ok_or_else(|| AppError::Configuration(
            format!("Price ID not configured for plan: {}", plan_id)
        ))?;
        
        // Get URLs from configuration
        let config_repo = crate::db::repositories::BillingConfigurationRepository::new(
            self.subscription_repository.get_pool().clone()
        );
        let stripe_urls = config_repo.get_stripe_urls().await?;

        // Add metadata to track which plan the user is subscribing to
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("plan_id".to_string(), plan_id.to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        
        // Create checkout session
        let session_params = CheckoutSessionCreateParams {
            line_items: Some(vec![
                CheckoutSessionCreateParams::LineItems {
                    price: Some(price_id),
                    quantity: Some(1),
                    ..Default::default()
                },
            ]),
            mode: Some(stripe::CheckoutSessionMode::Subscription),
            success_url: Some(stripe_urls.success_url),
            cancel_url: Some(stripe_urls.cancel_url),
            customer: Some(customer_id),
            metadata: Some(metadata),
            ..Default::default()
        };
        
        // Create the session
        let session = CheckoutSession::create(stripe, session_params).await
            .map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;
        
        // Return the URL
        session.url.ok_or_else(|| AppError::Internal("No URL returned from Stripe".to_string()))
    }
    
    // Get or create a Stripe customer for a user
    #[cfg(feature = "stripe")]
    async fn get_or_create_stripe_customer(&self, user_id: &Uuid) -> Result<String, AppError> {
        // Check if user already has a subscription with a Stripe customer ID
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?;
        
        if let Some(sub) = subscription {
            if let Some(customer_id) = sub.stripe_customer_id {
                return Ok(customer_id);
            }
        }
        
        // Ensure Stripe is configured
        let stripe = match &self.stripe_client {
            Some(client) => client,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };
        
        // Get user details from database
        let user = crate::db::repositories::user_repository::UserRepository::new(
            self.subscription_repository.get_pool()
        ).get_by_id(user_id).await?;
        
        // Create a new Stripe customer
        let customer_params = CustomerCreateParams {
            email: Some(&user.email),
            name: user.full_name.as_deref(),
            metadata: Some(std::collections::HashMap::from_iter(vec![
                ("user_id".to_string(), user_id.to_string()),
            ])),
            ..Default::default()
        };
        
        let customer = Customer::create(stripe, customer_params).await
            .map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;
        
        // Update the subscription with the customer ID
        if let Some(mut sub) = subscription {
            sub.stripe_customer_id = Some(customer.id.to_string());
            self.subscription_repository.update(&sub).await?;
        }
        
        Ok(customer.id.to_string())
    }
    
    // Create billing portal session
    #[cfg(feature = "stripe")]
    pub async fn create_billing_portal_session(
        &self,
        user_id: &Uuid,
    ) -> Result<String, AppError> {
        // Get customer ID
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;
        
        // Ensure Stripe is configured
        let stripe = match &self.stripe_client {
            Some(client) => client,
            None => return Err(AppError::Configuration("Stripe not configured".to_string())),
        };
        
        // Get URLs from configuration
        let config_repo = crate::db::repositories::BillingConfigurationRepository::new(
            self.subscription_repository.get_pool().clone()
        );
        let stripe_urls = config_repo.get_stripe_urls().await?;

        // Create portal session
        let session = stripe::billingportal::Session::create(
            stripe,
            stripe::billingportal::SessionCreateParams {
                customer: customer_id,
                return_url: Some(stripe_urls.portal_return_url),
                ..Default::default()
            },
        ).await.map_err(|e| AppError::External(format!("Failed to create billing portal session: {}", e)))?;
        
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
                // Create a trial subscription first
                self.create_trial_subscription(user_id).await?;
                self.subscription_repository.get_by_user_id(user_id).await?
                    .ok_or_else(|| AppError::Internal("Failed to retrieve newly created subscription".to_string()))?
            }
        };
        
        let _plan = self.get_plan_by_id(&subscription.plan_id).await?;
        
        // Get usage for current month
        let now = Utc::now();
        let start_of_month = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .ok_or_else(|| AppError::Internal("Failed to construct start of month date".to_string()))?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::Internal("Failed to construct start of month time".to_string()))?
            .and_utc();
        
        let usage = self.api_usage_repository
            .get_usage_for_period(user_id, Some(start_of_month), None)
            .await?;
        
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
            "isTrialing": subscription.status == "trialing",
            "hasCancelled": subscription.status == "canceled",
            "nextInvoiceAmount": self.calculate_next_invoice_amount(user_id, &spending_status).await?,
            "currency": spending_status.currency,
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
        let base_amount = plan.base_price_monthly;

        // Calculate overage charges
        let overage_amount = if spending_status.overage_amount > BigDecimal::from(0) {
            let overage_cost = &spending_status.overage_amount * FromPrimitive::from_f64(plan.overage_rate)
                .unwrap_or_else(|| BigDecimal::from(1));
            overage_cost.to_f64().unwrap_or(0.0)
        } else {
            0.0
        };

        // Total next invoice amount
        let total_amount = base_amount + overage_amount;

        // Return None if amount is 0 (free plans)
        if total_amount <= 0.0 {
            Ok(None)
        } else {
            Ok(Some(total_amount))
        }
    }

    /// Get access to the cost-based billing service
    pub fn get_cost_based_billing_service(&self) -> &Arc<CostBasedBillingService> {
        &self.cost_based_billing_service
    }
}