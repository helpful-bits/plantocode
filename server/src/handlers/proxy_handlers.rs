// Re-export public types
pub use crate::handlers::proxy::types::{
    LlmCompletionRequest,
    TranscriptionResponse,
    TextEnhancementRequest,
    TextEnhancementResponse,
    TextEnhancementUsage,
};
pub use crate::handlers::proxy::utils::extract_error_details;

use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::handlers::proxy::{router, specialized};
use crate::models::AuthenticatedUser;
use crate::services::billing_service::BillingService;
use crate::services::request_tracker::RequestTracker;
use actix_multipart::Multipart;
use actix_web::{HttpRequest, HttpResponse, web};
use std::sync::Arc;

/// AI proxy handler for intelligent model routing
/// Routes requests to appropriate AI providers based on model configuration
pub async fn llm_chat_completion_handler(
    payload: web::Json<LlmCompletionRequest>,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    router::llm_chat_completion_handler(
        payload,
        user,
        app_settings,
        billing_service,
        model_repository,
        request_tracker,
    )
    .await
}

/// Handle audio transcription (multipart form) - mimics OpenAI's /v1/audio/transcriptions
pub async fn transcription_handler(
    req: HttpRequest,
    payload: Multipart,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    specialized::transcription::transcription_handler(
        req,
        payload,
        user,
        app_settings,
        billing_service,
        model_repository,
    )
    .await
}

/// Handle video analysis requests
pub async fn video_analysis_handler(
    payload: Multipart,
    settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
    user: web::ReqData<AuthenticatedUser>,
) -> Result<HttpResponse, AppError> {
    specialized::video_analysis::video_analysis_handler(
        payload,
        settings,
        billing_service,
        model_repository,
        user,
    )
    .await
}

/// Handle text enhancement requests
pub async fn text_enhancement_handler(
    payload: web::Json<TextEnhancementRequest>,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    specialized::text_enhancement::text_enhancement_handler(
        payload,
        user,
        app_settings,
        billing_service,
        model_repository,
    )
    .await
}
