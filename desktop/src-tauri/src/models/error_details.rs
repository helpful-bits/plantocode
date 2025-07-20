use serde::{Deserialize, Serialize};

/// Detailed error information for rich error reporting
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDetails {
    /// Error code for categorization (e.g., "context_length_exceeded")
    pub code: String,
    /// User-friendly error message
    pub message: String,
    /// Provider-specific error information if available
    pub provider_error: Option<ProviderErrorInfo>,
    /// Whether a fallback to another provider was attempted
    pub fallback_attempted: bool,
}

/// Provider-specific error information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderErrorInfo {
    /// Provider name (e.g., "openai", "google", "anthropic")
    pub provider: String,
    /// HTTP status code from the provider
    pub status_code: u16,
    /// Provider's error type (e.g., "invalid_request_error")
    pub error_type: String,
    /// Full error details from the provider
    pub details: String,
    /// Additional context about the error
    pub context: Option<ErrorContext>,
}

/// Additional context for specific error types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorContext {
    /// Number of tokens requested
    pub requested_tokens: Option<i32>,
    /// Maximum tokens allowed by the model
    pub max_tokens: Option<i32>,
    /// Model's context length limit
    pub model_limit: Option<i32>,
    /// Any other relevant context
    pub additional_info: Option<String>,
}