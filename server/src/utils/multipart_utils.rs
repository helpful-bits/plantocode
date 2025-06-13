use actix_multipart::Multipart;
use actix_web::web;
use futures_util::StreamExt;
use crate::error::AppError;

pub struct TranscriptionMultipartData {
    pub audio_data: Vec<u8>,
    pub filename: String,
    pub model: String,
    pub duration_ms: i64,
    pub language: Option<String>,
    pub prompt: Option<String>,
    pub temperature: Option<f32>,
}

pub async fn process_transcription_multipart(mut payload: Multipart) -> Result<TranscriptionMultipartData, AppError> {
    let mut audio_data = Vec::new();
    let mut filename = String::from("audio.webm");
    let mut model = String::new(); // Default to empty, service will use default
    let mut duration_ms: i64 = 0;
    let mut language: Option<String> = None;
    let mut prompt: Option<String> = None;
    let mut temperature: Option<f32> = None;

    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition().ok_or_else(|| {
            AppError::InvalidArgument("Content-Disposition header missing".to_string())
        })?;
        
        let field_name = content_disposition.get_name().ok_or_else(|| {
            AppError::InvalidArgument("Field name missing".to_string())
        })?;

        match field_name {
            "file" => {
                if let Some(fname) = content_disposition.get_filename() {
                    filename = fname.to_string();
                }
                while let Some(chunk) = field.next().await {
                    audio_data.extend_from_slice(&chunk?);
                }
            },
            "model" => {
                let mut model_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    model_data.extend_from_slice(&chunk?);
                }
                model = String::from_utf8(model_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid model name encoding".to_string()))?;
            },
            "duration_ms" => {
                let mut duration_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    duration_data.extend_from_slice(&chunk?);
                }
                duration_ms = String::from_utf8(duration_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid duration_ms encoding".to_string()))?
                    .parse::<i64>()
                    .map_err(|_| AppError::InvalidArgument("Invalid duration_ms value".to_string()))?;
            },
            "language" => {
                let mut language_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    language_data.extend_from_slice(&chunk?);
                }
                let language_str = String::from_utf8(language_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid language encoding".to_string()))?;
                if !language_str.trim().is_empty() {
                    language = Some(language_str.trim().to_string());
                }
            },
            "prompt" => {
                let mut prompt_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    prompt_data.extend_from_slice(&chunk?);
                }
                let prompt_str = String::from_utf8(prompt_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid prompt encoding".to_string()))?;
                if !prompt_str.trim().is_empty() {
                    prompt = Some(prompt_str.trim().to_string());
                }
            },
            "temperature" => {
                let mut temperature_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    temperature_data.extend_from_slice(&chunk?);
                }
                let temperature_str = String::from_utf8(temperature_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid temperature encoding".to_string()))?;
                temperature = Some(temperature_str.trim().parse::<f32>()
                    .map_err(|_| AppError::InvalidArgument("Invalid temperature value".to_string()))?);
            },
            _ => {
                // Skip other fields
            }
        }
    }

    if audio_data.is_empty() {
        return Err(AppError::InvalidArgument("No audio data provided in 'file' field".to_string()));
    }

    if duration_ms <= 0 {
        return Err(AppError::InvalidArgument("Missing or invalid 'duration_ms' field".to_string()));
    }

    Ok(TranscriptionMultipartData {
        audio_data,
        filename,
        model,
        duration_ms,
        language,
        prompt,
        temperature,
    })
}