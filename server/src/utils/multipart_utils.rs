use crate::error::AppError;
use actix_multipart::Multipart;
use actix_web::web;
use futures_util::StreamExt;
use std::io::Write;
use tempfile::NamedTempFile;

pub struct TranscriptionMultipartData {
    pub audio_data: Vec<u8>,
    pub filename: String,
    pub model: String,
    pub duration_ms: i64,
    pub language: Option<String>,
    pub prompt: Option<String>,
    pub temperature: Option<f32>,
    pub mime_type: String,
}

pub async fn process_transcription_multipart(
    mut payload: Multipart,
) -> Result<TranscriptionMultipartData, AppError> {
    let mut audio_data = Vec::new();
    let mut filename = String::from("audio.webm");
    let mut model = String::new(); // Default to empty, service will use default
    let mut duration_ms: i64 = 0;
    let mut language: Option<String> = None;
    let mut prompt: Option<String> = None;
    let mut temperature: Option<f32> = None;
    let mut mime_type = "audio/webm".to_string();

    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition().ok_or_else(|| {
            AppError::InvalidArgument("Content-Disposition header missing".to_string())
        })?;

        let field_name = content_disposition
            .get_name()
            .ok_or_else(|| AppError::InvalidArgument("Field name missing".to_string()))?;

        match field_name {
            "file" => {
                if let Some(fname) = content_disposition.get_filename() {
                    filename = fname.to_string();
                }
                if let Some(content_type) = field.content_type() {
                    mime_type = content_type.to_string();
                }
                while let Some(chunk) = field.next().await {
                    audio_data.extend_from_slice(&chunk?);
                }
            }
            "model" => {
                let mut model_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    model_data.extend_from_slice(&chunk?);
                }
                model = String::from_utf8(model_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid model name encoding".to_string())
                })?;
            }
            "durationMs" => {
                let mut duration_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    duration_data.extend_from_slice(&chunk?);
                }
                let duration_str = String::from_utf8(duration_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid durationMs encoding".to_string())
                })?;
                let trimmed = duration_str.trim();
                duration_ms = trimmed.parse::<i64>().or_else(|_| {
                    trimmed
                        .parse::<f64>()
                        .map(|value| value.round() as i64)
                }).map_err(|e| {
                    AppError::InvalidArgument(format!(
                        "Invalid durationMs value '{}': {}",
                        trimmed,
                        e
                    ))
                })?;
            }
            "language" => {
                let mut language_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    language_data.extend_from_slice(&chunk?);
                }
                let language_str = String::from_utf8(language_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid language encoding".to_string())
                })?;
                if !language_str.trim().is_empty() {
                    language = Some(language_str.trim().to_string());
                }
            }
            "prompt" => {
                let mut prompt_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    prompt_data.extend_from_slice(&chunk?);
                }
                let prompt_str = String::from_utf8(prompt_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid prompt encoding".to_string())
                })?;
                if !prompt_str.trim().is_empty() {
                    prompt = Some(prompt_str.trim().to_string());
                }
            }
            "temperature" => {
                let mut temperature_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    temperature_data.extend_from_slice(&chunk?);
                }
                let temperature_str = String::from_utf8(temperature_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid temperature encoding".to_string())
                })?;
                temperature = Some(temperature_str.trim().parse::<f32>().map_err(|_| {
                    AppError::InvalidArgument("Invalid temperature value".to_string())
                })?);
            }
            _ => {
                // Skip other fields
            }
        }
    }

    if audio_data.is_empty() {
        return Err(AppError::InvalidArgument(
            "No audio data provided in 'file' field".to_string(),
        ));
    }

    if duration_ms <= 0 {
        return Err(AppError::InvalidArgument(
            "Missing or invalid 'durationMs' field".to_string(),
        ));
    }

    Ok(TranscriptionMultipartData {
        audio_data,
        filename,
        model,
        duration_ms,
        language,
        prompt,
        temperature,
        mime_type,
    })
}

pub async fn process_video_analysis_multipart(
    mut payload: Multipart,
) -> Result<
    (
        NamedTempFile,
        String,
        String,
        f32,
        Option<String>,
        i64,
        u32,
        Option<String>,
    ),
    AppError,
> {
    let mut video_file: Option<NamedTempFile> = None;
    let mut prompt = String::new();
    let mut model = String::from("google/gemini-2.5-pro"); // Default model
    let mut temperature: f32 = 0.4; // Default temperature
    let mut system_prompt: Option<String> = None;
    let mut duration_ms: i64 = 0;
    let mut framerate: u32 = 1; // Default framerate (1 FPS)
    let mut request_id: Option<String> = None;

    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition().ok_or_else(|| {
            AppError::InvalidArgument("Content-Disposition header missing".to_string())
        })?;

        let field_name = content_disposition
            .get_name()
            .ok_or_else(|| AppError::InvalidArgument("Field name missing".to_string()))?;

        match field_name {
            "video" => {
                let mut temp_file = NamedTempFile::new().map_err(|e| {
                    AppError::Internal(format!("Failed to create temp file: {}", e))
                })?;

                while let Some(chunk) = field.next().await {
                    let data = chunk?;
                    temp_file.write_all(&data).map_err(|e| {
                        AppError::Internal(format!("Failed to write video data: {}", e))
                    })?;
                }

                temp_file.flush().map_err(|e| {
                    AppError::Internal(format!("Failed to flush video file: {}", e))
                })?;

                video_file = Some(temp_file);
            }
            "prompt" => {
                let mut prompt_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    prompt_data.extend_from_slice(&chunk?);
                }
                prompt = String::from_utf8(prompt_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid prompt encoding".to_string()))?
                    .trim()
                    .to_string();
            }
            "model" => {
                let mut model_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    model_data.extend_from_slice(&chunk?);
                }
                let model_str = String::from_utf8(model_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid model encoding".to_string()))?
                    .trim()
                    .to_string();
                if !model_str.is_empty() {
                    model = model_str;
                }
            }
            "temperature" => {
                let mut temp_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    temp_data.extend_from_slice(&chunk?);
                }
                let temp_str = String::from_utf8(temp_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid temperature encoding".to_string())
                })?;
                temperature = temp_str.trim().parse::<f32>().map_err(|_| {
                    AppError::InvalidArgument("Invalid temperature value".to_string())
                })?;
            }
            "systemPrompt" => {
                let mut system_prompt_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    system_prompt_data.extend_from_slice(&chunk?);
                }
                let system_prompt_str = String::from_utf8(system_prompt_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid systemPrompt encoding".to_string())
                })?;
                if !system_prompt_str.trim().is_empty() {
                    system_prompt = Some(system_prompt_str.trim().to_string());
                }
            }
            "durationMs" => {
                let mut duration_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    duration_data.extend_from_slice(&chunk?);
                }
                let duration_str = String::from_utf8(duration_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid durationMs encoding".to_string())
                })?;
                let trimmed = duration_str.trim();
                duration_ms = trimmed.parse::<i64>().or_else(|_| {
                    trimmed
                        .parse::<f64>()
                        .map(|value| value.round() as i64)
                }).map_err(|_| {
                    AppError::InvalidArgument("Invalid durationMs value".to_string())
                })?;
            }
            "framerate" => {
                let mut framerate_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    framerate_data.extend_from_slice(&chunk?);
                }
                framerate = String::from_utf8(framerate_data)
                    .map_err(|_| {
                        AppError::InvalidArgument("Invalid framerate encoding".to_string())
                    })?
                    .trim()
                    .parse::<u32>()
                    .map_err(|_| {
                        AppError::InvalidArgument("Invalid framerate value".to_string())
                    })?;
            }
            "requestId" => {
                let mut request_id_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    request_id_data.extend_from_slice(&chunk?);
                }
                let request_id_str = String::from_utf8(request_id_data).map_err(|_| {
                    AppError::InvalidArgument("Invalid requestId encoding".to_string())
                })?;
                if !request_id_str.trim().is_empty() {
                    request_id = Some(request_id_str.trim().to_string());
                }
            }
            _ => {
                // Skip other fields
            }
        }
    }

    let video_file = video_file.ok_or_else(|| {
        AppError::InvalidArgument("No video data provided in 'video' field".to_string())
    })?;

    if prompt.is_empty() {
        return Err(AppError::InvalidArgument(
            "Missing 'prompt' field".to_string(),
        ));
    }

    if duration_ms <= 0 {
        return Err(AppError::InvalidArgument(
            "Missing or invalid 'durationMs' field".to_string(),
        ));
    }

    Ok((
        video_file,
        prompt,
        model,
        temperature,
        system_prompt,
        duration_ms,
        framerate,
        request_id,
    ))
}
