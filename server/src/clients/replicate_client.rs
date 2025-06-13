use reqwest::{Client, multipart::{Form, Part}};
use reqwest::header::HeaderMap;
use crate::config::settings::AppSettings;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use futures_util::{Stream, StreamExt};
use std::pin::Pin;
use actix_web::web;
use tracing::{debug, info, warn, error, instrument};
use base64::Engine;

// Replicate API base URL
const REPLICATE_BASE_URL: &str = "https://api.replicate.com/v1";

// Replicate prediction request and response structures
#[derive(Debug, Serialize, Deserialize)]
pub struct ReplicatePredictionRequest {
    pub input: ReplicateTranscriptionInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_events_filter: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplicateTranscriptionInput {
    pub audio_file: String, // URL to the uploaded audio file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplicatePredictionResponse {
    pub id: String,
    pub status: String,
    pub urls: Option<ReplicateUrls>,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub error: Option<String>,
    pub logs: Option<String>,
    pub created_at: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplicateUrls {
    pub get: String,
    pub cancel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplicateFileUploadResponse {
    pub upload_url: String,
    pub serving_url: String,
}

#[derive(Debug, Clone)]
pub struct ReplicateClient {
    client: Client,
    api_token: String,
    base_url: String,
}

impl ReplicateClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, AppError> {
        let api_token = app_settings
            .api_keys
            .replicate_api_token
            .as_ref()
            .ok_or_else(|| AppError::Configuration("REPLICATE_API_TOKEN must be set".to_string()))?
            .clone();

        let client = Client::new();
        let base_url = REPLICATE_BASE_URL.to_string();

        Ok(Self {
            client,
            api_token,
            base_url,
        })
    }

    /// Create data URI from base64 audio data (for files < 1MB)
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub fn create_audio_data_uri(
        &self,
        audio_data: &[u8],
        filename: &str,
    ) -> Result<String, AppError> {
        // Validate file size - data URI is only recommended for files < 1MB
        const MAX_DATA_URI_SIZE: usize = 1024 * 1024; // 1MB
        if audio_data.len() > MAX_DATA_URI_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too large for data URI ({}KB > 1MB). Use file upload instead.",
                audio_data.len() / 1024
            )));
        }

        // Validate audio filename
        Self::validate_audio_filename(filename)?;

        // Encode to base64
        let base64_data = base64::engine::general_purpose::STANDARD.encode(audio_data);
        
        // Create data URI exactly as shown in Replicate documentation
        // Use application/octet-stream as the MIME type for maximum compatibility
        let data_uri = format!("data:application/octet-stream;base64,{}", base64_data);
        
        debug!("Created data URI for audio file: {} ({} bytes)", filename, audio_data.len());
        Ok(data_uri)
    }

    /// Upload audio file to Replicate's file storage (for files >= 1MB)
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn upload_audio_file(
        &self,
        audio_data: &[u8],
        filename: &str,
    ) -> Result<String, AppError> {
        let url = format!("{}/files", self.base_url);

        // Create multipart form with the audio file
        let file_part = Part::bytes(audio_data.to_vec())
            .file_name(filename.to_string())
            .mime_str("audio/webm")
            .map_err(|e| AppError::Validation(format!("Invalid audio mime type: {}", e)))?;

        let form = Form::new()
            .part("content", file_part);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Replicate file upload failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "Replicate file upload error ({}): {}",
                status,
                error_text
            )));
        }

        // Debug: Log the actual response body to understand the format
        let response_text = response.text().await
            .map_err(|e| AppError::External(format!("Failed to get response text: {}", e)))?;
        
        debug!("Replicate upload response body: {}", response_text);
        
        let upload_response: ReplicateFileUploadResponse = serde_json::from_str(&response_text)
            .map_err(|e| AppError::External(format!("Failed to parse Replicate upload response: {} | Response body: {}", e, response_text)))?;

        Ok(upload_response.serving_url)
    }

    /// Create a transcription prediction using data URI as per Replicate documentation
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn create_transcription_prediction_json(
        &self,
        model_id: &str,
        audio_data: &[u8],
        filename: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
        stream: bool,
    ) -> Result<ReplicatePredictionResponse, AppError> {
        let url = format!("{}/models/{}/predictions", self.base_url, model_id);

        // Validate language parameter if provided
        if let Some(lang) = language.as_ref() {
            Self::validate_language_code(lang)?;
        }
        
        // Validate temperature parameter if provided
        if let Some(temp) = temperature {
            Self::validate_temperature(temp)?;
        }
        
        // Create data URI exactly as shown in Replicate documentation
        let audio_url = self.create_audio_data_uri(audio_data, filename)?;
        
        // Create the transcription input with the data URI
        let input = ReplicateTranscriptionInput {
            audio_file: audio_url,
            language: language.map(String::from),
            prompt: prompt.map(String::from),
            temperature,
        };
        
        // Create the prediction request
        let request = ReplicatePredictionRequest {
            input,
            stream: if stream { Some(true) } else { None },
            webhook: None,
            webhook_events_filter: None,
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Replicate prediction request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "Replicate prediction error ({}): {}",
                status,
                error_text
            )));
        }

        let prediction: ReplicatePredictionResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse Replicate prediction response: {}", e)))?;

        Ok(prediction)
    }

    /// Get prediction status and result
    #[instrument(skip(self), fields(prediction_id = %prediction_id))]
    pub async fn get_prediction(
        &self,
        prediction_id: &str,
    ) -> Result<ReplicatePredictionResponse, AppError> {
        let url = format!("{}/predictions/{}", self.base_url, prediction_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .map_err(|e| AppError::External(format!("Replicate get prediction failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "Replicate get prediction error ({}): {}",
                status,
                error_text
            )));
        }

        let prediction: ReplicatePredictionResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse Replicate prediction response: {}", e)))?;

        Ok(prediction)
    }

    /// Stream transcription results using Server-Sent Events
    #[instrument(skip(self), fields(stream_url = %stream_url))]
    pub async fn stream_transcription(
        &self,
        stream_url: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>, AppError> {
        let client = self.client.clone();
        let url = stream_url.to_string();

        let response = client
            .get(&url)
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-store")
            .send()
            .await
            .map_err(|e| AppError::External(format!("Replicate stream request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "Replicate stream error ({}): {}",
                status,
                error_text
            )));
        }

        // Convert the response body stream to our expected type
        let stream = response.bytes_stream()
            .map(|result| {
                match result {
                    Ok(bytes) => Ok(web::Bytes::from(bytes)),
                    Err(e) => Err(AppError::External(format!("Replicate stream error: {}", e))),
                }
            });

        Ok(Box::pin(stream))
    }

    /// Cancel a prediction
    #[instrument(skip(self), fields(prediction_id = %prediction_id))]
    pub async fn cancel_prediction(
        &self,
        prediction_id: &str,
    ) -> Result<ReplicatePredictionResponse, AppError> {
        let url = format!("{}/predictions/{}/cancel", self.base_url, prediction_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .map_err(|e| AppError::External(format!("Replicate cancel prediction failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "Replicate cancel prediction error ({}): {}",
                status,
                error_text
            )));
        }

        let prediction: ReplicatePredictionResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse Replicate cancel response: {}", e)))?;

        Ok(prediction)
    }

    /// Complete transcription workflow using data URI as per Replicate documentation
    /// Uses data URI format: data:application/octet-stream;base64,{audio_data}
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn transcribe(
        &self,
        model_id: &str,
        audio_data: &[u8],
        filename: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<(String, HeaderMap), AppError> {
        // Validate input parameters before processing
        Self::validate_audio_filename(filename)?;
        
        // Create prediction using JSON with data URI as per Replicate docs
        info!("Creating JSON prediction with data URI for: {} ({} bytes)", filename, audio_data.len());
        debug!("Creating transcription prediction with model: {}, language: {:?}, prompt: {:?}, temperature: {:?}", 
               model_id, language, prompt, temperature);
        let prediction = self.create_transcription_prediction_json(
            model_id,
            audio_data, 
            filename,
            language, 
            prompt, 
            temperature, 
            false
        ).await?;
        
        // Wait for prediction completion with timeout
        let completed_prediction = self.wait_for_prediction_completion(&prediction.id, 300).await?; // 5 minutes max
        
        // Extract transcription text
        let transcribed_text = Self::extract_transcription_text(&completed_prediction)?;
        
        info!("Transcription successful for prediction: {}", prediction.id);
        Ok((transcribed_text, HeaderMap::new()))
    }
    
    /// Complete transcription workflow with streaming using data URI as per Replicate documentation
    /// Uses data URI format: data:application/octet-stream;base64,{audio_data}
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn transcribe_streaming(
        &self,
        model_id: &str,
        audio_data: &[u8],
        filename: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<(String, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>), AppError> {
        // Validate input parameters before processing
        Self::validate_audio_filename(filename)?;
        
        // Create prediction using JSON with data URI as per Replicate docs for streaming
        info!("Creating JSON streaming prediction with data URI for: {} ({} bytes)", filename, audio_data.len());
        debug!("Creating streaming transcription prediction with model: {}, language: {:?}, prompt: {:?}, temperature: {:?}", 
               model_id, language, prompt, temperature);
        let prediction = self.create_transcription_prediction_json(
            model_id,
            audio_data, 
            filename,
            language, 
            prompt, 
            temperature, 
            true
        ).await?;
        
        // Get the stream URL from the prediction
        let stream_url = prediction
            .urls
            .as_ref()
            .and_then(|urls| urls.stream.as_ref())
            .ok_or_else(|| AppError::External("No stream URL provided in prediction response".to_string()))?;
        
        info!("Starting transcription stream for prediction: {}", prediction.id);
        let stream = self.stream_transcription(stream_url).await?;
        
        Ok((prediction.id, stream))
    }
    
    /// Validate language code parameter
    fn validate_language_code(language: &str) -> Result<(), AppError> {
        // Common ISO 639-1 language codes supported by OpenAI Whisper
        const SUPPORTED_LANGUAGES: &[&str] = &[
            "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "tr", "pl", "nl", "sv"
        ];
        
        if language.is_empty() {
            return Err(AppError::Validation("Language code cannot be empty".to_string()));
        }
        
        if language.len() > 10 {
            return Err(AppError::Validation("Language code too long".to_string()));
        }
        
        // Allow common language codes (more permissive than strict validation)
        if !language.chars().all(|c| c.is_ascii_lowercase() || c == '-' || c == '_') {
            return Err(AppError::Validation("Invalid language code format".to_string()));
        }
        
        debug!("Language code validated: {}", language);
        Ok(())
    }
    
    /// Validate temperature parameter
    fn validate_temperature(temperature: f32) -> Result<(), AppError> {
        if temperature < 0.0 || temperature > 1.0 {
            return Err(AppError::Validation(
                "Temperature must be between 0.0 and 1.0".to_string()
            ));
        }
        
        debug!("Temperature validated: {}", temperature);
        Ok(())
    }
    
    /// Get MIME type from audio filename extension
    fn get_audio_mime_type(filename: &str) -> Result<&'static str, AppError> {
        let filename_lower = filename.to_lowercase();
        
        if filename_lower.ends_with(".webm") {
            Ok("audio/webm")
        } else if filename_lower.ends_with(".mp3") {
            Ok("audio/mpeg")
        } else if filename_lower.ends_with(".wav") {
            Ok("audio/wav")
        } else if filename_lower.ends_with(".ogg") {
            Ok("audio/ogg")
        } else if filename_lower.ends_with(".m4a") {
            Ok("audio/mp4")
        } else if filename_lower.ends_with(".flac") {
            Ok("audio/flac")
        } else {
            // Default to application/octet-stream as shown in docs
            Ok("application/octet-stream")
        }
    }

    /// Validate audio filename
    fn validate_audio_filename(filename: &str) -> Result<(), AppError> {
        if filename.is_empty() {
            return Err(AppError::Validation("Filename cannot be empty".to_string()));
        }
        
        if filename.len() > 255 {
            return Err(AppError::Validation("Filename too long".to_string()));
        }
        
        // Check for valid audio file extensions
        let valid_extensions = &[".webm", ".mp3", ".wav", ".ogg", ".m4a", ".flac"];
        let has_valid_extension = valid_extensions.iter().any(|ext| {
            filename.to_lowercase().ends_with(ext)
        });
        
        if !has_valid_extension {
            return Err(AppError::Validation(
                format!("Unsupported audio file format. Supported: {}", 
                       valid_extensions.join(", "))
            ));
        }
        
        debug!("Audio filename validated: {}", filename);
        Ok(())
    }
    
    /// Get prediction status with timeout and error handling
    #[instrument(skip(self), fields(prediction_id = %prediction_id))]
    pub async fn wait_for_prediction_completion(
        &self,
        prediction_id: &str,
        timeout_seconds: u64,
    ) -> Result<ReplicatePredictionResponse, AppError> {
        let start_time = std::time::Instant::now();
        let max_duration = std::time::Duration::from_secs(timeout_seconds);
        let mut attempts = 0;
        
        loop {
            if start_time.elapsed() >= max_duration {
                return Err(AppError::External(format!(
                    "Transcription timeout after {} seconds for prediction: {}", 
                    timeout_seconds,
                    prediction_id
                )));
            }
            
            let prediction = self.get_prediction(prediction_id).await?;
            
            match prediction.status.as_str() {
                "succeeded" => {
                    info!("Prediction completed successfully: {}", prediction_id);
                    return Ok(prediction);
                }
                "failed" => {
                    let error_msg = prediction.error
                        .unwrap_or_else(|| "Unknown transcription error".to_string());
                    error!("Prediction failed {}: {}", prediction_id, error_msg);
                    return Err(AppError::External(format!("Transcription failed: {}", error_msg)));
                }
                "canceled" => {
                    warn!("Prediction was canceled: {}", prediction_id);
                    return Err(AppError::External("Transcription was canceled".to_string()));
                }
                _ => {
                    // Still processing, wait and retry with exponential backoff
                    attempts += 1;
                    let wait_time = std::cmp::min(5000, 1000 * attempts); // Max 5 seconds
                    debug!("Prediction still processing (attempt {}), waiting {}ms: {}", 
                           attempts, wait_time, prediction.status);
                    tokio::time::sleep(tokio::time::Duration::from_millis(wait_time)).await;
                }
            }
        }
    }
    
    /// Extract transcription text from prediction output with improved error handling
    pub fn extract_transcription_text(prediction: &ReplicatePredictionResponse) -> Result<String, AppError> {
        let output = prediction.output.as_ref()
            .ok_or_else(|| AppError::External("No transcription output received".to_string()))?;
        
        let transcribed_text = if let Some(array) = output.as_array() {
            let joined_text = array.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<&str>>()
                .join("");
            
            if joined_text.is_empty() {
                return Err(AppError::External("Empty transcription result".to_string()));
            }
            
            debug!("Transcription extracted from array: {} characters", joined_text.len());
            joined_text
        } else if let Some(text) = output.as_str() {
            if text.is_empty() {
                return Err(AppError::External("Empty transcription result".to_string()));
            }
            
            debug!("Transcription extracted from string: {} characters", text.len());
            text.to_string()
        } else {
            error!("Invalid transcription output format: {:?}", output);
            return Err(AppError::External("Invalid transcription output format".to_string()));
        };
        
        Ok(transcribed_text)
    }
}