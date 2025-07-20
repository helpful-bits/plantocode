use serde::{Deserialize, Serialize};

/// Detailed error information for rich error reporting
#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl ErrorDetails {
    /// Create a new error details instance
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            provider_error: None,
            fallback_attempted: false,
        }
    }

    /// Add provider error information
    pub fn with_provider_error(mut self, provider_error: ProviderErrorInfo) -> Self {
        self.provider_error = Some(provider_error);
        self
    }

    /// Mark that a fallback was attempted
    pub fn with_fallback(mut self) -> Self {
        self.fallback_attempted = true;
        self
    }
}

impl ProviderErrorInfo {
    /// Create provider error info from common error patterns
    pub fn from_openai_error(status_code: u16, error_body: &str) -> Option<Self> {
        // Try to parse OpenAI error format
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(error_body) {
            if let Some(error) = error_json.get("error") {
                let error_type = error.get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                
                let message = error.get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or(error_body)
                    .to_string();
                
                // Extract context for specific error types
                let context = if error_type == "invalid_request_error" && message.contains("context length") {
                    // Parse token limits from message
                    let mut ctx = ErrorContext {
                        requested_tokens: None,
                        max_tokens: None,
                        model_limit: None,
                        additional_info: None,
                    };
                    
                    // Extract numbers from message like "maximum context length is 200000 tokens. However, you requested 207660 tokens"
                    if let Some(cap) = regex::Regex::new(r"maximum context length is (\d+) tokens")
                        .ok()
                        .and_then(|re| re.captures(&message)) {
                        ctx.model_limit = cap.get(1).and_then(|m| m.as_str().parse().ok());
                    }
                    
                    if let Some(cap) = regex::Regex::new(r"you requested (\d+) tokens")
                        .ok()
                        .and_then(|re| re.captures(&message)) {
                        ctx.requested_tokens = cap.get(1).and_then(|m| m.as_str().parse().ok());
                    }
                    
                    Some(ctx)
                } else {
                    None
                };
                
                return Some(ProviderErrorInfo {
                    provider: "openai".to_string(),
                    status_code,
                    error_type,
                    details: message,
                    context,
                });
            }
        }
        
        // Fallback for unparseable errors
        Some(ProviderErrorInfo {
            provider: "openai".to_string(),
            status_code,
            error_type: "unknown".to_string(),
            details: error_body.to_string(),
            context: None,
        })
    }
    
    /// Create provider error info for other providers
    pub fn from_provider_error(provider: &str, status_code: u16, error_body: &str) -> Self {
        ProviderErrorInfo {
            provider: provider.to_string(),
            status_code,
            error_type: "provider_error".to_string(),
            details: error_body.to_string(),
            context: None,
        }
    }
}