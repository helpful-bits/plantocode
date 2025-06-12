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
    
    /// Execute subscription change action by getting portal URL
    async fn execute_change_plan(
        &self,
        billing_client: &BillingClient,
        user_id: &str,
        new_plan_id: &str,
        _effective_immediately: bool,
    ) -> AppResult<String> {
        debug!("Getting billing portal URL for subscription change for user {} to plan {}", user_id, new_plan_id);
        
        match billing_client.create_billing_portal().await {
            Ok(response) => {
                info!("Successfully retrieved billing portal URL for subscription change for user {}", user_id);
                Ok(format!("Billing portal URL retrieved for subscription change: {}", response.url))
            },
            Err(e) => {
                error!("Failed to get billing portal URL for subscription change for user {}: {}", user_id, e);
                Err(e)
            }
        }
    }
    
    /// Execute subscription cancellation action by getting portal URL
    async fn execute_cancel_subscription(
        &self,
        billing_client: &BillingClient,
        user_id: &str,
        _effective_immediately: bool,
    ) -> AppResult<String> {
        debug!("Getting billing portal URL for subscription cancellation for user {}", user_id);
        
        match billing_client.create_billing_portal().await {
            Ok(response) => {
                info!("Successfully retrieved billing portal URL for subscription cancellation for user {}", user_id);
                Ok(format!("Billing portal URL retrieved for subscription cancellation: {}", response.url))
            },
            Err(e) => {
                error!("Failed to get billing portal URL for subscription cancellation for user {}: {}", user_id, e);
                Err(e)
            }
        }
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
        
        // Execute the appropriate action based on the payload
        let result = match payload.action.as_str() {
            "change_plan" => {
                let new_plan_id = payload.new_plan_id.as_ref()
                    .ok_or_else(|| AppError::JobError("new_plan_id is required for change_plan action".to_string()))?;
                let effective_immediately = payload.effective_immediately.unwrap_or(false);
                
                self.execute_change_plan(&billing_client, &payload.user_id, new_plan_id, effective_immediately).await
            },
            "cancel" => {
                let effective_immediately = payload.effective_immediately.unwrap_or(false);
                
                self.execute_cancel_subscription(&billing_client, &payload.user_id, effective_immediately).await
            },
            _ => {
                let error_msg = format!("Unsupported subscription action: {}", payload.action);
                error!("{}", error_msg);
                Err(AppError::JobError(error_msg))
            }
        };
        
        // Handle the result
        match result {
            Ok(response_message) => {
                // Create metadata for the successful operation
                let metadata = json!({
                    "job_type": "SUBSCRIPTION_LIFECYCLE",
                    "action": payload.action,
                    "user_id": payload.user_id,
                    "new_plan_id": payload.new_plan_id,
                    "effective_immediately": payload.effective_immediately,
                    "context": payload.context
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