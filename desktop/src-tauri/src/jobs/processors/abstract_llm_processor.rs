use std::sync::Arc;
use tauri::AppHandle;
use log::{debug, info, warn};
use serde_json::Value;
use chrono;
use tokio::fs;
use uuid;

use crate::error::{AppError, AppResult};
use crate::models::OpenRouterUsage;
use crate::db_utils::BackgroundJobRepository;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{llm_api_utils, prompt_utils};
use crate::jobs::types::Job;
use crate::utils::unified_prompt_system::ComposedPrompt;

/// Configuration for an LLM task execution
#[derive(Debug, Clone)]
pub struct LlmTaskConfig {
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub stream: bool,
}

impl Default for LlmTaskConfig {
    fn default() -> Self {
        Self {
            model: "gpt-3.5-turbo".to_string(),
            temperature: 0.7,
            max_tokens: 4000,
            stream: false,
        }
    }
}

/// Result of an LLM task execution
#[derive(Debug, Clone)]
pub struct LlmTaskResult {
    pub response: String,
    pub usage: Option<OpenRouterUsage>,
    pub system_prompt_id: String,
    pub system_prompt_template: String,
}

/// Context for building unified prompts
#[derive(Debug, Clone)]
pub struct LlmPromptContext {
    pub task_description: String,
    pub file_contents: Option<std::collections::HashMap<String, String>>,
    pub directory_tree: Option<String>,
}

/// Abstract LLM task runner that provides common functionality for all LLM-based processors
#[derive(Clone)]
pub struct LlmTaskRunner {
    app_handle: AppHandle,
    job: Job,
    config: LlmTaskConfig,
}

impl LlmTaskRunner {
    pub fn new(app_handle: AppHandle, job: Job, config: LlmTaskConfig) -> Self {
        Self {
            app_handle,
            job,
            config,
        }
    }

    pub fn get_config(&self) -> &LlmTaskConfig {
        &self.config
    }

    /// Execute a non-streaming LLM task with unified prompt building
    pub async fn execute_llm_task(
        &self,
        context: LlmPromptContext,
        settings_repo: &crate::db_utils::SettingsRepository,
    ) -> AppResult<LlmTaskResult> {
        debug!("Executing LLM task for job {}", self.job.id);

        // Build unified prompt
        let composed_prompt = self.build_prompt(context).await?;
        
        // Extract system and user prompts using direct field access
        let system_prompt = composed_prompt.system_prompt.clone();
        let user_prompt = composed_prompt.user_prompt.clone();
        let system_prompt_id = composed_prompt.system_prompt_id.clone();
        let system_prompt_template = composed_prompt.system_prompt_template.clone();
        
        // Log the actual system prompt being sent to the LLM
        info!("System prompt (ID: {}) being sent to LLM", system_prompt_id);
        
        // Log full prompt to file for debugging
        self.log_prompt_to_file(&system_prompt, &user_prompt, "non_streaming").await;
        
        // Create messages
        let messages = llm_api_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options
        let api_options = llm_api_utils::create_api_client_options(
            self.config.model.clone(),
            self.config.temperature,
            self.config.max_tokens,
            self.config.stream,
        )?;
        
        info!("Making LLM API call with model: {}", self.config.model);
        
        // Execute the LLM call
        let response = llm_api_utils::execute_llm_chat_completion(
            &self.app_handle,
            messages,
            api_options,
        ).await?;
        
        // Log server-authoritative usage data for billing audit trail
        debug!("Server-authoritative usage data from non-streaming LLM response: {:?}", response.usage);
        
        let response_text = response.choices
            .first()
            .map(|choice| choice.message.content.clone())
            .unwrap_or_default();
        
        // Server provides authoritative cost and token counts - no client-side calculation needed
        debug!("Non-streaming LLM response usage (server-calculated): {:?}", response.usage);
        
        // Log complete interaction (prompt + response) to file for debugging
        self.log_complete_interaction(&system_prompt, &user_prompt, &response_text, &response.usage, "non_streaming").await;
        
        Ok(LlmTaskResult {
            response: response_text,
            usage: response.usage, // Server-authoritative usage data including cost
            system_prompt_id,
            system_prompt_template,
        })
    }

    /// Execute a streaming LLM task with unified prompt building
    pub async fn execute_streaming_llm_task(
        &self,
        context: LlmPromptContext,
        settings_repo: &crate::db_utils::SettingsRepository,
        repo: &Arc<BackgroundJobRepository>,
        job_id: &str,
    ) -> AppResult<LlmTaskResult> {
        debug!("Executing streaming LLM task for job {}", self.job.id);

        // Fetch the current job's metadata before starting the stream
        let initial_db_job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found for streaming metadata", job_id)))?;

        // Build unified prompt
        let composed_prompt = self.build_prompt(context).await?;
        
        // Extract system and user prompts using direct field access
        let system_prompt = composed_prompt.system_prompt.clone();
        let user_prompt = composed_prompt.user_prompt.clone();
        let system_prompt_id = composed_prompt.system_prompt_id.clone();
        let system_prompt_template = composed_prompt.system_prompt_template.clone();
        
        // Generate unique request ID for tracking final costs
        let request_id = uuid::Uuid::new_v4().to_string();
        info!("Generated request ID for streaming job {}: {}", self.job.id, request_id);
        
        // Create API options with streaming enabled and request ID
        let mut api_options = llm_api_utils::create_api_client_options(
            self.config.model.clone(),
            self.config.temperature,
            self.config.max_tokens,
            true, // Force streaming
        )?;
        api_options.request_id = Some(request_id.clone());
        
        // Log full prompt to file for debugging
        self.log_prompt_to_file(&system_prompt, &user_prompt, "streaming").await;
        
        info!("Making streaming LLM API call with model: {}", self.config.model);
        
        // Get API client
        let llm_client = llm_api_utils::get_api_client(&self.app_handle)?;
        
        // Create messages for structured streaming (preferred approach)
        let messages = llm_api_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create streaming handler configuration
        let stream_config = crate::jobs::streaming_handler::create_stream_config(&system_prompt, &user_prompt);
        
        // Create streaming handler
        let streaming_handler = crate::jobs::streaming_handler::StreamedResponseHandler::new(
            repo.clone(),
            job_id.to_string(),
            initial_db_job.metadata.clone(),
            stream_config,
            Some(self.app_handle.clone()),
        );
        
        // Process the stream using structured messages (preferred for LLM provider compliance)
        let stream_result = streaming_handler
            .process_stream_from_client_with_messages(&llm_client, messages, api_options)
            .await?;
        
        // Log server-authoritative usage data for billing audit trail
        debug!("Server-authoritative usage data from streaming LLM response: {:?}", stream_result.final_usage);
        
        // Poll for final cost if no cost was received in the stream
        let final_usage = if let Some(usage) = &stream_result.final_usage {
            if usage.cost.is_some() {
                // Cost already received in stream, use it
                stream_result.final_usage.clone()
            } else {
                // No cost in stream, poll for final cost from server
                self.poll_and_update_final_cost(&request_id, usage.clone(), repo.clone(), job_id).await
                    .unwrap_or_else(|e| {
                        warn!("Failed to poll for final cost for job {}: {}", job_id, e);
                        stream_result.final_usage.clone()
                    })
            }
        } else {
            // No usage data at all, try to poll for final cost
            if let Ok(Some(final_cost)) = self.poll_for_final_cost_only(&request_id).await {
                info!("Retrieved final cost via polling for job {}: ${:.4}", job_id, final_cost);
                // Create minimal usage data with the final cost
                Some(OpenRouterUsage {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    cost: Some(final_cost),
                    cached_input_tokens: None,
                    cache_write_tokens: None,
                    cache_read_tokens: None,
                })
            } else {
                stream_result.final_usage.clone()
            }
        };
        
        // Log complete interaction (prompt + response) to file for debugging
        self.log_complete_interaction(&system_prompt, &user_prompt, &stream_result.accumulated_response, &final_usage, "streaming").await;
        
        Ok(LlmTaskResult {
            response: stream_result.accumulated_response,
            usage: final_usage, // Server-authoritative usage data including cost
            system_prompt_id,
            system_prompt_template,
        })
    }

    /// Helper method to build unified prompt from context
    /// Gracefully handles None or empty values in LlmPromptContext
    async fn build_prompt(
        &self,
        context: LlmPromptContext,
    ) -> AppResult<ComposedPrompt> {
        // Validate that we have at least task_description for meaningful prompt generation
        if context.task_description.trim().is_empty() {
            warn!("LlmTaskRunner (job {}): Task description is empty, prompt quality may be poor", self.job.id);
        }

        // Use unified prompt system - it handles None values gracefully
        // The UnifiedPromptProcessor will omit empty sections and clean up placeholders
        prompt_utils::build_unified_prompt(
            &self.job,
            &self.app_handle,
            context.task_description,
            context.file_contents,
            context.directory_tree,
            &self.config.model,
        ).await
    }


    /// Finalize the job with success status and usage information
    /// Uses centralized job_processor_utils for consistent finalization
    pub async fn finalize_success(
        &self,
        repo: &Arc<BackgroundJobRepository>,
        job_id: &str,
        result: &LlmTaskResult,
        metadata: Option<Value>,
    ) -> AppResult<()> {
        job_processor_utils::finalize_job_success(
            job_id,
            repo,
            &result.response,
            result.usage.clone(),
            &self.config.model,
            &result.system_prompt_id,
            &result.system_prompt_template,
            metadata,
            &self.app_handle,
        ).await
    }

    /// Finalize the job with failure status
    /// Uses centralized job_processor_utils for consistent finalization
    pub async fn finalize_failure(
        &self,
        repo: &Arc<BackgroundJobRepository>,
        job_id: &str,
        error_message: &str,
        app_error_opt: Option<&AppError>,
        llm_usage: Option<OpenRouterUsage>,
    ) -> AppResult<()> {
        job_processor_utils::finalize_job_failure(
            job_id, 
            repo, 
            error_message, 
            app_error_opt,
            llm_usage,
            Some(self.config.model.clone()),
            &self.app_handle,
        ).await
    }

    /// Log prompt to temporary file for debugging
    async fn log_prompt_to_file(&self, system_prompt: &str, user_prompt: &str, prompt_type: &str) {
        let base_dir = std::path::Path::new("/path/to/project/tmp");
        let task_type_dir = base_dir.join("llm_logs").join(format!("{:?}", self.job.job_type));
        
        if let Err(_) = fs::create_dir_all(&task_type_dir).await {
            // Silently fail if can't create directory
            return;
        }
        
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S%.3f");
        let filename = format!("prompt_{}_{}.txt", self.job.id, timestamp);
        let filepath = task_type_dir.join(filename);
        
        let full_prompt = format!(
            "=== JOB ID: {} ===\n=== TASK TYPE: {:?} ===\n=== MODEL: {} ===\n=== TEMPERATURE: {} ===\n=== PROMPT TYPE: {} ===\n\n=== SYSTEM PROMPT ===\n{}\n\n=== USER PROMPT ===\n{}\n\n=== END ===\n",
            self.job.id, self.job.job_type, self.config.model, self.config.temperature, prompt_type, system_prompt, user_prompt
        );
        
        let _ = fs::write(&filepath, full_prompt).await;
    }
    
    /// Log complete LLM interaction (prompt + response) to temporary file for debugging
    async fn log_complete_interaction(&self, system_prompt: &str, user_prompt: &str, response: &str, usage: &Option<crate::models::OpenRouterUsage>, prompt_type: &str) {
        let base_dir = std::path::Path::new("/path/to/project/tmp");
        let task_type_dir = base_dir.join("llm_interactions").join(format!("{:?}", self.job.job_type));
        
        if let Err(_) = fs::create_dir_all(&task_type_dir).await {
            // Silently fail if can't create directory
            return;
        }
        
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S%.3f");
        let filename = format!("interaction_{}_{}.txt", self.job.id, timestamp);
        let filepath = task_type_dir.join(filename);
        
        // Format usage information
        let usage_info = if let Some(usage) = usage {
            format!(
                "=== USAGE ===\nInput Tokens: {}\nOutput Tokens: {}\nTotal Tokens: {}\nCost: ${:.6}\n\n",
                usage.prompt_tokens,
                usage.completion_tokens,
                usage.total_tokens,
                usage.cost.unwrap_or(0.0)
            )
        } else {
            "=== USAGE ===\nNo usage information available\n\n".to_string()
        };
        
        let full_interaction = format!(
            "=== LLM INTERACTION LOG ===\n=== JOB ID: {} ===\n=== TASK TYPE: {:?} ===\n=== MODEL: {} ===\n=== TEMPERATURE: {} ===\n=== PROMPT TYPE: {} ===\n\n{}\n=== SYSTEM PROMPT ===\n{}\n\n=== USER PROMPT ===\n{}\n\n=== LLM RESPONSE ===\n{}\n\n=== END INTERACTION ===\n",
            self.job.id, self.job.job_type, self.config.model, self.config.temperature, prompt_type, usage_info, system_prompt, user_prompt, response
        );
        
        let _ = fs::write(&filepath, full_interaction).await;
    }
    
    /// Poll for final cost and update usage data with resolved cost
    async fn poll_and_update_final_cost(
        &self,
        request_id: &str,
        mut usage: OpenRouterUsage,
        repo: Arc<BackgroundJobRepository>,
        job_id: &str,
    ) -> AppResult<Option<OpenRouterUsage>> {
        info!("Polling for final cost for job {} with request_id: {}", job_id, request_id);
        
        // Get API client for polling
        let llm_client = llm_api_utils::get_api_client(&self.app_handle)?;
        
        // Cast to ServerProxyClient to access polling methods
        let proxy_client = llm_client.as_any()
            .downcast_ref::<crate::api_clients::server_proxy_client::ServerProxyClient>()
            .ok_or_else(|| AppError::InternalError("Cannot poll for final cost with non-server proxy client".to_string()))?;
        
        // Poll for final cost with retry (5 attempts, 1 second delay)
        match proxy_client.poll_final_streaming_cost_with_retry(request_id, 5, 1000).await {
            Ok(Some(final_cost)) => {
                info!("Final cost retrieved for job {}: ${:.4}", job_id, final_cost);
                
                // Update usage with final cost
                usage.cost = Some(final_cost);
                
                // Update job metadata with final cost
                if let Err(e) = self.update_job_with_final_cost(&repo, job_id, final_cost).await {
                    warn!("Failed to update job {} metadata with final cost: {}", job_id, e);
                }
                
                Ok(Some(usage))
            }
            Ok(None) => {
                info!("Final cost not available for job {} after polling", job_id);
                Ok(Some(usage))
            }
            Err(e) => {
                warn!("Error polling for final cost for job {}: {}", job_id, e);
                Ok(Some(usage))
            }
        }
    }
    
    /// Poll for final cost only (when no usage data is available)
    async fn poll_for_final_cost_only(&self, request_id: &str) -> AppResult<Option<f64>> {
        info!("Polling for final cost only with request_id: {}", request_id);
        
        // Get API client for polling
        let llm_client = llm_api_utils::get_api_client(&self.app_handle)?;
        
        // Cast to ServerProxyClient to access polling methods
        let proxy_client = llm_client.as_any()
            .downcast_ref::<crate::api_clients::server_proxy_client::ServerProxyClient>()
            .ok_or_else(|| AppError::InternalError("Cannot poll for final cost with non-server proxy client".to_string()))?;
        
        // Poll for final cost with retry (5 attempts, 1 second delay)
        proxy_client.poll_final_streaming_cost_with_retry(request_id, 5, 1000).await
    }
    
    /// Update job metadata with final cost
    async fn update_job_with_final_cost(
        &self,
        repo: &Arc<BackgroundJobRepository>,
        job_id: &str,
        final_cost: f64,
    ) -> AppResult<()> {
        info!("Updating job {} metadata with final cost: ${:.4}", job_id, final_cost);
        
        // Get current job to update metadata
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::InternalError(format!("Job {} not found", job_id)))?;
        
        // Parse existing metadata or create new
        let mut metadata: serde_json::Value = if let Some(meta_str) = &job.metadata {
            serde_json::from_str(meta_str).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };
        
        // Add final cost to metadata
        if let Some(task_data) = metadata.get_mut("task_data") {
            task_data["finalCost"] = serde_json::json!(final_cost);
            task_data["actualCost"] = serde_json::json!(final_cost);
        } else {
            metadata["task_data"] = serde_json::json!({
                "finalCost": final_cost,
                "actualCost": final_cost
            });
        }
        
        // Update job metadata
        let updated_metadata = serde_json::to_string(&metadata)
            .map_err(|e| AppError::InternalError(format!("Failed to serialize metadata: {}", e)))?;
        
        // Use the existing update_job_stream_progress method to update metadata
        repo.update_job_stream_progress(
            job_id,
            "", // No new response content
            0,  // No new tokens
            0,  // Current response length  
            Some(&updated_metadata),
            None, // No app_handle
            Some(final_cost),
        ).await?;
        
        info!("Successfully updated job {} with final cost: ${:.4}", job_id, final_cost);
        Ok(())
    }
}

/// Builder for LlmTaskConfig
pub struct LlmTaskConfigBuilder {
    config: LlmTaskConfig,
}

impl LlmTaskConfigBuilder {
    pub fn new() -> Self {
        Self {
            config: LlmTaskConfig::default(),
        }
    }

    pub fn model<S: Into<String>>(mut self, model: S) -> Self {
        self.config.model = model.into();
        self
    }

    pub fn temperature(mut self, temperature: f32) -> Self {
        self.config.temperature = temperature;
        self
    }

    pub fn max_tokens(mut self, max_tokens: u32) -> Self {
        self.config.max_tokens = max_tokens;
        self
    }

    pub fn stream(mut self, stream: bool) -> Self {
        self.config.stream = stream;
        self
    }

    pub fn build(self) -> LlmTaskConfig {
        self.config
    }
}

impl Default for LlmTaskConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}