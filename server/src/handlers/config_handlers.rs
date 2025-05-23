use actix_web::{web, HttpResponse};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tracing::{debug, info, instrument};

use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::models::runtime_config::{RuntimeAIConfig, TaskSpecificModelConfig, ModelInfo, PathFinderSettings};
use serde::{Serialize, Deserialize};


// Runtime config response format that matches the Tauri backend expectations
// This is the same as RuntimeAiConfig but with different model format
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
    /// Price per 1K input tokens in USD
    pub price_per_input_token: f64,
    /// Price per 1K output tokens in USD
    pub price_per_output_token: f64,
}


/// Handler for GET /api/config/desktop-runtime-config endpoint for desktop app
///
/// Retrieves the runtime AI configuration including available models and default settings
#[instrument(skip(model_repository))]
pub async fn get_desktop_runtime_ai_config(
    model_repository: web::Data<Arc<ModelRepository>>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching desktop runtime AI configuration");
    
    // Get all models from the repository
    let models = model_repository.get_all().await?;
    
    // Transform models to the response format
    let available_models = models.into_iter().map(|model| {
        // Extract provider from model ID (e.g., "anthropic/claude-3-sonnet" -> "anthropic")
        let provider = model.id.split('/').next().unwrap_or("unknown").to_string();
        
        DesktopModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider,
            description: Some(format!("{} - AI Language Model", model.name)),
            context_window: Some(model.context_window as u32),
            // Convert from cost per token to cost per 1K tokens
            price_per_input_token: model.price_input * 1000.0,
            price_per_output_token: model.price_output * 1000.0,
        }
    }).collect::<Vec<_>>();
    
    // Create default path finder settings
    let path_finder_settings = PathFinderSettings {
        max_files_with_content: Some(10),
        include_file_contents: Some(true),
        max_content_size_per_file: Some(10000),
        max_file_count: Some(50),
        file_content_truncation_chars: Some(5000),
        token_limit_buffer: Some(500),
    };
    
    // Create the response matching Tauri backend expectations
    let response = DesktopRuntimeAIConfig {
        default_llm_model_id: "anthropic/claude-3-sonnet".to_string(),
        default_voice_model_id: "openai/whisper-1".to_string(),
        default_transcription_model_id: "openai/whisper-1".to_string(),
        tasks: std::collections::HashMap::new(), // Empty for now
        available_models,
        path_finder_settings,
    };
    
    info!("Returning desktop runtime AI configuration with {} models", response.available_models.len());
    
    Ok(HttpResponse::Ok().json(response))
}