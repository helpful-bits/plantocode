use log::error;
use serde_json::Value;
use std::sync::Arc;
use tauri::Manager;

use crate::error::AppError;

/// Format an error message for user display with more user-friendly messages
pub fn format_user_error(error: &AppError) -> String {
    match error {
        AppError::OpenRouterError(msg) => {
            if msg.contains("rate limit") || msg.contains("429") {
                "AI service rate limit reached. Please try again in a moment.".to_string()
            } else if msg.contains("401") || msg.contains("unauthorized") {
                "AI service authentication failed. Please check your API key configuration.".to_string()
            } else if msg.contains("insufficient") || msg.contains("quota") {
                "AI service quota exceeded. Please check your billing status.".to_string()
            } else {
                format!("AI service error: {}", msg)
            }
        },
        AppError::ServerProxyError(msg) => {
            if msg.contains("connection") || msg.contains("timeout") {
                "Unable to connect to server. Please check your internet connection.".to_string()
            } else if msg.contains("unauthorized") || msg.contains("401") {
                "Authentication failed. Please log in again.".to_string()
            } else {
                format!("Server communication error: {}", msg)
            }
        },
        AppError::DatabaseError(msg) | AppError::SqlxError(msg) => {
            if msg.contains("FOREIGN KEY") {
                "Database integrity error. Please refresh and try again.".to_string()
            } else if msg.contains("locked") {
                "Database is temporarily busy. Please try again in a moment.".to_string()
            } else {
                format!("Database error: {}", msg)
            }
        },
        AppError::FileSystemError(msg) => {
            if msg.contains("permission") || msg.contains("access denied") {
                "File access denied. Please check file permissions.".to_string()
            } else if msg.contains("not found") {
                "File or directory not found.".to_string()
            } else if msg.contains("disk full") || msg.contains("no space") {
                "Insufficient disk space. Please free up some space and try again.".to_string()
            } else {
                format!("File system error: {}", msg)
            }
        },
        AppError::ValidationError(msg) => format!("Invalid input: {}", msg),
        AppError::InvalidPath(msg) => format!("Invalid file path: {}", msg),
        AppError::NotFoundError(msg) => format!("Not found: {}", msg),
        AppError::ConfigError(msg) => {
            if msg.contains("missing") {
                "Configuration is incomplete. Please check your settings.".to_string()
            } else {
                format!("Configuration error: {}", msg)
            }
        },
        AppError::AuthError(msg) => {
            if msg.contains("expired") {
                "Your session has expired. Please log in again.".to_string()
            } else if msg.contains("invalid token") {
                "Authentication failed. Please log in again.".to_string()
            } else {
                format!("Authentication error: {}", msg)
            }
        },
        AppError::JobError(msg) => {
            if msg.contains("timeout") {
                "Operation timed out. Please try again or try a smaller task.".to_string()
            } else if msg.contains("cancelled") {
                "Operation was cancelled.".to_string()
            } else {
                format!("Task processing error: {}", msg)
            }
        },
        AppError::NetworkError(msg) => {
            if msg.contains("timeout") {
                "Network request timed out. Please check your connection and try again.".to_string()
            } else if msg.contains("connection refused") {
                "Unable to connect to the service. Please try again later.".to_string()
            } else {
                format!("Network error: {}", msg)
            }
        },
        AppError::BillingError(msg) => {
            if msg.contains("insufficient") || msg.contains("limit") {
                "Usage limit reached. Please upgrade your plan or wait for your limit to reset.".to_string()
            } else if msg.contains("payment") {
                "Payment issue detected. Please check your billing information.".to_string()
            } else {
                format!("Billing error: {}", msg)
            }
        },
        AppError::KeyringError(msg) => {
            if msg.contains("access denied") || msg.contains("permission") {
                "Unable to access secure storage. Please check your system permissions.".to_string()
            } else {
                format!("Secure storage error: {}", msg)
            }
        },
        AppError::IoError(msg) => format!("I/O error: {}", msg),
        AppError::SerdeError(msg) | AppError::SerializationError(msg) => {
            "Data processing error. Please try again.".to_string()
        },
        AppError::HttpError(msg) => format!("HTTP error: {}", msg),
        AppError::TauriError(msg) => format!("Application error: {}", msg),
        AppError::GitError(msg) => format!("Git error: {}", msg),
        AppError::SecurityError(msg) => format!("Security error: {}", msg),
        AppError::InternalError(msg) => format!("Internal error: {}", msg),
        AppError::FileLockError(msg) => {
            "File is in use by another process. Please try again in a moment.".to_string()
        },
        AppError::InitializationError(msg) => format!("Initialization error: {}", msg),
        AppError::ApplicationError(msg) => format!("Application error: {}", msg),
        AppError::AccessDenied(msg) => format!("Access denied: {}", msg),
        AppError::InvalidArgument(msg) => format!("Invalid input: {}", msg),
        AppError::ExternalServiceError(msg) => format!("External service error: {}", msg),
        AppError::InvalidResponse(msg) => {
            "Received invalid response from service. Please try again.".to_string()
        },
        AppError::StorageError(msg) => format!("Storage error: {}", msg),
        AppError::TokenLimitExceededError(msg) => format!("Token limit exceeded: {}", msg),
        AppError::PaymentFailed(_) => "Payment could not be processed. Please check your payment method and try again.".to_string(),
        AppError::PaymentDeclined(_) => "Your payment was declined. Please check your payment method or contact your bank.".to_string(),
        AppError::PaymentAuthenticationRequired(_) => "Payment authentication required. Please complete the payment verification process.".to_string(),
        AppError::BillingExpired(_) => "Your billing has expired. Please add credits to continue using services.".to_string(),
        AppError::BillingCancelled(_) => "Your billing has been cancelled. Please reactivate to restore full access.".to_string(),
        AppError::CreditInsufficient(_) => "Insufficient credits. Please purchase more credits to continue.".to_string(),
        AppError::CreditPurchaseRequired(_) => "Credit purchase required. Please purchase credits to use this feature.".to_string(),
        AppError::PaymentMethodRequired(_) => "Payment method required. Please add a valid payment method to continue.".to_string(),
        AppError::BillingAddressRequired(_) => "Billing address required. Please complete your billing information.".to_string(),
        AppError::StripeError(_) => "Payment service error. Please try again or contact support if the issue persists.".to_string(),
        AppError::BillingConflict(_) => "Billing conflict detected. Please contact support for assistance.".to_string(),
        AppError::SpendingLimitExceeded(_) => "You've reached your spending limit. Services will be restricted until your next billing period.".to_string(),
        AppError::InvoiceError(_) => "Invoice processing error. Please contact support for assistance.".to_string(),
        AppError::CheckoutError(_) => "Checkout error. Please try again or use a different payment method.".to_string(),
        AppError::PaymentRequired(_) => "Payment required. Please complete your payment to continue.".to_string(),
        AppError::PaymentError(_) => "Payment processing error. Please try again or contact support.".to_string(),
        AppError::Unauthorized(_) => "Authentication required. Please log in again.".to_string(),
        AppError::Forbidden(_) => "Access denied. You don't have permission to perform this action.".to_string(),
        AppError::BadRequest(_) => "Invalid request. Please check your input and try again.".to_string(),
        AppError::TooManyRequests(_) => "Too many requests. Please wait a moment before trying again.".to_string(),
        AppError::NotImplemented(_) => "This feature is not yet implemented. Please contact support.".to_string(),
        AppError::LockPoisoned(_) => "System resource lock error. Please try again.".to_string(),
        AppError::ConfigurationError(msg) => format!("Configuration error: {}", msg),
        AppError::InvalidTaskTypeError(msg) => format!("Invalid task type: {}", msg),
        AppError::Conflict(msg) => format!("Conflict: {}", msg),
        AppError::CacheValidationError(msg) => format!("Cache validation error: {}", msg),
        AppError::TaskInitiationFailed(msg) => format!("Task initiation failed: {}", msg),
        AppError::TaskFinalizationFailed(msg) => format!("Task finalization failed: {}", msg),
        AppError::VideoAnalysisError(msg) => format!("Video analysis error: {}", msg),
        AppError::UpdaterError(msg) => format!("Update error: {}", msg),
        AppError::TerminalError(msg) => format!("Terminal error: {}", msg),
        AppError::TerminalRecoveryError(msg) => format!("Terminal recovery error: {}", msg),
        AppError::TerminalStateError(msg) => format!("Terminal state error: {}", msg),
        AppError::TerminalPersistenceError(msg) => format!("Terminal persistence error: {}", msg),
        AppError::TerminalSessionNotFound(msg) => format!("Terminal session not found: {}", msg),
        AppError::TerminalAttachmentFailed(msg) => format!("Terminal attachment failed: {}", msg),
        AppError::TerminalNoOutput(msg) => format!("Terminal output error: {}", msg),
        AppError::StreamError(msg) => {
            if msg.contains("connection") || msg.contains("timeout") {
                "Stream connection error. Please check your internet connection and try again.".to_string()
            } else {
                format!("Stream error: {}", msg)
            }
        },
        AppError::Processing(msg) => {
            if msg.contains("FFmpeg") || msg.contains("ffprobe") {
                format!("Video processing error: {}. Please ensure FFmpeg is properly installed.", msg)
            } else if msg.contains("chunk") {
                format!("Video processing error: {}", msg)
            } else {
                format!("Processing error: {}", msg)
            }
        },
    }
}

/// Log an error
pub fn log_error(error: &AppError, context: &str) {
    error!("{}: {}", context, error);
}

/// Log an error with additional metadata context
pub fn log_error_with_metadata(error: &AppError, context: &str, metadata: Option<Value>) {
    if let Some(meta) = metadata {
        error!("{}: {} | Metadata: {}", context, error, meta);
    } else {
        error!("{}: {}", context, error);
    }
}

/// Log a workflow-specific error with enhanced context
pub fn log_workflow_error(
    error: &AppError,
    context: &str,
    workflow_id: Option<&str>,
    stage_name: Option<&str>,
    stage_job_id: Option<&str>,
) {
    let mut log_parts = vec![format!("{}: {}", context, error)];

    if let Some(wf_id) = workflow_id {
        log_parts.push(format!("WorkflowId: {}", wf_id));
    }

    if let Some(stage) = stage_name {
        log_parts.push(format!("Stage: {}", stage));
    }

    if let Some(job_id) = stage_job_id {
        log_parts.push(format!("JobId: {}", job_id));
    }

    error!("{}", log_parts.join(" | "));
}

/// Log an error to the database (async)
pub async fn log_error_to_db(error: &AppError, context: &str, metadata: Option<Value>) {
    if let Some(handle) = crate::GLOBAL_APP_HANDLE.get() {
        if let Some(repo) = handle.try_state::<Arc<crate::db_utils::ErrorLogRepository>>() {
            // Determine error level based on error type
            let level = match error {
                AppError::InternalError(_)
                | AppError::DatabaseError(_)
                | AppError::SqlxError(_)
                | AppError::LockPoisoned(_)
                | AppError::InitializationError(_) => "CRITICAL",

                AppError::AuthError(_)
                | AppError::SecurityError(_)
                | AppError::AccessDenied(_)
                | AppError::Unauthorized(_)
                | AppError::Forbidden(_) => "SECURITY",

                AppError::PaymentFailed(_)
                | AppError::PaymentDeclined(_)
                | AppError::BillingError(_)
                | AppError::StripeError(_) => "BILLING",

                _ => "ERROR",
            };

            // Get error type string
            let error_type = match error {
                AppError::IoError(_) => "IO_ERROR",
                AppError::SerdeError(_) => "SERDE_ERROR",
                AppError::DatabaseError(_) => "DATABASE_ERROR",
                AppError::SqlxError(_) => "SQLX_ERROR",
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
                AppError::TerminalError(_) => "TERMINAL_ERROR",
                AppError::TerminalRecoveryError(_) => "TERMINAL_RECOVERY_ERROR",
                AppError::TerminalStateError(_) => "TERMINAL_STATE_ERROR",
                AppError::TerminalPersistenceError(_) => "TERMINAL_PERSISTENCE_ERROR",
                AppError::TerminalSessionNotFound(_) => "TERMINAL_SESSION_NOT_FOUND",
                AppError::TerminalAttachmentFailed(_) => "TERMINAL_ATTACHMENT_FAILED",
                AppError::TerminalNoOutput(_) => "TERMINAL_NO_OUTPUT",
                AppError::StreamError(_) => "STREAM_ERROR",
                AppError::Conflict(_) => "CONFLICT",
                AppError::Processing(_) => "PROCESSING_ERROR",
            };

            // Stack trace would need backtrace crate
            let stack_str: Option<String> = None;

            // Enhance metadata with additional context
            let mut final_metadata = serde_json::json!({
                "source": "rust_backend",
                "threadId": format!("{:?}", std::thread::current().id()),
                "timestamp": chrono::Utc::now().to_rfc3339(),
            });

            if let Some(meta) = metadata {
                if let Some(obj) = final_metadata.as_object_mut() {
                    if let Some(meta_obj) = meta.as_object() {
                        for (k, v) in meta_obj {
                            obj.insert(k.clone(), v.clone());
                        }
                    }
                }
            }

            let _ = repo
                .insert_error(
                    level,
                    Some(error_type),
                    &error.to_string(),
                    Some(context),
                    stack_str.as_deref(), // Would need backtrace crate for actual stack traces
                    Some(&final_metadata.to_string()),
                    Some(env!("CARGO_PKG_VERSION")),
                    Some(std::env::consts::OS),
                )
                .await;
        }
    }
}

/// Convert a serialized error string back to a SerializableError
pub fn parse_error_string(error_string: &str) -> crate::error::SerializableError {
    serde_json::from_str(error_string).unwrap_or_else(|_| crate::error::SerializableError {
        code: "UNKNOWN_ERROR".to_string(),
        message: error_string.to_string(),
        details: None,
    })
}
