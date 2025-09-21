use actix_web::{web, HttpResponse};
use crate::config::settings::AppSettings;
use crate::handlers;
use crate::middleware::RateLimitMiddleware;

/// Configures API routes that REQUIRE JWT authentication.
/// Mounted under the "/api" scope and wrapped with SecureAuthentication middleware in main.rs.
pub fn configure_routes(cfg: &mut web::ServiceConfig, strict_rate_limiter: RateLimitMiddleware) {
    cfg.service(
        web::scope("/auth") // Base path: /api/auth
            .route("/userinfo", web::get().to(handlers::auth::userinfo_handler::get_user_info))
            .route("/logout", web::post().to(handlers::auth::logout_handler::logout))
    );
    cfg.service(
        web::scope("/auth0") // Base path: /api/auth0 (protected)
            .route("/refresh-app-token", web::post().to(handlers::auth0_handlers::refresh_app_token_auth0))
    );
    
    
    // Billing routes (/api/billing/*)
    cfg.service(
        web::scope("/billing")
            // Dashboard route
            .route("/dashboard", web::get().to(handlers::billing::dashboard_handler::get_billing_dashboard_data_handler))
            // Usage summary route with pre-calculated totals
            .route("/usage-summary", web::get().to(handlers::billing::dashboard_handler::get_detailed_usage_with_summary_handler))
            // Auto top-off settings routes
            .service(handlers::billing::auto_top_off_handlers::get_auto_top_off_settings_handler)
            .service(handlers::billing::auto_top_off_handlers::update_auto_top_off_settings_handler)
            // Payment and billing portal routes
            .service(handlers::billing::payment_handlers::create_billing_portal_session)
            .service(handlers::billing::payment_handlers::get_payment_methods)
            .service(handlers::billing::payment_handlers::get_stripe_publishable_key)
            // Invoice management routes
            .service(handlers::billing::invoice_handlers::list_invoices)
            // Stripe Checkout routes (/api/billing/checkout/*)
            .service(
                web::scope("/checkout")
                    .service(handlers::billing::checkout_handlers::create_custom_credit_checkout_session_handler)
                    .service(handlers::billing::checkout_handlers::create_setup_checkout_session_handler)
                    .service(handlers::billing::checkout_handlers::get_checkout_session_status_handler)
            )
            // Credit system routes (/api/billing/credits/*)
            .service(
                web::scope("/credits")
                    .service(handlers::billing::credit_handlers::get_credit_balance)
                    .route("/details", web::get().to(handlers::billing::credit_handlers::get_credit_details))
                    .route("/unified-history", web::get().to(handlers::billing::credit_handlers::get_unified_credit_history))
                    .route("/admin/adjust", web::post().to(handlers::billing::credit_handlers::admin_adjust_credits))
                    .service(handlers::billing::credit_handlers::get_credit_purchase_fee_tiers_handler)
            )
            // Usage debug routes (/api/billing/usage/*)
            .service(
                web::scope("/usage")
                    .route("/providers", web::get().to(handlers::billing::usage_debug_handlers::get_usage_debug_data))
            )
            // Customer billing lifecycle actions (cancel, resume, update) are handled by the billing portal
            // This prevents future additions of direct billing modification endpoints
    );
    
    
    
    // Configuration routes (/api/config/*)
    cfg.service(
        web::scope("/config")
            .route("/all-configurations", web::get().to(handlers::config_handlers::get_all_application_configurations_handler))
            .route("/billing", web::get().to(handlers::config_handlers::get_billing_config))
            .route("/billing", web::put().to(handlers::config_handlers::update_billing_config))
            .route("/desktop-runtime-config", web::get().to(handlers::config_handlers::get_desktop_runtime_ai_config))
    );
    
    // Provider routes (/api/providers/*)
    cfg.service(
        web::scope("/providers")
            .route("", web::get().to(handlers::provider_handlers::get_all_providers))
            .route("/with-counts", web::get().to(handlers::provider_handlers::get_providers_with_counts))
            .route("/by-code/{code}", web::get().to(handlers::provider_handlers::get_provider_by_code))
            .route("/by-capability/{capability}", web::get().to(handlers::provider_handlers::get_providers_by_capability))
    );
    
    // Model routes (/api/models/*)
    cfg.service(
        web::scope("/models")
            .route("", web::get().to(handlers::model_handlers::get_all_models))
            .route("/{id}", web::get().to(handlers::model_handlers::get_model_by_id))
            .route("/by-provider/{provider_code}", web::get().to(handlers::model_handlers::get_models_by_provider))
            .route("/by-type/{model_type}", web::get().to(handlers::model_handlers::get_models_by_type))
            .route("/estimate-cost", web::post().to(handlers::model_handlers::estimate_cost))
            .route("/estimate-batch-cost", web::post().to(handlers::model_handlers::estimate_batch_cost))
            .route("/estimate-tokens", web::post().to(handlers::model_handlers::estimate_tokens_handler))
    );

    // LLM proxy routes (/api/llm/*)
    cfg.service(
        web::scope("/llm")
            .route("/chat/completions", web::post().to(handlers::proxy_handlers::llm_chat_completion_handler))
            .route("/cancel", web::post().to(handlers::cancellation_handlers::cancel_request_handler))
            .route("/status/{request_id}", web::get().to(handlers::cancellation_handlers::get_request_status_handler))
            .route("/video/analyze", web::post().to(handlers::proxy_handlers::video_analysis_handler))
            .service(
                web::scope("/text")
                    .route("/enhance", web::post().to(handlers::proxy_handlers::text_enhancement_handler))
            )
    );

    // Audio transcription routes (/api/audio/*) - mimics OpenAI API structure
    cfg.service(
        web::scope("/audio")
            .route("/transcriptions", web::post().to(handlers::proxy_handlers::transcription_handler))
    );

    // Featurebase SSO routes (/api/featurebase/*)
    cfg.service(
        web::scope("/featurebase")
            .route("/sso-token", web::get().to(handlers::featurebase_handlers::get_sso_token))
    );

    // System prompts routes (/api/system-prompts/*)
    cfg.service(
        web::scope("/system-prompts")
            .route("/defaults", web::get().to(handlers::system_prompts_handlers::get_default_system_prompts))
            .route("/defaults/{task_type}", web::get().to(handlers::system_prompts_handlers::get_default_system_prompt_by_task_type))
    );

    // Consent routes (/api/consent/*)
    cfg.service(
        web::scope("/consent")
            .route("/documents/current", web::get().to(handlers::consent_handlers::get_current_legal_documents))
            .route("/status", web::get().to(handlers::consent_handlers::get_consent_status))
            .route("/verify", web::get().to(handlers::consent_handlers::verify_consent))
            .route("/accept", web::post().to(handlers::consent_handlers::accept_consent))
            .route("/admin/report", web::get().to(handlers::consent_handlers::get_consent_report))
    );

    // Device management routes (/api/devices/*)
    cfg.service(
        web::scope("/devices")
            .route("/register", web::post().to(handlers::device_handlers::register_device_handler))
            .route("", web::get().to(handlers::device_handlers::get_devices_handler))
            .route("/{device_id}", web::delete().to(handlers::device_handlers::unregister_device_handler))
            .route("/{device_id}/heartbeat", web::post().to(handlers::device_handlers::heartbeat_handler))
            .route("/{device_id}/connection-descriptor", web::get().to(handlers::device_handlers::get_connection_descriptor_handler))
            .route("/{device_id}/push-token", web::post().to(handlers::device_handlers::save_push_token_handler))
    );

    // Notification routes (/api/notifications/*)
    cfg.service(
        web::scope("/notifications")
            .route("/job-completed", web::post().to(handlers::notification_handlers::job_completed_handler))
            .route("/job-failed", web::post().to(handlers::notification_handlers::job_failed_handler))
            .route("/job-progress", web::post().to(handlers::notification_handlers::job_progress_handler))
            .route("/test", web::post().to(handlers::notification_handlers::test_notification_handler))
    );
}

/// Configures public authentication routes (not part of /api).
/// These are typically for browser-based parts of the auth flow.
/// Mounted under the "/auth" scope in main.rs.
pub fn configure_public_auth_routes(cfg: &mut web::ServiceConfig, account_creation_rate_limiter: RateLimitMiddleware) {
    cfg.service(
        web::scope("/auth0") // Base path: /auth/auth0
            .route("/initiate-login", web::get().to(handlers::auth0_handlers::initiate_auth0_login).wrap(account_creation_rate_limiter))
            .route("/callback", web::get().to(handlers::auth0_handlers::handle_auth0_callback))
            .route("/logged-out", web::get().to(auth0_logged_out_handler))
    );
}

// Logged out handler that redirects to the website
async fn auth0_logged_out_handler(
    settings: web::Data<AppSettings>,
) -> actix_web::Result<HttpResponse> {
    let redirect_url = format!(
        "{}/auth/auth0/logged-out",
        settings.website_base_url
    );
    
    Ok(HttpResponse::Found()
        .append_header(("Location", redirect_url))
        .finish())
}

// Note: The public API routes (auth0 polling/finalization and config/regions) are now
// registered directly in main.rs to avoid using an empty scope

/// Configures webhook routes that DO NOT require JWT authentication.
/// Mounted under the "/webhooks" scope in main.rs.
pub fn configure_webhook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(handlers::billing::webhook_handlers::stripe_webhook);
}