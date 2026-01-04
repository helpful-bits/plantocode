use actix_web::{HttpResponse, error::ResponseError, http::StatusCode};
use serde::{Deserialize, Serialize};
use sqlx::error::Error as SqlxError;
use std::error::Error as StdError;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Database(String),
    Internal(String),
    Auth(String),
    Unauthorized(String),
    NotFound(String),
    BadRequest(String),
    Forbidden(String),
    Configuration(String),
    Validation(String),
    External(String),
    InvalidArgument(String),
    Payment(String),
    PaymentRequired(String), // For cases where additional payment is needed (e.g., failed proration)
    PaymentFailed(String),
    PaymentDeclined(String),
    PaymentAuthenticationRequired(String),
    BillingExpired(String),
    BillingCancelled(String),
    CreditInsufficient(String),
    CreditPurchaseRequired(String),
    ConsentRequired(String),
    TaskInitiationFailed(String),
    TaskFinalizationFailed(String),
    PaymentMethodRequired(String),
    BillingAddressRequired(String),
    BillingConflict(String),
    InvoiceError(String),
    Serialization(String),
    LockPoisoned(String),
    NotImplemented(String),
    TooManyRequests(String),
    Billing(String),
    AlreadyExists(String),
    DataIntegrity(String),
    SpendingLimitExceeded(String),
    CheckoutError(String),
    VideoAnalysisError(String),
}

#[derive(Serialize, Deserialize)]
struct ErrorResponse {
    code: u16,
    message: String,
    error_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_details: Option<crate::models::error_details::ErrorDetails>,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Database(e) => write!(f, "Database error: {}", e),
            AppError::Internal(e) => write!(f, "Internal error: {}", e),
            AppError::Auth(e) => write!(f, "Authentication error: {}", e),
            AppError::Unauthorized(e) => write!(f, "Unauthorized: {}", e),
            AppError::NotFound(e) => write!(f, "Not found: {}", e),
            AppError::BadRequest(e) => write!(f, "Bad request: {}", e),
            AppError::Forbidden(e) => write!(f, "Forbidden: {}", e),
            AppError::Configuration(e) => write!(f, "Configuration error: {}", e),
            AppError::Validation(e) => write!(f, "Validation error: {}", e),
            AppError::External(e) => write!(f, "External service error: {}", e),
            AppError::InvalidArgument(e) => write!(f, "Invalid argument: {}", e),
            AppError::Payment(e) => write!(f, "Payment error: {}", e),
            AppError::PaymentRequired(e) => write!(f, "Payment required: {}", e),
            AppError::PaymentFailed(e) => write!(f, "Payment failed: {}", e),
            AppError::PaymentDeclined(e) => write!(f, "Payment declined: {}", e),
            AppError::PaymentAuthenticationRequired(e) => {
                write!(f, "Payment authentication required: {}", e)
            }
            AppError::BillingExpired(e) => write!(f, "Billing expired: {}", e),
            AppError::BillingCancelled(e) => write!(f, "Billing cancelled: {}", e),
            AppError::CreditInsufficient(e) => write!(f, "Insufficient credits: {}", e),
            AppError::CreditPurchaseRequired(e) => write!(f, "Credit purchase required: {}", e),
            AppError::ConsentRequired(e) => write!(f, "Consent required: {}", e),
            AppError::TaskInitiationFailed(e) => write!(f, "Task initiation failed: {}", e),
            AppError::TaskFinalizationFailed(e) => write!(f, "Task finalization failed: {}", e),
            AppError::PaymentMethodRequired(e) => write!(f, "Payment method required: {}", e),
            AppError::BillingAddressRequired(e) => write!(f, "Billing address required: {}", e),
            AppError::BillingConflict(e) => write!(f, "Billing conflict: {}", e),
            AppError::InvoiceError(e) => write!(f, "Invoice error: {}", e),
            AppError::Serialization(e) => write!(f, "Serialization error: {}", e),
            AppError::LockPoisoned(e) => write!(f, "Lock poisoned: {}", e),
            AppError::NotImplemented(e) => write!(f, "Not implemented: {}", e),
            AppError::TooManyRequests(e) => write!(f, "Too many requests: {}", e),
            AppError::Billing(e) => write!(f, "Billing error: {}", e),
            AppError::AlreadyExists(e) => write!(f, "Already exists: {}", e),
            AppError::DataIntegrity(e) => write!(f, "Data integrity error: {}", e),
            AppError::SpendingLimitExceeded(e) => write!(f, "Spending limit exceeded: {}", e),
            AppError::CheckoutError(e) => write!(f, "Checkout error: {}", e),
            AppError::VideoAnalysisError(e) => write!(f, "Video analysis error: {}", e),
        }
    }
}

impl StdError for AppError {}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        let (status_code, error_type) = match self {
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "database_error"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
            AppError::Auth(_) => (StatusCode::UNAUTHORIZED, "authentication_error"),
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Forbidden(_) => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::Configuration(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "configuration_error")
            }
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, "validation_error"),
            AppError::External(_) => (StatusCode::BAD_GATEWAY, "external_service_error"),
            AppError::InvalidArgument(_) => (StatusCode::BAD_REQUEST, "invalid_argument"),
            AppError::Payment(_) => (StatusCode::PAYMENT_REQUIRED, "payment_required"),
            AppError::PaymentRequired(_) => (StatusCode::PAYMENT_REQUIRED, "payment_required"),
            AppError::PaymentFailed(_) => (StatusCode::PAYMENT_REQUIRED, "payment_failed"),
            AppError::PaymentDeclined(_) => (StatusCode::PAYMENT_REQUIRED, "payment_declined"),
            AppError::PaymentAuthenticationRequired(_) => (
                StatusCode::PAYMENT_REQUIRED,
                "payment_authentication_required",
            ),
            AppError::BillingExpired(_) => (StatusCode::PAYMENT_REQUIRED, "billing_expired"),
            AppError::BillingCancelled(_) => (StatusCode::PAYMENT_REQUIRED, "billing_cancelled"),
            AppError::CreditInsufficient(_) => {
                (StatusCode::PAYMENT_REQUIRED, "credit_insufficient")
            }
            AppError::CreditPurchaseRequired(_) => {
                (StatusCode::PAYMENT_REQUIRED, "credit_purchase_required")
            }
            AppError::ConsentRequired(_) => (StatusCode::FORBIDDEN, "consent_required"),
            AppError::TaskInitiationFailed(_) => {
                (StatusCode::PAYMENT_REQUIRED, "task_initiation_failed")
            }
            AppError::TaskFinalizationFailed(_) => {
                (StatusCode::PAYMENT_REQUIRED, "task_finalization_failed")
            }
            AppError::PaymentMethodRequired(_) => {
                (StatusCode::PAYMENT_REQUIRED, "payment_method_required")
            }
            AppError::BillingAddressRequired(_) => {
                (StatusCode::PAYMENT_REQUIRED, "billing_address_required")
            }
            AppError::BillingConflict(_) => (StatusCode::CONFLICT, "billing_conflict"),
            AppError::InvoiceError(_) => (StatusCode::BAD_REQUEST, "invoice_error"),
            AppError::Serialization(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "serialization_error")
            }
            AppError::LockPoisoned(_) => (StatusCode::INTERNAL_SERVER_ERROR, "lock_poisoned"),
            AppError::NotImplemented(_) => (StatusCode::NOT_IMPLEMENTED, "not_implemented"),
            AppError::TooManyRequests(_) => (StatusCode::TOO_MANY_REQUESTS, "too_many_requests"),
            AppError::Billing(_) => (StatusCode::PAYMENT_REQUIRED, "billing_error"),
            AppError::AlreadyExists(_) => (StatusCode::CONFLICT, "already_exists"),
            AppError::DataIntegrity(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "data_integrity_error")
            }
            AppError::SpendingLimitExceeded(_) => {
                (StatusCode::PAYMENT_REQUIRED, "spending_limit_exceeded")
            }
            AppError::CheckoutError(_) => (StatusCode::PAYMENT_REQUIRED, "checkout_error"),
            AppError::VideoAnalysisError(_) => (StatusCode::BAD_REQUEST, "video_analysis_error"),
        };

        let error_response = ErrorResponse {
            code: status_code.as_u16(),
            message: self.to_string(),
            error_type: error_type.to_string(),
            error_details: None, // TODO: Pass error details from context
        };

        HttpResponse::build(status_code).json(error_response)
    }

    fn status_code(&self) -> StatusCode {
        match self {
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Auth(_) => StatusCode::UNAUTHORIZED,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::Configuration(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::External(_) => StatusCode::BAD_GATEWAY,
            AppError::InvalidArgument(_) => StatusCode::BAD_REQUEST,
            AppError::Payment(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::PaymentRequired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::PaymentFailed(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::PaymentDeclined(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::PaymentAuthenticationRequired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::BillingExpired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::BillingCancelled(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::CreditInsufficient(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::CreditPurchaseRequired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::ConsentRequired(_) => StatusCode::FORBIDDEN,
            AppError::TaskInitiationFailed(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::TaskFinalizationFailed(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::PaymentMethodRequired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::BillingAddressRequired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::BillingConflict(_) => StatusCode::CONFLICT,
            AppError::InvoiceError(_) => StatusCode::BAD_REQUEST,
            AppError::Serialization(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::LockPoisoned(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::NotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
            AppError::TooManyRequests(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::Billing(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::AlreadyExists(_) => StatusCode::CONFLICT,
            AppError::DataIntegrity(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::SpendingLimitExceeded(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::CheckoutError(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::VideoAnalysisError(_) => StatusCode::BAD_REQUEST,
        }
    }
}

impl AppError {
    /// Returns true if this error is permanent and should not be retried
    pub fn is_permanent(&self) -> bool {
        matches!(
            self,
            AppError::Auth(_)
                | AppError::InvalidArgument(_)
                | AppError::Validation(_)
                | AppError::NotFound(_)
                | AppError::AlreadyExists(_)
                | AppError::Configuration(_)
                | AppError::BadRequest(_)
                | AppError::Forbidden(_)
        )
    }
}

impl From<SqlxError> for AppError {
    fn from(error: SqlxError) -> Self {
        match error {
            SqlxError::RowNotFound => AppError::NotFound("Record not found".to_string()),
            _ => AppError::Database(error.to_string()),
        }
    }
}

impl From<actix_multipart::MultipartError> for AppError {
    fn from(error: actix_multipart::MultipartError) -> Self {
        AppError::BadRequest(format!("Multipart error: {}", error))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::Internal(format!(
            "JSON deserialization/serialization error: {}",
            error
        ))
    }
}

impl From<bigdecimal::ParseBigDecimalError> for AppError {
    fn from(error: bigdecimal::ParseBigDecimalError) -> Self {
        AppError::Validation(format!("Invalid decimal value: {}", error))
    }
}

impl From<crate::services::stripe_service::StripeServiceError> for AppError {
    fn from(error: crate::services::stripe_service::StripeServiceError) -> Self {
        match error {
            crate::services::stripe_service::StripeServiceError::StripeApi(stripe_error) => {
                AppError::Payment(format!("Stripe API error: {}", stripe_error))
            }
            crate::services::stripe_service::StripeServiceError::WebhookVerification(msg) => {
                AppError::Auth(format!("Webhook verification failed: {}", msg))
            }
            crate::services::stripe_service::StripeServiceError::Configuration(msg) => {
                AppError::Configuration(format!("Stripe configuration error: {}", msg))
            }
            crate::services::stripe_service::StripeServiceError::PaymentProcessing(msg) => {
                AppError::Payment(format!("Payment processing error: {}", msg))
            }
            crate::services::stripe_service::StripeServiceError::CreditBilling(msg) => {
                AppError::Payment(format!("Credit billing error: {}", msg))
            }
        }
    }
}

// Define AppResult type alias for Result<T, AppError>
pub type AppResult<T> = Result<T, AppError>;
