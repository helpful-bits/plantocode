use crate::error::AppError;
use base64::Engine;
use reqwest::{Client, multipart::{Form, Part}};
use tracing::{debug, info, instrument};

use super::structs::OpenAITranscriptionResponse;

/// Transcribe audio using OpenAI's direct API with GPT-4o-transcribe
#[instrument(skip(client, api_key, audio_data), fields(filename = %filename))]
pub async fn transcribe_audio(
    client: &Client,
    api_key: &str,
    base_url: &str,
    audio_data: &[u8],
    filename: &str,
    model: &str,
    language: Option<&str>,
    prompt: Option<&str>,
    temperature: Option<f32>,
    mime_type: &str,
) -> Result<String, AppError> {
    let url = format!("{}/audio/transcriptions", base_url);

    // Validate transcription model is supported
    validate_transcription_model(model)?;

    // Validate audio data
    if audio_data.is_empty() {
        return Err(AppError::Validation(
            "Audio data cannot be empty".to_string(),
        ));
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
        if audio_data[0] != 0x1A
            || audio_data[1] != 0x45
            || audio_data[2] != 0xDF
            || audio_data[3] != 0xA3
        {
            debug!(
                "WebM header validation failed for {}: {:02X} {:02X} {:02X} {:02X}",
                filename, audio_data[0], audio_data[1], audio_data[2], audio_data[3]
            );
            return Err(AppError::Validation(
                "Invalid WebM file format - missing EBML header".to_string(),
            ));
        }
    }

    // Create multipart form with proper filename - this is critical!
    // Ensure filename has correct extension
    let filename_with_ext = if !filename.contains('.') {
        // Add extension based on mime type if missing
        match mime_type {
            "audio/webm" => format!("{}.webm", filename),
            "audio/mpeg" => format!("{}.mp3", filename),
            "audio/wav" => format!("{}.wav", filename),
            _ => filename.to_string(),
        }
    } else {
        filename.to_string()
    };

    let file_part = Part::bytes(audio_data.to_vec())
        .file_name(filename_with_ext.clone()) // Critical: GPT-4o needs the correct extension
        .mime_str(mime_type) // Keep MIME simple, no codec parameters
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

    info!(
        "Sending transcription request to OpenAI: {} ({} bytes)",
        filename_with_ext,
        audio_data.len()
    );
    debug!(
        "Using model: {}, language: {:?}, prompt: {:?}, temperature: {:?}, mime_type: {}",
        model, language, prompt, temperature, mime_type
    );
    debug!(
        "Audio data header (first 16 bytes): {:02X?}",
        &audio_data[..audio_data.len().min(16)]
    );
    debug!(
        "Multipart form will be sent with filename: {} and mime_type: {}",
        filename_with_ext, mime_type
    );

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| {
            AppError::External(format!("OpenAI transcription request failed: {}", e))
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::External(format!(
            "OpenAI transcription error ({}): {}",
            status, error_text
        )));
    }

    let transcription: OpenAITranscriptionResponse = response.json().await.map_err(|e| {
        AppError::External(format!(
            "Failed to parse OpenAI transcription response: {}",
            e
        ))
    })?;

    info!(
        "Transcription successful: {} characters",
        transcription.text.len()
    );
    Ok(transcription.text)
}

/// Transcribe audio from base64 data URI
#[instrument(skip(client, api_key, data_uri))]
pub async fn transcribe_from_data_uri(
    client: &Client,
    api_key: &str,
    base_url: &str,
    data_uri: &str,
    filename: &str,
    model: &str,
    language: Option<&str>,
    prompt: Option<&str>,
    temperature: Option<f32>,
    mime_type: &str,
) -> Result<String, AppError> {
    // Extract base64 data from data URI
    let b64 = data_uri
        .split(',')
        .nth(1)
        .ok_or_else(|| AppError::Validation("Invalid data URI format".to_string()))?;

    // Decode base64 to bytes
    let audio_data = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| {
            AppError::Validation(format!("Failed to decode base64 audio data: {}", e))
        })?;

    // Use the main transcription method
    transcribe_audio(
        client,
        api_key,
        base_url,
        &audio_data,
        filename,
        model,
        language,
        prompt,
        temperature,
        mime_type,
    )
    .await
}

/// Transcribe audio from raw bytes
pub async fn transcribe_from_bytes(
    client: &Client,
    api_key: &str,
    base_url: &str,
    audio_data: &[u8],
    filename: &str,
    language: Option<&str>,
    prompt: Option<&str>,
    temperature: Option<f32>,
    mime_type: &str,
) -> Result<String, AppError> {
    // Use gpt-4o-mini-transcribe as default (cheaper option)
    transcribe_audio(
        client,
        api_key,
        base_url,
        audio_data,
        filename,
        "gpt-4o-mini-transcribe",
        language,
        prompt,
        temperature,
        mime_type,
    )
    .await
}

/// Validate that the model is a supported transcription model
pub fn validate_transcription_model(model: &str) -> Result<(), AppError> {
    const SUPPORTED_MODELS: &[&str] = &["gpt-4o-transcribe", "gpt-4o-mini-transcribe"];

    if !SUPPORTED_MODELS.contains(&model) {
        return Err(AppError::Validation(format!(
            "Unsupported transcription model: {}. Supported: {}",
            model,
            SUPPORTED_MODELS.join(", ")
        )));
    }

    Ok(())
}