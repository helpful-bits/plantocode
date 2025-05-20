use actix_web::{web, HttpResponse};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tracing::{debug, info, instrument};

use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::models::runtime_config::{RuntimeAiConfig, TaskSpecificModelConfig, ModelInfo, PathFinderSettings};
use serde::{Serialize, Deserialize};

// Legacy handler for compatibility
#[instrument(skip(app_settings))]
pub async fn get_runtime_ai_config(
    app_settings: web::Data<Arc<RwLock<AppSettings>>>,
    model_repository: web::Data<Arc<ModelRepository>>,
) -> Result<HttpResponse, AppError> {
    info!("Generating runtime AI configuration from database-loaded settings");
    
    // Refresh models from database first
    // This ensures we always have the latest models when the config is requested
    let models = model_repository.get_all().await?;
    
    // Get a read lock on the app settings
    let app_settings_guard = app_settings.read().map_err(|_| {
        AppError::Internal("Failed to acquire read lock on app settings".to_string())
    })?;
    
    // Get the AI settings
    let ai_conf = &app_settings_guard.ai_models;
    
    // Convert AiModelSettings variants to RuntimeAiConfig variants
    let runtime_tasks: HashMap<String, TaskSpecificModelConfig> = ai_conf.task_specific_configs.iter().map(|(k, v_entry)| {
        (k.clone(), TaskSpecificModelConfig {
            model: v_entry.model.clone(),
            max_tokens: v_entry.max_tokens,
            temperature: v_entry.temperature,
        })
    }).collect();

    // Convert database models to the format needed for RuntimeAiConfig
    let runtime_available_models: Vec<ModelInfo> = models.iter().map(|model| {
        ModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: "database".to_string(),
            description: Some(format!("{} - Database Model", model.name)),
            context_window: Some(model.context_window as u32),
            price_input_per_1k_tokens: Some(model.price_input),
            price_output_per_1k_tokens: Some(model.price_output),
        }
    }).collect();

    let runtime_path_finder_settings = PathFinderSettings {
        max_files_with_content: ai_conf.path_finder_settings.max_files_with_content,
        include_file_contents: ai_conf.path_finder_settings.include_file_contents,
        max_content_size_per_file: ai_conf.path_finder_settings.max_content_size_per_file,
        max_file_count: ai_conf.path_finder_settings.max_file_count,
        file_content_truncation_chars: ai_conf.path_finder_settings.file_content_truncation_chars,
        token_limit_buffer: ai_conf.path_finder_settings.token_limit_buffer,
    };

    let runtime_config = RuntimeAiConfig {
        default_llm_model_id: ai_conf.default_llm_model_id.clone(),
        default_voice_model_id: ai_conf.default_voice_model_id.clone(),
        default_transcription_model_id: ai_conf.default_transcription_model_id.clone(),
        tasks: runtime_tasks,
        available_models: runtime_available_models,
        path_finder_settings: runtime_path_finder_settings,
    };
    
    info!("Runtime AI configuration generated successfully with {} models", runtime_config.available_models.len());
    Ok(HttpResponse::Ok().json(runtime_config))
}

// New runtime config response format for desktop app
#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopRuntimeAiConfig {
    /// List of available models
    pub models: Vec<DesktopModelInfo>,
    /// Default settings for the AI configuration
    pub default_settings: DefaultAiSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopModelInfo {
    /// Unique model identifier
    pub id: String,
    /// Human-readable model name
    pub name: String,
    /// Context window size in tokens
    pub context_window: i32,
    /// Price per 1K input tokens in USD
    pub price_per_input_token: f64,
    /// Price per 1K output tokens in USD
    pub price_per_output_token: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DefaultAiSettings {
    /// Default model to use for general tasks
    pub default_model: String,
    /// Default temperature setting
    pub temperature: f32,
    /// Default max tokens setting
    pub max_tokens: i32,
}

/// Handler for GET /api/config/runtime-ai-config endpoint for desktop app
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
    let model_infos = models.into_iter().map(|model| {
        DesktopModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            context_window: model.context_window,
            // Convert from cost per token to cost per 1K tokens
            price_per_input_token: model.price_input * 1000.0,
            price_per_output_token: model.price_output * 1000.0,
        }
    }).collect::<Vec<_>>();
    
    // Create the default settings - using Claude 3 Sonnet as default
    let default_settings = DefaultAiSettings {
        default_model: "anthropic/claude-3-sonnet".to_string(),
        temperature: 0.7,
        max_tokens: 4000,
    };
    
    // Create the response
    let response = DesktopRuntimeAiConfig {
        models: model_infos,
        default_settings,
    };
    
    info!("Returning desktop runtime AI configuration with {} models", response.models.len());
    
    Ok(HttpResponse::Ok().json(response))
}