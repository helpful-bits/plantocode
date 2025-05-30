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