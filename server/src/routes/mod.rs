use actix_web::web;
use crate::handlers::auth::{firebase_handlers, userinfo_handler};

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
            .service(crate::handlers::proxy_handlers::gemini_proxy)
            .service(crate::handlers::proxy_handlers::claude_proxy)
            .service(crate::handlers::proxy_handlers::groq_proxy)
            .service(crate::handlers::proxy_handlers::gemini_stream_proxy)
            .service(crate::handlers::proxy_handlers::claude_stream_proxy)
            .service(crate::handlers::proxy_handlers::groq_stream_proxy)
    );
    
    // Billing routes (/api/billing/*)
    cfg.service(
        web::scope("/billing")
            .service(crate::handlers::billing_handlers::get_subscription)
            .service(crate::handlers::billing_handlers::create_checkout_session)
            .service(crate::handlers::billing_handlers::create_billing_portal)
            .service(crate::handlers::billing_handlers::get_usage_summary)
    );
    
    // Background job routes (/api/background-jobs/*)
    cfg.service(
        web::scope("/background-jobs")
            .service(crate::handlers::background_job_handlers::update_job)
            .service(crate::handlers::background_job_handlers::list_jobs)
            .service(crate::handlers::background_job_handlers::get_job)
    );
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