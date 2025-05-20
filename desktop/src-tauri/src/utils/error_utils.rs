use std::fmt;
use log::error;

use crate::error::{AppError, SerializableError};

/// Format an error message for user display
pub fn format_user_error(error: &AppError) -> String {
    match error {
        AppError::OpenRouterError(msg) => format!("OpenRouter API error: {}", msg),
        AppError::ServerProxyError(msg) => format!("Server proxy error: {}", msg),
        AppError::DatabaseError(msg) => format!("Database error: {}", msg),
        AppError::FileSystemError(msg) => format!("File system error: {}", msg),
        AppError::ValidationError(msg) => format!("Validation error: {}", msg),
        AppError::NotFoundError(msg) => format!("Not found: {}", msg),
        AppError::ConfigError(msg) => format!("Configuration error: {}", msg),
        AppError::AuthError(msg) => format!("Authentication error: {}", msg),
        AppError::JobError(msg) => format!("Job error: {}", msg),
        AppError::IoError(msg) => format!("I/O error: {}", msg),
        AppError::SerdeError(msg) => format!("Serialization error: {}", msg),
        AppError::HttpError(msg) => format!("HTTP error: {}", msg),
        AppError::TauriError(msg) => format!("Tauri error: {}", msg),
        AppError::StrongholdError(msg) => format!("Stronghold error: {}", msg),
        AppError::GitError(msg) => format!("Git error: {}", msg),
        AppError::SecurityError(msg) => format!("Security error: {}", msg),
        AppError::InternalError(msg) => format!("Internal error: {}", msg),
        AppError::FileLockError(msg) => format!("File lock error: {}", msg),
        AppError::InitializationError(msg) => format!("Initialization error: {}", msg),
        AppError::ApplicationError(msg) => format!("Application error: {}", msg),
        AppError::SerializationError(msg) => format!("Serialization error: {}", msg),
        AppError::SqlxError(msg) => format!("Database error: {}", msg),
        AppError::AccessDenied(msg) => format!("Access denied: {}", msg),
        AppError::BillingError(msg) => format!("Billing error: {}", msg),
        AppError::InvalidArgument(msg) => format!("Invalid argument: {}", msg),
        AppError::NetworkError(msg) => format!("Network error: {}", msg),
        AppError::ExternalServiceError(msg) => format!("External service error: {}", msg),
        AppError::InvalidResponse(msg) => format!("Invalid response: {}", msg),
    }
}

/// Log an error
pub fn log_error(error: &AppError, context: &str) {
    error!("{}: {}", context, error);
}

/// Create a SerializableError from an AppError
pub fn to_serializable_error(error: &AppError, details: Option<&str>) -> SerializableError {
    let code = match error {
        AppError::IoError(_) => "IO_ERROR",
        AppError::SerdeError(_) => "SERDE_ERROR",
        AppError::DatabaseError(_) => "DATABASE_ERROR",
        AppError::OpenRouterError(_) => "OPENROUTER_ERROR",
        AppError::ServerProxyError(_) => "SERVER_PROXY_ERROR",
        AppError::HttpError(_) => "HTTP_ERROR",
        AppError::TauriError(_) => "TAURI_ERROR",
        AppError::StrongholdError(_) => "STRONGHOLD_ERROR",
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
    }.to_string();
    
    SerializableError {
        code,
        message: error.to_string(),
        details: details.map(|s| s.to_string()),
    }
}

/// Convert a serialized error string back to a SerializableError
pub fn parse_error_string(error_string: &str) -> SerializableError {
    serde_json::from_str(error_string).unwrap_or_else(|_| {
        SerializableError {
            code: "UNKNOWN_ERROR".to_string(),
            message: error_string.to_string(),
            details: None,
        }
    })
}