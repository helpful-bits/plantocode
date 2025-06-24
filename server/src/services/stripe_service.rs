use stripe::{
    Client, CreateCustomer, CreatePaymentIntent, CreateSetupIntent, CreateSubscription,
    CreateBillingPortalSession, PaymentIntent, SetupIntent, 
    Subscription, Customer, BillingPortalSession, Event, EventType,
    PaymentIntentStatus, SubscriptionStatus, Currency,
    PaymentIntentConfirmationMethod, SubscriptionItem,
    CreateSubscriptionItem, Price, Expandable, Invoice, PaymentMethod,
    ListPaymentMethods, CreatePrice, Product, CreateProduct, CreatePriceRecurringInterval, CreatePriceRecurring,
    ApiVersion,
    CreateInvoice, InvoiceStatus, ListInvoices,
    CheckoutSession, CreateCheckoutSession, CheckoutSessionMode,
    UsageRecord, CreateUsageRecord,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
use uuid::Uuid;
use log::{debug, error, info, warn};
use hex;

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

impl std::fmt::Debug for StripeService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StripeService")
            .field("client", &"<stripe::Client>")
            .field("webhook_secret", &"<redacted>")
            .field("publishable_key", &self.publishable_key)
            .finish()
    }
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

    pub async fn create_payment_intent(
        &self,
        customer_id: &str,
        amount_cents: i64,
        currency: &str,
        description: &str,
        metadata: HashMap<String, String>,
        save_payment_method: bool,
    ) -> Result<PaymentIntent, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        let currency_enum = currency_from_str(currency)?;
        
        let mut create_intent = CreatePaymentIntent::new(amount_cents, currency_enum);
        create_intent.customer = Some(parsed_customer_id);
        create_intent.description = Some(description);
        create_intent.metadata = Some(metadata);
        create_intent.confirmation_method = Some(PaymentIntentConfirmationMethod::Automatic);
        
        if save_payment_method {
            create_intent.setup_future_usage = Some(stripe::PaymentIntentSetupFutureUsage::OffSession);
        }

        let payment_intent = PaymentIntent::create(&self.client, create_intent).await
            .map_err(|e| StripeServiceError::StripeApi(e))?;
        
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
        
        let parsed_price_id = price_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe price ID format".to_string()))?;
        
        let item = stripe::CreateSubscriptionItems {
            price: Some(parsed_price_id),
            quantity: Some(1u64),
            ..Default::default()
        };
        let items = vec![item];
        create_sub.items = Some(items);
        
        // Set trial period
        if let Some(days) = trial_days {
            let trial_end = Utc::now() + chrono::Duration::days(days);
            create_sub.trial_end = Some(stripe::Scheduled::Timestamp(trial_end.timestamp()));
        }
        
        create_sub.metadata = Some(metadata);
        create_sub.expand = &["latest_invoice.payment_intent"];

        let subscription = Subscription::create(&self.client, create_sub).await
            .map_err(|e| StripeServiceError::StripeApi(e))?;
        
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

        let session = BillingPortalSession::create(&self.client, create_session).await
            .map_err(|e| StripeServiceError::StripeApi(e))?;
        
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

        let setup_intent = SetupIntent::create(&self.client, create_intent).await
            .map_err(|e| StripeServiceError::StripeApi(e))?;
        
        info!("Created SetupIntent for customer: {}", customer_id);
        Ok(setup_intent)
    }

    /// Create a Stripe Checkout Session (generic for payment and subscription modes)
    pub async fn create_checkout_session(
        &self,
        customer_id: &str,
        mode: CheckoutSessionMode,
        line_items: Option<Vec<stripe::CreateCheckoutSessionLineItems>>,
        success_url: &str,
        cancel_url: &str,
        metadata: HashMap<String, String>,
    ) -> Result<CheckoutSession, StripeServiceError> {
        let parsed_customer_id = customer_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe customer ID format".to_string()))?;
        
        let mut create_session = CreateCheckoutSession::new();
        create_session.customer = Some(parsed_customer_id);
        create_session.mode = Some(mode);
        create_session.line_items = line_items;
        create_session.success_url = Some(success_url);
        create_session.cancel_url = Some(cancel_url);
        create_session.metadata = Some(metadata);
        
        let session = CheckoutSession::create(&self.client, create_session).await
            .map_err(|e| StripeServiceError::StripeApi(e))?;
        
        info!("Created Checkout Session: {} for customer: {}", session.id, customer_id);
        Ok(session)
    }

    /// Get a checkout session by ID
    pub async fn get_checkout_session(&self, session_id: &str) -> Result<CheckoutSession, StripeServiceError> {
        let parsed_session_id = session_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe session ID format".to_string()))?;
        let session = CheckoutSession::retrieve(&self.client, &parsed_session_id, &[]).await?;
        Ok(session)
    }

    /// Report usage to a Stripe subscription item for billing purposes
    pub async fn report_usage_record(
        &self,
        subscription_item_id: &str,
        quantity: i64,
        timestamp: Option<i64>,
    ) -> Result<UsageRecord, StripeServiceError> {
        let parsed_subscription_item_id = subscription_item_id.parse()
            .map_err(|_| StripeServiceError::Configuration("Invalid Stripe subscription item ID format".to_string()))?;
        
        let create_usage_record = CreateUsageRecord {
            quantity: quantity as u64, // Convert i64 to u64 for Stripe API
            timestamp,
            ..Default::default()
        };
        
        let usage_record = UsageRecord::create(&self.client, &parsed_subscription_item_id, create_usage_record).await
            .map_err(|e| {
                error!("Failed to report usage record to Stripe: subscription_item={}, quantity={}, error={}", 
                       subscription_item_id, quantity, e);
                StripeServiceError::StripeApi(e)
            })?;
        
        info!("Successfully reported usage record to Stripe: subscription_item={}, quantity={}, record_id={}", 
              subscription_item_id, quantity, usage_record.id);
        
        Ok(usage_record)
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