pub mod settings;

use tracing::info;

pub use settings::AppSettings;

/// Initialize application configuration
pub fn init_config() -> Result<settings::AppSettings, Box<dyn std::error::Error>> {
    info!("Initializing application configuration from environment");
    let config = settings::AppSettings::from_env()?;
    Ok(config)
}
