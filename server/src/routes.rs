use actix_web::web;
use crate::handlers;

/// Configures API routes that REQUIRE JWT authentication.
/// Mounted under the "/api" scope and wrapped with SecureAuthentication middleware in main.rs.
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/auth") // Base path: /api/auth
            .route("/userinfo", web::get().to(handlers::auth::userinfo_handler::get_user_info))
    );
    cfg.service(
        web::scope("/auth0") // Base path: /api/auth0 (protected)
            .route("/refresh-app-token", web::post().to(handlers::auth0_handlers::refresh_app_token_auth0))
    );
    
    // Proxy routes (/api/proxy/*)
    cfg.service(
        web::scope("/proxy")
            .service(handlers::proxy_handlers::openrouter_chat_completions_proxy)
            .service(handlers::proxy_handlers::audio_transcriptions_proxy)
    );
    
    // Billing routes (/api/billing/*)
    cfg.service(
        web::scope("/billing")
            .service(handlers::billing_handlers::get_subscription)
            .service(handlers::billing_handlers::get_available_plans)
            .service(handlers::billing_handlers::create_checkout_session)
            .service(handlers::billing_handlers::create_billing_portal)
            .service(handlers::billing_handlers::get_usage_summary)
    );
    
    // Spending routes (/api/spending/*)
    cfg.service(
        web::scope("/spending")
            .service(handlers::spending_handlers::get_spending_status)
            .service(handlers::spending_handlers::check_service_access)
            .service(handlers::spending_handlers::update_spending_limits)
            .service(handlers::spending_handlers::acknowledge_alert)
            .service(handlers::spending_handlers::get_spending_history)
    );
    
    // Usage routes (/api/usage/*)
    cfg.service(
        web::scope("/usage")
            .route("/summary", web::get().to(handlers::usage_handlers::get_usage_summary_handler))
    );
    
    // AI proxy endpoint for direct model access (/api/ai-proxy/*)
    cfg.service(
        web::scope("/ai-proxy")
            .route("/{endpoint:.*}", web::post().to(handlers::proxy_handlers::ai_proxy_endpoint))
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
}

/// Configures webhook routes that DO NOT require JWT authentication.
/// Mounted under the "/webhooks" scope in main.rs.
pub fn configure_webhook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(handlers::billing_handlers::stripe_webhook);
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
                .configure(configure_public_api_routes)
                .configure(configure_webhook_routes)
        );
    }
}