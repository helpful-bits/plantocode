use log::{error, debug};
use serde_json::Value;

use crate::error::AppError;

/// Map direct OpenRouter API HTTP status code and response to an AppError
pub fn map_direct_openrouter_error(status_code: u16, response_text: &str) -> AppError {
    // Try to parse the response as JSON
    if let Ok(json) = serde_json::from_str::<Value>(response_text) {
        let error_message = json["error"]["message"]
            .as_str()
            .or_else(|| json["error"].as_str())
            .unwrap_or("Unknown error");
            
        match status_code {
            400 => AppError::OpenRouterError(format!("Bad request: {}", error_message)),
            401 => AppError::OpenRouterError(format!("Unauthorized: {}", error_message)),
            403 => AppError::OpenRouterError(format!("Forbidden: {}", error_message)),
            404 => AppError::OpenRouterError(format!("Not found: {}", error_message)),
            429 => AppError::OpenRouterError(format!("Rate limit exceeded: {}", error_message)),
            500..=599 => AppError::OpenRouterError(format!("Server error: {}", error_message)),
            _ => AppError::OpenRouterError(format!("Unknown error ({}): {}", status_code, error_message)),
        }
    } else {
        // If it's not JSON, just use the raw text
        match status_code {
            400 => AppError::OpenRouterError(format!("Bad request: {}", response_text)),
            401 => AppError::OpenRouterError(format!("Unauthorized: {}", response_text)),
            403 => AppError::OpenRouterError(format!("Forbidden: {}", response_text)),
            404 => AppError::OpenRouterError(format!("Not found: {}", response_text)),
            429 => AppError::OpenRouterError(format!("Rate limit exceeded: {}", response_text)),
            500..=599 => AppError::OpenRouterError(format!("Server error: {}", response_text)),
            _ => AppError::OpenRouterError(format!("Unknown error ({}): {}", status_code, response_text)),
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
    debug!("Mapping server proxy error: status={}, response={}", status_code, response_text);
    
    // Try to parse the response as our server error format
    if let Ok(error_response) = serde_json::from_str::<ServerErrorResponse>(response_text) {
        let error_type = error_response.error_type.unwrap_or_else(|| "unknown_error".to_string());
        let message = error_response.message;
        
        match error_type.as_str() {
            "authentication_error" => AppError::AuthError(format!("Authentication failed: {}", message)),
            "authorization_error" => AppError::AccessDenied(format!("Access denied: {}", message)),
            "billing_error" => AppError::BillingError(message),
            "payment_required" => AppError::BillingError(message),
            "rate_limit_error" => AppError::ServerProxyError(format!("Rate limit exceeded: {}", message)),
            "provider_error" => AppError::ServerProxyError(format!("AI provider error: {}", message)),
            "database_error" => AppError::ServerProxyError(format!("Server database error: {}", message)),
            "validation_error" => AppError::ValidationError(message),
            _ => {
                if let Some(code_val) = error_response.code {
                    AppError::ServerProxyError(format!("{} (HTTP Status: {}, Server Code: {})", message, status_code, code_val))
                } else {
                    AppError::ServerProxyError(format!("{} (HTTP Status: {})", message, status_code))
                }
            },
        }
    } else {
        // Fallback based on HTTP status code if we can't parse the server's error format
        match status_code {
            400 => AppError::ValidationError(format!("Bad request: {}", response_text)),
            401 => AppError::AuthError(format!("Authentication failed: {}", response_text)),
            402 => AppError::BillingError(format!("Payment required: {}", response_text)),
            403 => AppError::AccessDenied(format!("Access denied: {}", response_text)),
            404 => AppError::NotFoundError(format!("Resource not found: {}", response_text)),
            429 => AppError::ServerProxyError(format!("Rate limit exceeded: {}", response_text)),
            500..=599 => AppError::ServerProxyError(format!("Server error: {}", response_text)),
            _ => AppError::ServerProxyError(format!("Server proxy error ({}): {}", status_code, response_text)),
        }
    }
}


