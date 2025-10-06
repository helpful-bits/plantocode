use crate::api_clients::client_factory;
use crate::error::AppResult;
use log::info;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, command};

/// Response from audio transcription
#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResponse {
    pub text: String,
}

/// Transcribe audio data using the server's transcription API
#[command]
pub async fn transcribe_audio_command(
    audio_data: Vec<u8>,
    duration_ms: i64,
    mime_type: String,
    filename: String,
    language: Option<String>,
    prompt: Option<String>,
    temperature: Option<f32>,
    model: Option<String>,
    app_handle: AppHandle,
) -> AppResult<TranscriptionResponse> {
    info!(
        "Transcribing audio: size={} bytes, duration={}ms, mime_type={}, language={:?}, model={:?}",
        audio_data.len(),
        duration_ms,
        mime_type,
        language,
        model
    );

    // Validate audio data
    if audio_data.len() < 1024 {
        return Err(crate::error::AppError::ValidationError(format!(
            "Audio data too small: {} bytes (minimum 1024 bytes required)",
            audio_data.len()
        )));
    }

    // Validate duration
    if duration_ms <= 0 {
        return Err(crate::error::AppError::ValidationError(
            "Duration must be greater than 0".to_string(),
        ));
    }

    // Validate temperature if provided
    if let Some(temp) = temperature {
        if !(0.0..=1.0).contains(&temp) {
            return Err(crate::error::AppError::ValidationError(
                "Temperature must be between 0 and 1".to_string(),
            ));
        }
    }

    // Validate prompt length if provided
    if let Some(p) = &prompt {
        if p.trim().len() > 1000 {
            return Err(crate::error::AppError::ValidationError(
                "Prompt must be 1000 characters or less".to_string(),
            ));
        }
    }

    // Get the API client (server proxy)
    let api_client = client_factory::get_api_client(&app_handle).await?;

    // Get the server proxy client to access transcription functionality
    let server_proxy = api_client
        .as_any()
        .downcast_ref::<crate::api_clients::server_proxy_client::ServerProxyClient>()
        .ok_or_else(|| {
            crate::error::AppError::InternalError(
                "Failed to get server proxy client for transcription".to_string(),
            )
        })?;

    // Use the default model if not provided
    let model_to_use = model.unwrap_or_else(|| "whisper-1".to_string());

    // Call the transcription method with extended parameters
    let text = transcribe_with_extended_params(
        server_proxy,
        &app_handle,
        &audio_data,
        &filename,
        &model_to_use,
        duration_ms,
        language.as_deref(),
        prompt.as_deref(),
        temperature,
    )
    .await?;

    info!("Audio transcription successful");

    Ok(TranscriptionResponse { text })
}

/// Transcribe audio with extended parameters (prompt, temperature)
/// This function extends the basic transcription client with additional parameters
async fn transcribe_with_extended_params(
    server_proxy: &crate::api_clients::server_proxy_client::ServerProxyClient,
    app_handle: &tauri::AppHandle,
    audio_data: &[u8],
    filename: &str,
    model: &str,
    duration_ms: i64,
    language: Option<&str>,
    prompt: Option<&str>,
    temperature: Option<f32>,
) -> AppResult<String> {
    use crate::auth::header_utils;
    use crate::constants::{APP_HTTP_REFERER, APP_X_TITLE};
    use log::{debug, error};
    use reqwest::multipart;
    use tauri::Manager;

    info!(
        "Sending transcription request with extended params - model: {}, language: {:?}, prompt: {:?}, temp: {:?}",
        model, language, prompt.map(|p| format!("{}...", &p.chars().take(50).collect::<String>())), temperature
    );
    debug!("Audio file: {}, size: {} bytes", filename, audio_data.len());

    // Get auth token from token manager
    let token_manager = app_handle.state::<std::sync::Arc<crate::auth::TokenManager>>();
    let auth_token = match token_manager.get().await {
        Some(token) => {
            debug!("Using auth token from TokenManager");
            token
        }
        None => {
            debug!("No auth token found in TokenManager");
            return Err(crate::error::AppError::AuthError(
                "Authentication token not found. Please re-authenticate.".to_string(),
            ));
        }
    };

    // Use the audio transcriptions endpoint
    let transcription_url = format!("{}/api/audio/transcriptions", server_proxy.server_url());

    // Get MIME type
    let mime_type_str = get_mime_type_from_filename(filename)?;

    // Build multipart form with all parameters
    let mut form = multipart::Form::new()
        .text("model", model.to_string())
        .text("duration_ms", duration_ms.to_string())
        .part(
            "file",
            multipart::Part::bytes(audio_data.to_vec())
                .file_name(filename.to_string())
                .mime_str(mime_type_str)
                .map_err(|e| {
                    crate::error::AppError::InternalError(format!("Invalid mime type: {}", e))
                })?,
        );

    // Add optional parameters
    if let Some(lang) = language {
        form = form.text("language", lang.to_string());
    }
    if let Some(p) = prompt {
        form = form.text("prompt", p.to_string());
    }
    if let Some(temp) = temperature {
        form = form.text("temperature", temp.to_string());
    }

    // Get HTTP client and make request with auth headers
    let http_client = crate::api_clients::client_factory::create_http_client();
    let req = header_utils::apply_auth_headers(
        http_client.post(&transcription_url),
        &auth_token,
        app_handle,
    )?;

    let response = req
        .header("HTTP-Referer", APP_HTTP_REFERER)
        .header("X-Title", APP_X_TITLE)
        .multipart(form)
        .send()
        .await
        .map_err(|e| crate::error::AppError::HttpError(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Failed to get error text".to_string());
        error!(
            "Server proxy transcription API error: {} - {}",
            status, error_text
        );

        // Handle auth errors properly (clear token on 401)
        return Err(handle_transcription_auth_error(
            status.as_u16(),
            &error_text,
            app_handle,
        )
        .await);
    }

    // Parse the response
    let transcription_response: serde_json::Value = response.json().await.map_err(|e| {
        crate::error::AppError::ServerProxyError(format!(
            "Failed to parse transcription response: {}",
            e
        ))
    })?;

    let text = transcription_response["text"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    info!("Transcription through server proxy successful");
    Ok(text)
}

/// Get MIME type from filename
fn get_mime_type_from_filename(filename: &str) -> AppResult<&'static str> {
    let extension = std::path::Path::new(filename)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("");

    match extension.to_lowercase().as_str() {
        "wav" => Ok("audio/wav"),
        "mp3" => Ok("audio/mpeg"),
        "m4a" => Ok("audio/x-m4a"),
        "ogg" => Ok("audio/ogg"),
        "webm" => Ok("audio/webm"),
        "flac" => Ok("audio/flac"),
        "aac" => Ok("audio/aac"),
        "mp4" => Ok("audio/mp4"),
        "" => Err(crate::error::AppError::ValidationError(
            "Audio file has no extension".to_string(),
        )),
        _ => Err(crate::error::AppError::ValidationError(format!(
            "Unsupported audio file extension for transcription: .{}",
            extension
        ))),
    }
}

/// Handle authentication errors for transcription requests
async fn handle_transcription_auth_error(
    status_code: u16,
    error_text: &str,
    app_handle: &tauri::AppHandle,
) -> crate::error::AppError {
    use log::{error, warn};
    use tauri::Manager;

    if status_code == 401 {
        warn!(
            "Received 401 Unauthorized during transcription. Clearing token. Details: {}",
            error_text
        );

        // Clear the invalid token
        let token_manager = app_handle.state::<std::sync::Arc<crate::auth::TokenManager>>();
        if let Err(e) = token_manager.set(None).await {
            error!("Failed to clear invalid token: {}", e);
        }

        crate::error::AppError::AuthError(
            "Authentication token expired. Please re-authenticate.".to_string(),
        )
    } else {
        crate::api_clients::error_handling::map_server_proxy_error(status_code, error_text)
    }
}
