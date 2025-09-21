use log::{debug, error, warn};
use serde_json::Value;

use crate::auth::token_manager::TokenManager;
use crate::constants::ErrorType;
use crate::error::AppError;
use std::sync::Arc;

/// Check if an error message indicates token limit exceeded
fn is_token_limit_error(message: &str) -> bool {
    let lower_message = message.to_lowercase();
    lower_message.contains("is too long")
        || lower_message.contains("maximum context length")
        || lower_message.contains("prompt is too large")
        || lower_message.contains("context window exceeded")
        || lower_message.contains("token limit exceeded")
        || lower_message.contains("too many tokens")
        || lower_message.contains("context length exceeded")
        || lower_message.contains("maximum tokens exceeded")
        || lower_message.contains("input too long")
}

/// Map direct OpenRouter API HTTP status code and response to an AppError
pub fn map_direct_openrouter_error(status_code: u16, response_text: &str) -> AppError {
    // Try to parse the response as JSON
    if let Ok(json) = serde_json::from_str::<Value>(response_text) {
        let error_message = json["error"]["message"]
            .as_str()
            .or_else(|| json["error"].as_str())
            .unwrap_or("Unknown error");

        // Check for token limit exceeded errors first
        if is_token_limit_error(error_message) {
            return AppError::TokenLimitExceededError(
                "Prompt is too long for the selected model. Please reduce the number of selected files or shorten the task description.".to_string()
            );
        }

        match status_code {
            400 => AppError::OpenRouterError(format!("Bad request: {}", error_message)),
            401 => AppError::OpenRouterError(format!("Unauthorized: {}", error_message)),
            403 => AppError::OpenRouterError(format!("Forbidden: {}", error_message)),
            404 => AppError::OpenRouterError(format!("Not found: {}", error_message)),
            429 => AppError::OpenRouterError(format!("Rate limit exceeded: {}", error_message)),
            500..=599 => AppError::OpenRouterError(format!("Server error: {}", error_message)),
            _ => AppError::OpenRouterError(format!(
                "Unknown error ({}): {}",
                status_code, error_message
            )),
        }
    } else {
        // Check for token limit errors in raw text response
        if is_token_limit_error(response_text) {
            return AppError::TokenLimitExceededError(
                "Prompt is too long for the selected model. Please reduce the number of selected files or shorten the task description.".to_string()
            );
        }

        // If it's not JSON, just use the raw text
        match status_code {
            400 => AppError::OpenRouterError(format!("Bad request: {}", response_text)),
            401 => AppError::OpenRouterError(format!("Unauthorized: {}", response_text)),
            403 => AppError::OpenRouterError(format!("Forbidden: {}", response_text)),
            404 => AppError::OpenRouterError(format!("Not found: {}", response_text)),
            429 => AppError::OpenRouterError(format!("Rate limit exceeded: {}", response_text)),
            500..=599 => AppError::OpenRouterError(format!("Server error: {}", response_text)),
            _ => AppError::OpenRouterError(format!(
                "Unknown error ({}): {}",
                status_code, response_text
            )),
        }
    }
}

/// Server error response structure
#[derive(Debug, serde::Deserialize)]
struct ServerErrorResponse {
    code: Option<u16>,
    message: String,
    error_type: Option<String>,
}

/// Map server proxy error to an AppError
/// This handles the structured errors returned from our server proxy
pub fn map_server_proxy_error(status_code: u16, response_text: &str) -> AppError {
    debug!(
        "Mapping server proxy error: status={}, response={}",
        status_code, response_text
    );

    // Try to parse the response as our server error format
    if let Ok(error_response) = serde_json::from_str::<ServerErrorResponse>(response_text) {
        let error_type = error_response
            .error_type
            .unwrap_or_else(|| "unknown_error".to_string());
        let message = error_response.message;

        // Check for token limit exceeded errors first
        if is_token_limit_error(&message) {
            return AppError::TokenLimitExceededError(
                "Prompt is too long for the selected model. Please reduce the number of selected files or shorten the task description.".to_string()
            );
        }

        match error_type.as_str() {
            "authentication_error" => {
                AppError::AuthError(format!("Authentication failed: {}", message))
            }
            "authorization_error" | "unauthorized" => {
                AppError::AccessDenied(format!("Access denied: {}", message))
            }
            "credit_insufficient" | "insufficient_credits" => AppError::CreditInsufficient(message),
            "credit_purchase_required" | "upgrade_required" => {
                AppError::CreditPurchaseRequired(message)
            }
            "task_initiation_failed" => AppError::TaskInitiationFailed(message),
            "task_finalization_failed" => AppError::TaskFinalizationFailed(message),
            "payment_failed" | "payment_error" => AppError::PaymentFailed(message),
            "payment_declined" | "card_declined" => AppError::PaymentDeclined(message),
            "payment_authentication_required" | "authentication_required" => {
                AppError::PaymentAuthenticationRequired(message)
            }
            "customer_billing_expired" => AppError::BillingExpired(message),
            "customer_billing_cancelled" => AppError::BillingCancelled(message),
            "payment_method_required" => AppError::PaymentMethodRequired(message),
            "billing_address_required" => AppError::BillingAddressRequired(message),
            "customer_billing_conflict" => AppError::BillingConflict(message),
            "spending_limit_exceeded" => AppError::SpendingLimitExceeded(message),
            "invoice_error" => AppError::InvoiceError(message),
            "checkout_error" | "checkout_session_expired" | "checkout_cancelled" => {
                AppError::CheckoutError(message)
            }
            "payment_required" => AppError::PaymentRequired(message),
            "stripe_error" => AppError::StripeError(message),
            "billing_error" => AppError::BillingError(message),
            "rate_limit_error" => {
                AppError::NetworkError(format!("Rate limit exceeded: {}", message))
            }
            "provider_error" | "external_service_error" => {
                AppError::ExternalServiceError(format!("AI provider error: {}", message))
            }
            "database_error" => {
                AppError::DatabaseError(format!("Server database error: {}", message))
            }
            "validation_error" | "bad_request" => AppError::ValidationError(message),
            "not_found" => AppError::NotFoundError(message),
            "configuration_error" => {
                AppError::ConfigError(format!("Server configuration error: {}", message))
            }
            "internal_error" => {
                AppError::ServerProxyError(format!("Server internal error: {}", message))
            }
            error_type if error_type == ErrorType::SerializationError.as_str() => {
                AppError::SerializationError(format!("Server serialization error: {}", message))
            }
            error_type if error_type == ErrorType::InvalidArgument.as_str() => {
                AppError::InvalidArgument(message)
            }
            // Handle provider-specific errors that may come from the server
            error_type if error_type == ErrorType::OpenRouterError.as_str() => {
                AppError::OpenRouterError(format!("OpenRouter API error: {}", message))
            }
            error_type if error_type == ErrorType::ReplicateError.as_str() => {
                AppError::ExternalServiceError(format!("Replicate API error: {}", message))
            }
            error_type if error_type == ErrorType::AnthropicError.as_str() => {
                AppError::ExternalServiceError(format!("Anthropic API error: {}", message))
            }
            error_type if error_type == ErrorType::OpenAIError.as_str() => {
                AppError::ExternalServiceError(format!("OpenAI API error: {}", message))
            }
            // Network and connection related errors
            error_type if error_type == ErrorType::NetworkError.as_str() => {
                AppError::NetworkError(format!("Network error: {}", message))
            }
            "timeout_error" => AppError::NetworkError(format!("Request timeout: {}", message)),
            "connection_error" => AppError::NetworkError(format!("Connection error: {}", message)),
            _ => {
                if let Some(code_val) = error_response.code {
                    AppError::ServerProxyError(format!(
                        "{} (HTTP Status: {}, Server Code: {})",
                        message, status_code, code_val
                    ))
                } else {
                    AppError::ServerProxyError(format!(
                        "{} (HTTP Status: {})",
                        message, status_code
                    ))
                }
            }
        }
    } else {
        // Check for token limit errors in raw response text
        if is_token_limit_error(response_text) {
            return AppError::TokenLimitExceededError(
                "Prompt is too long for the selected model. Please reduce the number of selected files or shorten the task description.".to_string()
            );
        }

        // Fallback based on HTTP status code if we can't parse the server's error format
        match status_code {
            400 => AppError::ValidationError(format!("Bad request: {}", response_text)),
            401 => AppError::AuthError(format!("Authentication failed: {}", response_text)),
            402 => AppError::BillingError(format!("Payment required: {}", response_text)),
            403 => AppError::AccessDenied(format!("Access denied: {}", response_text)),
            404 => AppError::NotFoundError(format!("Resource not found: {}", response_text)),
            429 => AppError::ServerProxyError(format!("Rate limit exceeded: {}", response_text)),
            500..=599 => AppError::ServerProxyError(format!("Server error: {}", response_text)),
            _ => AppError::ServerProxyError(format!(
                "Server proxy error ({}): {}",
                status_code, response_text
            )),
        }
    }
}

pub async fn handle_api_error(
    status_code: u16,
    error_text: &str,
    token_manager: &Arc<TokenManager>,
) -> AppError {
    if status_code == 401 {
        warn!(
            "Received 401 Unauthorized. Clearing token. Details: {}",
            error_text
        );
        if let Err(e) = token_manager.set(None).await {
            error!("Failed to clear invalid token: {}", e);
        }
        AppError::AuthError("Authentication token expired. Please re-authenticate.".to_string())
    } else {
        map_server_proxy_error(status_code, error_text)
    }
}
