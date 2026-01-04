use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterMobileDeviceRequest {
    pub device_name: String,
    pub platform: String,
    pub app_version: String,
    #[serde(default)]
    pub capabilities: Option<serde_json::Value>,
    #[serde(default)]
    pub push_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPushTokenRequest {
    pub platform: String,
    pub token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceResponse {
    pub device_id: Uuid,
    pub device_name: String,
    pub device_type: String,
    pub platform: String,
    pub app_version: String,
    pub is_connected: bool,
}
