use async_trait::async_trait;
use tauri::AppHandle;
use log::{debug, info, error};

use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;

/// Processor for guidance generation jobs
pub struct GuidanceGenerationProcessor;

impl GuidanceGenerationProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for GuidanceGenerationProcessor {
    fn name(&self) -> &str {
        "GuidanceGenerationProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::GuidanceGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let payload = match &job.payload {
            JobPayload::GuidanceGeneration(p) => p,
            _ => {
                return Err(AppError::JobError(format!(
                    "Cannot process job with payload type {:?} in GuidanceGenerationProcessor",
                    job.task_type_str()
                )));
            }
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&job.id, "guidance generation");
        debug!("Task description: {}", payload.task_description);
        
        // Load file contents if paths are provided
        let file_contents = if let Some(paths) = &payload.paths {
            Some(job_processor_utils::load_file_contents(paths, &payload.project_directory).await)
        } else {
            None
        };
        
        // Generate directory tree for enhanced context
        let directory_tree = job_processor_utils::generate_directory_tree_for_context(
            &payload.project_directory
        ).await;
        
        // Handle system prompt override or use unified prompt
        let composed_prompt = if let Some(override_prompt) = &payload.system_prompt_override {
            crate::utils::unified_prompt_system::ComposedPrompt {
                final_prompt: format!("{}\n\n{}", override_prompt, payload.task_description),
                system_prompt_id: "override".to_string(),
                context_sections: vec![],
                estimated_tokens: Some(crate::utils::token_estimator::estimate_tokens(override_prompt) as usize),
            }
        } else {
            // Use build_unified_prompt helper
            job_processor_utils::build_unified_prompt(
                &job,
                &app_handle,
                payload.task_description.clone(),
                payload.file_contents_summary.clone(),
                file_contents,
                directory_tree,
                &settings_repo,
                &model_used,
            ).await?
        };

        info!("Enhanced Guidance Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user parts from the composed prompt
        let (system_prompt, user_prompt, system_prompt_id) = 
            job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Build messages array
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options
        let api_options = job_processor_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        debug!("Sending guidance generation request with options: {:?}", api_options);
        
        // Call the LLM API
        let api_options_clone = api_options.clone();
        match job_processor_utils::execute_llm_chat_completion(&app_handle, messages, api_options).await {
            Ok(llm_response) => {
                debug!("Received guidance response");
                
                if let Some(choice) = llm_response.choices.first() {
                    let content = &choice.message.content;
                    let usage_clone = llm_response.usage.clone();
                    
                    // Finalize job success
                    job_processor_utils::finalize_job_success(
                        &job.id,
                        &repo,
                        content,
                        llm_response.usage,
                        &api_options_clone.model,
                        &system_prompt_id,
                        None,
                    ).await?;
                    
                    Ok(JobProcessResult::success(job.id.clone(), content.clone())
                        .with_tokens(
                            usage_clone.as_ref().map(|u| u.prompt_tokens as i32),
                            usage_clone.as_ref().map(|u| u.completion_tokens as i32),
                            usage_clone.as_ref().map(|u| u.total_tokens as i32),
                            Some(content.len() as i32)
                        ))
                } else {
                    let error_msg = "No content in LLM response".to_string();
                    error!("{}", error_msg);
                    job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg).await?;
                    
                    Ok(JobProcessResult::failure(job.id.clone(), error_msg))
                }
            },
            Err(e) => {
                let error_msg = format!("LLM API error: {}", e);
                error!("{}", error_msg);
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}