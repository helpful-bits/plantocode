use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::repositories::{
    ApiUsageRepository, ModelRepository, SubscriptionRepository, 
    SubscriptionPlanRepository, UserRepository, SettingsRepository
};
use crate::config::AppSettings;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSpecificModelConfig {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub copy_buttons: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderSettings {
    pub max_files_with_content: Option<u32>,
    pub include_file_contents: Option<bool>,
    pub max_content_size_per_file: Option<u32>,
    pub max_file_count: Option<u32>,
    pub file_content_truncation_chars: Option<u32>,
    pub token_limit_buffer: Option<u32>,
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
}