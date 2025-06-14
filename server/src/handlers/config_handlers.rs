use actix_web::{web, HttpResponse};
use std::collections::HashMap;
use tracing::{info, instrument};
use bigdecimal::ToPrimitive;

use crate::error::AppError;
use crate::models::runtime_config::{TaskSpecificModelConfig, PathFinderSettings, AppState};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWithModels {
    pub provider: ProviderInfo,
    pub models: Vec<DesktopModelInfo>,
}

// Runtime config response format that matches the Tauri backend expectations
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeAIConfig {
    /// Default LLM model ID
    pub default_llm_model_id: String,
    /// Default voice model ID  
    pub default_voice_model_id: String,
    /// Default transcription model ID
    pub default_transcription_model_id: String,
    /// Task-specific configurations - LOADED DIRECTLY FROM DATABASE
    pub tasks: std::collections::HashMap<String, TaskSpecificModelConfig>,
    /// List of providers with their models - LOADED DIRECTLY FROM DATABASE
    pub providers: Vec<ProviderWithModels>,
    /// Path finder settings
    pub path_finder_settings: PathFinderSettings,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopModelInfo {
    /// Unique model identifier
    pub id: String,
    /// Human-readable model name
    pub name: String,
    /// Model provider
    pub provider: String,
    /// Provider name
    pub provider_name: String,
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
/// **COMPLETELY REFACTORED**: No more JSON storage! Gets data directly from database.
#[instrument(skip(app_state))]
pub async fn get_desktop_runtime_ai_config(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching desktop runtime AI configuration DIRECTLY from database");
    
    // Use model repository from app state directly (no need to create new instance)
    let settings_repo = &app_state.settings_repository;
    
    // Get models with provider info directly from database (NO JSON!)
    let models_with_providers = app_state.model_repository.get_all_with_providers().await
        .map_err(|e| AppError::Internal(format!("Failed to fetch models from database: {}", e)))?;
    
    // Group models by provider
    let mut provider_models: HashMap<String, ProviderWithModels> = HashMap::new();
    
    for model in models_with_providers.iter() {
        let input_price = model.price_input
            .to_f64()
            .ok_or_else(|| AppError::Internal(format!("Invalid input price for model {}", model.id)))?;
        let output_price = model.price_output
            .to_f64()
            .ok_or_else(|| AppError::Internal(format!("Invalid output price for model {}", model.id)))?;
        
        let desktop_model = DesktopModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: model.provider_code.clone(),
            provider_name: model.provider_name.clone(),
            description: model.description.clone(),
            context_window: Some(model.context_window as u32),
            price_per_input_token: input_price / 1000.0,
            price_per_output_token: output_price / 1000.0,
        };
        
        provider_models.entry(model.provider_name.clone())
            .or_insert_with(|| ProviderWithModels {
                provider: ProviderInfo {
                    code: model.provider_code.clone(),
                    name: model.provider_name.clone(),
                },
                models: Vec::new(),
            })
            .models.push(desktop_model);
    }
    
    let providers: Vec<ProviderWithModels> = provider_models.into_values().collect();
    
    // Get task-specific configs directly from database (NO JSON!)
    let task_configs = settings_repo.get_ai_model_settings().await
        .map_err(|e| AppError::Internal(format!("Failed to get AI settings from database: {}", e)))?;
    
    // Convert task configs to response format
    let tasks = task_configs.task_specific_configs.iter().map(|(task_key, config)| {
        let task_config = TaskSpecificModelConfig {
            model: config.model.clone(),
            max_tokens: config.max_tokens,
            temperature: config.temperature,
        };
        (task_key.clone(), task_config)
    }).collect::<HashMap<String, TaskSpecificModelConfig>>();
    
    // Get default model IDs from database configurations
    let default_llm_model_id = task_configs.default_llm_model_id;
    let default_voice_model_id = task_configs.default_voice_model_id;
    let default_transcription_model_id = task_configs.default_transcription_model_id;
    
    // Path finder settings from database
    let path_finder_settings = PathFinderSettings {
        max_files_with_content: task_configs.path_finder_settings.max_files_with_content,
        include_file_contents: task_configs.path_finder_settings.include_file_contents,
        max_content_size_per_file: task_configs.path_finder_settings.max_content_size_per_file,
        max_file_count: task_configs.path_finder_settings.max_file_count,
        file_content_truncation_chars: task_configs.path_finder_settings.file_content_truncation_chars,
        token_limit_buffer: task_configs.path_finder_settings.token_limit_buffer,
    };
    
    // Create the response with data DIRECTLY from database
    let response = DesktopRuntimeAIConfig {
        default_llm_model_id,
        default_voice_model_id,
        default_transcription_model_id,
        tasks,
        providers,
        path_finder_settings,
    };
    
    info!("Returning desktop runtime AI configuration with {} providers (NO JSON storage used)", response.providers.len());
    
    Ok(HttpResponse::Ok().json(response))
}

/// Handler for GET /api/config/all-configurations endpoint
///
/// Retrieves all application configurations from the database
#[instrument(skip(app_state))]
pub async fn get_all_application_configurations_handler(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching all application configurations");
    
    // Use the settings repository from app state
    let settings_repo = &app_state.settings_repository;
    
    // Fetch all configurations
    let configurations = settings_repo.get_all_application_configurations().await?;
    
    info!("Returning {} application configurations", configurations.len());
    
    Ok(HttpResponse::Ok().json(configurations))
}