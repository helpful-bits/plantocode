//! Transcription Error Handling and Recovery Utilities
//! 
//! This module provides comprehensive error handling, recovery strategies,
//! and retry logic specifically for transcription operations.

use crate::error::AppError;
use crate::utils::transcription_validation::{ValidationError, ValidatedTranscriptionParams, TranscriptionParameterFallbacks};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn, error, info};
use serde::{Serialize, Deserialize};

/// Maximum number of retry attempts for recoverable errors
pub const MAX_RETRY_ATTEMPTS: u32 = 3;

/// Base delay between retries in milliseconds
pub const BASE_RETRY_DELAY_MS: u64 = 1000;

/// Maximum delay between retries in milliseconds
pub const MAX_RETRY_DELAY_MS: u64 = 30000;

/// Timeout for transcription requests in seconds
pub const DEFAULT_TRANSCRIPTION_TIMEOUT_SECONDS: u64 = 300;

/// Categories of transcription errors for handling strategies
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TranscriptionErrorCategory {
    /// User input validation errors (non-retryable)
    ValidationError,
    /// Network connectivity issues (retryable)
    NetworkError,
    /// Service unavailable or rate limited (retryable with backoff)
    ServiceError,
    /// Authentication/authorization issues (non-retryable)
    AuthError,
    /// File format or processing issues (non-retryable)
    FormatError,
    /// Temporary server issues (retryable)
    TemporaryError,
    /// Unknown or unexpected errors (limited retry)
    UnknownError,
}

/// Error recovery strategy
#[derive(Debug, Clone)]
pub enum RecoveryStrategy {
    /// Do not retry, return error immediately
    NoRetry,
    /// Retry with exponential backoff
    RetryWithBackoff { max_attempts: u32, base_delay_ms: u64 },
    /// Retry with linear backoff
    RetryWithLinearBackoff { max_attempts: u32, delay_ms: u64 },
    /// Apply parameter fallbacks and retry
    ApplyFallbacksAndRetry { fallbacks: TranscriptionParameterFallbacks },
    /// Reduce quality/complexity and retry
    DegradeAndRetry,
}

/// Detailed error information for transcription operations
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionError {
    pub category: TranscriptionErrorCategory,
    pub message: String,
    pub user_message: String,
    pub recovery_strategy: String,
    pub retry_count: u32,
    pub is_retryable: bool,
    pub estimated_retry_delay: Option<Duration>,
    pub context: TranscriptionErrorContext,
}

/// Context information for transcription errors
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionErrorContext {
    pub operation: String,
    pub user_id: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<usize>,
    pub parameters: Option<serde_json::Value>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub request_id: Option<String>,
}

/// Result type for transcription operations with enhanced error handling
pub type TranscriptionResult<T> = Result<T, TranscriptionError>;

/// Retry configuration for different error types
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub exponential_base: f64,
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: MAX_RETRY_ATTEMPTS,
            base_delay_ms: BASE_RETRY_DELAY_MS,
            max_delay_ms: MAX_RETRY_DELAY_MS,
            exponential_base: 2.0,
            jitter: true,
        }
    }
}

/// ## Error Classification and Handling ##

/// Classifies an error into appropriate category and recovery strategy
pub fn classify_transcription_error(error: &AppError) -> (TranscriptionErrorCategory, RecoveryStrategy) {
    match error {
        AppError::ValidationError(_) => (
            TranscriptionErrorCategory::ValidationError,
            RecoveryStrategy::NoRetry,
        ),
        AppError::NetworkError(_) => (
            TranscriptionErrorCategory::NetworkError,
            RecoveryStrategy::RetryWithBackoff {
                max_attempts: 3,
                base_delay_ms: 1000,
            },
        ),
        AppError::HttpError(msg) if msg.contains("timeout") => (
            TranscriptionErrorCategory::TemporaryError,
            RecoveryStrategy::RetryWithBackoff {
                max_attempts: 2,
                base_delay_ms: 2000,
            },
        ),
        AppError::ExternalServiceError(msg) if msg.contains("rate limit") => (
            TranscriptionErrorCategory::ServiceError,
            RecoveryStrategy::RetryWithBackoff {
                max_attempts: 3,
                base_delay_ms: 5000,
            },
        ),
        AppError::ExternalServiceError(msg) if msg.contains("service unavailable") => (
            TranscriptionErrorCategory::ServiceError,
            RecoveryStrategy::RetryWithLinearBackoff {
                max_attempts: 2,
                delay_ms: 10000,
            },
        ),
        AppError::AuthError(_) | AppError::SecurityError(_) => (
            TranscriptionErrorCategory::AuthError,
            RecoveryStrategy::NoRetry,
        ),
        AppError::InvalidResponse(msg) | AppError::ValidationError(msg) if msg.contains("audio") || msg.contains("format") => (
            TranscriptionErrorCategory::FormatError,
            RecoveryStrategy::NoRetry,
        ),
        AppError::ExternalServiceError(_) | AppError::InvalidResponse(_) => (
            TranscriptionErrorCategory::TemporaryError,
            RecoveryStrategy::RetryWithBackoff {
                max_attempts: 2,
                base_delay_ms: 1000,
            },
        ),
        _ => (
            TranscriptionErrorCategory::UnknownError,
            RecoveryStrategy::RetryWithBackoff {
                max_attempts: 1,
                base_delay_ms: 1000,
            },
        ),
    }
}

/// Creates a detailed transcription error from an AppError
pub fn create_transcription_error(
    error: AppError,
    context: TranscriptionErrorContext,
    retry_count: u32,
) -> TranscriptionError {
    let (category, recovery_strategy) = classify_transcription_error(&error);
    
    let is_retryable = matches!(
        category,
        TranscriptionErrorCategory::NetworkError
            | TranscriptionErrorCategory::ServiceError
            | TranscriptionErrorCategory::TemporaryError
    );

    let estimated_retry_delay = if is_retryable {
        Some(calculate_retry_delay(retry_count, &RetryConfig::default()))
    } else {
        None
    };

    let user_message = generate_user_friendly_message(&error, &category);
    let recovery_strategy_desc = format_recovery_strategy(&recovery_strategy);

    TranscriptionError {
        category,
        message: error.to_string(),
        user_message,
        recovery_strategy: recovery_strategy_desc,
        retry_count,
        is_retryable,
        estimated_retry_delay,
        context,
    }
}

/// ## Retry Logic Implementation ##

/// Executes a transcription operation with automatic retry logic
pub async fn execute_with_retry<F, T, Fut>(
    operation: F,
    context: TranscriptionErrorContext,
    config: Option<RetryConfig>,
) -> TranscriptionResult<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, AppError>>,
{
    let config = config.unwrap_or_default();
    let mut last_error = None;

    for attempt in 0..config.max_attempts {
        info!(
            "Executing transcription operation attempt {} of {}",
            attempt + 1,
            config.max_attempts
        );

        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    info!("Transcription operation succeeded after {} retries", attempt);
                }
                return Ok(result);
            }
            Err(error) => {
                let transcription_error = create_transcription_error(
                    error.clone(),
                    context.clone(),
                    attempt,
                );

                // Check if error is retryable
                if !transcription_error.is_retryable {
                    warn!("Non-retryable transcription error: {}", transcription_error.message);
                    return Err(transcription_error);
                }

                // Check if we've exhausted retries
                if attempt == config.max_attempts - 1 {
                    error!("Transcription operation failed after {} attempts", config.max_attempts);
                    last_error = Some(transcription_error);
                    break;
                }

                // Calculate delay and wait
                let delay = calculate_retry_delay(attempt, &config);
                warn!(
                    "Transcription attempt {} failed: {}. Retrying in {:?}",
                    attempt + 1,
                    transcription_error.message,
                    delay
                );

                sleep(delay).await;
                last_error = Some(transcription_error);
            }
        }
    }

    Err(last_error.unwrap())
}

/// Calculates retry delay with exponential backoff and optional jitter
pub fn calculate_retry_delay(attempt: u32, config: &RetryConfig) -> Duration {
    let base_delay = config.base_delay_ms as f64;
    let exponential_delay = base_delay * config.exponential_base.powi(attempt as i32);
    
    let mut delay_ms = exponential_delay.min(config.max_delay_ms as f64) as u64;

    // Add jitter to prevent thundering herd
    if config.jitter {
        let jitter_range = delay_ms / 4; // ±25% jitter
        let jitter = rand::random::<u64>() % (jitter_range * 2);
        delay_ms = delay_ms.saturating_sub(jitter_range).saturating_add(jitter);
    }

    Duration::from_millis(delay_ms)
}

/// ## Parameter Fallback and Recovery ##

/// Applies parameter fallbacks when validation fails
pub async fn recover_with_fallbacks<F, T, Fut>(
    original_params: (Option<String>, Option<f32>, Option<String>),
    operation: F,
    fallbacks: &TranscriptionParameterFallbacks,
) -> TranscriptionResult<T>
where
    F: Fn(ValidatedTranscriptionParams) -> Fut,
    Fut: std::future::Future<Output = Result<T, AppError>>,
{
    let (prompt, temperature, language) = original_params;

    // Try with original parameters first
    match crate::utils::validate_transcription_params(
        prompt.as_deref(),
        temperature,
        language.as_deref(),
    ) {
        Ok(validated_params) => {
            debug!("Original parameters validated successfully");
            match operation(validated_params).await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    warn!("Operation failed with valid parameters: {}", error);
                    // Continue to fallback logic
                }
            }
        }
        Err(validation_error) => {
            warn!("Parameter validation failed: {}", validation_error);
            // Continue to fallback logic
        }
    }

    // Apply fallbacks and retry
    info!("Applying parameter fallbacks for transcription");
    let fallback_params = crate::utils::validate_with_fallbacks(
        prompt.as_deref(),
        temperature,
        language.as_deref(),
        fallbacks,
    );

    match operation(fallback_params).await {
        Ok(result) => {
            info!("Transcription succeeded with fallback parameters");
            Ok(result)
        }
        Err(error) => {
            error!("Transcription failed even with fallback parameters: {}", error);
            let context = TranscriptionErrorContext {
                operation: "transcription_with_fallbacks".to_string(),
                user_id: None,
                file_name: None,
                file_size: None,
                parameters: Some(serde_json::json!({
                    "fallback_applied": true,
                    "original_prompt": prompt,
                    "fallback_temperature": fallbacks.default_temperature,
                    "fallback_language": fallbacks.default_language
                })),
                timestamp: chrono::Utc::now(),
                request_id: None,
            };
            Err(create_transcription_error(error, context, 0))
        }
    }
}

/// ## User-Friendly Error Messages ##

/// Generates user-friendly error messages based on error category
pub fn generate_user_friendly_message(
    error: &AppError,
    category: &TranscriptionErrorCategory,
) -> String {
    match category {
        TranscriptionErrorCategory::ValidationError => {
            if let AppError::ValidationError(msg) = error {
                if msg.contains("prompt") && msg.contains("long") {
                    "Your transcription prompt is too long. Please shorten it and try again.".to_string()
                } else if msg.contains("temperature") {
                    "Invalid temperature setting. Please use a value between 0.0 and 1.0.".to_string()
                } else if msg.contains("language") {
                    "Unsupported language selected. Please choose a different language.".to_string()
                } else if msg.contains("unsafe") {
                    "Your prompt contains content that cannot be processed. Please revise and try again.".to_string()
                } else {
                    format!("Input validation failed: {}", msg)
                }
            } else {
                "There's an issue with your input. Please check your settings and try again.".to_string()
            }
        }
        TranscriptionErrorCategory::NetworkError => {
            "Network connection issue. Please check your internet connection and try again.".to_string()
        }
        TranscriptionErrorCategory::ServiceError => {
            if error.to_string().contains("rate limit") {
                "Too many requests. Please wait a moment and try again.".to_string()
            } else {
                "The transcription service is temporarily unavailable. Please try again later.".to_string()
            }
        }
        TranscriptionErrorCategory::AuthError => {
            "Authentication failed. Please check your account settings.".to_string()
        }
        TranscriptionErrorCategory::FormatError => {
            "The audio file format is not supported or the file is corrupted. Please try a different file.".to_string()
        }
        TranscriptionErrorCategory::TemporaryError => {
            "Temporary service issue. Please try again in a few moments.".to_string()
        }
        TranscriptionErrorCategory::UnknownError => {
            "An unexpected error occurred. Please try again or contact support if the issue persists.".to_string()
        }
    }
}

/// Formats recovery strategy for display
fn format_recovery_strategy(strategy: &RecoveryStrategy) -> String {
    match strategy {
        RecoveryStrategy::NoRetry => "No automatic retry".to_string(),
        RecoveryStrategy::RetryWithBackoff { max_attempts, .. } => {
            format!("Automatic retry up to {} times with increasing delays", max_attempts)
        }
        RecoveryStrategy::RetryWithLinearBackoff { max_attempts, delay_ms } => {
            format!("Automatic retry up to {} times with {}ms delays", max_attempts, delay_ms)
        }
        RecoveryStrategy::ApplyFallbacksAndRetry { .. } => {
            "Apply safe default settings and retry".to_string()
        }
        RecoveryStrategy::DegradeAndRetry => {
            "Reduce quality settings and retry".to_string()
        }
    }
}

/// ## Timeout Handling ##

/// Executes operation with timeout
pub async fn execute_with_timeout<F, T, Fut>(
    operation: F,
    timeout: Duration,
) -> Result<T, AppError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, AppError>>,
{
    match tokio::time::timeout(timeout, operation()).await {
        Ok(result) => result,
        Err(_) => Err(AppError::HttpError(format!(
            "Operation timed out after {:?}",
            timeout
        ))),
    }
}

/// ## Error Recovery Utilities ##

/// Attempts to recover from common transcription errors
pub async fn attempt_error_recovery(
    error: &TranscriptionError,
    original_operation: impl Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, AppError>> + Send>>,
) -> Option<String> {
    match error.category {
        TranscriptionErrorCategory::NetworkError => {
            debug!("Attempting network error recovery");
            // Wait a bit longer and retry once
            sleep(Duration::from_secs(5)).await;
            match original_operation().await {
                Ok(result) => Some(result),
                Err(_) => None,
            }
        }
        TranscriptionErrorCategory::ServiceError => {
            debug!("Attempting service error recovery");
            // Wait for rate limit to reset
            sleep(Duration::from_secs(30)).await;
            match original_operation().await {
                Ok(result) => Some(result),
                Err(_) => None,
            }
        }
        _ => None, // No recovery possible for other error types
    }
}

/// Provides suggestions for resolving transcription errors
pub fn get_error_resolution_suggestions(error: &TranscriptionError) -> Vec<String> {
    let mut suggestions = Vec::new();

    match error.category {
        TranscriptionErrorCategory::ValidationError => {
            suggestions.push("Check your transcription prompt for length and content".to_string());
            suggestions.push("Ensure temperature is between 0.0 and 1.0".to_string());
            suggestions.push("Verify the selected language is supported".to_string());
        }
        TranscriptionErrorCategory::NetworkError => {
            suggestions.push("Check your internet connection".to_string());
            suggestions.push("Try connecting to a different network".to_string());
            suggestions.push("Disable VPN if active".to_string());
        }
        TranscriptionErrorCategory::ServiceError => {
            suggestions.push("Wait a few minutes before trying again".to_string());
            suggestions.push("Check service status page".to_string());
            suggestions.push("Try during off-peak hours".to_string());
        }
        TranscriptionErrorCategory::FormatError => {
            suggestions.push("Convert audio to MP3, WAV, or WebM format".to_string());
            suggestions.push("Ensure file is not corrupted".to_string());
            suggestions.push("Try a different audio file".to_string());
        }
        TranscriptionErrorCategory::AuthError => {
            suggestions.push("Check your account credentials".to_string());
            suggestions.push("Verify your subscription is active".to_string());
            suggestions.push("Contact support for account issues".to_string());
        }
        _ => {
            suggestions.push("Try again in a few minutes".to_string());
            suggestions.push("Contact support if the issue persists".to_string());
        }
    }

    suggestions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_validation_error() {
        let error = AppError::Validation("Invalid prompt".to_string());
        let (category, strategy) = classify_transcription_error(&error);
        
        assert_eq!(category, TranscriptionErrorCategory::ValidationError);
        assert!(matches!(strategy, RecoveryStrategy::NoRetry));
    }

    #[test]
    fn test_classify_network_error() {
        let error = AppError::Network("Connection failed".to_string());
        let (category, strategy) = classify_transcription_error(&error);
        
        assert_eq!(category, TranscriptionErrorCategory::NetworkError);
        assert!(matches!(strategy, RecoveryStrategy::RetryWithBackoff { .. }));
    }

    #[test]
    fn test_calculate_retry_delay() {
        let config = RetryConfig {
            max_attempts: 3,
            base_delay_ms: 1000,
            max_delay_ms: 10000,
            exponential_base: 2.0,
            jitter: false,
        };

        let delay0 = calculate_retry_delay(0, &config);
        let delay1 = calculate_retry_delay(1, &config);
        let delay2 = calculate_retry_delay(2, &config);

        assert_eq!(delay0, Duration::from_millis(1000));
        assert_eq!(delay1, Duration::from_millis(2000));
        assert_eq!(delay2, Duration::from_millis(4000));
    }

    #[test]
    fn test_generate_user_friendly_message() {
        let error = AppError::Validation("Prompt too long: 1500 characters".to_string());
        let message = generate_user_friendly_message(&error, &TranscriptionErrorCategory::ValidationError);
        
        assert!(message.contains("prompt") && message.contains("long"));
    }

    #[test]
    fn test_error_resolution_suggestions() {
        let error = TranscriptionError {
            category: TranscriptionErrorCategory::NetworkError,
            message: "Connection failed".to_string(),
            user_message: "Network issue".to_string(),
            recovery_strategy: "Retry".to_string(),
            retry_count: 0,
            is_retryable: true,
            estimated_retry_delay: None,
            context: TranscriptionErrorContext {
                operation: "test".to_string(),
                user_id: None,
                file_name: None,
                file_size: None,
                parameters: None,
                timestamp: chrono::Utc::now(),
                request_id: None,
            },
        };

        let suggestions = get_error_resolution_suggestions(&error);
        assert!(!suggestions.is_empty());
        assert!(suggestions.iter().any(|s| s.contains("internet")));
    }
}