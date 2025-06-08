use crate::error::AppError;
use crate::auth::token_manager::TokenManager;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use reqwest::Client;
use std::sync::Arc;
use log::{debug, error, info};

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
    pub is_trialing: Option<bool>,
    pub has_cancelled: Option<bool>,
    pub next_invoice_amount: Option<f64>,
    pub currency: Option<String>,
    pub usage: UsageInfo,
    pub credit_balance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub total_cost: f64,
    pub usage_percentage: f64,
    pub services_blocked: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionResponse {
    pub url: String,
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
pub struct InvoiceHistoryResponse {
    pub invoices: Vec<InvoiceHistoryEntry>,
    pub total_count: usize,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditBalanceResponse {
    pub user_id: String,
    pub balance: f64, // Proper numeric type
    pub currency: String,
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

async fn make_authenticated_request<T: for<'de> Deserialize<'de>>(
    token_manager: &Arc<TokenManager>,
    method: &str,
    endpoint: &str,
    body: Option<serde_json::Value>,
) -> Result<T, AppError> {
    let server_url = std::env::var("MAIN_SERVER_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let token = token_manager.get().await
        .ok_or_else(|| AppError::AuthError("No authentication token available".to_string()))?;
    
    let client = Client::new();
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(&format!("{}{}", server_url, endpoint)),
        "POST" => client.post(&format!("{}{}", server_url, endpoint)),
        "PUT" => client.put(&format!("{}{}", server_url, endpoint)),
        "DELETE" => client.delete(&format!("{}{}", server_url, endpoint)),
        _ => return Err(AppError::InvalidArgument("Unsupported HTTP method".to_string())),
    };
    
    request_builder = request_builder.header("Authorization", format!("Bearer {}", token));
    
    if let Some(body_data) = body {
        request_builder = request_builder
            .header("Content-Type", "application/json")
            .json(&body_data);
    }
    
    let response = request_builder
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Request failed: {}", e)))?;
    
    if !response.status().is_success() {
        return Err(AppError::ExternalServiceError(format!("Server error: {}", response.status())));
    }
    
    let result: T = response
        .json()
        .await
        .map_err(|e| AppError::InvalidResponse(format!("Failed to parse response: {}", e)))?;
    
    Ok(result)
}

/// Get subscription details for the current user
#[tauri::command]
pub async fn get_subscription_details_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<SubscriptionDetails, AppError> {
    debug!("Getting subscription details via Tauri command");
    
    let subscription_details = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/billing/subscription",
        None,
    ).await?;
    
    info!("Successfully retrieved subscription details");
    Ok(subscription_details)
}

/// Create a checkout session for plan upgrade
#[tauri::command]
pub async fn create_checkout_session_command(
    token_manager: State<'_, Arc<TokenManager>>,
    plan: String,
) -> Result<CheckoutSessionResponse, AppError> {
    debug!("Creating checkout session for plan: {}", plan);
    
    let request_body = serde_json::json!({
        "plan": plan
    });
    
    let checkout_response = make_authenticated_request(
        &token_manager,
        "POST",
        "/api/billing/checkout",
        Some(request_body),
    ).await?;
    
    info!("Successfully created checkout session for plan: {}", plan);
    Ok(checkout_response)
}

/// Create a billing portal session
#[tauri::command]
pub async fn create_billing_portal_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<BillingPortalResponse, AppError> {
    debug!("Creating billing portal session");
    
    let portal_response = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/billing/portal",
        None,
    ).await?;
    
    info!("Successfully created billing portal session");
    Ok(portal_response)
}

/// Get current spending status
#[tauri::command]
pub async fn get_spending_status_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<SpendingStatusInfo, AppError> {
    debug!("Getting spending status via Tauri command");
    
    let spending_status = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/spending/status",
        None,
    ).await?;
    
    info!("Successfully retrieved spending status");
    Ok(spending_status)
}

/// Acknowledge a spending alert
#[tauri::command]
pub async fn acknowledge_spending_alert_command(
    token_manager: State<'_, Arc<TokenManager>>,
    alert_id: String,
) -> Result<bool, AppError> {
    debug!("Acknowledging spending alert: {}", alert_id);
    
    let request_body = serde_json::json!({
        "alertId": alert_id
    });
    
    let _response: serde_json::Value = make_authenticated_request(
        &token_manager,
        "POST",
        "/api/spending/alerts/acknowledge",
        Some(request_body),
    ).await?;
    
    info!("Successfully acknowledged spending alert: {}", alert_id);
    Ok(true)
}

/// Update spending limits
#[tauri::command]
pub async fn update_spending_limits_command(
    token_manager: State<'_, Arc<TokenManager>>,
    monthly_spending_limit: Option<f64>,
    hard_limit: Option<f64>,
) -> Result<bool, AppError> {
    debug!("Updating spending limits");
    
    let request_body = serde_json::json!({
        "monthlySpendingLimit": monthly_spending_limit,
        "hardLimit": hard_limit,
    });
    
    let _response: serde_json::Value = make_authenticated_request(
        &token_manager,
        "PUT",
        "/api/spending/limits",
        Some(request_body),
    ).await?;
    
    info!("Successfully updated spending limits");
    Ok(true)
}

/// Get invoice history
#[tauri::command]
pub async fn get_invoice_history_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<InvoiceHistoryResponse, AppError> {
    debug!("Getting invoice history via Tauri command");
    
    let invoice_history = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/billing/invoices",
        None,
    ).await?;
    
    info!("Successfully retrieved invoice history");
    Ok(invoice_history)
}

/// Get spending history
#[tauri::command]
pub async fn get_spending_history_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting spending history via Tauri command");
    
    let spending_history = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/spending/history",
        None,
    ).await?;
    
    info!("Successfully retrieved spending history");
    Ok(spending_history)
}

/// Check if AI services are accessible
#[tauri::command]
pub async fn check_service_access_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Checking service access via Tauri command");
    
    let service_access = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/spending/access",
        None,
    ).await?;
    
    info!("Successfully checked service access");
    Ok(service_access)
}

/// Get spending analytics
#[tauri::command]
pub async fn get_spending_analytics_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting spending analytics via Tauri command");
    
    let analytics = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/spending/analytics",
        None,
    ).await?;
    
    info!("Successfully retrieved spending analytics");
    Ok(analytics)
}

/// Get spending forecast
#[tauri::command]
pub async fn get_spending_forecast_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting spending forecast via Tauri command");
    
    let forecast = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/spending/forecast",
        None,
    ).await?;
    
    info!("Successfully retrieved spending forecast");
    Ok(forecast)
}

/// Get payment methods
#[tauri::command]
pub async fn get_payment_methods_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<serde_json::Value, AppError> {
    debug!("Getting payment methods via Tauri command");
    
    let payment_methods = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/billing/payment-methods",
        None,
    ).await?;
    
    info!("Successfully retrieved payment methods");
    Ok(payment_methods)
}

/// Purchase credits via Stripe checkout
#[tauri::command]
pub async fn purchase_credits_command(
    token_manager: State<'_, Arc<TokenManager>>,
    stripe_price_id: String,
) -> Result<CheckoutSessionResponse, AppError> {
    debug!("Purchasing credits with Stripe price ID: {}", stripe_price_id);
    
    let request_body = serde_json::json!({
        "stripePriceId": stripe_price_id
    });
    
    let checkout_response = make_authenticated_request(
        &token_manager,
        "POST",
        "/api/credits/purchase",
        Some(request_body),
    ).await?;
    
    info!("Successfully created credit purchase checkout session for price: {}", stripe_price_id);
    Ok(checkout_response)
}

/// Get current credit balance
#[tauri::command]
pub async fn get_credit_balance_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<CreditBalanceResponse, AppError> {
    debug!("Getting credit balance via Tauri command");
    
    let credit_balance = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/credits/balance",
        None,
    ).await?;
    
    info!("Successfully retrieved credit balance");
    Ok(credit_balance)
}

/// Get credit transaction history
#[tauri::command]
pub async fn get_credit_history_command(
    token_manager: State<'_, Arc<TokenManager>>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<CreditHistoryResponse, AppError> {
    debug!("Getting credit history via Tauri command");
    
    let mut query_params = Vec::new();
    if let Some(limit) = limit {
        query_params.push(format!("limit={}", limit));
    }
    if let Some(offset) = offset {
        query_params.push(format!("offset={}", offset));
    }
    
    let query_string = if query_params.is_empty() {
        String::new()
    } else {
        format!("?{}", query_params.join("&"))
    };
    
    let endpoint = format!("/api/credits/transactions{}", query_string);
    
    let credit_history = make_authenticated_request(
        &token_manager,
        "GET",
        &endpoint,
        None,
    ).await?;
    
    info!("Successfully retrieved credit history");
    Ok(credit_history)
}

/// Get available credit packs for purchase
#[tauri::command]
pub async fn get_credit_packs_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<CreditPacksResponse, AppError> {
    debug!("Getting credit packs via Tauri command");
    
    let credit_packs = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/credits/packs",
        None,
    ).await?;
    
    info!("Successfully retrieved credit packs");
    Ok(credit_packs)
}

/// Get user's credit statistics
#[tauri::command]
pub async fn get_credit_stats_command(
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<CreditStats, AppError> {
    debug!("Getting credit stats via Tauri command");
    
    let credit_stats = make_authenticated_request(
        &token_manager,
        "GET",
        "/api/credits/stats",
        None,
    ).await?;
    
    info!("Successfully retrieved credit stats");
    Ok(credit_stats)
}