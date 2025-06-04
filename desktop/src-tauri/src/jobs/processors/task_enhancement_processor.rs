use async_trait::async_trait;
use log::{info, error, debug};
use tauri::AppHandle;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::utils::xml_utils::extract_xml_from_markdown;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

// Define structs for parsing the XML response
#[derive(Debug, Deserialize, Serialize, Default)]
struct TaskEnhancementResponseXml {
    original_task: Option<String>,
    enhanced_task: String,
    analysis: Option<String>,
    considerations: Option<ConsiderationsXml>,
    acceptance_criteria: Option<AcceptanceCriteriaXml>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct ConsiderationsXml {
    #[serde(rename = "consideration", default)]
    consideration: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct AcceptanceCriteriaXml {
    #[serde(rename = "criterion", default)]
    criterion: Vec<String>,
}

pub struct TaskEnhancementProcessor;

impl TaskEnhancementProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for TaskEnhancementProcessor {
    fn name(&self) -> &str {
        "TaskEnhancementProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type_str() == crate::models::TaskType::TaskEnhancement.to_string() &&
        matches!(job.payload, JobPayload::TaskEnhancement(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id().to_string();
        info!("Processing Task Enhancement job {}", job_id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TaskEnhancement(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Task Enhancement job {}",
                    job_id
                )));
            }
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job_id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&job_id, "task enhancement");
        
        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents: None,
            directory_tree: None,
            codebase_structure: payload.project_context.clone(),
            system_prompt_override: None,
        };
        
        debug!("Using model: {} for Task Enhancement", model_used);
        
        // Execute LLM task using the task runner
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("Task Enhancement LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job_id, &error_msg).await?;
                return Ok(JobProcessResult::failure(job_id, error_msg));
            }
        };
        
        info!("Task Enhancement LLM task completed successfully for job {}", job_id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        let clean_xml_content = extract_xml_from_markdown(&llm_result.response);
        
        // Parse the XML from the cleaned content
        let xml_response: Result<TaskEnhancementResponseXml, _> = quick_xml::de::from_str(&clean_xml_content);
        
        let parsed_response = match xml_response {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse XML response: {}", e);
                
                // Use cleaned XML content as fallback, or original response if cleaning resulted in empty string
                let enhanced_task = if !clean_xml_content.is_empty() {
                    clean_xml_content
                } else {
                    llm_result.response.clone()
                };
                
                // Create a basic response with just the text
                TaskEnhancementResponseXml {
                    original_task: None,
                    enhanced_task,
                    analysis: None,
                    considerations: None,
                    acceptance_criteria: None,
                }
            }
        };
        
        // Serialize the detailed analysis data for storing in metadata
        let metadata = serde_json::json!({
            "originalTask": parsed_response.original_task,
            "analysis": parsed_response.analysis,
            "considerations": parsed_response.considerations.map(|c| c.consideration),
            "acceptanceCriteria": parsed_response.acceptance_criteria.map(|a| a.criterion),
            "targetField": payload.target_field,
        });
        
        // Extract usage before moving it
        let usage_for_result = llm_result.usage.clone();
        
        // Use manual finalization since we need to set the response to enhanced_task
        // instead of the raw LLM response
        job_processor_utils::finalize_job_success(
            &job_id,
            &repo,
            &parsed_response.enhanced_task,
            llm_result.usage,
            &model_used,
            &llm_result.system_prompt_id,
            Some(metadata),
        ).await?;
        
        info!("Completed Task Enhancement job {}", job_id);
        
        let enhanced_task = parsed_response.enhanced_task.clone();
        let task_len = enhanced_task.len() as i32;
        
        Ok(JobProcessResult::success(job_id, enhanced_task)
            .with_tokens(
                usage_for_result.as_ref().map(|u| u.prompt_tokens as i32),
                usage_for_result.as_ref().map(|u| u.completion_tokens as i32),
                usage_for_result.as_ref().map(|u| u.total_tokens as i32),
                Some(task_len),
            ))
    }
}