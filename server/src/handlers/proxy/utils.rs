use crate::clients::usage_extractor::ProviderUsage;
use crate::error::AppError;
use crate::handlers::proxy::types::LlmCompletionRequest;
use crate::models::error_details::{ErrorDetails, ProviderErrorInfo};
use bigdecimal::BigDecimal;

/// Helper function to determine if an error should trigger a fallback to OpenRouter
pub(crate) fn is_fallback_error(error: &AppError) -> bool {
    match error {
        AppError::External(_) => true,
        AppError::TooManyRequests(_) => true,
        AppError::BadRequest(msg) => {
            msg.contains("rate limit") || msg.contains("quota") || msg.contains("capacity")
        }
        AppError::Internal(msg) => {
            msg.contains("deserialization failed") || msg.contains("JSON parse")
        }
        _ => false,
    }
}

/// Extract detailed error information from AppError
pub fn extract_error_details(error: &AppError, provider: &str) -> ErrorDetails {
    let (code, message) = match error {
        AppError::External(msg) => {
            // Try to extract provider-specific error details
            if msg.contains("context_length_exceeded") || msg.contains("context length") {
                ("context_length_exceeded", msg.clone())
            } else if msg.contains("status 429")
                || msg.contains("rate_limit")
                || msg.contains("rate limit")
            {
                ("rate_limit_exceeded", msg.clone())
            } else if msg.contains("status 401")
                || msg.contains("authentication")
                || msg.contains("unauthorized")
            {
                ("authentication_failed", msg.clone())
            } else if msg.contains("status 403") || msg.contains("forbidden") {
                ("permission_denied", msg.clone())
            } else if msg.contains("status 400") || msg.contains("bad request") {
                ("bad_request", msg.clone())
            } else if msg.contains("status 500") || msg.contains("internal server error") {
                ("provider_internal_error", msg.clone())
            } else if msg.contains("status 502") || msg.contains("bad gateway") {
                ("provider_gateway_error", msg.clone())
            } else if msg.contains("status 503") || msg.contains("service unavailable") {
                ("provider_unavailable", msg.clone())
            } else if msg.contains("timeout") || msg.contains("timed out") {
                ("timeout_error", msg.clone())
            } else if msg.contains("network") || msg.contains("connection") {
                ("network_error", msg.clone())
            } else {
                ("external_service_error", msg.clone())
            }
        }
        AppError::TooManyRequests(msg) => ("rate_limit_exceeded", msg.clone()),
        AppError::BadRequest(msg) => {
            // More specific error codes for bad requests
            if msg.contains("invalid") || msg.contains("validation") {
                ("validation_error", msg.clone())
            } else if msg.contains("missing") || msg.contains("required") {
                ("missing_parameter", msg.clone())
            } else {
                ("bad_request", msg.clone())
            }
        }
        AppError::Internal(msg) => {
            // More specific error codes for internal errors
            if msg.contains("deserialization") || msg.contains("JSON") || msg.contains("parse") {
                ("parsing_error", msg.clone())
            } else {
                ("internal_error", msg.clone())
            }
        }
        AppError::NotFound(msg) => ("not_found", msg.clone()),
        AppError::Unauthorized(msg) => ("unauthorized", msg.clone()),
        AppError::CreditInsufficient(msg) => ("insufficient_credits", msg.clone()),
        AppError::Configuration(msg) => ("configuration_error", msg.clone()),
        AppError::InvalidArgument(msg) => ("invalid_argument", msg.clone()),
        _ => ("unknown_error", error.to_string()),
    };

    let mut error_details = ErrorDetails::new(code, message.clone());

    // Extract provider error info if available
    if let AppError::External(msg) = error {
        // More robust status code extraction using regex
        let status_code = if let Some(captures) = regex::Regex::new(r"status (\d{3})")
            .ok()
            .and_then(|re| re.captures(msg))
        {
            captures
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0)
        } else {
            // Fallback to pattern matching
            if msg.contains("400") {
                400
            } else if msg.contains("401") {
                401
            } else if msg.contains("403") {
                403
            } else if msg.contains("429") {
                429
            } else if msg.contains("500") {
                500
            } else if msg.contains("502") {
                502
            } else if msg.contains("503") {
                503
            } else {
                0
            }
        };

        // Try to extract JSON error body from the message
        // Look for JSON anywhere in the message, not just at the start
        if let Some(json_start) = msg.find('{') {
            if let Some(json_end) = msg.rfind('}') {
                let json_str = &msg[json_start..=json_end];

                // Provider-specific error parsing
                match provider {
                    "openai" | "xai" => {
                        if let Some(provider_error) =
                            ProviderErrorInfo::from_openai_error(status_code, json_str)
                        {
                            error_details = error_details.with_provider_error(provider_error);
                        }
                    }
                    "anthropic" => {
                        // Anthropic has a similar error format to OpenAI
                        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(json_str)
                        {
                            if let Some(error) = error_json.get("error") {
                                let error_type = error
                                    .get("type")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("unknown")
                                    .to_string();

                                let details = error
                                    .get("message")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or(json_str)
                                    .to_string();

                                let provider_error = ProviderErrorInfo {
                                    provider: provider.to_string(),
                                    status_code,
                                    error_type,
                                    details,
                                    context: None,
                                };
                                error_details = error_details.with_provider_error(provider_error);
                            }
                        }
                    }
                    "google" => {
                        // Google has a different error format
                        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(json_str)
                        {
                            if let Some(error) = error_json.get("error") {
                                let error_type = error
                                    .get("status")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("UNKNOWN")
                                    .to_string();

                                let details = error
                                    .get("message")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or(json_str)
                                    .to_string();

                                let provider_error = ProviderErrorInfo {
                                    provider: provider.to_string(),
                                    status_code,
                                    error_type,
                                    details,
                                    context: None,
                                };
                                error_details = error_details.with_provider_error(provider_error);
                            }
                        }
                    }
                    _ => {
                        // Generic provider error handling
                        let provider_error =
                            ProviderErrorInfo::from_provider_error(provider, status_code, json_str);
                        error_details = error_details.with_provider_error(provider_error);
                    }
                }
            }
        } else if status_code > 0 {
            // No JSON found, but we have a status code
            let provider_error = ProviderErrorInfo {
                provider: provider.to_string(),
                status_code,
                error_type: "http_error".to_string(),
                details: message.clone(),
                context: None,
            };
            error_details = error_details.with_provider_error(provider_error);
        }
    }

    error_details
}

/// Calculate input tokens from request payload using accurate tiktoken-rs estimation
///
/// This function provides accurate token estimation for upfront billing.
/// It uses the same tiktoken-rs library as the desktop client to ensure consistency.
///
/// # Arguments
///
/// * `payload` - The LLM completion request
/// * `model_id` - The model ID to use for tokenization
///
/// # Returns
///
/// Accurate token count as i32
pub(crate) fn calculate_input_tokens(payload: &LlmCompletionRequest, model_id: &str) -> i32 {
    use crate::utils::token_estimator::estimate_tokens_for_messages;

    // Use accurate tiktoken-rs estimation for upfront billing
    // This ensures consistency with desktop client estimates
    estimate_tokens_for_messages(&payload.messages, model_id) as i32
}

/// Helper function to create standardized usage response
pub(crate) fn create_standardized_usage_response(
    usage: &ProviderUsage,
    cost: &BigDecimal,
) -> Result<serde_json::Value, AppError> {
    // Create response with camelCase field names to match desktop client's OpenRouterUsage
    let response = serde_json::json!({
        "promptTokens": usage.prompt_tokens,
        "completionTokens": usage.completion_tokens,
        "totalTokens": usage.prompt_tokens + usage.completion_tokens,
        "cost": cost.to_string().parse::<f64>().unwrap_or(0.0),
        "cacheWriteTokens": usage.cache_write_tokens,
        "cacheReadTokens": usage.cache_read_tokens
    });

    Ok(response)
}
