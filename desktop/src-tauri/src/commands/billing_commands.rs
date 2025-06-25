use crate::error::AppError;
use crate::api_clients::billing_client::BillingClient;
use crate::models::{SubscriptionPlan, ListInvoicesResponse};
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use log::{debug, info, warn, error};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailedUsage {
    pub service_name: String,
    pub model_display_name: String,
    pub provider_code: String,
    pub model_type: String,
    pub total_cost: f64,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_duration_ms: i64,
}
use regex::Regex;
use once_cell::sync::Lazy;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionResponse {
    pub url: String,
    pub session_id: String,
}


// ========================================
// VALIDATION UTILITIES FOR BILLING SECURITY
// ========================================

// Compiled regex patterns for validation
static PAYMENT_METHOD_ID_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^pm_[a-zA-Z0-9]{20,30}$").unwrap()
});

static STRIPE_PRICE_ID_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^price_[a-zA-Z0-9]{20,30}$").unwrap()
});

static PLAN_ID_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9_-]{3,50}$").unwrap()
});

static EMAIL_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
});

static CURRENCY_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[A-Z]{3}$").unwrap()
});

static ALPHANUMERIC_ID_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap()
});

/// Validates a payment method ID
fn validate_payment_method_id(payment_method_id: &str) -> Result<(), AppError> {
    if payment_method_id.is_empty() {
        return Err(AppError::ValidationError("Payment method ID cannot be empty".to_string()));
    }

    if !PAYMENT_METHOD_ID_PATTERN.is_match(payment_method_id) {
        warn!("Invalid payment method ID format: {}", payment_method_id);
        return Err(AppError::ValidationError("Invalid payment method ID format".to_string()));
    }

    Ok(())
}

/// Validates a Stripe price ID
fn validate_stripe_price_id(price_id: &str) -> Result<(), AppError> {
    if price_id.is_empty() {
        return Err(AppError::ValidationError("Price ID cannot be empty".to_string()));
    }

    if !STRIPE_PRICE_ID_PATTERN.is_match(price_id) {
        warn!("Invalid Stripe price ID format: {}", price_id);
        return Err(AppError::ValidationError("Invalid price ID format".to_string()));
    }

    Ok(())
}

/// Validates a plan ID
fn validate_plan_id(plan_id: &str) -> Result<(), AppError> {
    if plan_id.is_empty() {
        return Err(AppError::ValidationError("Plan ID cannot be empty".to_string()));
    }

    if !PLAN_ID_PATTERN.is_match(plan_id) {
        warn!("Invalid plan ID format: {}", plan_id);
        return Err(AppError::ValidationError("Invalid plan ID format".to_string()));
    }

    Ok(())
}


/// Validates address field length
fn validate_address_field(field: &str, field_name: &str, max_length: usize) -> Result<(), AppError> {
    if field.len() > max_length {
        return Err(AppError::ValidationError(format!("{} exceeds maximum length of {} characters", field_name, max_length)));
    }
    Ok(())
}

/// Validates due days for invoice settings
fn validate_due_days(due_days: i32) -> Result<(), AppError> {
    if due_days < 1 || due_days > 365 {
        return Err(AppError::ValidationError("Due days must be between 1 and 365".to_string()));
    }
    Ok(())
}

/// Validates URL format (basic validation)
fn validate_url(url: &str, field_name: &str) -> Result<(), AppError> {
    if url.is_empty() {
        return Ok(()); // Empty URL is allowed
    }

    if url.len() > 2048 {
        return Err(AppError::ValidationError(format!("{} URL exceeds maximum length", field_name)));
    }

    // Basic URL validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::ValidationError(format!("{} must be a valid HTTP or HTTPS URL", field_name)));
    }

    Ok(())
}



/// Validates an email address
fn validate_email(email: &str) -> Result<(), AppError> {
    if email.is_empty() {
        return Err(AppError::ValidationError("Email address cannot be empty".to_string()));
    }

    if email.len() > 254 {
        return Err(AppError::ValidationError("Email address is too long".to_string()));
    }

    if !EMAIL_PATTERN.is_match(email) {
        warn!("Invalid email format: {}", email);
        return Err(AppError::ValidationError("Invalid email address format".to_string()));
    }

    Ok(())
}

/// Validates a monetary amount
fn validate_payment_amount(amount: f64, field_name: &str) -> Result<(), AppError> {
    if amount <= 0.0 {
        return Err(AppError::ValidationError(format!("{} must be greater than zero", field_name)));
    }

    if amount > 10000.0 {
        return Err(AppError::ValidationError(format!("{} exceeds maximum allowed value", field_name)));
    }

    // Check for reasonable precision (max 2 decimal places)
    let rounded = (amount * 100.0).round() / 100.0;
    if (amount - rounded).abs() > f64::EPSILON {
        return Err(AppError::ValidationError(format!("{} can have at most 2 decimal places", field_name)));
    }

    Ok(())
}

/// Validates a spending limit (can be None)
fn validate_spending_limit(limit: Option<f64>) -> Result<(), AppError> {
    if let Some(limit_value) = limit {
        if limit_value < 0.0 {
            return Err(AppError::ValidationError("Spending limit cannot be negative".to_string()));
        }

        if limit_value > 100000.0 {
            return Err(AppError::ValidationError("Spending limit exceeds maximum allowed value".to_string()));
        }
    }

    Ok(())
}

/// Validates a currency code
fn validate_currency_code(currency: &str) -> Result<(), AppError> {
    if currency.is_empty() {
        return Err(AppError::ValidationError("Currency code cannot be empty".to_string()));
    }

    if !CURRENCY_PATTERN.is_match(currency) {
        warn!("Invalid currency code: {}", currency);
        return Err(AppError::ValidationError("Currency code must be a valid 3-letter ISO code".to_string()));
    }

    let supported_currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"];
    if !supported_currencies.contains(&currency) {
        return Err(AppError::ValidationError(format!("Currency {} is not supported", currency)));
    }

    Ok(())
}

/// Sanitizes user input by removing potentially dangerous characters
fn sanitize_string_input(input: &str) -> String {
    input
        .chars()
        .filter(|c| {
            // Allow alphanumeric, spaces, and common punctuation
            c.is_alphanumeric() || " .-_@+()[]{}:,;!?'\"".contains(*c)
        })
        .take(1000) // Limit length
        .collect::<String>()
        .trim()
        .to_string()
}

/// Rate limiting check for sensitive operations
fn check_rate_limit(operation: &str) -> Result<(), AppError> {
    // This is a placeholder for actual rate limiting implementation
    // In a real implementation, you would check against a rate limiting store
    debug!("Rate limit check for operation: {}", operation);
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionDetails {
    pub plan: String,
    pub plan_name: Option<String>,
    pub status: String,
    pub trial_ends_at: Option<String>,
    pub current_period_ends_at: Option<String>,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardData {
    pub plan_details: BillingDashboardPlanDetails,
    pub spending_details: BillingDashboardSpendingDetails,
    pub credit_balance_usd: f64,
    pub subscription_status: String,
    pub trial_ends_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardPlanDetails {
    pub plan_id: String,
    pub name: String,
    pub price_usd: f64,
    pub billing_interval: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardSpendingDetails {
    pub current_spending_usd: f64,
    pub spending_limit_usd: f64,
    pub period_start: String,
    pub period_end: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub total_cost: f64,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub monthly_limit: Option<f64>,
    pub hard_limit: Option<f64>,
    pub remaining_allowance: Option<f64>,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingPortalResponse {
    pub url: String,
}




#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditBalanceResponse {
    pub user_id: String,
    pub balance: f64, // Proper numeric type
    pub currency: String,
    pub last_updated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditTransactionEntry {
    pub id: String,
    pub amount: f64,
    pub currency: String,
    pub transaction_type: String,
    pub description: String,
    pub created_at: String,
    pub balance_after: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditHistoryResponse {
    pub transactions: Vec<CreditTransactionEntry>,
    pub total_count: i64,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditDetailsResponse {
    pub balance: f64,
    pub currency: String,
    pub last_updated: Option<String>,
    pub transactions: Vec<CreditTransactionEntry>,
    pub total_transaction_count: i64,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditStats {
    pub user_id: String,
    pub current_balance: f64,
    pub total_purchased: f64,
    pub total_consumed: f64,
    pub total_refunded: f64,
    pub transaction_count: i64,
    pub currency: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPack {
    pub id: String,
    pub name: String,
    pub value_credits: f64,
    pub price_amount: f64,
    pub currency: String,
    pub description: Option<String>,
    pub recommended: bool,
    pub bonus_percentage: Option<f64>,
    pub is_popular: Option<bool>,
    pub is_active: bool,
    pub display_order: i32,
    pub stripe_price_id: String,
}


/// Get consolidated billing dashboard data
#[tauri::command]
pub async fn get_billing_dashboard_data_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<BillingDashboardData, AppError> {
    debug!("Getting billing dashboard data via Tauri command");
    
    let dashboard_data = billing_client.get_billing_dashboard_data().await?;
    
    info!("Successfully retrieved billing dashboard data");
    Ok(dashboard_data)
}

/// Get available subscription plans
#[tauri::command]
pub async fn get_subscription_plans_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<Vec<SubscriptionPlan>, AppError> {
    debug!("Getting subscription plans via Tauri command");
    
    let subscription_plans = billing_client.get_subscription_plans().await?;
    
    info!("Successfully retrieved subscription plans");
    Ok(subscription_plans)
}






/// Get spending history
#[tauri::command]
pub async fn get_spending_history_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting spending history via Tauri command");
    
    let spending_history = billing_client.get_spending_history().await?;
    
    info!("Successfully retrieved spending history");
    Ok(spending_history)
}

/// Check if AI services are accessible
#[tauri::command]
pub async fn check_service_access_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Checking service access via Tauri command");
    
    let service_access = billing_client.check_service_access().await?;
    
    info!("Successfully checked service access");
    Ok(service_access)
}

/// Get spending analytics
#[tauri::command]
pub async fn get_spending_analytics_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting spending analytics via Tauri command");
    
    let analytics = billing_client.get_spending_analytics().await?;
    
    info!("Successfully retrieved spending analytics");
    Ok(analytics)
}

/// Get spending forecast
#[tauri::command]
pub async fn get_spending_forecast_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting spending forecast via Tauri command");
    
    let forecast = billing_client.get_spending_forecast().await?;
    
    info!("Successfully retrieved spending forecast");
    Ok(forecast)
}




/// Get credit transaction history
#[tauri::command]
pub async fn get_credit_history_command(
    billing_client: State<'_, Arc<BillingClient>>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<CreditHistoryResponse, AppError> {
    debug!("Getting credit history via Tauri command");
    
    let credit_history = billing_client.get_credit_history(limit, offset).await?;
    
    info!("Successfully retrieved credit history");
    Ok(credit_history)
}


/// Get current credit balance for the user
#[tauri::command]
pub async fn get_credit_balance_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<CreditBalanceResponse, AppError> {
    debug!("Getting credit balance via Tauri command");
    
    let credit_balance = billing_client.get_credit_balance().await?;
    
    info!("Successfully retrieved credit balance");
    Ok(credit_balance)
}

/// Get user's credit statistics
#[tauri::command]
pub async fn get_credit_stats_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<CreditStats, AppError> {
    debug!("Getting credit stats via Tauri command");
    
    let credit_stats = billing_client.get_credit_stats().await?;
    
    info!("Successfully retrieved credit stats");
    Ok(credit_stats)
}

/// Get comprehensive credit details (balance, stats, and recent transactions)
#[tauri::command]
pub async fn get_credit_details_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<CreditDetailsResponse, AppError> {
    debug!("Getting credit details via Tauri command");
    
    // Get balance and history separately and combine them
    let balance_response = billing_client.get_credit_balance().await?;
    let history_response = billing_client.get_credit_history(Some(20), Some(0)).await?;
    
    let credit_details = CreditDetailsResponse {
        balance: balance_response.balance,
        currency: balance_response.currency,
        last_updated: balance_response.last_updated,
        transactions: history_response.transactions,
        total_transaction_count: history_response.total_count,
        has_more: history_response.has_more,
    };
    
    info!("Successfully retrieved credit details");
    Ok(credit_details)
}

/// Get available credit packs for purchase
#[tauri::command]
pub async fn get_credit_packs_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<Vec<CreditPack>, AppError> {
    debug!("Getting credit packs via Tauri command");
    
    let credit_packs = billing_client.get_available_credit_packs().await?;
    
    info!("Successfully retrieved credit packs");
    Ok(credit_packs)
}

// ========================================
// STRIPE CHECKOUT SESSION COMMANDS
// ========================================


/// Create a checkout session for credit purchase
#[tauri::command]
pub async fn create_credit_checkout_session_command(
    billing_client: State<'_, Arc<BillingClient>>,
    credit_pack_id: String,
) -> Result<CheckoutSessionResponse, AppError> {
    debug!("Creating checkout session for credit pack: {}", credit_pack_id);
    
    // Security validation
    check_rate_limit("create_credit_checkout_session")?;
    
    let checkout_response = billing_client.create_credit_checkout_session(&credit_pack_id).await?;
    
    info!("Successfully created checkout session for credit purchase");
    Ok(CheckoutSessionResponse {
        url: checkout_response.url,
        session_id: checkout_response.session_id,
    })
}

/// Create a checkout session for subscription
#[tauri::command]
pub async fn create_subscription_checkout_session_command(
    billing_client: State<'_, Arc<BillingClient>>,
    plan_id: String,
) -> Result<CheckoutSessionResponse, AppError> {
    debug!("Creating subscription checkout session for plan: {}", plan_id);
    
    let checkout_response = billing_client.create_subscription_checkout_session(
        &plan_id,
        None
    ).await?;
    
    info!("Successfully created subscription checkout session");
    Ok(CheckoutSessionResponse {
        url: checkout_response.url,
        session_id: checkout_response.session_id,
    })
}

/// Create a checkout session for payment method setup
#[tauri::command]
pub async fn create_setup_checkout_session_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<CheckoutSessionResponse, AppError> {
    debug!("Creating setup checkout session for payment method setup");
    
    let checkout_response = billing_client.create_setup_checkout_session().await?;
    
    info!("Successfully created setup checkout session");
    Ok(CheckoutSessionResponse {
        url: checkout_response.url,
        session_id: checkout_response.session_id,
    })
}

/// Get checkout session status
#[tauri::command]
pub async fn get_checkout_session_status_command(
    session_id: String,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting checkout session status for session: {}", session_id);
    
    let status = billing_client.confirm_checkout_session(&session_id).await?;
    
    info!("Successfully retrieved checkout session status");
    Ok(status)
}

// ========================================
// SUBSCRIPTION LIFECYCLE MANAGEMENT
// ========================================


/// Get usage summary
#[tauri::command]
pub async fn get_usage_summary_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting usage summary via Tauri command");
    
    let usage_summary = billing_client.get_usage_summary().await?;
    
    info!("Successfully retrieved usage summary");
    Ok(usage_summary)
}

/// Create a billing portal session
#[tauri::command]
pub async fn create_billing_portal_session_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<BillingPortalResponse, AppError> {
    debug!("Creating billing portal session");
    
    // Security validation
    check_rate_limit("create_billing_portal_session")?;
    
    let portal_response = billing_client.create_billing_portal().await?;
    
    info!("Successfully created billing portal session");
    Ok(portal_response)
}









// ========================================
// PAYMENT METHOD MANAGEMENT STRUCTS
// ========================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethodCard {
    pub brand: String,
    pub last4: String,
    pub exp_month: u32,
    pub exp_year: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethod {
    pub id: String,
    pub type_: String, // Renamed to avoid keyword conflict
    pub card: Option<PaymentMethodCard>,
    pub created: i64,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethodsResponse {
    pub total_methods: usize,
    pub has_default: bool,
    pub methods: Vec<PaymentMethod>,
}

// ========================================
// PAYMENT METHOD MANAGEMENT COMMANDS
// ========================================

/// Get payment methods with enhanced type safety
#[tauri::command]
pub async fn get_payment_methods_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<PaymentMethodsResponse, AppError> {
    debug!("Getting payment methods via Tauri command with struct-based deserialization");
    
    // Security validation
    check_rate_limit("get_payment_methods")?;
    
    let payment_methods = billing_client.get_payment_methods().await
        .map_err(|e| {
            error!("Failed to retrieve payment methods via command: {}", e);
            e
        })?;
    
    info!("Successfully retrieved payment methods via command with {} methods", payment_methods.total_methods);
    Ok(payment_methods)
}





/// Set default payment method for the user
#[tauri::command]
pub async fn set_default_payment_method_command(
    payment_method_id: String,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Setting default payment method: {}", payment_method_id);
    
    // Security validation
    check_rate_limit("set_default_payment_method")?;
    validate_payment_method_id(&payment_method_id)?;
    
    let result = billing_client.set_default_payment_method(&payment_method_id).await?;
    
    info!("Successfully set default payment method");
    Ok(result)
}

/// Detach payment method from the user
#[tauri::command]
pub async fn detach_payment_method_command(
    payment_method_id: String,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Detaching payment method: {}", payment_method_id);
    
    // Security validation
    check_rate_limit("detach_payment_method")?;
    validate_payment_method_id(&payment_method_id)?;
    
    let result = billing_client.detach_payment_method(&payment_method_id).await?;
    
    info!("Successfully detached payment method");
    Ok(result)
}

/// List invoices with optional pagination
#[tauri::command]
pub async fn list_invoices_command(
    limit: Option<i32>,
    offset: Option<i32>,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<ListInvoicesResponse, AppError> {
    debug!("List invoices command called with limit: {:?}, offset: {:?}", limit, offset);
    
    // Security validation
    check_rate_limit("list_invoices")?;
    
    let response = billing_client
        .list_invoices(limit, offset)
        .await?;
    
    info!("Successfully retrieved {} invoices via command", response.invoices.len());
    Ok(response)
}

/// Get detailed usage for a specific date range
#[tauri::command]
pub async fn get_detailed_usage_command(
    start_date: String,
    end_date: String,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<Vec<DetailedUsage>, AppError> {
    debug!("Getting detailed usage from {} to {}", start_date, end_date);
    
    let detailed_usage_json = billing_client.get_detailed_usage(&start_date, &end_date).await?;
    
    let detailed_usage: Vec<DetailedUsage> = if let serde_json::Value::Array(arr) = detailed_usage_json {
        arr.into_iter().map(|v| {
            serde_json::from_value(v).map_err(|e| AppError::SerializationError(format!("Failed to deserialize detailed usage: {}", e)))
        }).collect::<Result<Vec<DetailedUsage>, AppError>>()?
    } else {
        return Err(AppError::SerializationError("Expected array for detailed usage".to_string()));
    };
    
    info!("Successfully retrieved detailed usage");
    Ok(detailed_usage)
}

/// Get current subscription plan with cost markup information
#[tauri::command]
pub async fn get_current_plan_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<CurrentPlanResponse, AppError> {
    debug!("Getting current plan with cost markup information");
    
    let current_plan = billing_client.get_current_plan().await?;
    
    info!("Successfully retrieved current plan information");
    Ok(current_plan)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentPlanResponse {
    pub plan_id: String,
    pub plan_name: String,
    pub cost_markup_percentage: f64,
    pub status: String,
}

/// Response structure for credit details (alias for CreditDetailsResponse)
pub type CreditDetails = CreditDetailsResponse;


