use actix_web::{web, HttpResponse};
use std::collections::HashMap;
use log::{debug, info};

use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::error::AppError;
use crate::models::{ModelInfo, RuntimeAiConfig, TaskSpecificModelConfig, PathFinderSettings};

pub async fn get_runtime_ai_config(
    settings: web::Data<AppSettings>,
    api_usage_repo: web::Data<ApiUsageRepository>
) -> Result<HttpResponse, AppError> {
    info!("Generating runtime AI configuration with pricing information");
    
    // Convert the task specific configs
    let mut tasks = HashMap::new();
    for (key, config) in &settings.ai_models.task_specific_configs {
        tasks.insert(key.clone(), TaskSpecificModelConfig {
            model: config.model.clone(),
            max_tokens: config.max_tokens,
            temperature: config.temperature,
        });
    }
    
    // Get model IDs for pricing lookup
    let model_ids: Vec<String> = settings.ai_models.available_models
        .iter()
        .map(|model| model.id.clone())
        .collect();
    
    // Get pricing information for all models from the database
    let pricing_map: HashMap<String, Option<(f64, f64)>> = {
        let pricing_results = api_usage_repo.get_models_pricing(&model_ids).await?;
        pricing_results.into_iter().collect()
    };
    
    debug!("Retrieved pricing information for {} models", pricing_map.len());
    
    // Convert the available models, including pricing from database
    let available_models: Vec<ModelInfo> = settings.ai_models.available_models.iter().map(|model| {
        // Get pricing from database or use model's configured pricing if available
        let (price_input, price_output) = match pricing_map.get(&model.id) {
            Some(Some((input, output))) => (Some(*input), Some(*output)),
            _ => (model.price_input_per_1k_tokens, model.price_output_per_1k_tokens),
        };
        
        ModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: model.provider.clone(),
            description: model.description.clone(),
            context_window: model.context_window,
            price_input_per_1k_tokens: price_input,
            price_output_per_1k_tokens: price_output,
        }
    }).collect();
    
    // Convert the path finder settings
    let path_finder_settings = PathFinderSettings {
        max_files_with_content: settings.ai_models.path_finder_settings.max_files_with_content,
        include_file_contents: settings.ai_models.path_finder_settings.include_file_contents,
        max_content_size_per_file: settings.ai_models.path_finder_settings.max_content_size_per_file,
        max_file_count: settings.ai_models.path_finder_settings.max_file_count,
        file_content_truncation_chars: settings.ai_models.path_finder_settings.file_content_truncation_chars,
        token_limit_buffer: settings.ai_models.path_finder_settings.token_limit_buffer,
    };
    
    // Construct the RuntimeAiConfig object
    let runtime_config = RuntimeAiConfig {
        default_llm_model_id: settings.ai_models.default_llm_model_id.clone(),
        default_voice_model_id: settings.ai_models.default_voice_model_id.clone(),
        default_transcription_model_id: settings.ai_models.default_transcription_model_id.clone(),
        tasks,
        available_models,
        path_finder_settings,
    };
    
    info!("Runtime AI configuration generated successfully");
    // Return as JSON response
    Ok(HttpResponse::Ok().json(runtime_config))
}