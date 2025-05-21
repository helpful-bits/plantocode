use log::{debug, info, warn, error};
use serde_json::json;
use tauri::{AppHandle, Manager};
use quick_xml::Reader;
use quick_xml::events::Event;

use crate::api_clients::{ApiClient, client_trait::ApiClientOptions};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, RegexGenerationPayload};
use crate::models::{BackgroundJob, JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::prompts::regex::generate_regex_prompt;
use crate::utils::get_timestamp;

pub struct RegexGenerationProcessor;

impl RegexGenerationProcessor {
    pub fn new() -> Self {
        Self {}
    }
    
    // Ensure job is visible to the user
    async fn ensure_job_visible(&self, repo: &BackgroundJobRepository, job_id: &str) -> AppResult<()> {
        // Get the current job
        if let Some(mut job) = repo.get_job_by_id(job_id).await? {
            // Set visibility flags
            job.visible = Some(true);
            job.cleared = Some(false);
            
            // Update the job
            repo.update_job(&job).await?;
        }
        
        Ok(())
    }
    
    // Parse regex patterns from the XML response
    fn parse_regex_patterns(&self, response: &str) -> AppResult<serde_json::Value> {
        debug!("Parsing regex patterns from response");
        
        // Check if the response contains a regex_generation tag
        if !response.contains("<regex_generation>") {
            warn!("Response does not contain <regex_generation> tag");
            return Ok(json!({
                "raw_content": response,
                "format": "raw",
                "parsing_status": "failed"
            }));
        }
        
        // Prepare to extract pattern information
        let mut reader = Reader::from_str(response);
        reader.config_mut().trim_text(true);
        
        let mut buf = Vec::new();
        let mut current_section = "";
        let mut primary_pattern = String::new();
        let mut primary_explanation = String::new();
        let mut alternative_patterns = Vec::new();
        let mut current_alternative = String::new();
        let mut current_alternative_explanation = String::new();
        let mut analysis = String::new();
        let mut flags = Vec::new();
        let mut current_text = String::new();
        
        // Parse the XML response
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    match e.name().as_ref() {
                        b"analysis" => current_section = "analysis",
                        b"expression" => {
                            if current_section == "primary_pattern" {
                                current_section = "primary_expression";
                            } else if current_section == "alternative_pattern" {
                                current_section = "alternative_expression";
                            }
                        },
                        b"explanation" => {
                            if current_section == "primary_pattern" {
                                current_section = "primary_explanation";
                            } else if current_section == "alternative_pattern" {
                                current_section = "alternative_explanation";
                            }
                        },
                        b"pattern" => {
                            // Get the purpose attribute to determine if it's primary or alternative
                            for attr in e.attributes() {
                                if let Ok(attr) = attr {
                                    if attr.key.as_ref() == b"purpose" {
                                        let value = attr.value.as_ref();
                                        if value == b"primary" {
                                            current_section = "primary_pattern";
                                        } else if value == b"alternative" {
                                            // If we already have an alternative pattern, save it before starting a new one
                                            if !current_alternative.is_empty() && !current_alternative_explanation.is_empty() {
                                                alternative_patterns.push(json!({
                                                    "pattern": current_alternative.trim(),
                                                    "explanation": current_alternative_explanation.trim()
                                                }));
                                                current_alternative = String::new();
                                                current_alternative_explanation = String::new();
                                            }
                                            current_section = "alternative_pattern";
                                        }
                                    }
                                }
                            }
                        },
                        b"flag" => current_section = "flag",
                        _ => {}
                    }
                },
                Ok(Event::End(ref e)) => {
                    match e.name().as_ref() {
                        b"analysis" => {
                            analysis = current_text.trim().to_string();
                            current_text.clear();
                            current_section = "";
                        },
                        b"expression" => {
                            if current_section == "primary_expression" {
                                primary_pattern = current_text.trim().to_string();
                                current_text.clear();
                                current_section = "primary_pattern";
                            } else if current_section == "alternative_expression" {
                                current_alternative = current_text.trim().to_string();
                                current_text.clear();
                                current_section = "alternative_pattern";
                            }
                        },
                        b"explanation" => {
                            if current_section == "primary_explanation" {
                                primary_explanation = current_text.trim().to_string();
                                current_text.clear();
                                current_section = "primary_pattern";
                            } else if current_section == "alternative_explanation" {
                                current_alternative_explanation = current_text.trim().to_string();
                                current_text.clear();
                                current_section = "alternative_pattern";
                            }
                        },
                        b"pattern" => {
                            // If we're ending an alternative pattern, add it to the collection
                            if current_section == "alternative_pattern" && !current_alternative.is_empty() && !current_alternative_explanation.is_empty() {
                                alternative_patterns.push(json!({
                                    "pattern": current_alternative.trim(),
                                    "explanation": current_alternative_explanation.trim()
                                }));
                                current_alternative = String::new();
                                current_alternative_explanation = String::new();
                            }
                            current_section = "";
                        },
                        b"flag" => {
                            flags.push(current_text.trim().to_string());
                            current_text.clear();
                            current_section = "";
                        },
                        _ => {}
                    }
                },
                Ok(Event::Text(e)) => {
                    if !current_section.is_empty() {
                        current_text.push_str(&e.unescape().unwrap_or_default().to_string());
                    }
                },
                Ok(Event::Eof) => break,
                Err(e) => {
                    warn!("Error parsing XML: {}", e);
                    return Ok(json!({
                        "raw_content": response,
                        "format": "raw",
                        "parsing_status": "error",
                        "error": format!("Error parsing XML: {}", e)
                    }));
                },
                _ => {}
            }
            buf.clear();
        }
        
        // Create a structured representation of the parsed regex patterns
        Ok(json!({
            "raw_content": response,
            "format": "xml",
            "parsing_status": "success",
            "analysis": analysis,
            "primary_pattern": {
                "pattern": primary_pattern,
                "explanation": primary_explanation
            },
            "alternative_patterns": alternative_patterns,
            "flags": flags
        }))
    }
}

#[async_trait::async_trait]
impl JobProcessor for RegexGenerationProcessor {
    fn name(&self) -> &'static str {
        "RegexGenerationProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::RegexGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::RegexGeneration(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Get dependencies from app state
        let repo_state = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>();
        let repo = repo_state.inner().clone();
        
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Ensure job is visible
        self.ensure_job_visible(&repo, &job.id).await?;
        
        // Update job status to running
        let timestamp = get_timestamp();
        let mut db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
        db_job.status = "running".to_string();
        db_job.updated_at = Some(timestamp);
        db_job.start_time = Some(timestamp);
        repo.update_job(&db_job).await?;
        
        // Generate the regex prompt
        info!("Generating regex for description: {}", &payload.description);
        let examples = payload.examples.as_ref().map(|e| e.iter().map(|s| s.as_str()).collect());
        let prompt = generate_regex_prompt(
            &payload.description,
            examples,
            payload.target_language.as_deref()
        );
        
        // Create messages for the LLM
        let messages = vec![
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: prompt,
                }],
            },
        ];
        
        // Determine which model to use from config
        let model = match payload.model_override.clone() {
            Some(model) => model,
            None => crate::config::get_model_for_task(crate::models::TaskType::RegexGeneration)?
        };
        
        // Get max tokens from payload or config
        let max_tokens = match payload.max_output_tokens {
            Some(tokens) => Some(tokens),
            None => Some(crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::RegexGeneration))?)
        };
        
        // Create API client options
        let api_options = ApiClientOptions {
            model: model.clone(),
            max_tokens,
            temperature: Some(payload.temperature),
            stream: false,
        };
        
        // Call LLM
        info!("Calling LLM for regex generation with model {}", &model);
        let llm_response = match llm_client.chat_completion(messages, api_options).await {
            Ok(response) => response,
            Err(e) => {
                error!("Failed to call LLM: {}", e);
                let error_msg = format!("Failed to call LLM: {}", e);
                
                // Update job to failed
                let timestamp = get_timestamp();
                let mut db_job = repo.get_job_by_id(&job.id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
                db_job.status = "failed".to_string();
                db_job.error_message = Some(error_msg.clone());
                db_job.updated_at = Some(timestamp);
                db_job.end_time = Some(timestamp);
                repo.update_job(&db_job).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
        
        // Parse the regex patterns
        let structured_data = match self.parse_regex_patterns(&response_content) {
            Ok(data) => data,
            Err(e) => {
                error!("Failed to parse regex patterns: {}", e);
                let error_msg = format!("Failed to parse regex patterns: {}", e);
                
                // Update job to failed
                let timestamp = get_timestamp();
                let mut db_job = repo.get_job_by_id(&job.id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
                db_job.status = "failed".to_string();
                db_job.error_message = Some(error_msg.clone());
                db_job.updated_at = Some(timestamp);
                db_job.end_time = Some(timestamp);
                repo.update_job(&db_job).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Extract the primary pattern for the response
        let primary_pattern = structured_data["primary_pattern"]["pattern"].as_str()
            .unwrap_or("No pattern found");
            
        // Format a user-friendly response with the pattern and its explanation
        let explanation = structured_data["primary_pattern"]["explanation"].as_str()
            .unwrap_or("No explanation available");
            
        let flags = structured_data["flags"].as_array()
            .map(|f| f.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(""))
            .unwrap_or_default();
            
        let formatted_response = format!(
            "Generated Regex Pattern: /{}/{}\n\nExplanation:\n{}", 
            primary_pattern, 
            flags,
            explanation
        );
        
        // Update the job with the results
        let timestamp = get_timestamp();
        let mut db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
        db_job.status = "completed".to_string();
        db_job.response = Some(formatted_response.clone());
        db_job.updated_at = Some(timestamp);
        db_job.end_time = Some(timestamp);
        db_job.model_used = Some(model);
        
        // Add token usage if available
        if let Some(usage) = llm_response.usage {
            db_job.tokens_sent = Some(usage.prompt_tokens as i32);
            db_job.tokens_received = Some(usage.completion_tokens as i32);
            db_job.total_tokens = Some(usage.total_tokens as i32);
        }
        
        // Store structured data in metadata
        let metadata_json = json!({
            "regexData": structured_data
        }).to_string();
        
        db_job.metadata = Some(metadata_json);
        
        // Update the job
        repo.update_job(&db_job).await?;
        
        // Return success result
        Ok(JobProcessResult::success(job.id.clone(), formatted_response))
    }
}