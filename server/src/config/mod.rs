pub mod settings;

use actix_web::web::Data;
use std::sync::{Arc, RwLock};
use tracing::{info, error, instrument};

use crate::config::settings::{ModelInfoEntry};
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppResult;

pub use settings::AppSettings;

/// Initialize application configuration
pub fn init_config() -> Result<settings::AppSettings, Box<dyn std::error::Error>> {
    info!("Initializing application configuration from environment");
    let config = settings::AppSettings::from_env()?;
    Ok(config)
}

/// Update application settings with model information from the database
#[instrument(skip(app_settings, model_repository))]
pub async fn load_models_from_database(
    app_settings: Arc<RwLock<AppSettings>>,
    model_repository: &ModelRepository,
) -> AppResult<()> {
    info!("Loading AI model information from database");
    
    // Fetch all models from the database
    let models = model_repository.get_all().await?;
    
    // Convert database models to the format used in app settings
    let model_entries: Vec<ModelInfoEntry> = models.into_iter()
        .map(|model| {
            ModelInfoEntry {
                id: model.id.clone(),
                name: model.name.clone(),
                provider: "database".to_string(), // Default provider
                description: Some(format!("{} (from database)", model.name)),
                context_window: Some(model.context_window as u32),
                price_input_per_1k_tokens: Some(model.price_input),
                price_output_per_1k_tokens: Some(model.price_output),
            }
        })
        .collect();
    
    info!("Loaded {} models from database", model_entries.len());
    
    // Update app settings with the models from database
    if let Ok(mut settings) = app_settings.write() {
        settings.ai_models.available_models = model_entries;
        info!("Updated application settings with models from database");
    } else {
        error!("Failed to acquire write lock on application settings");
    }
    
    Ok(())
}

/// Refresh model information in the application settings
#[instrument(skip(app_settings, app_data))]
pub async fn refresh_models(
    app_settings: Arc<RwLock<AppSettings>>, 
    app_data: &Data<crate::models::runtime_config::AppState>,
) -> AppResult<()> {
    info!("Refreshing AI model information from database");
    
    // Get the model repository from app state
    let model_repository = &app_data.model_repository;
    
    // Load models from database and update app settings
    load_models_from_database(app_settings, model_repository.as_ref()).await?;
    
    info!("AI model information refreshed successfully");
    Ok(())
}