use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::BackgroundJob;
use sqlx::Row;
use tauri::Emitter;

impl BackgroundJobRepository {
    pub async fn create_job(&self, job: &BackgroundJob) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO background_jobs (
                id, session_id, task_type, status, prompt, response, error_message,
                tokens_sent, tokens_received, cache_write_tokens, cache_read_tokens,
                model_used, actual_cost, metadata, system_prompt_template,
                created_at, updated_at, start_time, end_time, is_finalized
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            "#)
            .bind(&job.id)
            .bind(&job.session_id)
            .bind(&job.task_type)
            .bind(&job.status)
            .bind(&job.prompt)
            .bind(&job.response)
            .bind(&job.error_message)
            .bind(job.tokens_sent.map(|v| v as i64))
            .bind(job.tokens_received.map(|v| v as i64))
            .bind(job.cache_write_tokens)
            .bind(job.cache_read_tokens)
            .bind(&job.model_used)
            .bind(job.actual_cost)
            .bind(&job.metadata)
            .bind(&job.system_prompt_template)
            .bind(job.created_at)
            .bind(job.updated_at)
            .bind(job.start_time)
            .bind(job.end_time)
            .bind(job.is_finalized)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to insert job: {}", e)))?;

        if let Some(ref app_handle) = self.app_handle {
            if let Ok(Some(created_job)) = self.get_job_by_id(&job.id).await {
                emit_job_created(app_handle, JobCreatedEvent {
                    job: created_job.clone(),
                    session_id: created_job.session_id.clone(),
                });
            }
        }

        Ok(())
    }

    pub async fn update_job(&self, job: &BackgroundJob) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE background_jobs SET
                session_id = $1,
                task_type = $2,
                status = $3,
                updated_at = $4,
                start_time = $5,
                end_time = $6,
                prompt = $7,
                response = $8,
                error_message = $9,
                tokens_sent = $10,
                tokens_received = $11,
                cache_write_tokens = $12,
                cache_read_tokens = $13,
                model_used = $14,
                actual_cost = $15,
                metadata = $16,
                system_prompt_template = $17,
                is_finalized = $18
            WHERE id = $19
            "#,
        )
        .bind(&job.session_id)
        .bind(&job.task_type)
        .bind(&job.status)
        .bind(job.updated_at)
        .bind(job.start_time)
        .bind(job.end_time)
        .bind(&job.prompt)
        .bind(&job.response)
        .bind(&job.error_message)
        .bind(job.tokens_sent.map(|v| v as i64))
        .bind(job.tokens_received.map(|v| v as i64))
        .bind(job.cache_write_tokens)
        .bind(job.cache_read_tokens)
        .bind(&job.model_used)
        .bind(job.actual_cost)
        .bind(&job.metadata)
        .bind(&job.system_prompt_template)
        .bind(job.is_finalized)
        .bind(&job.id)
        .execute(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update job: {}", e)))?;

        if let Some(app_handle) = &self.app_handle {
            emit_job_status_changed(
                app_handle,
                JobStatusChangedEvent {
                    session_id: job.session_id.clone(),
                    job_id: job.id.clone(),
                    status: job.status.clone(),
                    start_time: job.start_time,
                    end_time: job.end_time,
                    sub_status_message: job.error_message.clone(),
                },
            );
        }

        Ok(())
    }

    pub async fn delete_job(&self, id: &str) -> AppResult<()> {
        let session_id = if let Some(ref app_handle) = self.app_handle {
            self.get_job_by_id(id).await.ok().flatten().map(|job| job.session_id)
        } else {
            None
        };

        sqlx::query("DELETE FROM background_jobs WHERE id = $1")
            .bind(id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))?;

        if let Some(ref app_handle) = self.app_handle {
            emit_job_deleted(
                app_handle,
                JobDeletedEvent {
                    job_id: id.to_string(),
                    session_id: session_id.unwrap_or_default(),
                },
            );
        }

        Ok(())
    }
}
