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
    pub tasks: std::collections::HashMap<String, TaskSpecificModelConfig>,
    pub providers: Vec<ProviderWithModels>,
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
    /// Price input per million tokens in USD
    pub price_input_per_million: String,
    /// Price output per million tokens in USD
    pub price_output_per_million: String,
    /// Price cache read per million tokens in USD
    pub price_cache_read: Option<String>,
    /// Price cache write per million tokens in USD
    pub price_cache_write: Option<String>,
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
    
    // Partition models by type: transcription vs others
    let (transcription_models, regular_models): (Vec<_>, Vec<_>) = models_with_providers
        .into_iter()
        .partition(|model| model.model_type == "transcription");
    
    // Group regular models by provider
    let mut provider_models: HashMap<String, ProviderWithModels> = HashMap::new();
    
    for model in regular_models.iter() {
        let desktop_model = DesktopModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: model.provider_code.clone(),
            provider_name: model.provider_name.clone(),
            description: model.description.clone(),
            context_window: Some(model.context_window as u32),
            price_input_per_million: model.price_input.to_string(),
            price_output_per_million: model.price_output.to_string(),
            price_cache_read: model.price_cache_read.as_ref().map(|v| v.to_string()),
            price_cache_write: model.price_cache_write.as_ref().map(|v| v.to_string())
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
    
    let mut providers: Vec<ProviderWithModels> = provider_models.into_values().collect();
    
    // Create synthetic transcription provider if there are transcription models
    if !transcription_models.is_empty() {
        let mut transcription_provider_models = Vec::new();
        
        for model in transcription_models.iter() {
            let desktop_model = DesktopModelInfo {
                id: model.id.clone(),
                name: model.name.clone(),
                provider: model.provider_code.clone(),
                provider_name: model.provider_name.clone(),
                description: model.description.clone(),
                context_window: Some(model.context_window as u32),
                price_input_per_million: model.price_input.to_string(),
                price_output_per_million: model.price_output.to_string(),
                price_cache_read: model.price_cache_read.as_ref().map(|v| v.to_string()),
                price_cache_write: model.price_cache_write.as_ref().map(|v| v.to_string())
            };
            
            transcription_provider_models.push(desktop_model);
        }
        
        let transcription_provider = ProviderWithModels {
            provider: ProviderInfo {
                code: "openai_transcription".to_string(),
                name: "Transcription".to_string(),
            },
            models: transcription_provider_models,
        };
        
        providers.push(transcription_provider);
    }
    
    // Get consolidated AI model settings directly from database
    let task_configs = settings_repo.get_ai_model_settings().await
        .map_err(|e| AppError::Internal(format!("Failed to get AI settings from database: {}", e)))?;
    
    // Convert database types to response types
    let mut tasks: std::collections::HashMap<String, TaskSpecificModelConfig> = task_configs.tasks
        .into_iter()
        .map(|(key, db_config)| {
            (key, TaskSpecificModelConfig {
                model: db_config.model,
                max_tokens: db_config.max_tokens,
                temperature: db_config.temperature,
                copy_buttons: db_config.copy_buttons,
                allowed_models: db_config.allowed_models,
            })
        })
        .collect();


    let path_finder_settings = PathFinderSettings {
        max_files_with_content: task_configs.path_finder_settings.max_files_with_content,
        include_file_contents: task_configs.path_finder_settings.include_file_contents,
        max_content_size_per_file: task_configs.path_finder_settings.max_content_size_per_file,
        max_file_count: task_configs.path_finder_settings.max_file_count,
        file_content_truncation_chars: task_configs.path_finder_settings.file_content_truncation_chars,
        token_limit_buffer: task_configs.path_finder_settings.token_limit_buffer,
    };

    let response = DesktopRuntimeAIConfig {
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