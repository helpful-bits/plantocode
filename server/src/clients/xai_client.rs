use crate::clients::openai::OpenAIClient;
use crate::config::settings::AppSettings;
use crate::error::AppError;

const XAI_BASE_URL: &str = "https://api.x.ai/v1";

pub struct XaiClient;

impl XaiClient {
    pub fn new_for_xai(app_settings: &AppSettings) -> Result<OpenAIClient, AppError> {
        let api_key = app_settings
            .api_keys
            .xai_api_key
            .clone()
            .ok_or_else(|| AppError::Configuration("XAI API key not configured".to_string()))?;

        // XAI uses OpenAI-compatible API, just with different endpoint
        OpenAIClient::new_with_base_url(api_key, XAI_BASE_URL.to_string())
    }
}
