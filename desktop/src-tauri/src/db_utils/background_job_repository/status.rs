use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::JobStatus;
use crate::utils::get_timestamp;
use log::info;
use tauri::Emitter;

impl BackgroundJobRepository {
    /// Update job status
    pub async fn update_job_status(
        &self,
        job_id: &str,
        status: &JobStatus,
        message: Option<&str>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        let result = if let Some(msg) = message {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2, error_message = $3 WHERE id = $4")
                .bind(status.to_string())
                .bind(now)
                .bind(msg)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        } else {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2 WHERE id = $3")
                .bind(status.to_string())
                .bind(now)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        };

        result
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job status: {}", e)))?;

        // Emit job:status-changed event
        if let Some(app_handle) = &self.app_handle {
            emit_job_status_changed(
                app_handle,
                JobStatusChangedEvent {
                    job_id: job_id.to_string(),
                    status: status.to_string(),
                    start_time: None,
                    end_time: None,
                    sub_status_message: message.map(|m| m.to_string()),
                },
            );
        }

        Ok(())
    }

    /// Update job status with metadata
    /// This is useful for adding retry information and other processing metadata
    pub async fn update_job_status_with_metadata(
        &self,
        job_id: &str,
        status: &JobStatus,
        message: Option<&str>,
        metadata_json: String,
    ) -> AppResult<()> {
        let now = get_timestamp();

        let result = sqlx::query(
            "UPDATE background_jobs SET status = $1, updated_at = $2, metadata = $3 WHERE id = $4",
        )
        .bind(status.to_string())
        .bind(now)
        .bind(metadata_json)
        .bind(job_id)
        .execute(&*self.pool)
        .await;

        result.map_err(|e| {
            AppError::DatabaseError(format!("Failed to update job status with metadata: {}", e))
        })?;

        // Emit job:status-changed event
        if let Some(app_handle) = &self.app_handle {
            emit_job_status_changed(
                app_handle,
                JobStatusChangedEvent {
                    job_id: job_id.to_string(),
                    status: status.to_string(),
                    start_time: None,
                    end_time: None,
                    sub_status_message: message.map(|m| m.to_string()),
                },
            );
        }

        Ok(())
    }

    /// Mark a job as running
    pub async fn mark_job_running(&self, job_id: &str) -> AppResult<()> {
        let now = get_timestamp();

        sqlx::query(
            "UPDATE background_jobs SET status = $1, updated_at = $2, start_time = $3, error_message = NULL WHERE id = $4"
        )
        .bind(JobStatus::Running.to_string())
        .bind(now)
        .bind(now)
        .bind(job_id)
        .execute(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to mark job as running: {}", e)))?;

        // Emit job:status-changed event
        if let Some(app_handle) = &self.app_handle {
            emit_job_status_changed(
                app_handle,
                JobStatusChangedEvent {
                    job_id: job_id.to_string(),
                    status: JobStatus::Running.to_string(),
                    start_time: Some(now),
                    end_time: None,
                    sub_status_message: None,
                },
            );
        }

        Ok(())
    }
}
