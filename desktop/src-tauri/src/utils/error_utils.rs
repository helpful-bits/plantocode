use log::error;

use crate::error::AppError;

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

/// Convert a serialized error string back to a SerializableError
pub fn parse_error_string(error_string: &str) -> crate::error::SerializableError {
    serde_json::from_str(error_string).unwrap_or_else(|_| {
        crate::error::SerializableError {
            code: "UNKNOWN_ERROR".to_string(),
            message: error_string.to_string(),
            details: None,
        }
    })
}