use actix_web::{HttpResponse, HttpRequest, web, Responder};
use serde::{Serialize, Deserialize};
use crate::services::request_tracker::RequestTracker;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentStatus {
    status: String,
    version: String,
    active_streams: usize,
    active_requests: usize,
    deployment_color: String,
    port: u16,
    uptime_seconds: u64,
    ready_for_shutdown: bool,
}

// Store server start time
static SERVER_START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

pub fn init_deployment_tracking() {
    SERVER_START.set(std::time::Instant::now()).ok();
}

pub async fn deployment_status(
    req: HttpRequest,
    tracker: web::Data<RequestTracker>,
) -> impl Responder {
    // Get deployment token from environment variable
    let expected_token = std::env::var("VIBE_DEPLOYMENT_TOKEN").unwrap_or_default();

    // If no token is configured, reject all requests for security
    if expected_token.is_empty() {
        return HttpResponse::ServiceUnavailable()
            .json(serde_json::json!({
                "error": "Service Unavailable",
                "message": "Deployment endpoint not configured"
            }));
    }

    // Check for API token in Authorization header
    let auth_header = req.headers().get("Authorization");

    let is_authorized = if let Some(auth_value) = auth_header {
        if let Ok(auth_str) = auth_value.to_str() {
            // Support both "Bearer TOKEN" and direct token formats
            auth_str == format!("Bearer {}", expected_token) ||
            auth_str == expected_token
        } else {
            false
        }
    } else {
        false
    };

    if !is_authorized {
        return HttpResponse::Unauthorized()
            .json(serde_json::json!({
                "error": "Unauthorized",
                "message": "Valid API token required"
            }));
    }
    let active_requests = tracker.get_active_count().await;

    // Get deployment color from environment or default
    let deployment_color = std::env::var("DEPLOYMENT_COLOR").unwrap_or_else(|_| "unknown".to_string());
    let port = std::env::var("SERVER_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap_or(8080);

    let uptime = SERVER_START
        .get()
        .map(|start| start.elapsed().as_secs())
        .unwrap_or(0);

    // Count active streaming requests specifically
    // Prefer streaming-only if available; fallback to total
    let active_streams = tracker.get_active_stream_count().await.unwrap_or(active_requests);

    let response = DeploymentStatus {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        active_streams,
        active_requests,
        deployment_color,
        port,
        uptime_seconds: uptime,
        ready_for_shutdown: active_streams == 0 && active_requests == 0,
    };

    HttpResponse::Ok().json(response)
}