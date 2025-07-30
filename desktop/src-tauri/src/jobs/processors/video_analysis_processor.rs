use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, VideoAnalysisPayload, JobResultData};
use crate::models::{BackgroundJob, TaskType};
use async_trait::async_trait;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use log::{debug, error, info};
use tokio::fs;
use serde_json;

pub struct VideoAnalysisProcessor;

#[async_trait]
impl JobProcessor for VideoAnalysisProcessor {
    fn name(&self) -> &str {
        "VideoAnalysisProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type == TaskType::VideoAnalysis
    }

    async fn process(
        &self,
        job: Job,
        app_handle: AppHandle,
    ) -> AppResult<JobProcessResult> {
        info!("Processing video analysis job: {}", job.id);

        // Extract VideoAnalysisPayload from job.payload
        let payload = match &job.payload {
            JobPayload::VideoAnalysis(payload) => payload,
            _ => return Err(AppError::InternalError("Invalid payload type for video analysis job".to_string())),
        };

        debug!("Video analysis payload: {:?}", payload);

        // Get ServerProxyClient from app state
        let server_proxy_client = app_handle
            .state::<Arc<crate::api_clients::server_proxy_client::ServerProxyClient>>()
            .inner()
            .clone();

        // Read video file as bytes
        let video_data = fs::read(&payload.video_path).await
            .map_err(|e| AppError::FileSystemError(format!("Failed to read video file '{}': {}", payload.video_path, e)))?;

        info!("Read video file: {} bytes", video_data.len());

        // Extract filename from path
        let filename = std::path::Path::new(&payload.video_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("video.mp4");

        // Call server proxy to analyze video
        let analysis_response = server_proxy_client
            .analyze_video(
                video_data,
                filename,
                &payload.prompt,
                &payload.model,
                payload.temperature,
                payload.system_prompt.clone(),
                payload.duration_ms,
                Some(job.id.to_string()),
            )
            .await?;

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
        let cost_response = server_proxy_client
            .estimate_cost(
                &payload.model,
                analysis_response.usage.prompt_tokens as i64,
                analysis_response.usage.completion_tokens as i64,
                None, // cache_write_tokens
                analysis_response.usage.cached_tokens.map(|t| t as i64), // cache_read_tokens
                Some(payload.duration_ms),
            )
            .await?;

        // Extract cost from response
        let actual_cost = cost_response
            .get("estimatedCost")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);

        // Return success with JSON response, token usage, and cost
        Ok(JobProcessResult::success(
            job.id.clone(),
            JobResultData::Json(json_response),
        )
        .with_tokens(
            Some(analysis_response.usage.prompt_tokens as u32),
            Some(analysis_response.usage.completion_tokens as u32),
        )
        .with_actual_cost(actual_cost))
    }
}