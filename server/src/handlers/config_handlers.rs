use actix_web::{web, HttpResponse};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tracing::{debug, info, instrument};
use bigdecimal::{BigDecimal, ToPrimitive};

use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::models::runtime_config::{RuntimeAIConfig, TaskSpecificModelConfig, ModelInfo, PathFinderSettings, AppState};
use serde::{Serialize, Deserialize};


// Runtime config response format that matches the Tauri backend expectations
// This is the same as RuntimeAIConfig but with different model format
#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopRuntimeAIConfig {
    /// Default LLM model ID
    pub default_llm_model_id: String,
    /// Default voice model ID  
    pub default_voice_model_id: String,
    /// Default transcription model ID
    pub default_transcription_model_id: String,
    /// Task-specific configurations (empty for now)
    pub tasks: std::collections::HashMap<String, TaskSpecificModelConfig>,
    /// List of available models
    pub available_models: Vec<DesktopModelInfo>,
    /// Path finder settings (with defaults)
    pub path_finder_settings: PathFinderSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopModelInfo {
    /// Unique model identifier
    pub id: String,
    /// Human-readable model name
    pub name: String,
    /// Model provider
    pub provider: String,
    /// Model description
    pub description: Option<String>,
    /// Context window size in tokens
    pub context_window: Option<u32>,
    /// Price per input token in USD
    pub price_per_input_token: f64,
    /// Price per output token in USD
    pub price_per_output_token: f64,
}


/// Handler for GET /api/config/desktop-runtime-config endpoint for desktop app
///
/// Retrieves the runtime AI configuration including available models and default settings
#[instrument(skip(app_state))]
pub async fn get_desktop_runtime_ai_config(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching desktop runtime AI configuration from database-sourced settings");
    
    // Get AI settings from application state (loaded from database at startup)
    let ai_settings = &app_state.settings.ai_models;
    
    // Transform available_models from AI settings to response format
    let available_models = ai_settings.available_models.iter().map(|model| {
        DesktopModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: model.provider.clone(),
            description: model.description.clone(),
            context_window: model.context_window,
            // Convert prices from per 1K tokens to per token
            price_per_input_token: model.price_input_per_1k_tokens
                .as_ref()
                .and_then(|p| p.to_f64())
                .unwrap_or(0.0) / 1000.0,
            price_per_output_token: model.price_output_per_1k_tokens
                .as_ref()
                .and_then(|p| p.to_f64())
                .unwrap_or(0.0) / 1000.0,
        }
    }).collect::<Vec<_>>();
    
    // Convert task_specific_configs to response format
    let tasks = ai_settings.task_specific_configs.iter().map(|(task_key, config)| {
        let task_config = TaskSpecificModelConfig {
            model: config.model.clone(),
            max_tokens: config.max_tokens,
            temperature: config.temperature,
        };
        (task_key.clone(), task_config)
    }).collect::<HashMap<String, TaskSpecificModelConfig>>();
    
    // Convert path_finder_settings to response format (keeping as u32 to match PathFinderSettings type)
    let path_finder_settings = PathFinderSettings {
        max_files_with_content: ai_settings.path_finder_settings.max_files_with_content,
        include_file_contents: ai_settings.path_finder_settings.include_file_contents,
        max_content_size_per_file: ai_settings.path_finder_settings.max_content_size_per_file,
        max_file_count: ai_settings.path_finder_settings.max_file_count,
        file_content_truncation_chars: ai_settings.path_finder_settings.file_content_truncation_chars,
        token_limit_buffer: ai_settings.path_finder_settings.token_limit_buffer,
    };
    
    // Create the response from database-sourced AI settings
    let response = DesktopRuntimeAIConfig {
        default_llm_model_id: ai_settings.default_llm_model_id.clone(),
        default_voice_model_id: ai_settings.default_voice_model_id.clone(),
        default_transcription_model_id: ai_settings.default_transcription_model_id.clone(),
        tasks,
        available_models,
        path_finder_settings,
    };
    
    info!("Returning desktop runtime AI configuration with {} models", response.available_models.len());
    
    Ok(HttpResponse::Ok().json(response))
}