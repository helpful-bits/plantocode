use std::sync::Arc;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};
use async_trait::async_trait;
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, SubscriptionLifecyclePayload};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_processor_utils;
use crate::models::TaskType;
use crate::api_clients::billing_client::BillingClient;

/// Processor for subscription lifecycle management
/// Handles subscription changes, cancellations, and other billing operations
pub struct SubscriptionLifecycleProcessor;

impl SubscriptionLifecycleProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for SubscriptionLifecycleProcessor {
    fn name(&self) -> &'static str {
        "SubscriptionLifecycleProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::SubscriptionLifecycle(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing subscription lifecycle job {}", job.id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::SubscriptionLifecycle(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type for subscription lifecycle job".to_string())),
        };
        
        // Setup repositories and mark job as running
        let (repo, _settings_repo, _db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get the billing client from app state
        let billing_client = app_handle
            .state::<Arc<BillingClient>>()
            .inner()
            .clone();
        
        // All subscription management now goes through the billing portal
        let result = match billing_client.create_billing_portal().await {
            Ok(response) => {
                info!("Successfully retrieved billing portal URL for user {}", payload.user_id);
                Ok(format!("Billing portal URL retrieved: {}", response.url))
            },
            Err(e) => {
                error!("Failed to get billing portal URL for user {}: {}", payload.user_id, e);
                Err(e)
            }
        };
        
        // Handle the result
        match result {
            Ok(response_message) => {
                // Create metadata for the successful operation
                let metadata = json!({
                    "job_type": "SUBSCRIPTION_LIFECYCLE",
                    "user_id": payload.user_id,
                    "portal_access": true
                });
                
                // Finalize job success - using empty string for model and system_prompt_id since this isn't an LLM job
                job_processor_utils::finalize_job_success(
                    &job.id,
                    &repo,
                    &response_message,
                    None, // No LLM usage
                    "", // No model used
                    "", // No system prompt used
                    Some(metadata),
                ).await?;
                
                info!("Subscription lifecycle job {} completed successfully", job.id);
                Ok(JobProcessResult::success(job.id.to_string(), response_message))
            },
            Err(e) => {
                let error_message = format!("Subscription lifecycle operation failed: {}", e);
                error!("{}", error_message);
                
                // Finalize job failure
                job_processor_utils::finalize_job_failure(
                    &job.id,
                    &repo,
                    &error_message,
                    Some(&e),
                ).await?;
                
                Ok(JobProcessResult::failure(job.id.to_string(), error_message))
            }
        }
    }
}