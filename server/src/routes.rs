use actix_web::web;
use crate::handlers;
use crate::middleware::RateLimitMiddleware;

/// Configures API routes that REQUIRE JWT authentication.
/// Mounted under the "/api" scope and wrapped with SecureAuthentication middleware in main.rs.
pub fn configure_routes(cfg: &mut web::ServiceConfig, strict_rate_limiter: RateLimitMiddleware) {
    cfg.service(
        web::scope("/auth") // Base path: /api/auth
            .route("/userinfo", web::get().to(handlers::auth::userinfo_handler::get_user_info))
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
            // Customer billing info route
            .route("/customer-info", web::get().to(handlers::billing::dashboard_handler::get_customer_billing_info_handler))
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
                    .route("/transaction-history", web::get().to(handlers::billing::credit_handlers::get_credit_history))
                    .route("/admin/adjust", web::post().to(handlers::billing::credit_handlers::admin_adjust_credits))
            )
            // Streaming cost and cancelled job cost reporting endpoints  
            .route("/streaming-cost", web::post().to(handlers::billing::webhook_handlers::streaming_cost_update_authenticated))
            .route("/cancelled-job-cost", web::post().to(handlers::billing::webhook_handlers::cancelled_job_cost_authenticated))
            // Customer billing lifecycle actions (cancel, resume, update) are handled by the billing portal
            // This prevents future additions of direct billing modification endpoints
    );
    
    
    
    // Configuration routes (/api/config/*)
    cfg.service(
        web::scope("/config")
            .route("/all-configurations", web::get().to(handlers::config_handlers::get_all_application_configurations_handler))
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
    );

    // LLM proxy routes (/api/llm/*)
    cfg.service(
        web::scope("/llm")
            .route("/chat/completions", web::post().to(handlers::proxy_handlers::llm_chat_completion_handler))
    );

    // Audio transcription routes (/api/audio/*) - mimics OpenAI API structure
    cfg.service(
        web::scope("/audio")
            .route("/transcriptions", web::post().to(handlers::proxy_handlers::transcription_handler))
    );
}

/// Configures public authentication routes (not part of /api).
/// These are typically for browser-based parts of the auth flow.
/// Mounted under the "/auth" scope in main.rs.
pub fn configure_public_auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/auth0") // Base path: /auth/auth0
            .route("/initiate-login", web::get().to(handlers::auth0_handlers::initiate_auth0_login))
            .route("/callback", web::get().to(handlers::auth0_handlers::handle_auth0_callback))
            .route("/logged-out", web::get().to(auth0_logged_out_handler))
    );
}

// Simple logged out handler
async fn auth0_logged_out_handler() -> actix_web::Result<actix_web::HttpResponse> {
    Ok(actix_web::HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(r#"
<!DOCTYPE html>
<html>
<head><title>Logged Out - Vibe Manager</title></head>
<body>
    <h1>Successfully Logged Out</h1>
    <p>You have been logged out from Vibe Manager.</p>
    <p>You can close this page.</p>
</body>
</html>
        "#))
}

/// Configures publicly accessible API routes that DO NOT require JWT authentication.
/// Mounted directly on the app (no /api prefix).
pub fn configure_public_api_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/auth0") // Base path: /auth0
            .route("/poll-status", web::get().to(handlers::auth0_handlers::poll_auth_status))
            .route("/finalize-login", web::post().to(handlers::auth0_handlers::finalize_auth0_login))
    );
    cfg.service(
        web::scope("/config") // Base path: /config
            .route("/desktop-runtime-config", web::get().to(handlers::config_handlers::get_desktop_runtime_ai_config))
    );
    cfg.service(
        web::scope("/system-prompts") // Base path: /system-prompts
            .route("/defaults", web::get().to(handlers::system_prompts_handlers::get_default_system_prompts))
            .route("/defaults/{task_type}", web::get().to(handlers::system_prompts_handlers::get_default_system_prompt_by_task_type))
    );
}

/// Configures webhook routes that DO NOT require JWT authentication.
/// Mounted under the "/webhooks" scope in main.rs.
pub fn configure_webhook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(handlers::billing::webhook_handlers::stripe_webhook);
}

// Make sure all modules are properly compiled
#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test;
    
    #[actix_web::test]
    async fn test_routes_compile() {
        // Test that all route configurations compile without errors
        let rate_limiter = RateLimitMiddleware::new(100, std::time::Duration::from_secs(60));
        
        let _app = test::init_service(
            actix_web::App::new()
                .configure(|cfg| configure_routes(cfg, rate_limiter))
                .configure(configure_public_auth_routes)
                .configure(configure_public_api_routes)
                .configure(configure_webhook_routes)
        );
    }
}