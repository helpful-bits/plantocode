use actix_web::{HttpRequest, HttpResponse, Result, web};
use actix_web_actors::ws;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::types::{BigDecimal, ipnetwork::IpNetwork};
use std::str::FromStr;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::api_contract::common::extract_device_id;
use crate::api_contract::devices::{DeviceResponse, RegisterMobileDeviceRequest, UpsertPushTokenRequest};
use crate::db::repositories::device_repository::{
    DeviceRepository, HeartbeatRequest, RegisterDeviceRequest,
};
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::services::apns_service::ApnsService;
use crate::services::device_connection_manager::{DeviceConnectionManager, DeviceMessage};
use crate::services::device_link_ws::create_device_link_ws;
use crate::services::relay_session_store::RelaySessionStore;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDeviceRequestBody {
    pub device_name: String,
    pub device_type: Option<String>,
    pub platform: String,
    pub platform_version: Option<String>,
    pub app_version: String,
    pub local_ips: Option<Vec<String>>,
    pub public_ip: Option<String>,
    pub relay_eligible: Option<bool>,
    pub available_ports: Option<Vec<u16>>,
    pub capabilities: Option<JsonValue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDeviceResponse {
    pub device_id: Uuid,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub device_id: Uuid,
    pub device_name: String,
    pub device_type: String,
    pub platform: String,
    pub platform_version: Option<String>,
    pub app_version: String,
    pub status: String,
    pub last_heartbeat: Option<DateTime<Utc>>,
    pub cpu_usage: Option<f64>,
    pub memory_usage: Option<f64>,
    pub disk_space_gb: Option<i64>,
    pub active_jobs: i32,
    pub capabilities: JsonValue,
    #[serde(rename = "isConnected")]
    pub is_connected: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRequestBody {
    pub cpu_usage: Option<f64>,
    pub memory_usage: Option<f64>,
    pub disk_space_gb: Option<i64>,
    pub active_jobs: Option<i32>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushTokenRequest {
    pub push_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDescriptor {
    pub connection_info: JsonValue,
    pub signature: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceQuery {
    pub device_type: Option<String>,
    pub connected_only: Option<bool>,
}

fn is_valid_desktop_platform(s: &str) -> bool {
    matches!(s, "macos" | "windows" | "linux")
}

pub async fn register_device_handler(
    device_repo: web::Data<DeviceRepository>,
    user: AuthenticatedUser,
    req_body: web::Json<RegisterDeviceRequestBody>,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let device_id = extract_device_id(&req)?;

    let client_type_header = req.headers()
        .get("X-Client-Type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let device_id_header = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok());

    let token_binding_header = req.headers()
        .get("X-Token-Binding")
        .and_then(|v| v.to_str().ok());

    if client_type_header.as_str() != "desktop" {
        return Err(AppError::BadRequest("invalid_client_type".into()));
    }

    let platform = req_body.platform.to_lowercase();
    if !is_valid_desktop_platform(&platform) {
        return Err(AppError::BadRequest("invalid_platform".into()));
    }

    if let Some(dt) = &req_body.device_type {
        if dt.to_lowercase().as_str() != "desktop" {
            return Err(AppError::BadRequest("invalid_device_type_for_endpoint".into()));
        }
    }

    let device_name_trimmed = req_body.device_name.trim();
    if device_name_trimmed.is_empty() || device_name_trimmed.eq_ignore_ascii_case("unknown") {
        return Err(AppError::BadRequest("invalid_device_name".into()));
    }

    if req_body.app_version.trim().is_empty() {
        return Err(AppError::BadRequest("invalid_app_version".into()));
    }

    if let (Some(dev_str), Some(tb_str)) = (device_id_header, token_binding_header) {
        let dev = Uuid::parse_str(dev_str)
            .map_err(|_| AppError::BadRequest("invalid_device_id_header".into()))?;
        let tb = Uuid::parse_str(tb_str)
            .map_err(|_| AppError::BadRequest("invalid_token_binding_header".into()))?;
        if dev != tb {
            return Err(AppError::BadRequest("token_binding_mismatch".into()));
        }
    }

    // Convert IP addresses to JSON
    let local_ips = req_body
        .local_ips
        .as_ref()
        .map(|ips| serde_json::to_value(ips).unwrap_or(JsonValue::Null));

    // Parse public IP if provided
    let public_ip = req_body.public_ip.as_ref().and_then(|ip_str| {
        ip_str
            .parse::<std::net::IpAddr>()
            .ok()
            .map(|ip| IpNetwork::from(ip))
    });

    // Convert available ports to JSON
    let available_ports = req_body
        .available_ports
        .as_ref()
        .map(|ports| serde_json::to_value(ports).unwrap_or(JsonValue::Null));

    let register_request = RegisterDeviceRequest {
        device_id,
        user_id: user.user_id,
        device_name: req_body.device_name.clone(),
        device_type: req_body
            .device_type
            .clone()
            .unwrap_or_else(|| "desktop".to_string()),
        platform: platform.clone(),
        platform_version: req_body.platform_version.clone(),
        app_version: req_body.app_version.clone(),
        local_ips,
        public_ip,
        relay_eligible: req_body.relay_eligible.unwrap_or(true),
        available_ports,
        capabilities: req_body
            .capabilities
            .clone()
            .unwrap_or_else(|| serde_json::json!({})),
    };

    let device = device_repo.register_device(register_request).await?;

    info!(
        user_id = %user.user_id,
        device_id = %device.device_id,
        device_name = %device.device_name,
        platform = %device.platform,
        "Device registered successfully"
    );

    let response = RegisterDeviceResponse {
        device_id: device.device_id,
        status: device.status,
        created_at: device.created_at,
        updated_at: device.updated_at,
    };

    Ok(HttpResponse::Created().json(response))
}

/// Get devices for the authenticated user
pub async fn get_devices_handler(
    device_repo: web::Data<DeviceRepository>,
    connection_manager: web::Data<DeviceConnectionManager>,
    user: AuthenticatedUser,
    query: web::Query<DeviceQuery>,
) -> Result<HttpResponse, AppError> {
    let devices = device_repo.list_devices_by_user(&user.user_id).await?;

    let removed = device_repo.cleanup_invalid_devices_for_user(&user.user_id).await.unwrap_or(0);
    if removed > 0 {
        info!(
            user_id = %user.user_id,
            removed = removed,
            "Cleaned up invalid devices"
        );
    }

    let devices_count_before = devices.len();

    let device_infos: Vec<DeviceInfo> = devices
        .into_iter()
        .map(|device| {
            use crate::services::device_connection_manager::ClientType;
            let is_connected = connection_manager.is_device_connected_with_type(
                &user.user_id,
                &device.device_id.to_string(),
                ClientType::Desktop
            );

            // Use "online" if connected, otherwise use database status (or "offline" if unavailable)
            let live_status = if is_connected {
                "online".to_string()
            } else {
                // If not connected, mark as offline regardless of database status
                "offline".to_string()
            };

            DeviceInfo {
                device_id: device.device_id,
                device_name: device.device_name,
                device_type: device.device_type,
                platform: device.platform,
                platform_version: device.platform_version,
                app_version: device.app_version,
                status: live_status,
                last_heartbeat: device.last_heartbeat,
                cpu_usage: device
                    .cpu_usage
                    .as_ref()
                    .and_then(|bd| bd.to_string().parse::<f64>().ok()),
                memory_usage: device
                    .memory_usage
                    .as_ref()
                    .and_then(|bd| bd.to_string().parse::<f64>().ok()),
                disk_space_gb: device.disk_space_gb,
                active_jobs: device.active_jobs,
                capabilities: device.capabilities,
                is_connected,
                created_at: device.created_at,
                updated_at: device.updated_at,
            }
        })
        .collect();

    let allowed_platforms = ["macos", "windows", "linux"];
    let device_infos: Vec<DeviceInfo> = device_infos
        .into_iter()
        .filter(|d| {
            d.device_type.eq_ignore_ascii_case("desktop")
                && allowed_platforms.contains(&d.platform.to_lowercase().as_str())
        })
        .collect();

    info!(
        user_id = %user.user_id,
        before = devices_count_before,
        after = device_infos.len(),
        "Filtered devices by platform allowlist"
    );

    // Apply device_type filter if provided
    let device_infos: Vec<DeviceInfo> = if let Some(ref device_type) = query.device_type {
        device_infos
            .into_iter()
            .filter(|d| d.device_type == *device_type)
            .collect()
    } else {
        device_infos
    };

    // Apply connected_only filter if provided
    let device_infos: Vec<DeviceInfo> = if query.connected_only == Some(true) {
        device_infos
            .into_iter()
            .filter(|d| d.is_connected)
            .collect()
    } else {
        device_infos
    };

    debug!(
        user_id = %user.user_id,
        device_count = device_infos.len(),
        "Retrieved devices for user"
    );

    Ok(HttpResponse::Ok().json(device_infos))
}

/// Unregister a device
pub async fn unregister_device_handler(
    device_repo: web::Data<DeviceRepository>,
    connection_manager: web::Data<DeviceConnectionManager>,
    user: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let device_id = path.into_inner();

    device_repo
        .unregister_device(&device_id, &user.user_id)
        .await?;

    info!(
        user_id = %user.user_id,
        device_id = %device_id,
        "Device unregistered successfully"
    );

    // Broadcast device-unlinked event to user's other devices
    let unlink_event = serde_json::json!({
        "type": "device-unlinked",
        "payload": {
            "deviceId": device_id.to_string()
        }
    });

    let device_message = DeviceMessage {
        message_type: "device-unlinked".to_string(),
        payload: unlink_event.get("payload").cloned().unwrap_or(serde_json::json!({})),
        target_device_id: None,
        source_device_id: None,
        timestamp: chrono::Utc::now(),
    };

    if let Err(e) = connection_manager
        .broadcast_to_user_excluding(&user.user_id, device_message, None)
        .await
    {
        warn!(
            user_id = %user.user_id,
            device_id = %device_id,
            error = %e,
            "Failed to broadcast device-unlinked event"
        );
    }

    Ok(HttpResponse::NoContent().finish())
}

/// Update device heartbeat
pub async fn heartbeat_handler(
    device_repo: web::Data<DeviceRepository>,
    user: AuthenticatedUser,
    path: web::Path<Uuid>,
    req_body: web::Json<HeartbeatRequestBody>,
) -> Result<HttpResponse, AppError> {
    let device_id = path.into_inner();

    let heartbeat_request = HeartbeatRequest {
        cpu_usage: req_body
            .cpu_usage
            .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
        memory_usage: req_body
            .memory_usage
            .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
        disk_space_gb: req_body.disk_space_gb,
        active_jobs: req_body.active_jobs.unwrap_or(0),
        status: req_body.status.clone(),
    };

    device_repo
        .update_heartbeat(&device_id, heartbeat_request)
        .await?;

    debug!(
        user_id = %user.user_id,
        device_id = %device_id,
        cpu_usage = ?req_body.cpu_usage,
        memory_usage = ?req_body.memory_usage,
        active_jobs = ?req_body.active_jobs,
        "Device heartbeat updated"
    );

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "heartbeat_updated",
        "timestamp": Utc::now()
    })))
}

/// Get connection descriptor for secure device communication
pub async fn get_connection_descriptor_handler(
    device_repo: web::Data<DeviceRepository>,
    user: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let device_id = path.into_inner();

    let (descriptor, signature) = device_repo
        .get_connection_descriptor(&device_id, &user.user_id)
        .await?;

    let response = ConnectionDescriptor {
        connection_info: descriptor,
        signature,
        expires_at: Utc::now() + chrono::Duration::hours(24), // 24-hour expiry
    };

    debug!(
        user_id = %user.user_id,
        device_id = %device_id,
        "Retrieved connection descriptor"
    );

    Ok(HttpResponse::Ok().json(response))
}

/// Save push notification token for a device
pub async fn save_push_token_handler(
    device_repo: web::Data<DeviceRepository>,
    user: AuthenticatedUser,
    path: web::Path<Uuid>,
    req_body: web::Json<PushTokenRequest>,
) -> Result<HttpResponse, AppError> {
    let device_id = path.into_inner();

    device_repo
        .save_push_token(&device_id, &req_body.push_token)
        .await?;

    info!(
        user_id = %user.user_id,
        device_id = %device_id,
        "Push token saved for device"
    );

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "push_token_saved",
        "timestamp": Utc::now()
    })))
}

pub async fn register_mobile_device_handler(
    device_repo: web::Data<DeviceRepository>,
    user: AuthenticatedUser,
    req_body: web::Json<RegisterMobileDeviceRequest>,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let device_id = extract_device_id(&req)?;

    let mut capabilities: serde_json::Value = req_body.capabilities.clone().unwrap_or_else(|| serde_json::json!({}));
    if let Some(token) = &req_body.push_token {
        if let Some(obj) = capabilities.as_object_mut() {
            obj.insert("device_push_token".to_string(), serde_json::Value::String(token.clone()));
        }
    }

    let register_request = RegisterDeviceRequest {
        device_id,
        user_id: user.user_id,
        device_name: req_body.device_name.clone(),
        device_type: "mobile".to_string(),
        platform: req_body.platform.clone(),
        platform_version: None,
        app_version: req_body.app_version.clone(),
        local_ips: None,
        public_ip: None,
        relay_eligible: false,
        available_ports: None,
        capabilities,
    };

    let device = device_repo.register_device(register_request).await?;

    info!(
        user_id = %user.user_id,
        device_id = %device.device_id,
        device_name = %device.device_name,
        platform = %device.platform,
        "Mobile device registered successfully"
    );

    let response = DeviceResponse {
        device_id: device.device_id,
        device_name: device.device_name,
        device_type: device.device_type,
        platform: device.platform,
        app_version: device.app_version,
        is_connected: false,
    };

    Ok(HttpResponse::Created().json(response))
}

pub async fn upsert_device_push_token_handler(
    device_repo: web::Data<DeviceRepository>,
    user: AuthenticatedUser,
    req_body: web::Json<UpsertPushTokenRequest>,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let device_id = extract_device_id(&req)?;

    device_repo
        .upsert_mobile_push_token(&user.user_id, &device_id, &req_body.platform, &req_body.token)
        .await?;

    info!(
        user_id = %user.user_id,
        device_id = %device_id,
        platform = %req_body.platform,
        "Push token upserted for device"
    );

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true
    })))
}

pub async fn device_link_ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    connection_manager: web::Data<DeviceConnectionManager>,
    device_repo: web::Data<DeviceRepository>,
    relay_store: web::Data<RelaySessionStore>,
    apns_service: Option<web::Data<ApnsService>>,
    user: AuthenticatedUser,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = user.user_id;
    let correlation_id = Uuid::new_v4();

    // Add targeted observability before WebSocket upgrade
    let remote_peer = req
        .peer_addr()
        .map(|addr| addr.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let has_auth_header = req.headers().contains_key("Authorization");
    let has_device_id_header = req.headers().contains_key("X-Device-ID");

    info!(
        ws_upgrade_start = true,
        correlation_id = %correlation_id,
        user_id = %user_id,
        request_path = req.path(),
        remote_peer = %remote_peer,
        has_auth_header = has_auth_header,
        has_device_id_header = has_device_id_header,
        "Starting device WebSocket connection"
    );

    let client_type = req.headers()
        .get("X-Client-Type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase());

    let ws_actor = create_device_link_ws(
        Some(user_id),
        connection_manager.clone(),
        device_repo,
        relay_store,
        apns_service,
        client_type,
    );

    match ws::WsResponseBuilder::new(ws_actor, &req, stream)
        .frame_size(32 * 1024 * 1024)
        .start() {
        Ok(resp) => {
            info!(
                ws_upgrade_success = true,
                correlation_id = %correlation_id,
                user_id = %user_id,
                "WebSocket upgrade success"
            );
            Ok(resp)
        }
        Err(e) => {
            error!(
                correlation_id = %correlation_id,
                user_id = %user_id,
                error = %e,
                "WebSocket handshake failed"
            );
            Err(AppError::Internal("websocket_handshake_failed".into()).into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_register_device_request_serialization() {
        let request = RegisterDeviceRequestBody {
            device_name: "Test Device".to_string(),
            device_type: Some("desktop".to_string()),
            platform: "macos".to_string(),
            platform_version: Some("14.0".to_string()),
            app_version: "1.0.0".to_string(),
            local_ips: Some(vec!["192.168.1.100".to_string()]),
            public_ip: Some("203.0.113.1".to_string()),
            relay_eligible: Some(true),
            available_ports: Some(vec![8080, 8081]),
            capabilities: Some(json!({"supports_voice": true})),
        };

        let serialized = serde_json::to_string(&request).unwrap();
        let deserialized: RegisterDeviceRequestBody = serde_json::from_str(&serialized).unwrap();

        assert_eq!(request.device_name, deserialized.device_name);
        assert_eq!(request.platform, deserialized.platform);
    }

    #[test]
    fn test_heartbeat_request_serialization() {
        let request = HeartbeatRequestBody {
            cpu_usage: Some(75.5),
            memory_usage: Some(60.2),
            disk_space_gb: Some(512),
            active_jobs: Some(3),
            status: Some("online".to_string()),
        };

        let serialized = serde_json::to_string(&request).unwrap();
        let deserialized: HeartbeatRequestBody = serde_json::from_str(&serialized).unwrap();

        assert_eq!(request.cpu_usage, deserialized.cpu_usage);
        assert_eq!(request.active_jobs, deserialized.active_jobs);
    }
}

// WebSocket Handshake Validation Checklist:
// 1. Without Authorization header: Returns 401 Unauthorized
// 2. With valid Authorization header: WebSocket upgrade succeeds
// 3. Server logs show "WebSocket upgrade success" on successful connection
// 4. Server logs show proper error messages with codes on failure
// 5. No more generic HTTP 500 errors during handshake

pub async fn events_stream_handler(
    _req: HttpRequest,
    user: web::ReqData<AuthenticatedUser>,
) -> Result<impl actix_web::Responder, actix_web::Error> {
    use actix_web_lab::sse;
    use futures_util::stream;
    use std::time::Duration;
    use tokio::time::interval;

    let user_id = user.user_id;
    info!("SSE events stream requested by user: {}", user_id);

    let event_stream = stream::unfold(
        interval(Duration::from_secs(30)),
        move |mut interval| async move {
            interval.tick().await;

            let event = sse::Event::Data(sse::Data::new(
                serde_json::json!({
                    "type": "heartbeat",
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "user_id": user_id.to_string(),
                })
                .to_string(),
            ));

            Some((Ok::<_, std::convert::Infallible>(event), interval))
        },
    );

    Ok(sse::Sse::from_stream(event_stream))
}
