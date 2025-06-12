use actix_web::{error::ResponseError, http::StatusCode, HttpResponse};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::error::Error as StdError;
use sqlx::error::Error as SqlxError;

#[derive(Debug)]
pub enum AppError {
    Database(String),
    Internal(String),
    Auth(String),
    Unauthorized(String),
    NotFound(String),
    BadRequest(String),
    Configuration(String),
    Validation(String),
    External(String),
    InvalidArgument(String),
    Payment(String),
    PaymentRequired(String), // For cases where additional payment is needed (e.g., failed proration)
    Serialization(String),
    LockPoisoned(String),
    NotImplemented(String),
    ActionRequired(String),
    TooManyRequests(String),
}

#[derive(Serialize, Deserialize)]
struct ErrorResponse {
    code: u16,
    message: String,
    error_type: String,
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
            AppError::Configuration(e) => write!(f, "Configuration error: {}", e),
            AppError::Validation(e) => write!(f, "Validation error: {}", e),
            AppError::External(e) => write!(f, "External service error: {}", e),
            AppError::InvalidArgument(e) => write!(f, "Invalid argument: {}", e),
            AppError::Payment(e) => write!(f, "Payment error: {}", e),
            AppError::PaymentRequired(e) => write!(f, "Payment required: {}", e),
            AppError::Serialization(e) => write!(f, "Serialization error: {}", e),
            AppError::LockPoisoned(e) => write!(f, "Lock poisoned: {}", e),
            AppError::NotImplemented(e) => write!(f, "Not implemented: {}", e),
            AppError::ActionRequired(e) => write!(f, "Action required: {}", e),
            AppError::TooManyRequests(e) => write!(f, "Too many requests: {}", e),
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
            AppError::Configuration(_) => (StatusCode::INTERNAL_SERVER_ERROR, "configuration_error"),
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, "validation_error"),
            AppError::External(_) => (StatusCode::BAD_GATEWAY, "external_service_error"),
            AppError::InvalidArgument(_) => (StatusCode::BAD_REQUEST, "invalid_argument"),
            AppError::Payment(_) => (StatusCode::PAYMENT_REQUIRED, "payment_required"),
            AppError::PaymentRequired(_) => (StatusCode::PAYMENT_REQUIRED, "payment_required"),
            AppError::Serialization(_) => (StatusCode::INTERNAL_SERVER_ERROR, "serialization_error"),
            AppError::LockPoisoned(_) => (StatusCode::INTERNAL_SERVER_ERROR, "lock_poisoned"),
            AppError::NotImplemented(_) => (StatusCode::NOT_IMPLEMENTED, "not_implemented"),
            AppError::ActionRequired(_) => (StatusCode::BAD_REQUEST, "action_required"),
            AppError::TooManyRequests(_) => (StatusCode::TOO_MANY_REQUESTS, "too_many_requests"),
        };

        let error_response = ErrorResponse {
            code: status_code.as_u16(),
            message: self.to_string(),
            error_type: error_type.to_string(),
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
            AppError::Configuration(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::External(_) => StatusCode::BAD_GATEWAY,
            AppError::InvalidArgument(_) => StatusCode::BAD_REQUEST,
            AppError::Payment(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::PaymentRequired(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::Serialization(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::LockPoisoned(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::NotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
            AppError::ActionRequired(_) => StatusCode::BAD_REQUEST,
            AppError::TooManyRequests(_) => StatusCode::TOO_MANY_REQUESTS,
        }
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
        AppError::Internal(format!("JSON deserialization/serialization error: {}", error))
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
            crate::services::stripe_service::StripeServiceError::SubscriptionManagement(msg) => {
                AppError::Payment(format!("Subscription management error: {}", msg))
            }
        }
    }
}

// Define AppResult type alias for Result<T, AppError>
pub type AppResult<T> = Result<T, AppError>;