use actix_web::{HttpResponse, Result, web};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{error, info, instrument};

use crate::config::AppSettings;
use crate::db::repositories::settings_repository::SettingsRepository;
use crate::error::AppError;
use crate::models::runtime_config::AppState;

/// Response structure for onboarding manifest
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingManifestResponse {
    pub videos: HashMap<String, String>,
}

/// GET /public/onboarding - Get onboarding video manifest
///
/// This is a PUBLIC endpoint (no authentication required).
/// Returns absolute CDN URLs for onboarding videos.
#[instrument(skip(app_state, settings))]
pub async fn get_onboarding_manifest(
    app_state: web::Data<AppState>,
    settings: web::Data<AppSettings>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching onboarding video manifest");

    let settings_repo = &app_state.settings_repository;

    // Fetch onboarding_videos configuration from database
    let config_value = settings_repo
        .get_config_value("onboarding_videos")
        .await?
        .ok_or_else(|| {
            error!("onboarding_videos configuration not found in database");
            AppError::Configuration("Onboarding videos configuration not found".to_string())
        })?;

    // Parse the JSON map of relative S3 keys
    let relative_paths: HashMap<String, String> = serde_json::from_value(config_value)
        .map_err(|e| {
            error!("Failed to parse onboarding_videos configuration: {}", e);
            AppError::Configuration(format!(
                "Invalid onboarding videos configuration format: {}",
                e
            ))
        })?;

    // Compose absolute URLs using CDN_BASE_URL
    let cdn_base_url = &settings.cdn_base_url;
    let absolute_urls: HashMap<String, String> = relative_paths
        .into_iter()
        .map(|(key, relative_path)| {
            let absolute_url = format!("{}/{}", cdn_base_url, relative_path);
            (key, absolute_url)
        })
        .collect();

    let response = OnboardingManifestResponse {
        videos: absolute_urls,
    };

    info!(
        "Returning onboarding manifest with {} videos",
        response.videos.len()
    );

    Ok(HttpResponse::Ok().json(response))
}
