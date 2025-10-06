use reqwest::RequestBuilder;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};

/// Retrieves the persistent device identifier used for device and token binding.
pub fn get_device_id(app_handle: &AppHandle) -> AppResult<String> {
    crate::auth::device_id_manager::get_or_create(app_handle)
}

/// Applies device binding headers (X-Device-ID and X-Token-Binding) to a request.
pub fn apply_device_binding_headers(
    builder: RequestBuilder,
    app_handle: &AppHandle,
) -> AppResult<RequestBuilder> {
    let device_id = get_device_id(app_handle)?;
    Ok(builder
        .header("x-device-id", device_id.clone())
        .header("X-Token-Binding", device_id))
}

/// Applies both authorization and device binding headers to a request.
pub fn apply_auth_headers(
    builder: RequestBuilder,
    token: &str,
    app_handle: &AppHandle,
) -> AppResult<RequestBuilder> {
    let builder = builder.header("Authorization", format!("Bearer {}", token));
    apply_device_binding_headers(builder, app_handle)
}
