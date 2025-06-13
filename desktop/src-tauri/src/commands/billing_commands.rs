use crate::error::AppError;
use crate::api_clients::billing_client::BillingClient;
use crate::models::SubscriptionPlan;
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use log::{debug, info, warn, error};
use regex::Regex;
use once_cell::sync::Lazy;

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

/// Validates a credit pack ID
fn validate_credit_pack_id(credit_pack_id: &str) -> Result<(), AppError> {
    if credit_pack_id.is_empty() {
        return Err(AppError::ValidationError("Credit pack ID cannot be empty".to_string()));
    }

    if credit_pack_id.len() < 3 || credit_pack_id.len() > 50 {
        return Err(AppError::ValidationError("Credit pack ID must be between 3 and 50 characters".to_string()));
    }

    if !ALPHANUMERIC_ID_PATTERN.is_match(credit_pack_id) {
        warn!("Invalid credit pack ID format: {}", credit_pack_id);
        return Err(AppError::ValidationError("Credit pack ID contains invalid characters".to_string()));
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
pub struct SpendingStatusInfo {
    pub current_spending: f64,
    pub included_allowance: f64,
    pub remaining_allowance: f64,
    pub overage_amount: f64,
    pub usage_percentage: f64,
    pub services_blocked: bool,
    pub hard_limit: f64,
    pub next_billing_date: String,
    pub currency: String,
    pub alerts: Vec<SpendingAlert>,
    pub credit_balance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingAlert {
    pub id: String,
    pub alert_type: String,
    pub threshold_amount: f64,
    pub current_spending: f64,
    pub alert_sent_at: String,
    pub acknowledged: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpendingLimitsRequest {
    pub monthly_spending_limit: Option<f64>,
    pub hard_limit: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpendingLimitsResponse {
    pub success: bool,
    pub message: String,
    pub updated_limits: UpdatedLimitsInfo,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatedLimitsInfo {
    pub monthly_allowance: f64,
    pub hard_limit: f64,
    pub current_spending: f64,
    pub services_blocked: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceHistoryEntry {
    pub id: String,
    pub amount: f64,
    pub currency: String,
    pub status: String,
    pub created_date: String,
    pub due_date: Option<String>,
    pub paid_date: Option<String>,
    pub invoice_pdf: Option<String>,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceHistoryRequest {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub status: Option<String>,
    pub search: Option<String>,
    pub sort_field: Option<String>,
    pub sort_direction: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceSummary {
    pub total_amount: f64,
    pub paid_amount: f64,
    pub unpaid_amount: f64,
    pub currency: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceHistoryResponse {
    pub invoices: Vec<InvoiceHistoryEntry>,
    pub total_count: usize,
    pub has_more: bool,
    pub summary: InvoiceSummary,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditBalanceResponse {
    pub user_id: String,
    pub balance: f64, // Proper numeric type
    pub currency: String,
    pub last_updated: String,
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
    pub total_count: usize,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPack {
    pub id: String,
    pub name: String,
    pub value_credits: f64, // Amount of credits user gets
    pub price_amount: f64,  // Actual price to pay
    pub currency: String,
    pub stripe_price_id: String,
    pub description: Option<String>,
    pub recommended: bool,
    pub bonus_percentage: Option<f64>,
    pub is_popular: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPacksResponse {
    pub packs: Vec<CreditPack>,
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




/// Acknowledge a spending alert
#[tauri::command]
pub async fn acknowledge_spending_alert_command(
    billing_client: State<'_, Arc<BillingClient>>,
    alert_id: String,
) -> Result<bool, AppError> {
    debug!("Acknowledging spending alert: {}", alert_id);
    
    let _response = billing_client.acknowledge_spending_alert(alert_id.clone()).await?;
    
    info!("Successfully acknowledged spending alert: {}", alert_id);
    Ok(true)
}

/// Update spending limits
#[tauri::command]
pub async fn update_spending_limits_command(
    billing_client: State<'_, Arc<BillingClient>>,
    monthly_spending_limit: Option<f64>,
    hard_limit: Option<f64>,
) -> Result<UpdateSpendingLimitsResponse, AppError> {
    debug!("Updating spending limits");
    
    // Security validation
    check_rate_limit("update_spending_limits")?;
    validate_spending_limit(monthly_spending_limit)?;
    validate_spending_limit(hard_limit)?;
    
    let response = billing_client.update_spending_limits(monthly_spending_limit, hard_limit).await?;
    
    info!("Successfully updated spending limits");
    Ok(response)
}

/// Get invoice history with optional filtering
#[tauri::command]
pub async fn get_invoice_history_command(
    request: Option<InvoiceHistoryRequest>,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<InvoiceHistoryResponse, AppError> {
    debug!("Getting invoice history via Tauri command with request: {:?}", request);
    
    let (limit, offset, status, search, sort_field, sort_direction) = if let Some(req) = request {
        (req.limit, req.offset, req.status, req.search, req.sort_field, req.sort_direction)
    } else {
        (None, None, None, None, None, None)
    };
    
    let invoice_history = billing_client.get_invoice_history(limit, offset, status, search, sort_field, sort_direction).await?;
    
    info!("Successfully retrieved invoice history");
    Ok(invoice_history)
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

/// Get available credit packs for purchase
#[tauri::command]
pub async fn get_credit_packs_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<Vec<CreditPack>, AppError> {
    debug!("Getting credit packs via Tauri command");
    
    let response = billing_client.get_credit_packs().await?;
    
    info!("Successfully retrieved credit packs");
    Ok(response.packs)
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

// ========================================
// MODERN PAYMENT INTENT COMMANDS (2024)
// ========================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentIntentResponse {
    pub client_secret: String,
    pub publishable_key: String,
    pub amount: i64,
    pub currency: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupIntentResponse {
    pub client_secret: String,
    pub publishable_key: String,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubscriptionIntentRequest {
    pub plan_id: String,
    pub trial_days: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionIntentResponse {
    pub subscription_id: String,
    pub client_secret: Option<String>, // For SetupIntent or PaymentIntent
    pub publishable_key: String,
    pub status: String,
    pub trial_end: Option<String>,
}

/// Create a PaymentIntent for credit purchase (modern embedded payment flow)
#[tauri::command]
pub async fn create_credit_payment_intent_command(
    billing_client: State<'_, Arc<BillingClient>>,
    credit_pack_id: String,
    save_payment_method: Option<bool>,
) -> Result<PaymentIntentResponse, AppError> {
    debug!("Creating PaymentIntent for credit pack: {}", credit_pack_id);
    
    // Security validation
    check_rate_limit("create_credit_payment_intent")?;
    validate_credit_pack_id(&credit_pack_id)?;
    
    let payment_intent = billing_client.create_credit_payment_intent(
        &credit_pack_id,
        save_payment_method.unwrap_or(false)
    ).await?;
    
    info!("Successfully created PaymentIntent for credit purchase");
    Ok(payment_intent)
}

/// Create a subscription with SetupIntent for trial (modern embedded payment flow)
#[tauri::command]
pub async fn create_subscription_intent_command(
    billing_client: State<'_, Arc<BillingClient>>,
    request: CreateSubscriptionIntentRequest,
) -> Result<SubscriptionIntentResponse, AppError> {
    debug!("Creating subscription with intent for plan: {}", request.plan_id);
    
    let subscription_intent = billing_client.create_subscription_with_intent(
        &request.plan_id,
        request.trial_days
    ).await?;
    
    info!("Successfully created subscription with intent");
    Ok(subscription_intent)
}

/// Create a SetupIntent for saving payment method without charging
#[tauri::command]
pub async fn create_setup_intent_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<SetupIntentResponse, AppError> {
    debug!("Creating SetupIntent for payment method setup");
    
    let setup_intent = billing_client.create_setup_intent().await?;
    
    info!("Successfully created SetupIntent");
    Ok(setup_intent)
}

/// Confirm payment status after client-side confirmation
#[tauri::command]
pub async fn confirm_payment_status_command(
    billing_client: State<'_, Arc<BillingClient>>,
    payment_intent_id: String,
) -> Result<serde_json::Value, AppError> {
    debug!("Confirming payment status for PaymentIntent: {}", payment_intent_id);
    
    let status = billing_client.get_payment_intent_status(&payment_intent_id).await?;
    
    info!("Successfully retrieved payment status");
    Ok(status)
}

/// Get Stripe publishable key for frontend
#[tauri::command]
pub async fn get_stripe_publishable_key_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<String, AppError> {
    debug!("Getting Stripe publishable key");
    
    let publishable_key = billing_client.get_stripe_publishable_key().await?;
    
    Ok(publishable_key)
}

// ========================================
// SUBSCRIPTION LIFECYCLE MANAGEMENT
// ========================================

/// Cancel a subscription
#[tauri::command]
pub async fn cancel_subscription_command(
    billing_client: State<'_, Arc<BillingClient>>,
    at_period_end: bool,
) -> Result<serde_json::Value, AppError> {
    debug!("Cancelling subscription with at_period_end: {}", at_period_end);
    
    // Security validation
    check_rate_limit("cancel_subscription")?;
    
    let response = billing_client.cancel_subscription(at_period_end).await?;
    
    info!("Successfully cancelled subscription");
    Ok(response)
}

/// Resume a subscription
#[tauri::command]
pub async fn resume_subscription_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Resuming subscription");
    
    // Security validation
    check_rate_limit("resume_subscription")?;
    
    let response = billing_client.resume_subscription().await?;
    
    info!("Successfully resumed subscription");
    Ok(response)
}

/// Reactivate a subscription
#[tauri::command]
pub async fn reactivate_subscription_command(
    billing_client: State<'_, Arc<BillingClient>>,
    plan_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    debug!("Reactivating subscription");
    
    // Security validation
    check_rate_limit("reactivate_subscription")?;
    
    let response = billing_client.reactivate_subscription(plan_id).await?;
    
    info!("Successfully reactivated subscription");
    Ok(response)
}

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

/// Delete a payment method
#[tauri::command]
pub async fn delete_payment_method_command(
    billing_client: State<'_, Arc<BillingClient>>,
    id: String,
) -> Result<bool, AppError> {
    debug!("Deleting payment method: {}", id);
    
    // Security validation
    check_rate_limit("delete_payment_method")?;
    validate_payment_method_id(&id)?;
    
    billing_client.delete_payment_method(&id).await?;
    
    info!("Successfully deleted payment method: {}", id);
    Ok(true)
}

/// Set default payment method
#[tauri::command]
pub async fn set_default_payment_method_command(
    billing_client: State<'_, Arc<BillingClient>>,
    id: String,
) -> Result<bool, AppError> {
    debug!("Setting default payment method: {}", id);
    
    // Security validation
    check_rate_limit("set_default_payment_method")?;
    validate_payment_method_id(&id)?;
    
    billing_client.set_default_payment_method(&id).await?;
    
    info!("Successfully set default payment method: {}", id);
    Ok(true)
}

// ========================================
// BILLING HEALTH MONITORING
// ========================================

/// Billing system health status
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingHealthStatus {
    pub overall_status: HealthStatus,
    pub server_connectivity: bool,
    pub authentication_status: bool,
    pub subscription_accessible: bool,
    pub payment_methods_accessible: bool,
    pub credit_system_accessible: bool,
    pub invoice_system_accessible: bool,
    pub last_checked: String,
    pub error_details: Vec<String>,
    pub warnings: Vec<String>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

/// Comprehensive billing health check
#[tauri::command]
pub async fn check_billing_health_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<BillingHealthStatus, AppError> {
    debug!("Running comprehensive billing health check");
    
    let mut status = BillingHealthStatus {
        overall_status: HealthStatus::Healthy,
        server_connectivity: false,
        authentication_status: false,
        subscription_accessible: false,
        payment_methods_accessible: false,
        credit_system_accessible: false,
        invoice_system_accessible: false,
        last_checked: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string(),
        error_details: Vec::new(),
        warnings: Vec::new(),
        recommendations: Vec::new(),
    };
    
    let mut errors = 0;
    let mut warnings = 0;
    
    // Test server connectivity and authentication by trying to get subscription details
    match billing_client.get_subscription_details().await {
        Ok(_) => {
            status.server_connectivity = true;
            status.authentication_status = true;
            status.subscription_accessible = true;
            info!("Billing health check: Subscription details accessible");
        }
        Err(e) => {
            errors += 1;
            let error_msg = format!("Failed to access subscription details: {}", e);
            status.error_details.push(error_msg.clone());
            error!("Billing health check error: {}", error_msg);
            
            // Try to determine if it's a connectivity or auth issue
            if format!("{}", e).contains("network") || format!("{}", e).contains("connection") {
                status.recommendations.push("Check internet connection and server availability".to_string());
            } else if format!("{}", e).contains("auth") || format!("{}", e).contains("token") {
                status.authentication_status = false;
                status.recommendations.push("Re-authenticate through the login flow".to_string());
            } else {
                status.recommendations.push("Check billing service configuration".to_string());
            }
        }
    }
    
    
    // Test payment methods accessibility  
    match billing_client.get_payment_methods().await {
        Ok(_) => {
            status.payment_methods_accessible = true;
            info!("Billing health check: Payment methods accessible");
        }
        Err(e) => {
            warnings += 1;
            let warning_msg = format!("Payment methods not accessible: {}", e);
            status.warnings.push(warning_msg.clone());
            warn!("Billing health check warning: {}", warning_msg);
        }
    }
    
    // Test credit system accessibility
    match billing_client.get_credit_balance().await {
        Ok(_) => {
            status.credit_system_accessible = true;
            info!("Billing health check: Credit system accessible");
        }
        Err(e) => {
            warnings += 1;
            let warning_msg = format!("Credit system not accessible: {}", e);
            status.warnings.push(warning_msg.clone());
            warn!("Billing health check warning: {}", warning_msg);
        }
    }
    
    // Test invoice system accessibility
    match billing_client.get_invoice_history(Some(1), Some(0), None, None, None, None).await {
        Ok(_) => {
            status.invoice_system_accessible = true;
            info!("Billing health check: Invoice system accessible");
        }
        Err(e) => {
            warnings += 1;
            let warning_msg = format!("Invoice system not accessible: {}", e);
            status.warnings.push(warning_msg.clone());
            warn!("Billing health check warning: {}", warning_msg);
        }
    }
    
    // Determine overall health status
    status.overall_status = if errors > 0 {
        HealthStatus::Unhealthy
    } else if warnings > 0 {
        HealthStatus::Degraded
    } else {
        HealthStatus::Healthy
    };
    
    // Add general recommendations based on status
    match status.overall_status {
        HealthStatus::Healthy => {
            status.recommendations.push("Billing system is operating normally".to_string());
        }
        HealthStatus::Degraded => {
            status.recommendations.push("Some billing features may not be available".to_string());
            status.recommendations.push("Consider refreshing authentication or checking network connection".to_string());
        }
        HealthStatus::Unhealthy => {
            status.recommendations.push("Billing system requires immediate attention".to_string());
            status.recommendations.push("Check authentication status and server connectivity".to_string());
        }
    }
    
    info!("Billing health check completed with status: {:?}", status.overall_status);
    Ok(status)
}

/// Quick billing connectivity test
#[tauri::command]
pub async fn ping_billing_service_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<bool, AppError> {
    debug!("Running quick billing service connectivity test");
    
    // Try a lightweight call to test connectivity
    match billing_client.get_stripe_publishable_key().await {
        Ok(_) => {
            info!("Billing service ping successful");
            Ok(true)
        }
        Err(e) => {
            warn!("Billing service ping failed: {}", e);
            Ok(false)
        }
    }
}

