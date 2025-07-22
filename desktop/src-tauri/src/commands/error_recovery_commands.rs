use crate::error::{AppError, AppResult};
use crate::error_recovery::config_recovery::{
    ConfigurationValidationError, attempt_configuration_recovery,
    detect_and_fix_common_config_issues, emergency_configuration_reset, rebuild_cache_from_server,
};
use log::{error, info, warn};
use tauri::{AppHandle, command};

/// Attempt comprehensive configuration recovery
#[command]
pub async fn attempt_config_recovery(app_handle: AppHandle) -> AppResult<Vec<String>> {
    info!("Configuration recovery requested via command");
    attempt_configuration_recovery(&app_handle).await
}

/// Detect and fix common configuration issues
#[command]
pub async fn detect_config_issues(
    app_handle: AppHandle,
) -> AppResult<Vec<ConfigurationValidationError>> {
    info!("Configuration issue detection requested via command");
    detect_and_fix_common_config_issues(&app_handle).await
}

/// Rebuild cache from server configuration
#[command]
pub async fn rebuild_config_cache(app_handle: AppHandle) -> AppResult<String> {
    warn!("Configuration cache rebuild requested via command");
    rebuild_cache_from_server(&app_handle).await
}

/// Emergency configuration reset (clears all cached configuration)
#[command]
pub async fn emergency_config_reset(app_handle: AppHandle) -> AppResult<String> {
    error!("Emergency configuration reset requested via command");
    emergency_configuration_reset(&app_handle).await
}

/// Validate current configuration state
#[command]
pub async fn validate_current_config(app_handle: AppHandle) -> AppResult<String> {
    info!("Configuration validation requested via command");

    match crate::utils::config_helpers::get_runtime_ai_config_from_cache(&app_handle).await {
        Ok(_) => Ok(
            "Configuration validation passed - all required settings are present and valid"
                .to_string(),
        ),
        Err(e) => Err(AppError::ConfigurationError(format!(
            "Configuration validation failed: {}\nSuggestion: Run configuration recovery or refresh from server",
            e
        ))),
    }
}

/// Get configuration health status
#[command]
pub async fn get_config_health_status(app_handle: AppHandle) -> AppResult<ConfigHealthStatus> {
    info!("Configuration health status requested via command");

    let mut status = ConfigHealthStatus {
        overall_health: "healthy".to_string(),
        issues: Vec::new(),
        suggestions: Vec::new(),
        cache_status: "unknown".to_string(),
        provider_count: 0,
        task_config_count: 0,
        missing_configurations: Vec::new(),
    };

    // Check cache status
    match crate::utils::config_helpers::get_runtime_ai_config_from_cache(&app_handle).await {
        Ok(config) => {
            status.cache_status = "healthy".to_string();
            status.provider_count = config.providers.len();
            status.task_config_count = config.tasks.len();

            // Check for common issues
            if config.providers.is_empty() {
                status.overall_health = "critical".to_string();
                status.issues.push("No providers configured".to_string());
                status
                    .suggestions
                    .push("Add at least one AI provider configuration".to_string());
            }

            if config.tasks.is_empty() {
                status.overall_health = "critical".to_string();
                status
                    .issues
                    .push("No task configurations found".to_string());
                status
                    .suggestions
                    .push("Add task configurations for required operations".to_string());
            }

            // Check for missing essential tasks
            let required_tasks = [
                "implementation_plan",
                "voice_transcription",
                "text_improvement",
                "path_correction",
                "task_refinement",
                "regex_file_filter",
                "file_relevance_assessment",
                "extended_path_finder",
                "web_search_prompts_generation",
                "web_search_execution",
            ];

            for task in required_tasks {
                if !config.tasks.contains_key(task) {
                    status.missing_configurations.push(task.to_string());
                    if status.overall_health == "healthy" {
                        status.overall_health = "warning".to_string();
                    }
                }
            }

            if !status.missing_configurations.is_empty() {
                status.issues.push(format!(
                    "Missing {} task configurations",
                    status.missing_configurations.len()
                ));
                status
                    .suggestions
                    .push("Configure missing task types in server settings".to_string());
            }

            // Check concurrent jobs setting
            if config.max_concurrent_jobs.is_none() {
                status
                    .issues
                    .push("Max concurrent jobs not configured".to_string());
                status
                    .suggestions
                    .push("Set max_concurrent_jobs in server configuration".to_string());
                if status.overall_health == "healthy" {
                    status.overall_health = "warning".to_string();
                }
            }
        }
        Err(e) => {
            status.overall_health = "critical".to_string();
            status.cache_status = "failed".to_string();
            status
                .issues
                .push(format!("Failed to load configuration: {}", e));
            status
                .suggestions
                .push("Refresh configuration from server or check connection".to_string());
        }
    }

    Ok(status)
}

/// Configuration health status response
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ConfigHealthStatus {
    pub overall_health: String,
    pub issues: Vec<String>,
    pub suggestions: Vec<String>,
    pub cache_status: String,
    pub provider_count: usize,
    pub task_config_count: usize,
    pub missing_configurations: Vec<String>,
}
