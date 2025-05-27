use reqwest::{Client, multipart::{Form, Part}};
use reqwest::header::HeaderMap;
use crate::config::settings::AppSettings;
use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GroqTranscriptionResponse {
    pub text: String,
}

#[derive(Debug)]
pub struct GroqClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl GroqClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, AppError> {
        let api_key = app_settings
            .api_keys
            .groq_api_key
            .as_ref()
            .ok_or_else(|| AppError::Configuration("GROQ_API_KEY must be set".to_string()))?
            .clone();

        let client = Client::new();
        let base_url = "https://api.groq.com/openai/v1".to_string();

        Ok(Self {
            client,
            api_key,
            base_url,
        })
    }

    pub async fn transcribe(
        &self,
        audio_data: &[u8],
        filename: &str,
        model: &str,
        user_id: &str,
        duration_ms: i64,
    ) -> Result<(String, HeaderMap), AppError> {
        let url = format!("{}/audio/transcriptions", self.base_url);

        // Create multipart form
        let audio_part = Part::bytes(audio_data.to_vec())
            .file_name(filename.to_string())
            .mime_str("audio/mpeg")
            .map_err(|e| AppError::Validation(format!("Invalid audio mime type: {}", e)))?;

        let form = Form::new()
            .part("file", audio_part)
            .text("model", model.to_string())
            .text("response_format", "text");

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("User-Agent", format!("vibe-manager/1.0 (user:{})", user_id))
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Groq API request failed: {}", e)))?;

        let headers = response.headers().clone();

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "Groq API error ({}): {}",
                status,
                error_text
            )));
        }

        // Groq returns plain text when response_format is "text"
        let transcribed_text = response
            .text()
            .await
            .map_err(|e| AppError::External(format!("Failed to read Groq response: {}", e)))?;

        Ok((transcribed_text, headers))
    }
}