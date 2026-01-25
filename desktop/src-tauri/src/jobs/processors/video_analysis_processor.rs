use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData, VideoAnalysisPayload};
use crate::models::TaskType;
use crate::utils::ffmpeg_utils::{verify_sidecars_available, probe_duration_ms, split_video_into_chunks, resolve_long_threshold_secs};
use crate::utils::fs_utils::get_app_temp_dir;
use async_trait::async_trait;
use log::{debug, error, info};
use serde::{Serialize, Deserialize};
use serde_json;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::sync::Semaphore;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct ChunkMeta {
    index: usize,
    start_ms: i64,
    end_ms: i64,
    filename: String,
}

pub struct VideoAnalysisProcessor;

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(default)
}

fn env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(default)
}

fn compute_chunk_secs_from_size(
    total_bytes: u64,
    duration_ms: i64,
    target_chunk_bytes: u64,
    min_secs: u32,
    max_secs: u32,
) -> u32 {
    if total_bytes == 0 || duration_ms <= 0 || target_chunk_bytes == 0 {
        return max_secs.max(min_secs);
    }

    let duration_secs = (duration_ms as f64 / 1000.0).max(1.0);
    let bitrate_bps = (total_bytes as f64 * 8.0) / duration_secs;
    if bitrate_bps <= 0.0 {
        return max_secs.max(min_secs);
    }

    let raw_secs = (target_chunk_bytes as f64 * 8.0) / bitrate_bps;
    let secs = raw_secs.floor().max(min_secs as f64) as u32;
    secs.clamp(min_secs, max_secs)
}

async fn reset_chunk_dir(path: &Path) -> AppResult<()> {
    if fs::metadata(path).await.is_ok() {
        fs::remove_dir_all(path)
            .await
            .map_err(|e| AppError::Processing(format!("Failed to clear chunk directory: {}", e)))?;
    }
    fs::create_dir_all(path)
        .await
        .map_err(|e| AppError::Processing(format!("Failed to create chunk directory: {}", e)))?;
    Ok(())
}

#[async_trait]
impl JobProcessor for VideoAnalysisProcessor {
    fn name(&self) -> &str {
        "VideoAnalysisProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type == TaskType::VideoAnalysis
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing video analysis job: {}", job.id);

        // Setup repositories and mark job as running
        let (repo, _session_repo, _settings_repo, db_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Extract VideoAnalysisPayload from job.payload
        let payload = match &job.payload {
            JobPayload::VideoAnalysis(payload) => payload,
            _ => {
                return Err(AppError::InternalError(
                    "Invalid payload type for video analysis job".to_string(),
                ));
            }
        };

        debug!("Video analysis payload: {:?}", payload);

        // Get ServerProxyClient from app state using the proper getter that handles initialization
        let server_proxy_client =
            crate::api_clients::client_factory::get_server_proxy_client(&app_handle)
                .await
                .map_err(|e| format!("Failed to get server proxy client: {}", e))?;

        // Resolve size and duration early (needed for size-aware chunking)
        let file_size_bytes = match fs::metadata(&payload.video_path).await {
            Ok(meta) => meta.len(),
            Err(e) => {
                let error_msg =
                    format!("Failed to read video metadata '{}': {}", payload.video_path, e);
                error!("{}", error_msg);
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Determine actual duration - this is required for server API
        let duration_ms = if payload.duration_ms > 0 {
            payload.duration_ms
        } else {
            // Try to probe duration from the video file
            match probe_duration_ms(&std::path::PathBuf::from(&payload.video_path)).await {
                Ok(d) if d > 0 => d,
                Ok(_) => {
                    let error_msg = "Video duration could not be determined (probed duration is 0). Please ensure the video file is valid.".to_string();
                    error!("{}", error_msg);
                    return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
                }
                Err(e) => {
                    let error_msg = format!(
                        "Failed to determine video duration: {}. Please ensure FFmpeg is available and the video file is valid.",
                        e
                    );
                    error!("{}", error_msg);
                    return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
                }
            }
        };

        let threshold_secs = resolve_long_threshold_secs();
        let max_upload_mb = env_u64("VIDEO_ANALYSIS_MAX_UPLOAD_MB", 90);
        let target_chunk_mb = env_u64("VIDEO_ANALYSIS_TARGET_CHUNK_MB", 85);
        let max_upload_bytes = max_upload_mb.saturating_mul(1024 * 1024);
        let target_chunk_bytes = target_chunk_mb
            .saturating_mul(1024 * 1024)
            .min(max_upload_bytes.saturating_sub(1 * 1024 * 1024));

        let is_over_upload_limit = file_size_bytes > max_upload_bytes;
        let is_long_video = duration_ms > (threshold_secs as i64 * 1000) || is_over_upload_limit;

        if !is_long_video {
            // Read video file as bytes only for short videos
            let video_data = match fs::read(&payload.video_path).await {
                Ok(data) => data,
                Err(e) => {
                    let error_msg =
                        format!("Failed to read video file '{}': {}", payload.video_path, e);
                    error!("{}", error_msg);
                    return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
                }
            };

            info!("Read video file: {} bytes", video_data.len());

            // SHORT VIDEO PATH - existing single-pass analysis
            // Check if job was canceled before making the API call
            if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
                return Ok(JobProcessResult::failure(
                    job.id.clone(),
                    "Job was cancelled".to_string(),
                ));
            }

            // Extract filename from path
            let filename = std::path::Path::new(&payload.video_path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("video.mp4");

            // Clamp framerate to [1, 20]
            let mut server_framerate = payload.framerate.max(1.0).round() as u32;
            if server_framerate > 20 {
                server_framerate = 20;
            }

            // Call server proxy to analyze video
            let analysis_response = match server_proxy_client
                .analyze_video(
                    video_data,
                    filename,
                    &payload.prompt,
                    &payload.model,
                    payload.temperature,
                    payload.system_prompt.clone(),
                    duration_ms,
                    server_framerate,
                    Some(job.id.to_string()),
                )
                .await
            {
                Ok(response) => response,
                Err(e) => {
                    let error_msg = format!("Video analysis failed: {}", e);
                    error!("{}", error_msg);
                    return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
                }
            };

            info!("Video analysis completed successfully");

            // Create JSON response with analysis and usage data
            let json_response = serde_json::json!({
                "analysis": analysis_response.analysis,
                "usage": {
                    "promptTokens": analysis_response.usage.prompt_tokens,
                    "completionTokens": analysis_response.usage.completion_tokens,
                    "totalTokens": analysis_response.usage.total_tokens
                }
            });

            // Calculate cost using server proxy
            let cost_response = match server_proxy_client
                .estimate_cost(
                    &payload.model,
                    analysis_response.usage.prompt_tokens as i64,
                    analysis_response.usage.completion_tokens as i64,
                    None,                                                    // cache_write_tokens
                    analysis_response.usage.cached_tokens.map(|t| t as i64), // cache_read_tokens
                    Some(duration_ms),
                )
                .await
            {
                Ok(response) => response,
                Err(e) => {
                    error!("Failed to calculate cost: {}", e);
                    // Continue with 0 cost if calculation fails
                    serde_json::json!({"estimatedCost": "0.0"})
                }
            };

            // Extract cost from response
            let actual_cost = cost_response
                .get("estimatedCost")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);

            // Return success with JSON response, token usage, and cost
            Ok(
                JobProcessResult::success(job.id.clone(), JobResultData::Json(json_response))
                    .with_tokens(
                        Some(analysis_response.usage.prompt_tokens as u32),
                        Some(analysis_response.usage.completion_tokens as u32),
                    )
                    .with_actual_cost(actual_cost),
            )
        } else {
            // LONG VIDEO PATH - chunked processing
            info!("Processing long video ({}ms) with chunking for job {}", duration_ms, job.id);

            // Verify FFmpeg sidecars
            verify_sidecars_available().await.map_err(|e| {
                AppError::Processing(format!("FFmpeg/ffprobe not available: {}", e))
            })?;

            // Create temp directory for chunks
            let app_temp = get_app_temp_dir().await?;
            let chunk_dir = app_temp.join(format!("video_chunks_{}", job.id));

            // Ensure cleanup happens on success or failure
            let _cleanup_guard = CleanupGuard::new(chunk_dir.clone());

            // Determine framerate for splitting
            let split_fps = if payload.framerate < 1.0 {
                Some(payload.framerate)
            } else {
                None
            };

            let min_chunk_secs = env_u32("VIDEO_ANALYSIS_MIN_CHUNK_SECS", 15);
            let max_chunk_secs = env_u32("VIDEO_ANALYSIS_MAX_CHUNK_SECS", 120);
            let mut chunk_secs = compute_chunk_secs_from_size(
                file_size_bytes,
                duration_ms,
                target_chunk_bytes,
                min_chunk_secs,
                max_chunk_secs,
            );

            let input_path = std::path::PathBuf::from(&payload.video_path);
            let max_attempts = env_u32("VIDEO_ANALYSIS_CHUNK_SPLIT_ATTEMPTS", 3);
            let mut chunks = Vec::new();

            for attempt in 0..max_attempts {
                reset_chunk_dir(&chunk_dir).await?;

                chunks = split_video_into_chunks(&input_path, &chunk_dir, chunk_secs, split_fps)
                    .await
                    .map_err(|e| AppError::Processing(format!("Failed to split video: {}", e)))?;

                let mut max_chunk_size = 0u64;
                for (_, chunk_path, _, _) in chunks.iter() {
                    let chunk_size = fs::metadata(chunk_path)
                        .await
                        .map_err(|e| AppError::Processing(format!(
                            "Failed to read chunk metadata {:?}: {}",
                            chunk_path, e
                        )))?
                        .len();
                    if chunk_size > max_chunk_size {
                        max_chunk_size = chunk_size;
                    }
                }

                if max_chunk_size <= max_upload_bytes {
                    break;
                }

                if attempt + 1 >= max_attempts {
                    return Err(AppError::Processing(format!(
                        "Chunk size {} bytes exceeds upload limit {} bytes after {} attempts. \
Consider lowering recording quality or enabling an unproxied upload endpoint.",
                        max_chunk_size, max_upload_bytes, max_attempts
                    )));
                }

                let ratio = if max_chunk_size > 0 {
                    (target_chunk_bytes as f64 / max_chunk_size as f64) * 0.9
                } else {
                    0.5
                };
                let adjusted = ((chunk_secs as f64) * ratio).floor() as u32;
                let next_chunk_secs = adjusted
                    .clamp(min_chunk_secs, max_chunk_secs)
                    .min(chunk_secs.saturating_sub(1).max(min_chunk_secs));

                if next_chunk_secs == chunk_secs {
                    return Err(AppError::Processing(format!(
                        "Unable to reduce chunk size below upload limit with current settings. \
Consider lowering recording quality or enabling an unproxied upload endpoint."
                    )));
                }

                chunk_secs = next_chunk_secs;
            }

            info!("Split video into {} chunks for job {}", chunks.len(), job.id);

            // Determine concurrency limit based on FPS
            let fps = payload.framerate;
            let default_concurrency = if fps >= 15.0 { 2 } else { 3 };
            let max_concurrent = std::env::var("VIDEO_ANALYSIS_CHUNK_CONCURRENCY")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(default_concurrency);
            let semaphore = Arc::new(Semaphore::new(max_concurrent));

            // Collect chunk metadata
            let mut chunk_metadata = Vec::new();

            // Process chunks in parallel
            let mut tasks = Vec::new();
            for (index, chunk_path, start_ms, end_ms) in chunks {
                // Store chunk metadata
                let chunk_filename = chunk_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("chunk.mp4")
                    .to_string();

                chunk_metadata.push(ChunkMeta {
                    index,
                    start_ms,
                    end_ms,
                    filename: chunk_filename,
                });
                let sem = semaphore.clone();
                let chunk_path = chunk_path.clone();
                let server_client = server_proxy_client.clone();
                let payload_clone = payload.clone();
                let job_id_clone = job.id.clone();

                let task = tokio::spawn(async move {
                    let _permit = sem.acquire().await.unwrap();

                    info!("Processing chunk {} for job {}", index, job_id_clone);

                    // Read chunk file
                    let chunk_bytes = tokio::fs::read(&chunk_path).await
                        .map_err(|e| AppError::Processing(format!("Failed to read chunk {}: {}", index, e)))?;

                    let chunk_duration_ms = end_ms - start_ms;

                    // Clamp framerate to [1, 20]
                    let mut server_framerate = payload_clone.framerate.max(1.0).round() as u32;
                    if server_framerate > 20 {
                        server_framerate = 20;
                    }

                    // Extract filename for chunk
                    let chunk_filename = chunk_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("chunk.mp4");

                    // Call analyze_video
                    let result = server_client.analyze_video(
                        chunk_bytes,
                        chunk_filename,
                        &payload_clone.prompt,
                        &payload_clone.model,
                        payload_clone.temperature,
                        payload_clone.system_prompt.clone(),
                        chunk_duration_ms,
                        server_framerate,
                        Some(format!("{}_{}", job_id_clone, index)),
                    ).await.map_err(|e| {
                        AppError::Processing(format!("Chunk {} analysis failed: {}", index, e))
                    })?;

                    Ok::<_, AppError>((index, result.analysis, result.usage))
                });

                tasks.push(task);
            }

            // Wait for all tasks and check for errors
            let mut results = Vec::new();
            let mut first_error = None;

            for (i, task) in tasks.into_iter().enumerate() {
                match task.await {
                    Ok(Ok(result)) => results.push(result),
                    Ok(Err(e)) => {
                        log::error!("Chunk {} failed: {}", i, e);
                        if first_error.is_none() {
                            first_error = Some(e);
                        }
                    }
                    Err(e) => {
                        log::error!("Chunk {} task panicked: {}", i, e);
                        if first_error.is_none() {
                            first_error = Some(AppError::Processing(format!("Chunk {} task failed", i)));
                        }
                    }
                }
            }

            // If any chunk failed, fail the entire job
            if let Some(error) = first_error {
                return Err(error);
            }

            // Sort results by index (defensive, should already be ordered)
            results.sort_by_key(|(index, _, _)| *index);

            // Concatenate analysis texts in order
            let combined_analysis = results.iter()
                .map(|(_, text, _)| text.as_str())
                .collect::<Vec<_>>()
                .join("\n\n");

            // Aggregate usage tokens
            let total_prompt_tokens = results.iter().map(|(_, _, u)| u.prompt_tokens as u32).sum::<u32>();
            let total_completion_tokens = results.iter().map(|(_, _, u)| u.completion_tokens as u32).sum::<u32>();
            let total_cache_read = results.iter()
                .filter_map(|(_, _, u)| u.cached_tokens.map(|t| t as i64))
                .sum::<i64>();

            // Estimate total cost with single call
            let cost_response = server_proxy_client.estimate_cost(
                &payload.model,
                total_prompt_tokens as i64,
                total_completion_tokens as i64,
                None, // cache_write_tokens
                if total_cache_read > 0 { Some(total_cache_read) } else { None },
                Some(duration_ms),
            ).await.unwrap_or_else(|e| {
                log::error!("Failed to calculate cost: {}", e);
                serde_json::json!({"estimatedCost": "0.0"})
            });

            let total_cost = cost_response
                .get("estimatedCost")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);

            // Complete job with aggregated data
            let mut result_json = serde_json::json!({
                "analysis": combined_analysis,
                "usage": {
                    "promptTokens": total_prompt_tokens,
                    "completionTokens": total_completion_tokens,
                    "totalTokens": total_prompt_tokens + total_completion_tokens,
                }
            });

            // Add chunk metadata if available
            if !chunk_metadata.is_empty() {
                result_json["chunks"] = serde_json::to_value(&chunk_metadata)
                    .unwrap_or(serde_json::json!([]));
            }

            info!("Long video analysis completed successfully for job {}", job.id);

            // Return with tokens and cost
            Ok(JobProcessResult::success(job.id.clone(), JobResultData::Json(result_json))
                .with_tokens(Some(total_prompt_tokens), Some(total_completion_tokens))
                .with_actual_cost(total_cost))
        }
    }
}

struct CleanupGuard {
    path: std::path::PathBuf,
}

impl CleanupGuard {
    fn new(path: std::path::PathBuf) -> Self {
        Self { path }
    }
}

impl Drop for CleanupGuard {
    fn drop(&mut self) {
        if self.path.exists() {
            if let Err(e) = std::fs::remove_dir_all(&self.path) {
                log::warn!("Failed to cleanup chunk directory {:?}: {}", self.path, e);
            } else {
                log::info!("Cleaned up chunk directory {:?}", self.path);
            }
        }
    }
}
