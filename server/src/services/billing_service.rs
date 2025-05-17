use crate::error::AppError;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::db::repositories::subscription_repository::SubscriptionRepository;
use crate::db::repositories::subscription_plan_repository::SubscriptionPlanRepository;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use log::{debug, error, info, warn};
use std::env;
use chrono::{DateTime, Utc, Duration, Datelike};
use std::sync::Arc;
use sqlx::PgPool;

// Import Stripe crate if available
#[cfg(feature = "stripe")]
use stripe::{
    Customer, CustomerCreateParams,
    Subscription, SubscriptionCreateParams,
    SubscriptionStatus, CheckoutSession,
    CheckoutSessionCreateParams, Price, 
    PaymentLink, Client as StripeClient
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanInfo {
    pub id: String,
    pub name: String,
    pub price_monthly: f64,
    pub price_yearly: f64,
    pub features: Vec<String>,
    pub token_limit: u64,
}

#[derive(Debug, Clone)]
pub struct BillingService {
    subscription_repository: Arc<SubscriptionRepository>,
    subscription_plan_repository: Arc<SubscriptionPlanRepository>,
    api_usage_repository: Arc<ApiUsageRepository>,
    #[cfg(feature = "stripe")]
    stripe_client: Option<StripeClient>,
    plans: Vec<PlanInfo>,
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
        let api_usage_repository = Arc::new(ApiUsageRepository::new(db_pool));
        // Initialize plans
        let plans = vec![
            PlanInfo {
                id: "free".to_string(),
                name: "Free".to_string(),
                price_monthly: 0.0,
                price_yearly: 0.0,
                features: vec![
                    "Basic access".to_string(),
                    "10K tokens per month".to_string(),
                ],
                token_limit: 10_000,
            },
            PlanInfo {
                id: "pro".to_string(),
                name: "Pro".to_string(),
                price_monthly: 29.99,
                price_yearly: 299.99,
                features: vec![
                    "Unlimited access".to_string(),
                    "2M tokens per month".to_string(),
                    "Priority support".to_string(),
                ],
                token_limit: 2_000_000,
            },
            PlanInfo {
                id: "enterprise".to_string(),
                name: "Enterprise".to_string(),
                price_monthly: 99.99,
                price_yearly: 999.99,
                features: vec![
                    "Unlimited access".to_string(),
                    "Unlimited tokens".to_string(),
                    "24/7 support".to_string(),
                    "Custom integrations".to_string(),
                ],
                token_limit: u64::MAX,
            },
        ];
        
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
            #[cfg(feature = "stripe")]
            stripe_client,
            plans,
            default_trial_days,
            app_settings,
        }
    }
    
    // Check if a user has access to a specific model
    pub async fn check_service_access(
        &self,
        user_id: &Uuid,
        model_id: &str,
    ) -> Result<bool, AppError> {
        // Validate model_id structure (simple check)
        if !model_id.contains("/") && model_id != "openai/whisper-1" {
            return Err(AppError::InvalidArgument(format!("Invalid model_id format: {}", model_id)));
        }
    
        // Get user's subscription
        let subscription = self.subscription_repository.get_by_user_id(user_id).await?;
        
        // If no subscription, check if they should get a trial
        if subscription.is_none() {
            debug!("No subscription found for user {}, creating trial", user_id);
            self.create_trial_subscription(user_id).await?;
            return Ok(true);
        }
        
        let subscription = subscription.unwrap();
        
        // Check subscription status
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
                
                // Determine allowed models dynamically from subscription_plans.features
                let allowed_model_patterns = self
                    .subscription_plan_repository
                    .get_allowed_models(&subscription.plan_id)
                    .await
                    .unwrap_or_else(|e| {
                        warn!("Failed to load allowed models for plan {}: {}", subscription.plan_id, e);
                        Vec::new()
                    });
                
                // Check if the model is allowed
                let model_allowed = allowed_model_patterns.iter().any(|pattern| *pattern == model_id);
                if !model_allowed {
                    debug!("Model {} not available on plan {} for user {}", model_id, subscription.plan_id, user_id);
                    return Err(AppError::Payment(format!("Model {} not available on your current plan", model_id)));
                }
                
                // Check usage limits
                let plan = self.get_plan_by_id(&subscription.plan_id)?;
                
                // Get usage for the current month
                let now = Utc::now();
                let start_of_month = DateTime::<Utc>::from_utc(
                    chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
                        .unwrap()
                        .and_hms_opt(0, 0, 0)
                        .unwrap(),
                    Utc,
                );
                
                let usage = self.api_usage_repository
                    .get_usage_for_period(user_id, Some(start_of_month), None)
                    .await?;
                
                let total_tokens = usage.tokens_input + usage.tokens_output;
                
                if total_tokens >= plan.token_limit as i64 && plan.token_limit != u64::MAX {
                    debug!("Token limit reached for user {}", user_id);
                    return Err(AppError::Payment("Token limit reached for this billing period".to_string()));
                }
                
                Ok(true)
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
    
    // Get plan by ID
    fn get_plan_by_id(&self, plan_id: &str) -> Result<&PlanInfo, AppError> {
        self.plans
            .iter()
            .find(|p| p.id == plan_id)
            .ok_or_else(|| AppError::NotFound(format!("Plan not found: {}", plan_id)))
    }
    
    // Generate a checkout session URL for upgrading
    #[cfg(feature = "stripe")]
    pub async fn create_checkout_session(
        &self,
        user_id: &Uuid,
        plan_id: &str,
    ) -> Result<String, AppError> {
        // Ensure plan exists
        let plan = self.get_plan_by_id(plan_id)?;
        
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
            success_url: Some(format!(
                "{}://auth-success?session_id={{CHECKOUT_SESSION_ID}}",
                self.app_settings.deep_link.scheme
            )),
            cancel_url: Some(format!(
                "{}://auth-cancelled",
                self.app_settings.deep_link.scheme
            )),
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
        
        // Create portal session
        let session = stripe::billingportal::Session::create(
            stripe,
            stripe::billingportal::SessionCreateParams {
                customer: customer_id,
                return_url: Some(format!(
                    "{}://billing-return",
                    self.app_settings.deep_link.scheme
                )),
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
        
        // Get plan details
        let plan = self.get_plan_by_id(&subscription.plan_id)?;
        
        // Get usage for current month
        let now = Utc::now();
        let start_of_month = DateTime::<Utc>::from_utc(
            chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap(),
            Utc,
        );
        
        let usage = self.api_usage_repository
            .get_usage_for_period(user_id, Some(start_of_month), None)
            .await?;
        
        // Get the total cost from the api_usage records
        // This is the actual recorded cost from OpenRouter or our cost calculations
        let cost = if subscription.plan_id != "free" {
            // Get the cost directly from the api_usage repository
            // The total_cost is already in BigDecimal format from the database
            let cost_decimal = &usage.total_cost;
            // Convert to f64 for the JSON response
            let cost_str = cost_decimal.to_string();
            cost_str.parse::<f64>().unwrap_or(0.0)
        } else {
            0.0
        };
        
        // Build the response
        let response = serde_json::json!({
            "plan": subscription.plan_id,
            "status": subscription.status,
            "trialEndsAt": subscription.trial_ends_at,
            "currentPeriodEndsAt": subscription.current_period_ends_at,
            "usage": {
                "tokensInput": usage.tokens_input,
                "tokensOutput": usage.tokens_output,
                "totalCost": cost
            }
        });
        
        Ok(response)
    }
}