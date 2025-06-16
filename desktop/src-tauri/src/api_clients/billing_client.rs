use crate::error::AppError;
use crate::auth::token_manager::TokenManager;
use crate::models::SubscriptionPlan;
use crate::commands::billing_commands::{
    SubscriptionDetails, BillingPortalResponse,
    CreditBalanceResponse, CreditHistoryResponse, CreditPacksResponse,
    CreditStats, PaymentIntentResponse, SetupIntentResponse, SubscriptionIntentResponse,
    PaymentMethodsResponse, PaymentMethod, PaymentMethodCard,
    BillingDashboardData, ListInvoicesResponse
};
use serde::{Deserialize, Serialize};
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
        
        let subscription_plans = self.make_authenticated_request(
            "GET",
            "/api/billing/subscription-plans",
            None,
        ).await?;
        
        info!("Successfully retrieved subscription plans");
        Ok(subscription_plans)
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
        
        let endpoint = format!("/api/billing/credits/transactions{}", query_string);
        
        let credit_history = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved credit history");
        Ok(credit_history)
    }

    /// Get available credit packs for purchase
    pub async fn get_credit_packs(&self) -> Result<CreditPacksResponse, AppError> {
        debug!("Getting credit packs via BillingClient");
        
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ServerCreditPack {
            pub id: String,
            pub name: String,
            pub value_credits: String,
            pub price_amount: String,
            pub currency: String,
            pub stripe_price_id: String,
            pub description: Option<String>,
            pub recommended: bool,
            pub bonus_percentage: Option<String>,
            pub is_popular: Option<bool>,
        }
        
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ServerCreditPacksResponse {
            pub packs: Vec<ServerCreditPack>,
        }
        
        let server_response: ServerCreditPacksResponse = self.make_authenticated_request(
            "GET",
            "/api/billing/credits/packs",
            None,
        ).await?;
        
        let packs = server_response.packs
            .into_iter()
            .map(|server_pack| {
                let value_credits = server_pack.value_credits.parse::<f64>()
                    .map_err(|_| AppError::InvalidResponse("Invalid value_credits format".to_string()))?;
                
                let price_amount = server_pack.price_amount.parse::<f64>()
                    .map_err(|_| AppError::InvalidResponse("Invalid price_amount format".to_string()))?;
                
                let bonus_percentage = if let Some(bonus_str) = server_pack.bonus_percentage {
                    Some(bonus_str.parse::<f64>()
                        .map_err(|_| AppError::InvalidResponse("Invalid bonus_percentage format".to_string()))?)
                } else {
                    None
                };
                
                Ok(crate::commands::billing_commands::CreditPack {
                    id: server_pack.id,
                    name: server_pack.name,
                    value_credits,
                    price_amount,
                    currency: server_pack.currency,
                    stripe_price_id: server_pack.stripe_price_id,
                    description: server_pack.description,
                    recommended: server_pack.recommended,
                    bonus_percentage,
                    is_popular: server_pack.is_popular,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        
        let credit_packs = CreditPacksResponse { packs };
        
        info!("Successfully retrieved credit packs");
        Ok(credit_packs)
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
    // MODERN PAYMENT INTENT METHODS (2024)
    // ========================================

    /// Create a PaymentIntent for credit purchase (modern embedded payment flow)
    pub async fn create_credit_payment_intent(
        &self,
        credit_pack_id: &str,
        save_payment_method: bool,
    ) -> Result<PaymentIntentResponse, AppError> {
        debug!("Creating PaymentIntent for credit pack: {}", credit_pack_id);
        
        let request_body = serde_json::json!({
            "creditPackId": credit_pack_id,
            "savePaymentMethod": save_payment_method
        });
        
        let payment_intent = self.make_authenticated_request(
            "POST",
            "/api/billing/payment-intents/credits",
            Some(request_body),
        ).await?;
        
        info!("Successfully created PaymentIntent for credit purchase");
        Ok(payment_intent)
    }

    /// Create a subscription with SetupIntent for trial (modern embedded payment flow)
    pub async fn create_subscription_with_intent(
        &self,
        plan_id: &str,
        trial_days: Option<u32>,
    ) -> Result<SubscriptionIntentResponse, AppError> {
        debug!("Creating subscription with intent for plan: {}", plan_id);
        
        let request_body = serde_json::json!({
            "planId": plan_id,
            "trialDays": trial_days
        });
        
        let subscription_intent = self.make_authenticated_request(
            "POST",
            "/api/billing/subscriptions/create-with-intent",
            Some(request_body),
        ).await?;
        
        info!("Successfully created subscription with intent");
        Ok(subscription_intent)
    }

    /// Create a SetupIntent for saving payment method without charging
    pub async fn create_setup_intent(&self) -> Result<SetupIntentResponse, AppError> {
        debug!("Creating SetupIntent for payment method setup");
        
        let setup_intent = self.make_authenticated_request(
            "POST",
            "/api/billing/setup-intents",
            None,
        ).await?;
        
        info!("Successfully created SetupIntent");
        Ok(setup_intent)
    }

    /// Get payment intent status after client-side confirmation
    pub async fn get_payment_intent_status(&self, payment_intent_id: &str) -> Result<serde_json::Value, AppError> {
        debug!("Getting payment intent status for: {}", payment_intent_id);
        
        let endpoint = format!("/api/billing/payment-intents/{}/status", payment_intent_id);
        
        let status = self.make_authenticated_request(
            "GET",
            &endpoint,
            None,
        ).await?;
        
        info!("Successfully retrieved payment intent status");
        Ok(status)
    }

    /// Get Stripe publishable key for frontend
    pub async fn get_stripe_publishable_key(&self) -> Result<String, AppError> {
        debug!("Getting Stripe publishable key");
        
        let response: serde_json::Value = self.make_authenticated_request(
            "GET",
            "/api/billing/stripe/publishable-key",
            None,
        ).await?;
        
        let publishable_key = response["publishableKey"]
            .as_str()
            .ok_or_else(|| AppError::InvalidResponse("Missing publishable key in response".to_string()))?
            .to_string();
        
        Ok(publishable_key)
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


    // ========================================
    // PAYMENT METHOD MANAGEMENT
    // ========================================

    /// List invoices with optional pagination
    pub async fn list_invoices(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<ListInvoicesResponse, AppError> {
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
        
        let endpoint = format!("/api/billing/invoices{}", query_string);
        
        self.make_authenticated_request::<ListInvoicesResponse>("GET", &endpoint, None)
            .await
    }

}