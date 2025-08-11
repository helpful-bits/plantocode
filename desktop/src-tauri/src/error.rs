use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;
use tauri::Manager;

#[derive(Error, Debug, Serialize, Clone)]
pub enum AppError {
    #[error("IO error: {0}")]
    IoError(String),

    #[error("Serde JSON error: {0}")]
    SerdeError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("OpenRouter API error: {0}")]
    OpenRouterError(String),

    #[error("Server proxy error: {0}")]
    ServerProxyError(String),

    #[error("HTTP client error: {0}")]
    HttpError(String),

    #[error("Tauri error: {0}")]
    TauriError(String),

    #[error("Keyring error: {0}")]
    KeyringError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Configuration validation error: {0}")]
    ConfigurationError(String),

    #[error("Invalid task type: {0}")]
    InvalidTaskTypeError(String),

    #[error("Cache validation error: {0}")]
    CacheValidationError(String),

    #[error("Job error: {0}")]
    JobError(String),

    #[error("File system error: {0}")]
    FileSystemError(String),

    #[error("Git error: {0}")]
    GitError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Not found: {0}")]
    NotFoundError(String),

    #[error("Authentication error: {0}")]
    AuthError(String),

    #[error("Security error: {0}")]
    SecurityError(String),

    #[error("Internal error: {0}")]
    InternalError(String),

    #[error("File lock error: {0}")]
    FileLockError(String),

    #[error("Initialization error: {0}")]
    InitializationError(String),

    #[error("Application error: {0}")]
    ApplicationError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Updater error: {0}")]
    UpdaterError(String),

    #[error("SQLx error: {0}")]
    SqlxError(String),

    #[error("Access denied: {0}")]
    AccessDenied(String),

    #[error("Billing error: {0}")]
    BillingError(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("External service error: {0}")]
    ExternalServiceError(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Token limit exceeded: {0}")]
    TokenLimitExceededError(String),

    // Billing-specific errors matching server error types
    #[error("Payment failed: {0}")]
    PaymentFailed(String),

    #[error("Payment declined: {0}")]
    PaymentDeclined(String),

    #[error("Payment authentication required: {0}")]
    PaymentAuthenticationRequired(String),

    #[error("Customer billing expired: {0}")]
    BillingExpired(String),

    #[error("Customer billing cancelled: {0}")]
    BillingCancelled(String),

    #[error("Insufficient credits: {0}")]
    CreditInsufficient(String),

    #[error("Credit purchase required: {0}")]
    CreditPurchaseRequired(String),

    #[error("Payment method required: {0}")]
    PaymentMethodRequired(String),

    #[error("Billing address required: {0}")]
    BillingAddressRequired(String),

    #[error("Customer billing conflict: {0}")]
    BillingConflict(String),

    #[error("Spending limit exceeded: {0}")]
    SpendingLimitExceeded(String),

    #[error("Invoice error: {0}")]
    InvoiceError(String),

    #[error("Stripe error: {0}")]
    StripeError(String),

    #[error("Checkout error: {0}")]
    CheckoutError(String),

    // Additional billing error variants to match server
    #[error("Payment required: {0}")]
    PaymentRequired(String),

    #[error("Payment error: {0}")]
    PaymentError(String),

    // Additional error variants to match server AppError for complete synchronization
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Too many requests: {0}")]
    TooManyRequests(String),

    #[error("Not implemented: {0}")]
    NotImplemented(String),

    #[error("Lock poisoned: {0}")]
    LockPoisoned(String),

    #[error("Task initiation failed: {0}")]
    TaskInitiationFailed(String),

    #[error("Task finalization failed: {0}")]
    TaskFinalizationFailed(String),

    #[error("Video analysis error: {0}")]
    VideoAnalysisError(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::IoError(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::SerdeError(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::HttpError(err.to_string())
    }
}

impl From<git2::Error> for AppError {
    fn from(err: git2::Error) -> Self {
        AppError::GitError(err.to_string())
    }
}

// Removed Stronghold From implementation

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        AppError::TauriError(error.to_string())
    }
}

impl From<String> for AppError {
    fn from(error: String) -> Self {
        AppError::InternalError(error)
    }
}

impl From<&str> for AppError {
    fn from(error: &str) -> Self {
        AppError::InternalError(error.to_string())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::SqlxError(err.to_string())
    }
}

// A serializable version of AppError for sending to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerializableError {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

impl From<AppError> for SerializableError {
    fn from(error: AppError) -> Self {
        // Log error to database automatically
        let error_type = match &error {
            AppError::IoError(_) => "IO_ERROR",
            AppError::SerdeError(_) => "SERDE_ERROR",
            AppError::DatabaseError(_) => "DATABASE_ERROR",
            AppError::OpenRouterError(_) => "OPENROUTER_ERROR",
            AppError::ServerProxyError(_) => "SERVER_PROXY_ERROR",
            AppError::HttpError(_) => "HTTP_ERROR",
            AppError::TauriError(_) => "TAURI_ERROR",
            AppError::KeyringError(_) => "KEYRING_ERROR",
            AppError::ConfigError(_) => "CONFIG_ERROR",
            AppError::ConfigurationError(_) => "CONFIGURATION_ERROR",
            AppError::InvalidTaskTypeError(_) => "INVALID_TASK_TYPE_ERROR",
            AppError::CacheValidationError(_) => "CACHE_VALIDATION_ERROR",
            AppError::JobError(_) => "JOB_ERROR",
            AppError::FileSystemError(_) => "FILE_SYSTEM_ERROR",
            AppError::GitError(_) => "GIT_ERROR",
            AppError::ValidationError(_) => "VALIDATION_ERROR",
            AppError::InvalidPath(_) => "INVALID_PATH_ERROR",
            AppError::NotFoundError(_) => "NOT_FOUND_ERROR",
            AppError::AuthError(_) => "AUTH_ERROR",
            AppError::SecurityError(_) => "SECURITY_ERROR",
            AppError::InternalError(_) => "INTERNAL_ERROR",
            AppError::FileLockError(_) => "FILE_LOCK_ERROR",
            AppError::InitializationError(_) => "INITIALIZATION_ERROR",
            AppError::ApplicationError(_) => "APPLICATION_ERROR",
            AppError::SerializationError(_) => "SERIALIZATION_ERROR",
            AppError::SqlxError(_) => "SQLX_ERROR",
            AppError::AccessDenied(_) => "ACCESS_DENIED_ERROR",
            AppError::BillingError(_) => "BILLING_ERROR",
            AppError::InvalidArgument(_) => "INVALID_ARGUMENT_ERROR",
            AppError::NetworkError(_) => "NETWORK_ERROR",
            AppError::ExternalServiceError(_) => "EXTERNAL_SERVICE_ERROR",
            AppError::InvalidResponse(_) => "INVALID_RESPONSE_ERROR",
            AppError::StorageError(_) => "STORAGE_ERROR",
            AppError::TokenLimitExceededError(_) => "TOKEN_LIMIT_EXCEEDED_ERROR",
            AppError::PaymentFailed(_) => "PAYMENT_FAILED",
            AppError::PaymentDeclined(_) => "PAYMENT_DECLINED",
            AppError::PaymentAuthenticationRequired(_) => "PAYMENT_AUTHENTICATION_REQUIRED",
            AppError::BillingExpired(_) => "CUSTOMER_BILLING_EXPIRED",
            AppError::BillingCancelled(_) => "CUSTOMER_BILLING_CANCELLED",
            AppError::CreditInsufficient(_) => "CREDIT_INSUFFICIENT",
            AppError::CreditPurchaseRequired(_) => "CREDIT_PURCHASE_REQUIRED",
            AppError::PaymentMethodRequired(_) => "PAYMENT_METHOD_REQUIRED",
            AppError::BillingAddressRequired(_) => "BILLING_ADDRESS_REQUIRED",
            AppError::BillingConflict(_) => "CUSTOMER_BILLING_CONFLICT",
            AppError::SpendingLimitExceeded(_) => "SPENDING_LIMIT_EXCEEDED",
            AppError::InvoiceError(_) => "INVOICE_ERROR",
            AppError::StripeError(_) => "STRIPE_ERROR",
            AppError::CheckoutError(_) => "CHECKOUT_ERROR",
            AppError::PaymentRequired(_) => "PAYMENT_REQUIRED",
            AppError::PaymentError(_) => "PAYMENT_ERROR",
            AppError::Unauthorized(_) => "UNAUTHORIZED",
            AppError::Forbidden(_) => "FORBIDDEN",
            AppError::BadRequest(_) => "BAD_REQUEST",
            AppError::TooManyRequests(_) => "TOO_MANY_REQUESTS",
            AppError::NotImplemented(_) => "NOT_IMPLEMENTED",
            AppError::LockPoisoned(_) => "LOCK_POISONED",
            AppError::TaskInitiationFailed(_) => "TASK_INITIATION_FAILED",
            AppError::TaskFinalizationFailed(_) => "TASK_FINALIZATION_FAILED",
            AppError::VideoAnalysisError(_) => "VIDEO_ANALYSIS_ERROR",
            AppError::UpdaterError(_) => "UPDATER_ERROR",
        }
        .to_string();

        // Centralized error logging - log ALL backend errors automatically
        let error_message = error.to_string();
        let error_type_clone = error_type.clone();
        
        // Spawn async task to log error (non-blocking)
        tauri::async_runtime::spawn(async move {
            // Try to get the error log repository from a global state
            // This will be set up during app initialization
            if let Some(handle) = crate::GLOBAL_APP_HANDLE.get() {
                let repo = handle.state::<crate::db_utils::ErrorLogRepository>();
                let _ = repo.insert_error(
                    "ERROR",
                    Some(&error_type_clone),
                    &error_message,
                    Some("Backend"),
                    None, // stack trace
                    None, // metadata
                    Some(env!("CARGO_PKG_VERSION")),
                    Some(std::env::consts::OS),
                ).await;
            }
        });

        SerializableError {
            code: error_type,
            message: error.to_string(),
            details: None,
        }
    }
}

// Keep SerializableError and its From<AppError> implementation for frontend error structures,
// but command results will rely on AppError's direct serialization now

// Define a Result type alias using our AppError
pub type AppResult<T> = Result<T, AppError>;

/// Error construction utilities for creating actionable error messages
impl AppError {
    /// Create a detailed configuration error with context and suggestions
    pub fn config_error_with_context(
        error_type: &str,
        description: &str,
        suggestion: &str,
        context: Option<&str>,
    ) -> Self {
        let message = if let Some(ctx) = context {
            format!(
                "{} Error: {}\nContext: {}\nSuggestion: {}",
                error_type, description, ctx, suggestion
            )
        } else {
            format!(
                "{} Error: {}\nSuggestion: {}",
                error_type, description, suggestion
            )
        };
        AppError::ConfigurationError(message)
    }

    /// Create a detailed invalid task type error with available options
    pub fn invalid_task_type_error(
        provided_task: &str,
        available_tasks: &[&str],
        context: Option<&str>,
    ) -> Self {
        let available_list = available_tasks.join(", ");
        let message = if let Some(ctx) = context {
            format!(
                "Invalid task type '{}' provided.\nContext: {}\nAvailable task types: {}\nSuggestion: Use one of the valid task types listed above.",
                provided_task, ctx, available_list
            )
        } else {
            format!(
                "Invalid task type '{}' provided.\nAvailable task types: {}\nSuggestion: Use one of the valid task types listed above.",
                provided_task, available_list
            )
        };
        AppError::InvalidTaskTypeError(message)
    }

    /// Create a detailed cache validation error
    pub fn cache_validation_error(
        validation_type: &str,
        details: &str,
        recovery_action: &str,
    ) -> Self {
        let message = format!(
            "Cache Validation Failed: {}\nDetails: {}\nRecovery Action: {}",
            validation_type, details, recovery_action
        );
        AppError::CacheValidationError(message)
    }

    /// Create a missing model configuration error
    pub fn missing_model_config_error(task_type: &str, available_models: &[String]) -> Self {
        let available_list = available_models.join(", ");
        let message = format!(
            "Missing Model Configuration for task '{}'.\nThis task requires a valid model to be configured.\nAvailable models: {}\nSuggestion: Configure a model for this task in the server settings.",
            task_type,
            if available_list.is_empty() {
                "No models available"
            } else {
                &available_list
            }
        );
        AppError::ConfigurationError(message)
    }

    /// Create a missing task configuration error
    pub fn missing_task_config_error(task_type: &str, required_fields: &[&str]) -> Self {
        let fields_list = required_fields.join(", ");
        let message = format!(
            "Missing Task Configuration for '{}'.\nRequired fields: {}\nSuggestion: Add complete configuration for this task in the server settings including all required fields.",
            task_type, fields_list
        );
        AppError::ConfigurationError(message)
    }

    /// Create an invalid configuration value error
    pub fn invalid_config_value_error(
        field_name: &str,
        current_value: &str,
        valid_range: &str,
        task_context: Option<&str>,
    ) -> Self {
        let message = if let Some(task) = task_context {
            format!(
                "Invalid Configuration Value for '{}' in task '{}'.\nCurrent value: {}\nValid range: {}\nSuggestion: Update the configuration to use a value within the valid range.",
                field_name, task, current_value, valid_range
            )
        } else {
            format!(
                "Invalid Configuration Value for '{}'.\nCurrent value: {}\nValid range: {}\nSuggestion: Update the configuration to use a value within the valid range.",
                field_name, current_value, valid_range
            )
        };
        AppError::ConfigurationError(message)
    }

    /// Create a model availability error
    pub fn model_not_available_error(
        model_id: &str,
        task_type: &str,
        available_models: &[String],
    ) -> Self {
        let available_list = available_models.join(", ");
        let message = format!(
            "Model '{}' is not available for task '{}'.\nThis model is either not configured or not accessible.\nAvailable models: {}\nSuggestion: Either configure the missing model or update the task to use an available model.",
            model_id,
            task_type,
            if available_list.is_empty() {
                "No models available"
            } else {
                &available_list
            }
        );
        AppError::ConfigurationError(message)
    }

    /// Create a configuration consistency error
    pub fn configuration_consistency_error(
        inconsistency_type: &str,
        details: &str,
        resolution_steps: &[&str],
    ) -> Self {
        let steps_list = resolution_steps
            .iter()
            .enumerate()
            .map(|(i, step)| format!("{}. {}", i + 1, step))
            .collect::<Vec<_>>()
            .join("\n");

        let message = format!(
            "Configuration Consistency Error: {}\nDetails: {}\nResolution Steps:\n{}\nSuggestion: Follow the resolution steps above to fix the configuration inconsistency.",
            inconsistency_type, details, steps_list
        );
        AppError::ConfigurationError(message)
    }
}
