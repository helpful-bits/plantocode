use crate::error::AppError;
use crate::auth::token_manager::TokenManager;
use chrono;
use crate::commands::billing_commands::{
    BillingPortalResponse,
    CreditBalanceResponse, CreditHistoryResponse,
    CreditStats,
    PaymentMethodsResponse, PaymentMethod, PaymentMethodCard,
    BillingDashboardData, CustomerBillingInfo,
    DetailedUsageResponse
};
use crate::models::ListInvoicesResponse;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionResponse {
    pub url: String,
    pub session_id: String,
}


use reqwest::Client;

// Server-side payment method structures for robust deserialization
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPaymentMethod {
    pub id: String,
    #[serde(rename = "type")]
    pub type_field: String,
    pub card: Option<ServerPaymentMethodCard>,
    pub created: i64,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPaymentMethodCard {
    pub brand: String,
    pub last4: String,
    pub exp_month: u32,
    pub exp_year: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPaymentMethodsResponse {
    pub total_methods: usize,
    pub has_default: bool,
    pub methods: Vec<ServerPaymentMethod>,
}

// Server-side credit transaction structures for robust deserialization
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCreditTransactionEntry {
    pub id: String,
    pub amount: String,
    pub currency: String,
    pub transaction_type: String,
    pub description: String,
    pub created_at: String,
    pub balance_after: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCreditHistoryResponse {
    pub transactions: Vec<ServerCreditTransactionEntry>,
    pub total_count: i64,
    pub has_more: bool,
}
use std::sync::Arc;
use log::{debug, error, info};
use crate::commands::billing_commands::{AutoTopOffSettings, UpdateAutoTopOffRequest};

/// Dedicated client for handling billing-related API calls
pub struct BillingClient {
    http_client: Client,
    token_manager: Arc<TokenManager>,
}

impl BillingClient {
    /// Create a new BillingClient instance
    pub fn new(token_manager: Arc<TokenManager>) -> Self {
        let http_client = Client::new();
        Self {
            http_client,
            token_manager,
        }
    }

    /// Get the raw HTTP client for direct requests (e.g., downloading files)
    pub fn get_raw_http_client(&self) -> &Client {
        &self.http_client
    }

    /// Internal helper method for making authenticated requests
    async fn make_authenticated_request<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        endpoint: &str,
        body: Option<serde_json::Value>,
    ) -> Result<T, AppError> {
        let server_url = std::env::var("MAIN_SERVER_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:8080".to_string());
        
        let token = self.token_manager.get().await
            .ok_or_else(|| AppError::AuthError("No authentication token available".to_string()))?;
        
        let mut request_builder = match method.to_uppercase().as_str() {
            "GET" => self.http_client.get(&format!("{}{}", server_url, endpoint)),
            "POST" => self.http_client.post(&format!("{}{}", server_url, endpoint)),
            "PUT" => self.http_client.put(&format!("{}{}", server_url, endpoint)),
            "DELETE" => self.http_client.delete(&format!("{}{}", server_url, endpoint)),
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


    /// Get consolidated billing dashboard data
    pub async fn get_billing_dashboard_data(&self) -> Result<BillingDashboardData, AppError> {
        debug!("Getting billing dashboard data via BillingClient");
        
        let dashboard_data = self.make_authenticated_request(
            "GET",
            "/api/billing/dashboard",
            None,
        ).await?;
        
        info!("Successfully retrieved billing dashboard data");
        Ok(dashboard_data)
    }

    /// Get customer billing information for read-only display
    pub async fn get_customer_billing_info(&self) -> Result<Option<CustomerBillingInfo>, AppError> {
        debug!("Getting customer billing info via BillingClient");
        
        let billing_info = self.make_authenticated_request(
            "GET",
            "/api/billing/customer-info",
            None,
        ).await?;
        
        info!("Successfully retrieved customer billing info");
        Ok(billing_info)
    }




    /// Create a billing portal session
    pub async fn create_billing_portal(&self) -> Result<BillingPortalResponse, AppError> {
        debug!("Creating billing portal session");
        
        let portal_response = self.make_authenticated_request(
            "POST",
            "/api/billing/create-portal-session",
            None,
        ).await?;
        
        info!("Successfully created billing portal session");
        Ok(portal_response)
    }




    /// Get spending history
    pub async fn get_spending_history(&self) -> Result<serde_json::Value, AppError> {
        debug!("Getting spending history via BillingClient");
        
        let spending_history = self.make_authenticated_request(
            "GET",
            "/api/billing/spending/history",
            None,
        ).await?;
        
        info!("Successfully retrieved spending history");
        Ok(spending_history)
    }

    /// Check if AI services are accessible
    pub async fn check_service_access(&self) -> Result<serde_json::Value, AppError> {
        debug!("Checking service access via BillingClient");
        
        let service_access = self.make_authenticated_request(
            "GET",
            "/api/billing/spending/access",
            None,
        ).await?;
        
        info!("Successfully checked service access");
        Ok(service_access)
    }

    /// Get spending analytics
    pub async fn get_spending_analytics(&self) -> Result<serde_json::Value, AppError> {
        debug!("Getting spending analytics via BillingClient");
        
        let analytics = self.make_authenticated_request(
            "GET",
            "/api/billing/spending/analytics",
            None,
        ).await?;
        
        info!("Successfully retrieved spending analytics");
        Ok(analytics)
    }

    /// Get spending forecast
    pub async fn get_spending_forecast(&self) -> Result<serde_json::Value, AppError> {
        debug!("Getting spending forecast via BillingClient");
        
        let forecast = self.make_authenticated_request(
            "GET",
            "/api/billing/spending/forecast",
            None,
        ).await?;
        
        info!("Successfully retrieved spending forecast");
        Ok(forecast)
    }

    /// Get payment methods with robust struct-based deserialization
    pub async fn get_payment_methods(&self) -> Result<PaymentMethodsResponse, AppError> {
        debug!("Getting payment methods via BillingClient with struct-based deserialization");
        
        // Use struct-based deserialization for robust type safety
        let server_response: ServerPaymentMethodsResponse = self.make_authenticated_request(
            "GET",
            "/api/billing/payment-methods",
            None,
        ).await?;
        
        // Transform server structs to client structs
        let methods: Vec<PaymentMethod> = server_response.methods
            .into_iter()
            .map(|server_method| PaymentMethod {
                id: server_method.id,
                type_: server_method.type_field,
                card: server_method.card.map(|server_card| PaymentMethodCard {
                    brand: server_card.brand,
                    last4: server_card.last4,
                    exp_month: server_card.exp_month,
                    exp_year: server_card.exp_year,
                }),
                created: server_method.created,
                is_default: server_method.is_default,
            })
            .collect();
        
        let payment_methods_response = PaymentMethodsResponse {
            total_methods: server_response.total_methods,
            has_default: server_response.has_default,
            methods,
        };
        
        info!("Successfully retrieved payment methods with struct-based deserialization");
        Ok(payment_methods_response)
    }



    /// Get current credit balance
    pub async fn get_credit_balance(&self) -> Result<CreditBalanceResponse, AppError> {
        debug!("Getting credit balance via BillingClient");
        
        let credit_balance = self.make_authenticated_request(
            "GET",
            "/api/billing/credits/balance",
            None,
        ).await?;
        
        info!("Successfully retrieved credit balance");
        Ok(credit_balance)
    }

    /// Get credit transaction history with robust struct-based deserialization
    pub async fn get_credit_history(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
        search: Option<String>,
    ) -> Result<CreditHistoryResponse, AppError> {
        debug!("Getting credit history via BillingClient with struct-based deserialization");
        
        let mut query_params = Vec::new();
        if let Some(limit) = limit {
            query_params.push(format!("limit={}", limit));
        }
        if let Some(offset) = offset {
            query_params.push(format!("offset={}", offset));
        }
        if let Some(search) = search {
            query_params.push(format!("search={}", urlencoding::encode(&search)));
        }
        
        let query_string = if query_params.is_empty() {
            String::new()
        } else {
            format!("?{}", query_params.join("&"))
        };
        
        let endpoint = format!("/api/billing/credits/transaction-history{}", query_string);
        
        // Use struct-based deserialization for robust type safety
        let server_response: ServerCreditHistoryResponse = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        // Transform server structs to client structs
        let transactions: Vec<crate::commands::billing_commands::CreditTransactionEntry> = server_response.transactions
            .into_iter()
            .map(|server_transaction| {
                // Parse string amounts to f64 with error handling
                let amount = server_transaction.amount.parse::<f64>()
                    .unwrap_or_else(|e| {
                        error!("Failed to parse amount '{}': {}. Using default value 0.0", server_transaction.amount, e);
                        0.0
                    });
                
                let balance_after = server_transaction.balance_after.parse::<f64>()
                    .unwrap_or_else(|e| {
                        error!("Failed to parse balance_after '{}': {}. Using default value 0.0", server_transaction.balance_after, e);
                        0.0
                    });
                
                // Handle empty description with default
                let description = if server_transaction.description.trim().is_empty() {
                    "No description".to_string()
                } else {
                    server_transaction.description
                };
                
                crate::commands::billing_commands::CreditTransactionEntry {
                    id: server_transaction.id,
                    amount,
                    currency: server_transaction.currency,
                    transaction_type: server_transaction.transaction_type,
                    description,
                    created_at: server_transaction.created_at,
                    balance_after,
                }
            })
            .collect();
        
        let credit_history_response = CreditHistoryResponse {
            transactions,
            total_count: server_response.total_count,
            has_more: server_response.has_more,
        };
        
        info!("Successfully retrieved credit history with struct-based deserialization");
        Ok(credit_history_response)
    }


    /// Get user's credit statistics
    pub async fn get_credit_stats(&self) -> Result<CreditStats, AppError> {
        debug!("Getting credit stats via BillingClient");
        
        let credit_stats = self.make_authenticated_request(
            "GET",
            "/api/billing/credits/stats",
            None,
        ).await?;
        
        info!("Successfully retrieved credit stats");
        Ok(credit_stats)
    }

    /// Get comprehensive credit details (stats, transactions, and pagination info)
    pub async fn get_credit_details(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<crate::commands::billing_commands::CreditDetailsResponse, AppError> {
        debug!("Getting credit details via BillingClient");
        
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
        
        let endpoint = format!("/api/billing/credits/details{}", query_string);
        
        let credit_details = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved credit details");
        Ok(credit_details)
    }

    // ========================================
    // STRIPE CHECKOUT SESSION METHODS
    // ========================================

    /// Create a checkout session for credit purchase
    pub async fn create_credit_purchase_checkout_session(
        &self,
        amount: f64,
    ) -> Result<CheckoutSessionResponse, AppError> {
        debug!("Creating checkout session for credit amount: {}", amount);
        
        let request_body = serde_json::json!({
            "amount": amount.to_string()
        });
        
        let response: CheckoutSessionResponse = self.make_authenticated_request(
            "POST",
            "/api/billing/checkout/custom-credit-session",
            Some(request_body),
        ).await?;
        
        info!("Successfully created checkout session for credit purchase");
        Ok(response)
    }


    /// Create a checkout session for payment method setup
    pub async fn create_setup_checkout_session(&self) -> Result<CheckoutSessionResponse, AppError> {
        debug!("Creating setup checkout session for payment method setup");
        
        let response: CheckoutSessionResponse = self.make_authenticated_request(
            "POST",
            "/api/billing/checkout/setup-session",
            None,
        ).await?;
        
        info!("Successfully created setup checkout session");
        Ok(response)
    }

    /// Confirm checkout session status
    pub async fn confirm_checkout_session(&self, session_id: &str) -> Result<serde_json::Value, AppError> {
        debug!("Getting checkout session status for: {}", session_id);
        
        let endpoint = format!("/api/billing/checkout/session-status/{}", session_id);
        
        let status = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved checkout session status");
        Ok(status)
    }

    // ========================================
    // SUBSCRIPTION LIFECYCLE MANAGEMENT
    // ========================================

    /// Get usage summary
    pub async fn get_usage_summary(&self) -> Result<serde_json::Value, AppError> {
        debug!("Getting usage summary via BillingClient");
        
        let usage_summary = self.make_authenticated_request(
            "GET",
            "/api/billing/usage",
            None,
        ).await?;
        
        info!("Successfully retrieved usage summary");
        Ok(usage_summary)
    }

    /// Get detailed usage for a specific date range
    pub async fn get_detailed_usage(&self, start_date: &str, end_date: &str) -> Result<serde_json::Value, AppError> {
        debug!("Getting detailed usage from {} to {} via BillingClient", start_date, end_date);
        
        let query_params = format!("start_date={}&end_date={}", start_date, end_date);
        let endpoint = format!("/api/billing/usage/details?{}", query_params);
        
        let detailed_usage = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved detailed usage");
        Ok(detailed_usage)
    }

    /// Get detailed usage with pre-calculated summary for a specific date range
    pub async fn get_detailed_usage_with_summary(&self, start_date: &str, end_date: &str) -> Result<DetailedUsageResponse, AppError> {
        debug!("Getting detailed usage with summary from {} to {} via BillingClient", start_date, end_date);
        
        let query_params = format!("start_date={}&end_date={}", start_date, end_date);
        let endpoint = format!("/api/billing/usage-summary?{}", query_params);
        
        let detailed_usage_response = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved detailed usage with summary");
        Ok(detailed_usage_response)
    }


    // ========================================
    // PAYMENT METHOD MANAGEMENT
    // ========================================



    /// List invoices with optional pagination
    pub async fn list_invoices(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<ListInvoicesResponse, AppError> {
        debug!("Listing invoices with limit: {:?}, offset: {:?}", limit, offset);
        
        // Validate pagination parameters
        let limit = limit.map(|l| l.clamp(1, 100)).unwrap_or(50);
        let offset = offset.map(|o| o.max(0)).unwrap_or(0);
        
        let mut query_params = Vec::new();
        query_params.push(format!("limit={}", limit));
        query_params.push(format!("offset={}", offset));
        
        let query_string = format!("?{}", query_params.join("&"));
        let endpoint = format!("/api/billing/invoices{}", query_string);
        
        let response = self.make_authenticated_request::<ListInvoicesResponse>("GET", &endpoint, None)
            .await?;
        
        info!("Successfully retrieved {} invoices", response.invoices.len());
        Ok(response)
    }

    // ========================================
    // AUTO TOP-OFF METHODS
    // ========================================

    /// Get auto top-off settings for the user
    pub async fn get_auto_top_off_settings(&self) -> Result<AutoTopOffSettings, AppError> {
        debug!("Getting auto top-off settings via BillingClient");
        
        let settings = self.make_authenticated_request(
            "GET",
            "/api/billing/auto-top-off-settings",
            None,
        ).await?;
        
        info!("Successfully retrieved auto top-off settings");
        Ok(settings)
    }

    /// Update auto top-off settings for the user
    pub async fn update_auto_top_off_settings(&self, request: &UpdateAutoTopOffRequest) -> Result<AutoTopOffSettings, AppError> {
        debug!("Updating auto top-off settings via BillingClient");
        
        let request_body = serde_json::json!({
            "enabled": request.enabled,
            "threshold": request.threshold.map(|v| v.to_string()),
            "amount": request.amount.map(|v| v.to_string())
        });
        
        let settings = self.make_authenticated_request(
            "POST",
            "/api/billing/auto-top-off-settings",
            Some(request_body),
        ).await?;
        
        info!("Successfully updated auto top-off settings");
        Ok(settings)
    }

    /// Report cancelled job cost to server for billing tracking
    /// Server will extract user_id from JWT token automatically
    pub async fn report_cancelled_job_cost(
        &self,
        request_id: &str,
        final_cost: f64,
        token_counts: serde_json::Value,
        service_name: Option<&str>,
    ) -> Result<(), AppError> {
        debug!("Reporting cancelled job cost for request {}: ${:.6}", request_id, final_cost);
        
        let mut request_body = serde_json::json!({
            "request_id": request_id,
            "final_cost": final_cost,
            "token_counts": token_counts,
            "cancelled_at": chrono::Utc::now().to_rfc3339()
        });
        
        // Add service_name if provided
        if let Some(service) = service_name {
            request_body["service_name"] = serde_json::Value::String(service.to_string());
        }
        
        let _response: serde_json::Value = self.make_authenticated_request(
            "POST",
            "/api/billing/cancelled-job-cost",
            Some(request_body),
        ).await?;
        
        info!("Successfully reported cancelled job cost for request {}", request_id);
        Ok(())
    }

}