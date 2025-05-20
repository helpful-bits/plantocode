use actix_web::web;
use crate::handlers::auth::{firebase_handlers, userinfo_handler};
use crate::handlers::usage_handlers;

// Configure protected API routes (requires authentication)
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    // Auth routes (protected part - /api/auth/*)
    cfg.service(
        web::scope("/auth")
            .route("/userinfo", web::get().to(userinfo_handler::get_user_info))
            .route("/validate", web::get().to(userinfo_handler::validate_token))
    );
    
    // Proxy routes (/api/proxy/*)
    cfg.service(
        web::scope("/proxy")
            .service(crate::handlers::proxy_handlers::openrouter_chat_completions_proxy)
            .service(crate::handlers::proxy_handlers::openrouter_audio_transcriptions_proxy)
    );
    
    // Billing routes (/api/billing/*)
    cfg.service(
        web::scope("/billing")
            .service(crate::handlers::billing_handlers::get_subscription)
            .service(crate::handlers::billing_handlers::create_checkout_session)
            .service(crate::handlers::billing_handlers::create_billing_portal)
            .service(crate::handlers::billing_handlers::get_usage_summary)
    );
    
    // Configuration routes (/api/config/*)
    cfg.service(
        web::scope("/config")
            // Legacy endpoint for web app
            .route("/runtime", web::get().to(crate::handlers::config_handlers::get_runtime_ai_config))
            // New endpoint for desktop app
            .route("/runtime-ai-config", web::get().to(crate::handlers::config_handlers::get_desktop_runtime_ai_config))
    );
    
    // Usage routes (/api/usage/*)
    cfg.service(
        web::scope("/usage")
            .route("/summary", web::get().to(usage_handlers::get_usage_summary_handler))
    );
    
    // AI proxy endpoint for direct model access (/api/ai-proxy/*)
    cfg.service(
        web::scope("/ai-proxy")
            .route("/{endpoint:.*}", web::post().to(crate::handlers::proxy_handlers::ai_proxy_endpoint))
    );
    
    // Background jobs are handled entirely on the desktop client side
}

// Configure public auth routes (no authentication required - /auth/*)
pub fn configure_public_auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(firebase_handlers::exchange_firebase_token);
}

// Configure public webhook routes (no authentication required - /webhooks/*)
pub fn configure_webhook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(crate::handlers::billing_handlers::stripe_webhook);
}

// Make sure all modules are properly compiled
#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test;
    
    #[test]
    fn test_routes_compile() {
        let mut app = test::init_service(
            actix_web::App::new()
                .configure(configure_routes)
                .configure(configure_public_auth_routes)
                .configure(configure_webhook_routes)
        );
    }
}