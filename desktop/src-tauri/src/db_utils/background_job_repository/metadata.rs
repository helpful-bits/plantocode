use super::base::BackgroundJobRepository;
use super::helpers::deep_merge_json;
use crate::error::{AppError, AppResult};
use crate::utils::get_timestamp;
use log::debug;
use serde_json::{Value, json};
use sqlx::Row;

impl BackgroundJobRepository {
    /// This method allows storing the system prompt template early in the job processing,
    /// before the LLM request is made, ensuring it's available even if the job fails
    pub async fn update_system_prompt_template(
        &self,
        job_id: &str,
        system_prompt_template: &str,
    ) -> AppResult<()> {
        let now = get_timestamp();

        debug!("Updating system prompt template for job {}", job_id);

        let result = sqlx::query(
            r#"
            UPDATE background_jobs
            SET system_prompt_template = $1, updated_at = $2
            WHERE id = $3
            "#,
        )
        .bind(system_prompt_template)
        .bind(now)
        .bind(job_id)
        .execute(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to update system prompt template for job {}: {}",
                job_id, e
            ))
        })?;

        if result.rows_affected() > 0 {
            debug!(
                "Successfully updated system prompt template for job {}",
                job_id
            );

            // System prompt template updates don't need specific events - they are internal metadata updates
        }

        Ok(())
    }

    /// Update the model used for a job
    pub async fn update_model_used(&self, job_id: &str, model: &str) -> AppResult<()> {
        sqlx::query("UPDATE background_jobs SET model_used = $1 WHERE id = $2")
            .bind(model)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to update job model_used: {}", e))
            })?;

        Ok(())
    }

    /// Update job prompt field with the actual executed prompts
    pub async fn update_job_prompt(&self, job_id: &str, prompt: &str) -> AppResult<()> {
        let now = get_timestamp();
        sqlx::query("UPDATE background_jobs SET prompt = $1, updated_at = $2 WHERE id = $3")
            .bind(prompt)
            .bind(now)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job prompt: {}", e)))?;
        Ok(())
    }

    /// Update job metadata atomically with deep merge
    /// Opens a transaction, SELECTs existing metadata, deep-merges patch into it, UPDATEs and commits
    pub async fn update_job_metadata(
        &self,
        job_id: &str,
        patch: &serde_json::Value,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Start a transaction for atomic update
        let mut tx =
            self.pool.begin().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
            })?;

        // Fetch existing metadata within transaction
        let row = sqlx::query("SELECT metadata FROM background_jobs WHERE id = $1")
            .bind(job_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch job metadata: {}", e)))?;

        if row.is_none() {
            tx.rollback().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to rollback transaction: {}", e))
            })?;
            return Err(AppError::NotFoundError(format!("Job {} not found", job_id)));
        }

        // Parse existing metadata or create new object
        let metadata_opt: Option<String> = row.unwrap().get(0);
        let mut metadata_json = if let Some(metadata_str) = metadata_opt {
            serde_json::from_str::<Value>(&metadata_str).unwrap_or_else(|_| json!({}))
        } else {
            json!({})
        };

        // Deep merge patch into existing metadata
        if let (Some(metadata_obj), Some(patch_obj)) =
            (metadata_json.as_object_mut(), patch.as_object())
        {
            for (key, value) in patch_obj {
                deep_merge_json(metadata_obj, key, value.clone());
            }
        }

        // Serialize updated metadata
        let updated_metadata = serde_json::to_string(&metadata_json).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize metadata: {}", e))
        })?;

        // Update the row
        sqlx::query("UPDATE background_jobs SET metadata = $1, updated_at = $2 WHERE id = $3")
            .bind(&updated_metadata)
            .bind(now)
            .bind(job_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to update job metadata: {}", e))
            })?;

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

        // Metadata updates are internal - no specific events needed

        debug!("Successfully updated metadata for job {}", job_id);
        Ok(())
    }
}
