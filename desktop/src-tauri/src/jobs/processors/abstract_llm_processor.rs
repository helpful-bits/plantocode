use std::sync::Arc;
use tauri::AppHandle;
use log::{debug, info, warn};
use serde_json::Value;
use chrono;

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
        
        let response_text = response.choices
            .first()
            .map(|choice| choice.message.content.clone())
            .unwrap_or_default();
        
        // Ensure we capture server-calculated cost from the non-streaming response
        debug!("Non-streaming LLM response usage: {:?}", response.usage);
        
        // Log complete interaction (prompt + response) to file for debugging
        self.log_complete_interaction(&system_prompt, &user_prompt, &response_text, &response.usage, "non_streaming").await;
        
        Ok(LlmTaskResult {
            response: response_text,
            usage: response.usage, // Contains server-calculated cost
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
        
        // Create API options with streaming enabled
        let api_options = llm_api_utils::create_api_client_options(
            self.config.model.clone(),
            self.config.temperature,
            self.config.max_tokens,
            true, // Force streaming
        )?;
        
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
        
        // Ensure we capture server-calculated cost from the streaming response
        debug!("Streaming LLM response usage: {:?}", stream_result.final_usage);
        
        // Log complete interaction (prompt + response) to file for debugging
        self.log_complete_interaction(&system_prompt, &user_prompt, &stream_result.accumulated_response, &stream_result.final_usage, "streaming").await;
        
        Ok(LlmTaskResult {
            response: stream_result.accumulated_response,
            usage: stream_result.final_usage, // Contains server-calculated cost from final stream chunk
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
        let base_dir = std::path::Path::new("/Users/kirylkazlovich/dev/vibe-manager/tmp");
        let task_type_dir = base_dir.join("llm_logs").join(format!("{:?}", self.job.job_type));
        
        if let Err(_) = tokio::fs::create_dir_all(&task_type_dir).await {
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
        
        let _ = tokio::fs::write(&filepath, full_prompt).await;
    }
    
    /// Log complete LLM interaction (prompt + response) to temporary file for debugging
    async fn log_complete_interaction(&self, system_prompt: &str, user_prompt: &str, response: &str, usage: &Option<crate::models::OpenRouterUsage>, prompt_type: &str) {
        let base_dir = std::path::Path::new("/Users/kirylkazlovich/dev/vibe-manager/tmp");
        let task_type_dir = base_dir.join("llm_interactions").join(format!("{:?}", self.job.job_type));
        
        if let Err(_) = tokio::fs::create_dir_all(&task_type_dir).await {
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
        
        let _ = tokio::fs::write(&filepath, full_interaction).await;
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