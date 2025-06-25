use crate::error::AppError;
use crate::auth::token_manager::TokenManager;
use crate::models::SubscriptionPlan;
use crate::commands::billing_commands::{
    SubscriptionDetails, BillingPortalResponse,
    CreditBalanceResponse, CreditHistoryResponse,
    CreditStats,
    PaymentMethodsResponse, PaymentMethod, PaymentMethodCard,
    BillingDashboardData, CreditPack
};
use crate::models::ListInvoicesResponse;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionResponse {
    pub url: String,
    pub session_id: String,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCreditPack {
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
use std::sync::Arc;
use log::{debug, error, info};

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

    /// Get available subscription plans
    pub async fn get_subscription_plans(&self) -> Result<Vec<SubscriptionPlan>, AppError> {
        debug!("Getting subscription plans via BillingClient");
        
        let subscription_plans: Vec<SubscriptionPlan> = self.make_authenticated_request(
            "GET",
            "/api/billing/subscription-plans",
            None,
        ).await?;
        
        info!("Successfully retrieved subscription plans");
        Ok(subscription_plans)
    }

    /// Get current subscription plan with cost markup information
    pub async fn get_current_plan(&self) -> Result<crate::commands::billing_commands::CurrentPlanResponse, AppError> {
        debug!("Getting current plan with cost markup information");
        
        let current_plan = self.make_authenticated_request(
            "GET",
            "/api/billing/current-plan",
            None,
        ).await?;
        
        info!("Successfully retrieved current plan information");
        Ok(current_plan)
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


    /// Get available credit packs
    pub async fn get_available_credit_packs(&self) -> Result<Vec<CreditPack>, AppError> {
        debug!("Getting available credit packs via BillingClient");
        
        let server_packs: Vec<ServerCreditPack> = self.make_authenticated_request(
            "GET",
            "/api/billing/credits/packs",
            None,
        ).await?;
        
        let credit_packs: Vec<CreditPack> = server_packs
            .into_iter()
            .map(|server_pack| CreditPack {
                id: server_pack.id,
                name: server_pack.name,
                value_credits: server_pack.value_credits,
                price_amount: server_pack.price_amount,
                currency: server_pack.currency,
                description: server_pack.description,
                recommended: server_pack.recommended,
                bonus_percentage: server_pack.bonus_percentage,
                is_popular: server_pack.is_popular,
                is_active: server_pack.is_active,
                display_order: server_pack.display_order,
                stripe_price_id: server_pack.stripe_price_id,
            })
            .collect();
        
        info!("Successfully retrieved available credit packs");
        Ok(credit_packs)
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

    /// Get credit transaction history
    pub async fn get_credit_history(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<CreditHistoryResponse, AppError> {
        debug!("Getting credit history via BillingClient");
        
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
        
        let endpoint = format!("/api/billing/credits/transaction-history{}", query_string);
        
        let credit_history = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved credit history");
        Ok(credit_history)
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

    // ========================================
    // STRIPE CHECKOUT SESSION METHODS
    // ========================================

    /// Create a checkout session for credit purchase
    pub async fn create_credit_checkout_session(
        &self,
        credit_pack_id: &str,
    ) -> Result<CheckoutSessionResponse, AppError> {
        debug!("Creating checkout session for credit pack: {}", credit_pack_id);
        
        let request_body = serde_json::json!({
            "creditPackId": credit_pack_id
        });
        
        let response: CheckoutSessionResponse = self.make_authenticated_request(
            "POST",
            "/api/billing/checkout/credit-session",
            Some(request_body),
        ).await?;
        
        info!("Successfully created checkout session for credit purchase");
        Ok(response)
    }

    /// Create a checkout session for subscription
    pub async fn create_subscription_checkout_session(
        &self,
        plan_id: &str,
        trial_days: Option<u32>,
    ) -> Result<CheckoutSessionResponse, AppError> {
        debug!("Creating subscription checkout session for plan: {}", plan_id);
        
        let request_body = serde_json::json!({
            "planId": plan_id,
            "trialDays": trial_days
        });
        
        let response: CheckoutSessionResponse = self.make_authenticated_request(
            "POST",
            "/api/billing/checkout/subscription-session",
            Some(request_body),
        ).await?;
        
        info!("Successfully created subscription checkout session");
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
        debug!("Confirming checkout session status for: {}", session_id);
        
        let endpoint = format!("/api/billing/checkout/session-status/{}", session_id);
        
        let status = self.make_authenticated_request(
            "POST",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully confirmed checkout session status");
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


    // ========================================
    // PAYMENT METHOD MANAGEMENT
    // ========================================

    /// Set default payment method for the user
    pub async fn set_default_payment_method(&self, payment_method_id: &str) -> Result<serde_json::Value, AppError> {
        debug!("Setting default payment method: {}", payment_method_id);
        
        let endpoint = format!("/api/billing/payment-methods/{}/set-default", payment_method_id);
        
        let result = self.make_authenticated_request(
            "POST",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully set default payment method");
        Ok(result)
    }

    /// Detach payment method from the user
    pub async fn detach_payment_method(&self, payment_method_id: &str) -> Result<serde_json::Value, AppError> {
        debug!("Detaching payment method: {}", payment_method_id);
        
        let endpoint = format!("/api/billing/payment-methods/{}", payment_method_id);
        
        let result = self.make_authenticated_request(
            "DELETE",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully detached payment method");
        Ok(result)
    }

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

}