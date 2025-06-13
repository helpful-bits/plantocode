use reqwest::{Client, multipart::{Form, Part}};
use serde::{Deserialize, Serialize};
use crate::config::settings::AppSettings;
use crate::error::AppError;
use base64::Engine;
use tracing::{debug, info, instrument};

// OpenAI API base URL
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAITranscriptionResponse {
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct OpenAIClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl OpenAIClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, AppError> {
        let api_key = app_settings
            .api_keys
            .openai_api_key
            .as_ref()
            .ok_or_else(|| AppError::Configuration("OPENAI_API_KEY must be set".to_string()))?
            .clone();

        let client = Client::new();
        let base_url = OPENAI_BASE_URL.to_string();

        Ok(Self {
            client,
            api_key,
            base_url,
        })
    }

    /// Transcribe audio using OpenAI's direct API with GPT-4o-transcribe
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn transcribe_audio(
        &self,
        audio_data: &[u8],
        filename: &str,
        model: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<String, AppError> {
        let url = format!("{}/audio/transcriptions", self.base_url);

        // Validate audio data
        if audio_data.is_empty() {
            return Err(AppError::Validation("Audio data cannot be empty".to_string()));
        }

        // Validate minimum size to filter out malformed chunks
        const MIN_FILE_SIZE: usize = 1000; // 1KB minimum
        if audio_data.len() < MIN_FILE_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too small ({}B < 1KB) - likely malformed",
                audio_data.len()
            )));
        }

        // Validate file size (25MB limit for OpenAI)
        const MAX_FILE_SIZE: usize = 25 * 1024 * 1024; // 25MB
        if audio_data.len() > MAX_FILE_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too large ({}MB > 25MB)",
                audio_data.len() / (1024 * 1024)
            )));
        }

        // Basic WebM header validation
        if filename.ends_with(".webm") && audio_data.len() >= 4 {
            // WebM files should start with EBML header (0x1A, 0x45, 0xDF, 0xA3)
            if audio_data[0] != 0x1A || audio_data[1] != 0x45 || audio_data[2] != 0xDF || audio_data[3] != 0xA3 {
                debug!("WebM header validation failed for {}: {:02X} {:02X} {:02X} {:02X}", 
                       filename, audio_data[0], audio_data[1], audio_data[2], audio_data[3]);
                return Err(AppError::Validation("Invalid WebM file format - missing EBML header".to_string()));
            }
        }

        // Create multipart form with proper filename - this is critical!
        let file_part = Part::bytes(audio_data.to_vec())
            .file_name(filename.to_string())  // Critical: GPT-4o needs the .webm extension
            .mime_str("audio/webm")           // Keep MIME simple, no codec parameters
            .map_err(|e| AppError::Validation(format!("Invalid audio mime type: {}", e)))?;

        let mut form = Form::new()
            .part("file", file_part)
            .text("model", model.to_string());

        // Add optional parameters
        if let Some(lang) = language {
            form = form.text("language", lang.to_string());
        }
        if let Some(p) = prompt {
            form = form.text("prompt", p.to_string());
        }
        if let Some(temp) = temperature {
            form = form.text("temperature", temp.to_string());
        }

        info!("Sending transcription request to OpenAI: {} ({} bytes)", filename, audio_data.len());
        debug!("Using model: {}, language: {:?}, prompt: {:?}, temperature: {:?}", 
               model, language, prompt, temperature);
        debug!("Audio data header (first 16 bytes): {:02X?}", &audio_data[..audio_data.len().min(16)]);

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenAI transcription request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "OpenAI transcription error ({}): {}",
                status,
                error_text
            )));
        }

        let transcription: OpenAITranscriptionResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse OpenAI transcription response: {}", e)))?;

        info!("Transcription successful: {} characters", transcription.text.len());
        Ok(transcription.text)
    }

    /// Transcribe audio from base64 data URI
    #[instrument(skip(self, data_uri))]
    pub async fn transcribe_from_data_uri(
        &self,
        data_uri: &str,
        filename: &str,
        model: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<String, AppError> {
        // Extract base64 data from data URI
        let b64 = data_uri
            .split(',')
            .nth(1)
            .ok_or_else(|| AppError::Validation("Invalid data URI format".to_string()))?;

        // Decode base64 to bytes
        let audio_data = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| AppError::Validation(format!("Failed to decode base64 audio data: {}", e)))?;

        // Use the main transcription method
        self.transcribe_audio(&audio_data, filename, model, language, prompt, temperature).await
    }

    /// Transcribe audio from raw bytes
    pub async fn transcribe_from_bytes(
        &self,
        audio_data: &[u8],
        filename: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<String, AppError> {
        // Use gpt-4o-mini-transcribe as default (cheaper option)
        self.transcribe_audio(
            audio_data,
            filename,
            "gpt-4o-mini-transcribe",
            language,
            prompt,
            temperature,
        ).await
    }

    /// Validate that the model is a supported transcription model
    pub fn validate_transcription_model(model: &str) -> Result<(), AppError> {
        const SUPPORTED_MODELS: &[&str] = &[
            "gpt-4o-transcribe",
            "gpt-4o-mini-transcribe",
        ];

        if !SUPPORTED_MODELS.contains(&model) {
            return Err(AppError::Validation(format!(
                "Unsupported transcription model: {}. Supported: {}",
                model,
                SUPPORTED_MODELS.join(", ")
            )));
        }

        Ok(())
    }
}