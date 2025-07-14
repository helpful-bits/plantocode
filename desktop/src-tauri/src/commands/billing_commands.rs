use crate::error::AppError;
use crate::api_clients::billing_client::BillingClient;
use crate::models::ListInvoicesResponse;
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use log::{debug, info, warn, error};
use chrono::{Utc, Duration};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailedUsage {
    pub service_name: String,
    pub model_display_name: String,
    pub provider_code: String,
    pub total_cost: f64,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_duration_ms: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub total_cost: f64,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_duration_ms: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailedUsageResponse {
    pub detailed_usage: Vec<DetailedUsage>,
    pub summary: UsageSummary,
}
use regex::Regex;
use once_cell::sync::Lazy;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionResponse {
    pub url: String,
    pub session_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionStatusResponse {
    pub status: String,
    pub payment_status: String,
    pub customer_email: Option<String>,
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
pub struct BillingDashboardData {
    pub credit_balance_usd: f64,
    pub services_blocked: bool,
    pub is_payment_method_required: bool,
    pub is_billing_info_required: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaxIdInfo {
    pub r#type: String,
    pub value: String,
    pub country: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerBillingInfo {
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub phone: Option<String>,
    pub tax_exempt: Option<String>,
    pub tax_ids: Vec<TaxIdInfo>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub address_city: Option<String>,
    pub address_state: Option<String>,
    pub address_postal_code: Option<String>,
    pub address_country: Option<String>,
    pub has_billing_info: bool,
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
    pub price: f64,  // renamed from amount
    pub currency: String,
    pub model: Option<String>,  // new field - model name or "Credit Purchase"
    pub input_tokens: Option<i64>,  // new field
    pub output_tokens: Option<i64>,  // new field
    pub balance_after: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditHistoryResponse {
    pub transactions: Vec<CreditTransactionEntry>,
    pub total_count: i64,
    pub has_more: bool,
}

// New unified credit history entry that includes API usage token details
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedCreditHistoryEntry {
    pub id: String,
    pub price: f64,  // Negative for usage, positive for purchases
    pub date: String,
    pub model: String,  // Model name or "Credit Purchase" for purchases
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub balance_after: f64,
    pub description: String,
    pub transaction_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedCreditHistoryResponse {
    pub entries: Vec<UnifiedCreditHistoryEntry>,
    pub total_count: i64,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditDetailsResponse {
    pub stats: CreditStats,
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
    pub net_balance: f64,
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

/// Get customer billing information for read-only display
#[tauri::command]
pub async fn get_customer_billing_info_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<Option<CustomerBillingInfo>, AppError> {
    debug!("Getting customer billing info via Tauri command");
    
    let billing_info = billing_client.get_customer_billing_info().await?;
    
    info!("Successfully retrieved customer billing info");
    Ok(billing_info)
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




/// Get credit transaction history with unified API usage and token details
#[tauri::command]
pub async fn get_credit_history_command(
    billing_client: State<'_, Arc<BillingClient>>,
    limit: Option<i32>,
    offset: Option<i32>,
    search: Option<String>,
) -> Result<UnifiedCreditHistoryResponse, AppError> {
    debug!("Getting unified credit history via Tauri command");
    
    let unified_credit_history = billing_client.get_unified_credit_history(limit, offset, search).await?;
    
    info!("Successfully retrieved unified credit history");
    Ok(unified_credit_history)
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
    
    let credit_details = billing_client.get_credit_details(Some(20), Some(0)).await?;
    
    info!("Successfully retrieved credit details");
    Ok(credit_details)
}


// ========================================
// STRIPE CHECKOUT SESSION COMMANDS
// ========================================


/// Create a checkout session for credit purchase with gross amount (includes processing fees)
#[tauri::command]
pub async fn create_credit_purchase_checkout_session_command(
    billing_client: State<'_, Arc<BillingClient>>,
    amount: f64,
) -> Result<CheckoutSessionResponse, AppError> {
    debug!("Creating checkout session for gross amount: ${}", amount);
    
    // Security validation
    check_rate_limit("create_credit_purchase_checkout_session")?;
    validate_payment_amount(amount, "gross amount")?;
    
    // Additional validation for reasonable credit purchase amounts
    if amount < 1.0 {
        return Err(AppError::ValidationError("Minimum purchase amount is $1.00".to_string()));
    }
    
    if amount > 1000.0 {
        return Err(AppError::ValidationError("Maximum purchase amount is $1,000.00".to_string()));
    }
    
    let checkout_response = billing_client.create_credit_purchase_checkout_session(amount).await?;
    
    info!("Successfully created checkout session for credit purchase with gross amount ${}", amount);
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
) -> Result<CheckoutSessionStatusResponse, AppError> {
    debug!("Getting checkout session status for session: {}", session_id);
    
    let status_json = billing_client.confirm_checkout_session(&session_id).await?;
    
    let status: CheckoutSessionStatusResponse = serde_json::from_value(status_json)
        .map_err(|e| AppError::SerializationError(format!("Failed to deserialize checkout session status: {}", e)))?;
    
    info!("Successfully retrieved checkout session status");
    Ok(status)
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









/// Download invoice PDF and save to Downloads folder
#[tauri::command]
pub async fn download_invoice_pdf_command(
    invoice_id: String,
    pdf_url: String,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<String, AppError> {
    debug!("Downloading invoice PDF for invoice: {}", invoice_id);
    
    // Security validation
    check_rate_limit("download_invoice_pdf")?;
    validate_url(&pdf_url, "PDF URL")?;
    
    // Fetch PDF bytes
    let response = billing_client.get_raw_http_client()
        .get(&pdf_url)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to download PDF: {}", e)))?;
    
    if !response.status().is_success() {
        return Err(AppError::NetworkError(format!("Failed to download PDF: HTTP {}", response.status())));
    }
    
    let pdf_bytes = response.bytes()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to read PDF bytes: {}", e)))?;
    
    // Get Downloads directory
    let downloads_dir = dirs::download_dir()
        .ok_or_else(|| AppError::FileSystemError("Could not find Downloads directory".to_string()))?;
    
    // Create filename with timestamp to avoid conflicts
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("invoice_{}_{}_{}.pdf", invoice_id, timestamp, "download");
    let file_path = downloads_dir.join(&filename);
    
    // Write PDF to file
    std::fs::write(&file_path, pdf_bytes)
        .map_err(|e| AppError::FileSystemError(format!("Failed to save PDF: {}", e)))?;
    
    let file_path_str = file_path.to_string_lossy().to_string();
    info!("Successfully downloaded invoice PDF to: {}", file_path_str);
    
    Ok(file_path_str)
}

/// Reveal file in system file explorer (Finder on macOS, Explorer on Windows, etc.)
#[tauri::command]
pub async fn reveal_file_in_explorer_command(file_path: String) -> Result<(), AppError> {
    debug!("Revealing file in explorer: {}", file_path);
    
    // Security validation
    check_rate_limit("reveal_file_in_explorer")?;
    
    // Check if file exists
    if !std::path::Path::new(&file_path).exists() {
        return Err(AppError::FileSystemError("File does not exist".to_string()));
    }
    
    // Platform-specific commands to reveal file in explorer
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(&["/select,", &format!("\"{}\"", file_path)])
            .spawn()
            .map_err(|e| AppError::FileSystemError(format!("Failed to reveal file in Explorer: {}", e)))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(&["-R", &file_path])
            .spawn()
            .map_err(|e| AppError::FileSystemError(format!("Failed to reveal file in Finder: {}", e)))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try multiple Linux file managers
        let managers = ["nautilus", "dolphin", "thunar", "pcmanfm"];
        let mut revealed = false;
        
        for manager in &managers {
            if let Ok(_) = std::process::Command::new(manager)
                .arg(&file_path)
                .spawn()
            {
                revealed = true;
                break;
            }
        }
        
        if !revealed {
            // Fallback: try to open parent directory
            if let Some(parent) = std::path::Path::new(&file_path).parent() {
                std::process::Command::new("xdg-open")
                    .arg(parent)
                    .spawn()
                    .map_err(|e| AppError::FileSystemError(format!("Failed to open directory: {}", e)))?;
            }
        }
    }
    
    info!("Successfully revealed file in explorer: {}", file_path);
    Ok(())
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


/// Get detailed usage with pre-calculated summary totals for a specific date range
#[tauri::command]
pub async fn get_detailed_usage_with_summary_command(
    start_date: String,
    end_date: String,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<DetailedUsageResponse, AppError> {
    debug!("Getting detailed usage with summary from {} to {}", start_date, end_date);
    
    let detailed_usage_response = billing_client.get_detailed_usage_with_summary(&start_date, &end_date).await?;
    
    info!("Successfully retrieved detailed usage with summary");
    Ok(detailed_usage_response)
}



/// Response structure for credit details (alias for CreditDetailsResponse)
pub type CreditDetails = CreditDetailsResponse;

// ========================================
// AUTO TOP-OFF STRUCTURES AND COMMANDS
// ========================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoTopOffSettings {
    pub enabled: bool,
    pub threshold: Option<String>,
    pub amount: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAutoTopOffRequest {
    pub enabled: bool,
    pub threshold: Option<f64>,
    pub amount: Option<f64>,
}

/// Get auto top-off settings for the user
#[tauri::command]
pub async fn get_auto_top_off_settings_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<AutoTopOffSettings, AppError> {
    debug!("Getting auto top-off settings via Tauri command");
    
    let settings = billing_client.get_auto_top_off_settings().await?;
    
    info!("Successfully retrieved auto top-off settings");
    Ok(settings)
}

/// Update auto top-off settings for the user
#[tauri::command]
pub async fn update_auto_top_off_settings_command(
    request: UpdateAutoTopOffRequest,
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<AutoTopOffSettings, AppError> {
    debug!("Updating auto top-off settings via Tauri command");
    
    // Validate the request
    if request.enabled {
        if request.threshold.is_none() {
            return Err(AppError::ValidationError("Auto top-off threshold is required when auto top-off is enabled".to_string()));
        }
        if request.amount.is_none() {
            return Err(AppError::ValidationError("Auto top-off amount is required when auto top-off is enabled".to_string()));
        }
        
        if let Some(threshold) = request.threshold {
            if threshold <= 0.0 || threshold > 1000.0 {
                return Err(AppError::ValidationError("Auto top-off threshold must be between $0.01 and $1000.00".to_string()));
            }
        }
        
        if let Some(amount) = request.amount {
            if amount <= 0.0 || amount > 1000.0 {
                return Err(AppError::ValidationError("Auto top-off amount must be between $0.01 and $1000.00".to_string()));
            }
        }
    }
    
    let settings = billing_client.update_auto_top_off_settings(&request).await?;
    
    info!("Successfully updated auto top-off settings");
    Ok(settings)
}



