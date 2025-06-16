use stripe::{
    Client, CreateCustomer, CreatePaymentIntent, CreateSetupIntent, CreateSubscription,
    CreateCheckoutSession, CreateBillingPortalSession, PaymentIntent, SetupIntent, 
    Subscription, Customer, CheckoutSession, BillingPortalSession, Event, EventType,
    PaymentIntentStatus, SubscriptionStatus, Currency, CheckoutSessionMode,
    PaymentIntentConfirmationMethod, SubscriptionItem,
    CreateSubscriptionItem, Price, Expandable, Invoice, PaymentMethod,
    ListPaymentMethods, CreatePrice, Product, CreateProduct, CreatePriceRecurringInterval, CreatePriceRecurring,
    ApiVersion, UpdateSubscription, UpdateSubscriptionItems, CreateCheckoutSessionLineItems,
    CreateInvoice, InvoiceStatus, ListInvoices,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
use uuid::Uuid;
use log::{debug, error, info, warn};

#[derive(Debug, thiserror::Error)]
pub enum StripeServiceError {
    #[error("Stripe API error: {0}")]
    StripeApi(#[from] stripe::StripeError),
    #[error("Webhook verification failed: {0}")]
    WebhookVerification(String),
    #[error("Invalid configuration: {0}")]
    Configuration(String),
    #[error("Payment processing error: {0}")]
    PaymentProcessing(String),
    #[error("Subscription management error: {0}")]
    SubscriptionManagement(String),
}

type HmacSha256 = Hmac<Sha256>;

// Public enums for proration and billing cycle anchor behavior
#[derive(Debug, Clone)]
pub enum ProrationBehavior {
    CreateProrations,
    None,
    AlwaysInvoice,
}

#[derive(Debug, Clone)]
pub enum BillingCycleAnchor {
    Now,
    Unchanged,
}

// Stripe Customer Portal Configuration Required:
// 1. Enable subscription cancellation
// 2. Enable plan changes with immediate/end-of-period options
// 3. Enable payment method updates
// 4. Enable invoice access
// 5. Set return URL to app billing page
// 6. Configure business branding

#[derive(Clone)]
pub struct StripeService {
    client: Client,
    webhook_secret: String,
    publishable_key: String,
}

impl StripeService {
    pub fn new(secret_key: String, webhook_secret: String, publishable_key: String) -> Self {
        let client = Client::new(secret_key);
        
        // Note: API version is managed by the async-stripe library version
        // This library version corresponds to API version 2023-10-16
        
        Self {
            client,
            webhook_secret,
            publishable_key,
        }
    }

    pub fn get_publishable_key(&self) -> &str {
        &self.publishable_key
    }

    /// Verify webhook signature
    pub fn verify_webhook_signature(
        &self,
        payload: &str,
        signature: &str,
    ) -> Result<(), StripeServiceError> {
        let elements: Vec<&str> = signature.split(',').collect();
        let mut timestamp = "";
        let mut signatures = Vec::new();

        for element in elements {
            if let Some(t) = element.strip_prefix("t=") {
                timestamp = t;
            } else if let Some(s) = element.strip_prefix("v1=") {
                signatures.push(s);
            }
        }

        if timestamp.is_empty() || signatures.is_empty() {
            return Err(StripeServiceError::WebhookVerification(
                "Invalid signature format".to_string(),
            ));
        }

        let signed_payload = format!("{}.{}", timestamp, payload);
        
        let mut mac = HmacSha256::new_from_slice(self.webhook_secret.as_bytes())
            .map_err(|e| StripeServiceError::WebhookVerification(format!("HMAC error: {}", e)))?;
        
        mac.update(signed_payload.as_bytes());
        let expected_signature = hex::encode(mac.finalize().into_bytes());

        for signature in signatures {
            if signature == expected_signature {
                return Ok(());
            }
        }

        Err(StripeServiceError::WebhookVerification(
            "Signature verification failed".to_string(),
        ))
    }

    /// Parse webhook event from payload
    pub fn parse_webhook_event(&self, payload: &str) -> Result<Event, StripeServiceError> {
        let event: Event = serde_json::from_str(payload)
            .map_err(|e| StripeServiceError::WebhookVerification(format!("Failed to parse event: {}", e)))?;
        Ok(event)
    }

    /// Create or retrieve existing customer
    pub async fn create_or_get_customer(
        &self,
        user_id: &Uuid,
        email: &str,
        name: Option<&str>,
        existing_customer_id: Option<&str>,
    ) -> Result<Customer, StripeServiceError> {
        // If we have an existing customer ID, try to retrieve it first
        if let Some(customer_id) = existing_customer_id {
            let parsed_customer_id = customer_id.parse()
                .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
            match Customer::retrieve(&self.client, &parsed_customer_id, &[]).await {
                Ok(customer) => return Ok(customer),
                Err(e) => {
                    warn!("Failed to retrieve existing customer {}: {}", customer_id, e);
                }
            }
        }

        // Create new customer
        let mut create_customer = CreateCustomer::new();
        create_customer.email = Some(email);
        create_customer.name = name;
        
        // Add metadata
        let mut metadata = HashMap::new();
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert("created_by".to_string(), "vibe_manager".to_string());
        create_customer.metadata = Some(metadata);

        let customer = Customer::create(&self.client, create_customer).await?;
        info!("Created Stripe customer: {} for user: {}", customer.id, user_id);
        
        Ok(customer)
    }

    /// Retrieve a customer by ID
    pub async fn get_customer(&self, customer_id: &str) -> Result<Customer, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        let customer = Customer::retrieve(&self.client, &parsed_customer_id, &[]).await?;
        Ok(customer)
    }

    /// Create a PaymentIntent for one-time payments (like credit purchases)
    /// This is kept for in-app credit purchase functionality
    pub async fn create_payment_intent(
        &self,
        customer_id: &str,
        amount_cents: i64,
        currency: &str,
        description: &str,
        metadata: HashMap<String, String>,
        save_payment_method: bool,
    ) -> Result<PaymentIntent, StripeServiceError> {
        let mut create_intent = CreatePaymentIntent::new(amount_cents, currency_from_str(currency).unwrap_or(Currency::USD));
        
        create_intent.customer = Some(customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?);
        create_intent.description = Some(description);
        create_intent.metadata = Some(metadata);
        create_intent.confirmation_method = Some(PaymentIntentConfirmationMethod::Manual);
        
        if save_payment_method {
            create_intent.setup_future_usage = Some(stripe::PaymentIntentSetupFutureUsage::OffSession);
        }

        let payment_intent = PaymentIntent::create(&self.client, create_intent).await?;
        info!("Created PaymentIntent: {} for customer: {}", payment_intent.id, customer_id);
        
        Ok(payment_intent)
    }

    /// Create a subscription with trial period (simple version only)
    /// Complex subscription management should be done via Customer Portal
    pub async fn create_subscription_with_trial(
        &self,
        customer_id: &str,
        price_id: &str,
        trial_days: Option<i64>,
        metadata: HashMap<String, String>,
    ) -> Result<Subscription, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        let mut create_sub = CreateSubscription::new(parsed_customer_id);
        
        // Add subscription item
        let items = vec![stripe::CreateSubscriptionItems {
            price: Some(price_id.parse()
                .map_err(|_| StripeServiceError::Configuration("Invalid Stripe price ID format".to_string()))?),
            quantity: Some(1),
            ..Default::default()
        }];
        create_sub.items = Some(items);
        
        // Set trial period
        if let Some(days) = trial_days {
            let trial_end = Utc::now() + chrono::Duration::days(days);
            create_sub.trial_end = Some(stripe::Scheduled::Timestamp(trial_end.timestamp()));
        }
        
        create_sub.metadata = Some(metadata);
        create_sub.expand = &["latest_invoice.payment_intent"];

        let subscription = Subscription::create(&self.client, create_sub).await?;
        info!("Created subscription: {} for customer: {}", subscription.id, customer_id);
        
        Ok(subscription)
    }

    /// Create billing portal session for customer self-service
    /// This is the primary method for complex billing operations
    pub async fn create_billing_portal_session(
        &self,
        customer_id: &str,
        return_url: &str,
    ) -> Result<BillingPortalSession, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        let mut create_session = CreateBillingPortalSession::new(parsed_customer_id);
        create_session.return_url = Some(return_url);

        let session = BillingPortalSession::create(&self.client, create_session).await?;
        info!("Created billing portal session for customer: {}", customer_id);
        
        Ok(session)
    }

    /// Retrieve a PaymentIntent by ID
    pub async fn get_payment_intent(&self, payment_intent_id: &str) -> Result<PaymentIntent, StripeServiceError> {
        let parsed_payment_intent_id = payment_intent_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe payment intent ID format".to_string()))?;
        let payment_intent = PaymentIntent::retrieve(&self.client, &parsed_payment_intent_id, &[]).await?;
        Ok(payment_intent)
    }

    /// Retrieve a subscription by ID (basic info only)
    pub async fn get_subscription(&self, subscription_id: &str) -> Result<Subscription, StripeServiceError> {
        let parsed_subscription_id = subscription_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe subscription ID format".to_string()))?;
        let subscription = Subscription::retrieve(&self.client, &parsed_subscription_id, &[]).await?;
        Ok(subscription)
    }

    /// Simple subscription update for immediate plan changes only
    /// For complex operations, redirect to Stripe Customer Portal
    pub async fn update_subscription_immediate(
        &self,
        subscription_id: &str,
        new_price_id: &str,
        metadata: Option<HashMap<String, String>>,
    ) -> Result<Subscription, StripeServiceError> {
        // Get current subscription to retrieve existing item IDs
        let current_subscription = self.get_subscription(subscription_id).await?;
        
        let mut update_sub = UpdateSubscription::new();
        
        // Update the subscription item with the new price
        if let Some(items) = current_subscription.items.data.first() {
            let mut update_items = Vec::new();
            let mut item_update = UpdateSubscriptionItems::default();
            item_update.id = Some(items.id.to_string());
            item_update.price = Some(new_price_id.to_string());
            update_items.push(item_update);
            update_sub.items = Some(update_items);
        }
        
        if let Some(meta) = metadata {
            update_sub.metadata = Some(meta);
        }

        let parsed_subscription_id = subscription_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe subscription ID format".to_string()))?;
        let subscription = Subscription::update(&self.client, &parsed_subscription_id, update_sub).await?;
        info!("Updated subscription immediately: {}", subscription_id);
        
        Ok(subscription)
    }

    /// Generate Stripe Customer Portal URL for complex billing operations
    /// This redirects users to Stripe's hosted portal for:
    /// - Complex subscription changes with proration
    /// - Payment method management  
    /// - Billing address updates
    /// - Invoice downloads
    /// - Payment failure resolution
    pub fn generate_portal_url(
        &self,
        customer_id: &str,
        return_url: &str,
    ) -> String {
        format!(
            "https://billing.stripe.com/p/session/{}/{}?return_url={}",
            customer_id,
            "portal_session_id", // This would be replaced with actual portal session creation
            urlencoding::encode(return_url)
        )
    }
    
    /// Utility function to check if an operation should redirect to Customer Portal
    pub fn should_redirect_to_portal(operation: &str) -> bool {
        match operation {
            "payment_method_management" => true,
            "complex_subscription_change" => true,
            "billing_address_update" => true,
            "invoice_download" => true,
            "payment_failure_resolution" => true,
            // Keep these operations in-app
            "credit_purchase" => false,
            "basic_plan_upgrade" => false,
            "subscription_status_display" => false,
            "trial_creation" => false,
            _ => true, // Default to portal for unknown operations
        }
    }

    /// List payment methods for a customer from Stripe
    pub async fn list_payment_methods(&self, customer_id: &str) -> Result<Vec<PaymentMethod>, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut list_params = ListPaymentMethods::new();
        list_params.customer = Some(parsed_customer_id);
        list_params.type_ = Some(stripe::PaymentMethodTypeFilter::Card);

        let payment_methods = PaymentMethod::list(&self.client, &list_params).await?;
        info!("Retrieved {} payment methods for customer: {}", payment_methods.data.len(), customer_id);
        
        Ok(payment_methods.data)
    }

    /// List invoices for a customer from Stripe
    pub async fn list_invoices(&self, customer_id: &str) -> Result<Vec<Invoice>, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut list_params = ListInvoices::new();
        list_params.customer = Some(parsed_customer_id);
        list_params.limit = Some(100); // Reasonable limit

        let invoices = Invoice::list(&self.client, &list_params).await?;
        info!("Retrieved {} invoices for customer: {}", invoices.data.len(), customer_id);
        
        Ok(invoices.data)
    }

    /// List invoices for a customer from Stripe with status filter and pagination
    pub async fn list_invoices_with_filter(&self, customer_id: &str, status: Option<&str>, limit: Option<u64>, starting_after: Option<&str>) -> Result<Vec<Invoice>, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut list_params = ListInvoices::new();
        list_params.customer = Some(parsed_customer_id);
        
        // Pass pagination parameters directly to Stripe API
        list_params.limit = limit;
        if let Some(starting_after_value) = starting_after {
            list_params.starting_after = Some(starting_after_value.parse()
                .map_err(|_| StripeServiceError::Configuration("Invalid starting_after invoice ID format".to_string()))?);
        }
        
        // Set status filter if provided
        if let Some(status_str) = status {
            list_params.status = match status_str.to_lowercase().as_str() {
                "draft" => Some(InvoiceStatus::Draft),
                "open" => Some(InvoiceStatus::Open),
                "paid" => Some(InvoiceStatus::Paid),
                "uncollectible" => Some(InvoiceStatus::Uncollectible),
                "void" => Some(InvoiceStatus::Void),
                _ => None, // Unknown status, ignore filter
            };
        }

        let invoices = Invoice::list(&self.client, &list_params).await?;
        info!("Retrieved {} invoices for customer: {} with pagination (limit: {:?}, starting_after: {:?})", invoices.data.len(), customer_id, limit, starting_after);
        
        Ok(invoices.data)
    }

    /// Detach/delete a payment method in Stripe
    pub async fn detach_payment_method(&self, payment_method_id: &str) -> Result<PaymentMethod, StripeServiceError> {
        let parsed_payment_method_id = payment_method_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe payment method ID format".to_string()))?;
        
        let payment_method = PaymentMethod::detach(&self.client, &parsed_payment_method_id).await?;
        info!("Detached payment method: {}", payment_method_id);
        
        Ok(payment_method)
    }

    /// Set default payment method for a customer in Stripe
    pub async fn set_default_payment_method(&self, customer_id: &str, payment_method_id: &str) -> Result<Customer, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut update_customer = stripe::UpdateCustomer::new();
        update_customer.invoice_settings = Some(stripe::CustomerInvoiceSettings {
            default_payment_method: Some(payment_method_id.parse()
                .map_err(|_| StripeServiceError::Configuration("Invalid Stripe payment method ID format".to_string()))?),
            ..Default::default()
        });

        let customer = Customer::update(&self.client, &parsed_customer_id, update_customer).await?;
        info!("Set default payment method {} for customer: {}", payment_method_id, customer_id);
        
        Ok(customer)
    }

    /// Create a product and price for subscription plans (admin use only)
    pub async fn create_product_and_price(
        &self,
        product_name: &str,
        price_amount: i64,
        currency: Currency,
        interval: stripe::CreatePriceRecurringInterval,
    ) -> Result<(Product, Price), StripeServiceError> {
        // Create product
        let mut create_product = CreateProduct::new(product_name);
        create_product.type_ = Some(stripe::ProductType::Service);
        
        let product = Product::create(&self.client, create_product).await?;
        
        // Create price
        let mut create_price = CreatePrice::new(currency);
        create_price.product = Some(stripe::IdOrCreate::Id(&product.id));
        create_price.unit_amount = Some(price_amount);
        
        let recurring = stripe::CreatePriceRecurring {
            interval,
            ..Default::default()
        };
        create_price.recurring = Some(recurring);
        
        let price = Price::create(&self.client, create_price).await?;
        
        info!("Created product {} and price {} for {}", product.id, price.id, product_name);
        Ok((product, price))
    }

    /// Create a checkout session for subscription (required by handlers)
    pub async fn create_checkout_session(
        &self,
        customer_id: &str,
        price_id: &str,
        mode: CheckoutSessionMode,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<CheckoutSession, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut create_session = CreateCheckoutSession::new();
        create_session.customer = Some(parsed_customer_id);
        create_session.mode = Some(mode);
        create_session.success_url = Some(success_url);
        create_session.cancel_url = Some(cancel_url);
        
        // Add line items for subscription
        let line_items = vec![stripe::CreateCheckoutSessionLineItems {
            price: Some(price_id.to_string()),
            quantity: Some(1),
            ..Default::default()
        }];
        create_session.line_items = Some(line_items);

        let session = CheckoutSession::create(&self.client, create_session).await?;
        info!("Created checkout session for customer: {}", customer_id);
        
        Ok(session)
    }

    /// Create a SetupIntent for saving payment method without charging (required by handlers)
    pub async fn create_setup_intent(
        &self,
        customer_id: &str,
        metadata: HashMap<String, String>,
    ) -> Result<SetupIntent, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut create_intent = CreateSetupIntent::new();
        create_intent.customer = Some(parsed_customer_id);
        create_intent.metadata = Some(metadata);

        let setup_intent = SetupIntent::create(&self.client, create_intent).await?;
        info!("Created SetupIntent for customer: {}", customer_id);
        
        Ok(setup_intent)
    }

    /// Preview subscription update (required by handlers)
    pub async fn preview_subscription_update(
        &self,
        subscription_id: &str,
        new_price_id: &str,
        proration_behavior: ProrationBehavior,
    ) -> Result<Invoice, StripeServiceError> {
        // Get current subscription
        let current_subscription = self.get_subscription(subscription_id).await?;
        
        // Create preview parameters
        let mut preview_params = stripe::CreateInvoice::new();
        preview_params.customer = Some(current_subscription.customer.id().clone());
        preview_params.subscription = Some(subscription_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe subscription ID format".to_string()))?);
        
        // This is a simplified preview - in production you'd use the upcoming invoice API
        // For now, return a basic response indicating the preview is complex
        return Err(StripeServiceError::SubscriptionManagement(
            "Preview functionality requires Stripe Customer Portal for complex calculations".to_string()
        ));
    }

    /// Cancel a subscription either immediately or at period end (required by handlers)
    pub async fn cancel_subscription(
        &self,
        subscription_id: &str,
        at_period_end: bool,
    ) -> Result<Subscription, StripeServiceError> {
        let mut update_sub = UpdateSubscription::new();
        
        if at_period_end {
            // Set to cancel at the end of the current period
            update_sub.cancel_at_period_end = Some(true);
        } else {
            // Cancel immediately
            update_sub.cancel_at_period_end = Some(false);
        }

        let parsed_subscription_id = subscription_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe subscription ID format".to_string()))?;
        
        let subscription = if at_period_end {
            // Just update the subscription to cancel at period end
            Subscription::update(&self.client, &parsed_subscription_id, update_sub).await?
        } else {
            // Actually cancel the subscription immediately
            Subscription::cancel(&self.client, &parsed_subscription_id, stripe::CancelSubscription::default()).await?
        };
        
        info!("Canceled subscription {} (at_period_end: {})", subscription_id, at_period_end);
        
        Ok(subscription)
    }

    /// Resume a subscription by removing cancel_at_period_end flag (required by handlers)
    pub async fn resume_subscription(
        &self,
        subscription_id: &str,
    ) -> Result<Subscription, StripeServiceError> {
        let mut update_sub = UpdateSubscription::new();
        update_sub.cancel_at_period_end = Some(false);

        let parsed_subscription_id = subscription_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe subscription ID format".to_string()))?;
        let subscription = Subscription::update(&self.client, &parsed_subscription_id, update_sub).await?;
        info!("Resumed subscription: {}", subscription_id);
        
        Ok(subscription)
    }
}

/// Helper function to convert Currency enum from string
pub fn currency_from_str(s: &str) -> Result<Currency, StripeServiceError> {
    match s.to_lowercase().as_str() {
        "usd" => Ok(Currency::USD),
        "eur" => Ok(Currency::EUR),
        "gbp" => Ok(Currency::GBP),
        "cad" => Ok(Currency::CAD),
        "aud" => Ok(Currency::AUD),
        "jpy" => Ok(Currency::JPY),
        _ => Err(StripeServiceError::Configuration(format!("Unsupported currency: {}", s))),
    }
}