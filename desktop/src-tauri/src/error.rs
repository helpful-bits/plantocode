use serde::{Serialize, Deserialize};
use std::fmt;
use thiserror::Error;

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
    
    #[error("Job error: {0}")]
    JobError(String),
    
    #[error("File system error: {0}")]
    FileSystemError(String),
    
    #[error("Git error: {0}")]
    GitError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
    
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
    
    // Billing-specific errors
    #[error("Payment failed: {0}")]
    PaymentFailed(String),
    
    #[error("Payment declined: {0}")]
    PaymentDeclined(String),
    
    #[error("Payment authentication required: {0}")]
    PaymentAuthenticationRequired(String),
    
    #[error("Subscription expired: {0}")]
    SubscriptionExpired(String),
    
    #[error("Subscription cancelled: {0}")]
    SubscriptionCancelled(String),
    
    #[error("Insufficient credits: {0}")]
    CreditInsufficient(String),
    
    #[error("Plan upgrade required: {0}")]
    PlanUpgradeRequired(String),
    
    #[error("Payment method required: {0}")]
    PaymentMethodRequired(String),
    
    #[error("Billing address required: {0}")]
    BillingAddressRequired(String),
    
    #[error("Stripe error: {0}")]
    StripeError(String),
    
    #[error("Subscription conflict: {0}")]
    SubscriptionConflict(String),
    
    #[error("Spending limit exceeded: {0}")]
    SpendingLimitExceeded(String),
    
    #[error("Invoice error: {0}")]
    InvoiceError(String),
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
        let code = match error {
            AppError::IoError(_) => "IO_ERROR",
            AppError::SerdeError(_) => "SERDE_ERROR",
            AppError::DatabaseError(_) => "DATABASE_ERROR",
            AppError::OpenRouterError(_) => "OPENROUTER_ERROR",
            AppError::ServerProxyError(_) => "SERVER_PROXY_ERROR",
            AppError::HttpError(_) => "HTTP_ERROR",
            AppError::TauriError(_) => "TAURI_ERROR",
            AppError::KeyringError(_) => "KEYRING_ERROR",
            AppError::ConfigError(_) => "CONFIG_ERROR",
            AppError::JobError(_) => "JOB_ERROR",
            AppError::FileSystemError(_) => "FILE_SYSTEM_ERROR",
            AppError::GitError(_) => "GIT_ERROR",
            AppError::ValidationError(_) => "VALIDATION_ERROR",
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
            AppError::SubscriptionExpired(_) => "SUBSCRIPTION_EXPIRED",
            AppError::SubscriptionCancelled(_) => "SUBSCRIPTION_CANCELLED",
            AppError::CreditInsufficient(_) => "CREDIT_INSUFFICIENT",
            AppError::PlanUpgradeRequired(_) => "PLAN_UPGRADE_REQUIRED",
            AppError::PaymentMethodRequired(_) => "PAYMENT_METHOD_REQUIRED",
            AppError::BillingAddressRequired(_) => "BILLING_ADDRESS_REQUIRED",
            AppError::StripeError(_) => "STRIPE_ERROR",
            AppError::SubscriptionConflict(_) => "SUBSCRIPTION_CONFLICT",
            AppError::SpendingLimitExceeded(_) => "SPENDING_LIMIT_EXCEEDED",
            AppError::InvoiceError(_) => "INVOICE_ERROR",
        }.to_string();
        
        SerializableError {
            code,
            message: error.to_string(),
            details: None,
        }
    }
}

// Keep SerializableError and its From<AppError> implementation for frontend error structures,
// but command results will rely on AppError's direct serialization now

// Define a Result type alias using our AppError
pub type AppResult<T> = Result<T, AppError>;