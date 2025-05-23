use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::db::repositories::{
    ApiUsageRepository, ModelRepository, SubscriptionRepository, 
    SubscriptionPlanRepository, UserRepository, SettingsRepository
};
use crate::config::AppSettings;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpecificModelConfig {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: Option<String>,
    #[serde(default)]
    pub context_window: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_input_per_1k_tokens: Option<f64>, 
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_output_per_1k_tokens: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathFinderSettings {
    pub max_files_with_content: Option<u32>,
    pub include_file_contents: Option<bool>,
    pub max_content_size_per_file: Option<u32>,
    pub max_file_count: Option<u32>,
    pub file_content_truncation_chars: Option<u32>,
    pub token_limit_buffer: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeAIConfig {
    pub default_llm_model_id: String,
    pub default_voice_model_id: String,
    pub default_transcription_model_id: String,
    pub tasks: HashMap<String, TaskSpecificModelConfig>,
    pub available_models: Vec<ModelInfo>,
    pub path_finder_settings: PathFinderSettings,
}

/// Application state shared across request handlers
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<AppSettings>,
    pub api_usage_repository: Arc<ApiUsageRepository>,
    pub model_repository: Arc<ModelRepository>,
    pub subscription_repository: Arc<SubscriptionRepository>,
    pub subscription_plan_repository: Arc<SubscriptionPlanRepository>,
    pub user_repository: Arc<UserRepository>,
    pub settings_repository: Arc<SettingsRepository>,
    pub free_tier_token_limit: Option<i64>,
}