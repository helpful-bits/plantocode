use crate::error::AppError;
use crate::utils::error_utils::format_user_error;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// JSON-RPC error representation with standard error codes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl RpcError {
    // Standard JSON-RPC error codes
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;

    // Application-specific error codes
    pub const UNAUTHORIZED: i32 = -32000;
    pub const FORBIDDEN: i32 = -32001;
    pub const NOT_FOUND: i32 = -32002;
    pub const CONFLICT: i32 = -32003;
    pub const VALIDATION_ERROR: i32 = -32004;
    pub const DATABASE_ERROR: i32 = -32005;
    pub const EXTERNAL_SERVICE_ERROR: i32 = -32006;
    pub const BILLING_ERROR: i32 = -32007;
    pub const PAYMENT_REQUIRED: i32 = -32008;
    pub const NOT_IMPLEMENTED: i32 = -32009;

    /// Create a new RpcError with custom code and message
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    /// Create a method not found error
    pub fn method_not_found(method: impl Into<String>) -> Self {
        Self {
            code: Self::METHOD_NOT_FOUND,
            message: format!("Method not found: {}", method.into()),
            data: None,
        }
    }

    /// Create an invalid params error
    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: Self::INVALID_PARAMS,
            message: message.into(),
            data: None,
        }
    }

    /// Create an internal error
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self {
            code: Self::INTERNAL_ERROR,
            message: message.into(),
            data: None,
        }
    }

    /// Create an unauthorized error
    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            code: Self::UNAUTHORIZED,
            message: message.into(),
            data: None,
        }
    }

    /// Create a forbidden error
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            code: Self::FORBIDDEN,
            message: message.into(),
            data: None,
        }
    }

    /// Create a not found error
    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: Self::NOT_FOUND,
            message: message.into(),
            data: None,
        }
    }

    /// Create a conflict error
    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            code: Self::CONFLICT,
            message: message.into(),
            data: None,
        }
    }

    /// Create a validation error
    pub fn validation_error(message: impl Into<String>) -> Self {
        Self {
            code: Self::VALIDATION_ERROR,
            message: message.into(),
            data: None,
        }
    }

    /// Create a database error
    pub fn database_error(message: impl Into<String>) -> Self {
        Self {
            code: Self::DATABASE_ERROR,
            message: message.into(),
            data: None,
        }
    }

    /// Create an external service error
    pub fn external_service_error(message: impl Into<String>) -> Self {
        Self {
            code: Self::EXTERNAL_SERVICE_ERROR,
            message: message.into(),
            data: None,
        }
    }

    /// Create a billing error
    pub fn billing_error(message: impl Into<String>) -> Self {
        Self {
            code: Self::BILLING_ERROR,
            message: message.into(),
            data: None,
        }
    }

    /// Create a payment required error
    pub fn payment_required(message: impl Into<String>) -> Self {
        Self {
            code: Self::PAYMENT_REQUIRED,
            message: message.into(),
            data: None,
        }
    }

    /// Create a not implemented error
    pub fn not_implemented(message: impl Into<String>) -> Self {
        Self {
            code: Self::NOT_IMPLEMENTED,
            message: message.into(),
            data: None,
        }
    }
}

/// Convert AppError to RpcError with appropriate error codes and user-friendly messages
impl From<AppError> for RpcError {
    fn from(app_error: AppError) -> Self {
        let user_message = format_user_error(&app_error);
        let data = Some(json!({ "userMessage": user_message }));

        match app_error {
            // Authentication and Authorization errors
            AppError::Unauthorized(_) | AppError::AuthError(_) => Self {
                code: Self::UNAUTHORIZED,
                message: app_error.to_string(),
                data,
            },

            AppError::Forbidden(_) | AppError::AccessDenied(_) | AppError::SecurityError(_) => {
                Self {
                    code: Self::FORBIDDEN,
                    message: app_error.to_string(),
                    data,
                }
            }

            // Not found errors
            AppError::NotFoundError(_) | AppError::TerminalSessionNotFound(_) => Self {
                code: Self::NOT_FOUND,
                message: app_error.to_string(),
                data,
            },

            // Conflict errors
            AppError::Conflict(_) | AppError::BillingConflict(_) => Self {
                code: Self::CONFLICT,
                message: app_error.to_string(),
                data,
            },

            // Validation errors
            AppError::ValidationError(_)
            | AppError::InvalidArgument(_)
            | AppError::InvalidPath(_)
            | AppError::InvalidTaskTypeError(_)
            | AppError::BadRequest(_)
            | AppError::InvalidResponse(_) => Self {
                code: Self::VALIDATION_ERROR,
                message: app_error.to_string(),
                data,
            },

            // Database errors
            AppError::DatabaseError(_) | AppError::SqlxError(_) => Self {
                code: Self::DATABASE_ERROR,
                message: app_error.to_string(),
                data,
            },

            // External service errors
            AppError::ExternalServiceError(_)
            | AppError::OpenRouterError(_)
            | AppError::ServerProxyError(_)
            | AppError::HttpError(_)
            | AppError::NetworkError(_)
            | AppError::StripeError(_) => Self {
                code: Self::EXTERNAL_SERVICE_ERROR,
                message: app_error.to_string(),
                data,
            },

            // Billing errors
            AppError::BillingError(_)
            | AppError::PaymentFailed(_)
            | AppError::PaymentDeclined(_)
            | AppError::PaymentAuthenticationRequired(_)
            | AppError::BillingExpired(_)
            | AppError::BillingCancelled(_)
            | AppError::CreditInsufficient(_)
            | AppError::CreditPurchaseRequired(_)
            | AppError::PaymentMethodRequired(_)
            | AppError::BillingAddressRequired(_)
            | AppError::SpendingLimitExceeded(_)
            | AppError::InvoiceError(_)
            | AppError::CheckoutError(_)
            | AppError::PaymentError(_) => Self {
                code: Self::BILLING_ERROR,
                message: app_error.to_string(),
                data,
            },

            // Payment required (special case for 402)
            AppError::PaymentRequired(_) => Self {
                code: Self::PAYMENT_REQUIRED,
                message: app_error.to_string(),
                data,
            },

            // Not implemented
            AppError::NotImplemented(_) => Self {
                code: Self::NOT_IMPLEMENTED,
                message: app_error.to_string(),
                data,
            },

            // All other errors map to internal error
            _ => Self {
                code: Self::INTERNAL_ERROR,
                message: app_error.to_string(),
                data,
            },
        }
    }
}

/// Convert String to RpcError (maps to internal error)
impl From<String> for RpcError {
    fn from(message: String) -> Self {
        Self {
            code: Self::INTERNAL_ERROR,
            message,
            data: None,
        }
    }
}

/// Convert &str to RpcError (maps to internal error)
impl From<&str> for RpcError {
    fn from(message: &str) -> Self {
        Self {
            code: Self::INTERNAL_ERROR,
            message: message.to_string(),
            data: None,
        }
    }
}

/// Result type alias for RPC operations
pub type RpcResult<T> = Result<T, RpcError>;

/// Convert an RpcResult into an RpcResponse
pub fn into_response(
    correlation_id: String,
    result: RpcResult<Value>,
) -> super::types::RpcResponse {
    match result {
        Ok(value) => super::types::RpcResponse {
            correlation_id,
            result: Some(value),
            error: None,
            is_final: true,
        },
        Err(err) => super::types::RpcResponse {
            correlation_id,
            result: None,
            error: Some(err),
            is_final: true,
        },
    }
}
