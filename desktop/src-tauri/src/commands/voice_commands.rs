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
        "temperature": temperature
    });
    
    let response = client
        .post(&format!("{}/api/proxy/audio/transcriptions/batch", server_url))
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

/// Configuration for transcription settings
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSettings {
    pub default_language: Option<String>,
    pub default_prompt: Option<String>,
    pub default_temperature: Option<f32>,
    pub model: Option<String>,
}

impl Default for TranscriptionSettings {
    fn default() -> Self {
        Self {
            default_language: None,
            default_prompt: None,
            default_temperature: Some(0.7),
            model: None,
        }
    }
}

/// Get transcription settings for the current user
#[command]
pub async fn get_transcription_settings_command(
    app_handle: AppHandle,
) -> AppResult<TranscriptionSettings> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    let settings_json = settings_repo
        .get_value("transcription_settings")
        .await?
        .unwrap_or_else(|| serde_json::to_string(&TranscriptionSettings::default()).unwrap());
    
    let settings: TranscriptionSettings = serde_json::from_str(&settings_json)
        .map_err(|e| AppError::SerializationError(format!("Failed to parse transcription settings: {}", e)))?;
    
    Ok(settings)
}

/// Update transcription settings for the current user  
#[command]
pub async fn set_transcription_settings_command(
    settings: TranscriptionSettings,
    app_handle: AppHandle,
) -> AppResult<()> {
    // Validate settings before saving
    if let Some(temp) = settings.default_temperature {
        if temp < 0.0 || temp > 1.0 {
            return Err(AppError::ValidationError("Temperature must be between 0.0 and 1.0".to_string()));
        }
    }
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let settings_json = serde_json::to_string(&settings)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize transcription settings: {}", e)))?;
    
    settings_repo
        .set_value("transcription_settings", &settings_json)
        .await?;
    
    info!("Updated transcription settings: {:?}", settings);
    Ok(())
}

/// Get project-specific transcription settings
#[command]
pub async fn get_project_transcription_settings_command(
    project_directory: String,
    app_handle: AppHandle,
) -> AppResult<TranscriptionSettings> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = crate::utils::hash_utils::hash_string(&project_directory);
    let key = format!("project_transcription_settings_{}", project_hash);
    
    let settings_json = settings_repo
        .get_value(&key)
        .await?
        .unwrap_or_else(|| serde_json::to_string(&TranscriptionSettings::default()).unwrap());
    
    let settings: TranscriptionSettings = serde_json::from_str(&settings_json)
        .map_err(|e| AppError::SerializationError(format!("Failed to parse project transcription settings: {}", e)))?;
    
    Ok(settings)
}

/// Set project-specific transcription settings  
#[command]
pub async fn set_project_transcription_settings_command(
    project_directory: String,
    settings: TranscriptionSettings,
    app_handle: AppHandle,
) -> AppResult<()> {
    // Validate settings before saving
    if let Some(temp) = settings.default_temperature {
        if temp < 0.0 || temp > 1.0 {
            return Err(AppError::ValidationError("Temperature must be between 0.0 and 1.0".to_string()));
        }
    }
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = crate::utils::hash_utils::hash_string(&project_directory);
    let key = format!("project_transcription_settings_{}", project_hash);
    
    let settings_json = serde_json::to_string(&settings)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize transcription settings: {}", e)))?;
    
    settings_repo
        .set_value(&key, &settings_json)
        .await?;
    
    info!("Updated project transcription settings for {}: {:?}", project_directory, settings);
    Ok(())
}

/// Reset transcription settings to defaults
#[command]
pub async fn reset_transcription_settings_command(
    app_handle: AppHandle,
) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let default_settings = TranscriptionSettings::default();
    let settings_json = serde_json::to_string(&default_settings)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize default transcription settings: {}", e)))?;
    
    settings_repo
        .set_value("transcription_settings", &settings_json)
        .await?;
    
    info!("Reset transcription settings to defaults");
    Ok(())
}

/// Get effective transcription settings with project-specific overrides
/// This merges global and project-specific settings for the frontend
#[command]
pub async fn get_effective_transcription_settings_command(
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<TranscriptionSettings> {
    let global_settings = get_transcription_settings_command(app_handle.clone()).await?;
    
    if let Some(project_dir) = project_directory {
        let project_settings = get_project_transcription_settings_command(project_dir, app_handle).await?;
        
        // Merge settings: project-specific settings override global settings
        let effective_settings = TranscriptionSettings {
            default_language: project_settings.default_language.or(global_settings.default_language),
            default_prompt: project_settings.default_prompt.or(global_settings.default_prompt),
            default_temperature: project_settings.default_temperature.or(global_settings.default_temperature),
            model: project_settings.model.or(global_settings.model),
        };
        
        Ok(effective_settings)
    } else {
        Ok(global_settings)
    }
}

/// Validate transcription settings for UI feedback
#[command]
pub async fn validate_transcription_settings_command(
    settings: TranscriptionSettings,
) -> AppResult<Vec<String>> {
    let mut validation_errors = Vec::new();
    
    if let Some(temp) = settings.default_temperature {
        if temp < 0.0 || temp > 1.0 {
            validation_errors.push("Temperature must be between 0.0 and 1.0".to_string());
        }
    }
    
    if let Some(prompt) = &settings.default_prompt {
        if prompt.len() > 1000 {
            validation_errors.push("Prompt must be 1000 characters or less".to_string());
        }
    }
    
    if let Some(language) = &settings.default_language {
        // Basic language code validation (2-letter or language-region format)
        if !language.chars().all(|c| c.is_alphabetic() || c == '-' || c == '_') {
            validation_errors.push("Language code contains invalid characters".to_string());
        }
        if language.len() < 2 || language.len() > 10 {
            validation_errors.push("Language code must be between 2 and 10 characters".to_string());
        }
    }
    
    Ok(validation_errors)
}


