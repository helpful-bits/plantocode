use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use base64::Engine;
use crate::error::{AppResult, AppError};
use crate::db_utils::{SessionRepository, SettingsRepository};



/// Response for batch transcription
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTranscriptionResponse {
    pub chunk_index: u32,
    pub text: String,
    pub processing_time_ms: Option<i64>,
}



/// Transcribes audio batch (5-second chunk) directly for real-time task description
#[command]
pub async fn transcribe_audio_batch_command(
    session_id: String,
    audio_base64: String,
    chunk_index: u32,
    duration_ms: i64,
    language: Option<String>,
    prompt: Option<String>,
    temperature: Option<f32>,
    model: Option<String>,
    app_handle: AppHandle,
) -> AppResult<BatchTranscriptionResponse> {
    let start_time = std::time::Instant::now();
    
    info!("Transcribing audio batch chunk {} with prompt: {:?}, temperature: {:?}, language: {:?}", 
          chunk_index, prompt, temperature, language);
    
    if session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if audio_base64.is_empty() {
        return Err(AppError::ValidationError("Audio data is required".to_string()));
    }
    
    // Validate temperature parameter if provided
    if let Some(temp) = temperature {
        if temp < 0.0 || temp > 1.0 {
            return Err(AppError::ValidationError("Temperature must be between 0.0 and 1.0".to_string()));
        }
    }
    
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(&audio_base64) {
        Ok(data) => data,
        Err(e) => return Err(AppError::ValidationError(format!("Invalid base64 audio data: {}", e))),
    };
    
    // Get the session repository to verify session
    let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
    
    let session = session_repo.get_session_by_id(&session_id).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", session_id)))?;
    
    let server_url = crate::commands::config_commands::get_server_url(app_handle.clone())
        .await
        .map_err(|e| AppError::ConfigError(format!("Failed to get server URL: {}", e)))?;
    
    let token_manager = app_handle.state::<Arc<crate::auth::token_manager::TokenManager>>();
    let jwt = crate::commands::auth0_commands::get_app_jwt(token_manager)
        .await
        .map_err(|e| AppError::AuthError(format!("Failed to get auth token: {}", e)))?
        .ok_or_else(|| AppError::AuthError("No JWT token available".to_string()))?;
    
    let client = reqwest::Client::new();
    let request_payload = serde_json::json!({
        "sessionId": session_id,
        "audioBase64": audio_base64,
        "chunkIndex": chunk_index,
        "durationMs": duration_ms,
        "language": language,
        "prompt": prompt,
        "temperature": temperature,
        "model": model
    });
    
    let response = client
        .post(&format!("{}/api/audio/transcriptions/batch", server_url))
        .header("Authorization", format!("Bearer {}", jwt))
        .header("Content-Type", "application/json")
        .json(&request_payload)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to send batch transcription request: {}", e)))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        let error_msg = format!(
            "Batch transcription failed for chunk {} ({}): {}",
            chunk_index,
            status,
            error_text
        );
        info!("{}", error_msg);
        return Err(AppError::ServerProxyError(error_msg));
    }
    
    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::SerializationError(format!("Failed to parse batch transcription response: {}", e)))?;
    
    let transcribed_text = result
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let processing_time = start_time.elapsed().as_millis() as i64;
    
    info!("Batch transcription chunk {} completed in {}ms: '{}'", 
          chunk_index, processing_time, transcribed_text);
    
    Ok(BatchTranscriptionResponse {
        chunk_index,
        text: transcribed_text,
        processing_time_ms: Some(processing_time),
    })
}










