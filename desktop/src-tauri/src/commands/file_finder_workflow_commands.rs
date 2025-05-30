use tauri::{command, AppHandle, Manager, Emitter};
use log::{debug, error, info, warn};
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use std::path::Path;
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, OpenRouterRequestMessage, OpenRouterContent};
use crate::db_utils::{SessionRepository, SettingsRepository};
use crate::utils::{directory_tree::{generate_directory_tree, DirectoryTreeOptions}, PromptComposer, CompositionContextBuilder};
use crate::utils::{fs_utils, path_utils};
use crate::constants::EXCLUDED_DIRS_FOR_SCAN;
use crate::api_clients::client_trait::ApiClientOptions;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinderWorkflowArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub excluded_paths: Option<Vec<String>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowProgress {
    pub workflow_id: String,
    pub stage: String,
    pub status: String,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkflowStage {
    GeneratingDirTree,
    GeneratingRegex,
    LocalFiltering,
    InitialPathFinder,
    InitialPathCorrection,
    ExtendedPathFinder,
    ExtendedPathCorrection,
    Completed,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinderWorkflowResult {
    pub success: bool,
    pub selected_files: Vec<String>,
    pub intermediate_data: WorkflowIntermediateData,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowIntermediateData {
    pub directory_tree_content: Option<String>,
    pub raw_regex_patterns: Option<serde_json::Value>,
    pub locally_filtered_files: Vec<String>,
    pub initial_verified_paths: Vec<String>,
    pub initial_unverified_paths: Vec<String>,
    pub initial_corrected_paths: Vec<String>,
    pub extended_verified_paths: Vec<String>,
    pub extended_unverified_paths: Vec<String>,
    pub extended_corrected_paths: Vec<String>,
}

fn emit_progress_event(app_handle: &AppHandle, workflow_id: &str, stage: WorkflowStage, message: &str, data: Option<serde_json::Value>) {
    let stage_str = serde_json::to_value(&stage)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| format!("{:?}", stage));
    
    let progress = WorkflowProgress {
        workflow_id: workflow_id.to_string(),
        stage: stage_str,
        status: "running".to_string(),
        message: message.to_string(),
        data,
    };
    
    if let Err(e) = app_handle.emit("file-finder-workflow-progress", &progress) {
        warn!("Failed to emit workflow progress event: {}", e);
    }
}

#[command]
pub async fn execute_file_finder_workflow_command(
    args: FileFinderWorkflowArgs,
    app_handle: AppHandle,
) -> AppResult<FileFinderWorkflowResult> {
    info!("Starting file finder workflow for task: {}", args.task_description.chars().take(50).collect::<String>());
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.task_description.trim().len() < 10 {
        return Err(AppError::ValidationError("Task description must be at least 10 characters".to_string()));
    }
    
    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    let mut intermediate_data = WorkflowIntermediateData::default();
    let excluded_paths = args.excluded_paths.unwrap_or_default();
    let workflow_id = format!("workflow_{}", args.session_id);
    
    // Stage 1: Generate directory tree
    info!("Stage 1: Generating directory tree");
    emit_progress_event(&app_handle, &workflow_id, WorkflowStage::GeneratingDirTree, "Generating directory tree...", None);
    let directory_tree = match generate_directory_tree_internal(&args.project_directory).await {
        Ok(tree) => {
            intermediate_data.directory_tree_content = Some(tree.clone());
            tree
        },
        Err(e) => {
            error!("Failed to generate directory tree: {}", e);
            return Ok(FileFinderWorkflowResult {
                success: false,
                selected_files: vec![],
                intermediate_data,
                error_message: Some(format!("Directory tree generation failed: {}", e)),
            });
        }
    };
    
    // Stage 2: Generate regex patterns
    info!("Stage 2: Generating regex patterns");
    emit_progress_event(&app_handle, &workflow_id, WorkflowStage::GeneratingRegex, "Generating regex patterns...", None);
    let regex_patterns = match generate_regex_patterns_internal(
        &args.session_id,
        &args.project_directory,
        &args.task_description,
        &directory_tree,
        &app_handle
    ).await {
        Ok(patterns) => {
            intermediate_data.raw_regex_patterns = Some(patterns.clone());
            patterns
        },
        Err(e) => {
            error!("Failed to generate regex patterns: {}", e);
            return Ok(FileFinderWorkflowResult {
                success: false,
                selected_files: vec![],
                intermediate_data,
                error_message: Some(format!("Regex pattern generation failed: {}", e)),
            });
        }
    };
    
    // Stage 3: Local filtering
    info!("Stage 3: Performing local filtering");
    emit_progress_event(&app_handle, &workflow_id, WorkflowStage::LocalFiltering, "Filtering files locally...", None);
    let locally_filtered_files = match perform_local_filtering_internal(&regex_patterns, &args.project_directory).await {
        Ok(files) => {
            intermediate_data.locally_filtered_files = files.clone();
            files
        },
        Err(e) => {
            error!("Failed to perform local filtering: {}", e);
            return Ok(FileFinderWorkflowResult {
                success: false,
                selected_files: vec![],
                intermediate_data,
                error_message: Some(format!("Local filtering failed: {}", e)),
            });
        }
    };
    
    // Stage 4: Initial path finder
    info!("Stage 4: Running initial path finder");
    emit_progress_event(&app_handle, &workflow_id, WorkflowStage::InitialPathFinder, "Finding relevant files...", None);
    let (initial_verified, initial_unverified) = match run_initial_path_finder_internal(
        &args.session_id,
        &args.project_directory,
        &args.task_description,
        &directory_tree,
        &locally_filtered_files,
        &excluded_paths,
        &app_handle
    ).await {
        Ok((verified, unverified)) => {
            intermediate_data.initial_verified_paths = verified.clone();
            intermediate_data.initial_unverified_paths = unverified.clone();
            (verified, unverified)
        },
        Err(e) => {
            error!("Failed to run initial path finder: {}", e);
            return Ok(FileFinderWorkflowResult {
                success: false,
                selected_files: vec![],
                intermediate_data,
                error_message: Some(format!("Initial path finder failed: {}", e)),
            });
        }
    };
    
    let mut all_verified_paths = initial_verified.clone();
    
    // Stage 5: Initial path correction (if needed)
    if !initial_unverified.is_empty() {
        info!("Stage 5: Running initial path correction");
        emit_progress_event(&app_handle, &workflow_id, WorkflowStage::InitialPathCorrection, "Correcting invalid paths...", None);
        let corrected_paths = match run_path_correction_internal(
            &args.session_id,
            &args.project_directory,
            &initial_unverified,
            &args.task_description,
            &directory_tree,
            &app_handle
        ).await {
            Ok(paths) => {
                intermediate_data.initial_corrected_paths = paths.clone();
                paths
            },
            Err(e) => {
                warn!("Initial path correction failed (continuing): {}", e);
                vec![]
            }
        };
        all_verified_paths.extend(corrected_paths);
    }
    
    // Stage 6: Extended path finder
    info!("Stage 6: Running extended path finder");
    emit_progress_event(&app_handle, &workflow_id, WorkflowStage::ExtendedPathFinder, "Finding additional relevant files...", None);
    let (extended_verified, extended_unverified) = match run_extended_path_finder_internal(
        &args.session_id,
        &args.project_directory,
        &args.task_description,
        &directory_tree,
        &all_verified_paths,
        &excluded_paths,
        &app_handle
    ).await {
        Ok((verified, unverified)) => {
            intermediate_data.extended_verified_paths = verified.clone();
            intermediate_data.extended_unverified_paths = unverified.clone();
            (verified, unverified)
        },
        Err(e) => {
            warn!("Extended path finder failed (continuing): {}", e);
            (vec![], vec![])
        }
    };
    
    all_verified_paths.extend(extended_verified);
    
    // Stage 7: Extended path correction (if needed)
    if !extended_unverified.is_empty() {
        info!("Stage 7: Running extended path correction");
        emit_progress_event(&app_handle, &workflow_id, WorkflowStage::ExtendedPathCorrection, "Correcting additional paths...", None);
        let corrected_paths = match run_path_correction_internal(
            &args.session_id,
            &args.project_directory,
            &extended_unverified,
            &args.task_description,
            &directory_tree,
            &app_handle
        ).await {
            Ok(paths) => {
                intermediate_data.extended_corrected_paths = paths.clone();
                paths
            },
            Err(e) => {
                warn!("Extended path correction failed (continuing): {}", e);
                vec![]
            }
        };
        all_verified_paths.extend(corrected_paths);
    }
    
    // Remove duplicates and return final result
    all_verified_paths.sort();
    all_verified_paths.dedup();
    
    info!("File finder workflow completed successfully with {} files", all_verified_paths.len());
    
    emit_progress_event(&app_handle, &workflow_id, WorkflowStage::Completed, 
        &format!("Workflow completed successfully with {} files", all_verified_paths.len()), None);
    
    Ok(FileFinderWorkflowResult {
        success: true,
        selected_files: all_verified_paths,
        intermediate_data,
        error_message: None,
    })
}

async fn generate_directory_tree_internal(project_directory: &str) -> AppResult<String> {
    let options = DirectoryTreeOptions {
        max_depth: None,
        include_ignored: false,
        respect_gitignore: true,
        exclude_patterns: Some(EXCLUDED_DIRS_FOR_SCAN.iter().map(|&s| s.to_string()).collect()),
        include_files: true,
        include_dirs: true,
        include_hidden: false,
    };
    let path = Path::new(project_directory);
    generate_directory_tree(path, options).await
}

async fn generate_regex_patterns_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    app_handle: &AppHandle
) -> AppResult<serde_json::Value> {
    info!("Generating regex patterns for task description");
    
    // Get model configuration
    let model = crate::config::get_model_for_task_with_project(TaskType::RegexPatternGeneration, project_directory, app_handle).await?;
    let temperature = crate::config::get_temperature_for_task_with_project(TaskType::RegexPatternGeneration, project_directory, app_handle).await?;
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(TaskType::RegexPatternGeneration, project_directory, app_handle).await?;
    
    // Get settings repository for PromptComposer
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create composition context
    let composition_context = CompositionContextBuilder::new(
        session_id.to_string(),
        TaskType::RegexPatternGeneration,
        task_description.to_string(),
    )
    .project_directory(Some(project_directory.to_string()))
    .codebase_structure(Some(directory_tree.to_string()))
    .build();

    // Use PromptComposer to generate the complete prompt
    let prompt_composer = PromptComposer::new();
    let composed_prompt = prompt_composer
        .compose_prompt(&composition_context, &settings_repo)
        .await?;

    // Get LLM client
    let llm_client = crate::api_clients::client_factory::get_api_client(app_handle)?;
    
    // Create messages for the LLM
    let messages = vec![
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: composed_prompt.final_prompt,
            }],
        },
    ];
    
    // Create API client options
    let api_options = ApiClientOptions {
        model: model.clone(),
        max_tokens: Some(max_tokens),
        temperature: Some(temperature),
        stream: false,
    };
    
    // Call LLM
    info!("Calling LLM for regex pattern generation with model {}", &model);
    let llm_response = llm_client.chat_completion(messages, api_options).await?;
    
    // Extract the response content
    let response_content = llm_response.choices[0].message.content.clone();
    debug!("LLM response content: {}", response_content);
    
    // Attempt to parse the content as JSON
    match serde_json::from_str::<serde_json::Value>(&response_content) {
        Ok(parsed_json) => {
            debug!("Successfully parsed JSON response");
            Ok(parsed_json)
        },
        Err(e) => {
            warn!("Failed to parse LLM response as JSON: {}. Using fallback patterns.", e);
            // Return default empty patterns
            Ok(serde_json::json!({
                "titleRegex": "",
                "contentRegex": "",
                "negativeTitleRegex": "",
                "negativeContentRegex": ""
            }))
        }
    }
}

async fn perform_local_filtering_internal(
    regex_patterns: &serde_json::Value,
    project_directory: &str
) -> AppResult<Vec<String>> {
    info!("Performing local filtering with regex patterns");
    
    // Get project files
    let project_dir_path = Path::new(project_directory);
    let file_entries = fs_utils::list_directory(project_dir_path).await?;
    
    let mut matching_paths = Vec::new();
    
    // Extract regex patterns from JSON
    let title_regex = regex_patterns.get("titleRegex")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let negative_title_regex = regex_patterns.get("negativeTitleRegex")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    for entry in file_entries {
        if entry.is_dir {
            continue;
        }
        
        // Make path relative to project directory
        let relative_path = match Path::new(&entry.path).strip_prefix(project_dir_path) {
            Ok(rel_path) => rel_path.to_string_lossy().to_string(),
            Err(_) => continue,
        };
        
        let mut is_match = false;
        
        // Apply positive title regex
        if !title_regex.is_empty() {
            match Regex::new(title_regex) {
                Ok(regex) => {
                    is_match = regex.is_match(&relative_path);
                },
                Err(_) => {
                    // Fallback to string contains
                    is_match = relative_path.to_lowercase().contains(&title_regex.to_lowercase());
                }
            }
        } else {
            // If no positive regex, include all files by default
            is_match = true;
        }
        
        // Apply negative title regex (exclusion)
        if is_match && !negative_title_regex.is_empty() {
            match Regex::new(negative_title_regex) {
                Ok(negative_regex) => {
                    if negative_regex.is_match(&relative_path) {
                        is_match = false;
                    }
                },
                Err(_) => {
                    // Fallback to string contains
                    if relative_path.to_lowercase().contains(&negative_title_regex.to_lowercase()) {
                        is_match = false;
                    }
                }
            }
        }
        
        if is_match {
            matching_paths.push(relative_path);
        }
    }
    
    info!("Local filtering found {} matching files", matching_paths.len());
    Ok(matching_paths)
}

async fn run_path_finder_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    included_files: &[String],
    excluded_files: &[String],
    task_type: TaskType,
    app_handle: &AppHandle
) -> AppResult<(Vec<String>, Vec<String>)> {
    info!("Running path finder with {} included files", included_files.len());
    
    // Get model configuration
    let model = crate::config::get_model_for_task_with_project(task_type, project_directory, app_handle).await?;
    let temperature = crate::config::get_temperature_for_task_with_project(task_type, project_directory, app_handle).await?;
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(task_type, project_directory, app_handle).await?;
    
    // Get settings repository for PromptComposer
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create composition context
    let composition_context = CompositionContextBuilder::new(
        session_id.to_string(),
        task_type,
        task_description.to_string(),
    )
    .project_directory(Some(project_directory.to_string()))
    .codebase_structure(Some(directory_tree.to_string()))
    .build();

    // Use PromptComposer to generate the complete prompt
    let prompt_composer = PromptComposer::new();
    let composed_prompt = prompt_composer
        .compose_prompt(&composition_context, &settings_repo)
        .await?;

    // Extract system and user prompts from the composed result
    let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
    let system_prompt = parts.get(0).unwrap_or(&"").to_string();
    let user_prompt = parts.get(1).unwrap_or(&"").to_string();

    // Get LLM client
    let llm_client = crate::api_clients::client_factory::get_api_client(app_handle)?;
    
    // Create messages for the LLM
    let messages = vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt,
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt,
            }],
        },
    ];
    
    // Create API client options
    let api_options = ApiClientOptions {
        model: model.clone(),
        max_tokens: Some(max_tokens),
        temperature: Some(temperature),
        stream: false,
    };
    
    // Call LLM
    info!("Calling LLM for path finding with model {}", &model);
    let llm_response = llm_client.chat_completion(messages, api_options).await?;
    
    // Extract the response content
    let response_content = llm_response.choices[0].message.content.clone();
    
    // Parse paths from the LLM response
    let raw_paths = parse_paths_from_text_response(&response_content, project_directory)?;
    
    // Validate paths against the file system
    info!("Validating {} parsed paths against filesystem...", raw_paths.len());
    let mut validated_paths = Vec::new();
    let mut unverified_paths = Vec::new();

    for relative_path in raw_paths {
        // Construct absolute path
        let absolute_path = Path::new(project_directory).join(&relative_path);
        
        // Check if file exists and is a file
        match tokio::fs::metadata(&absolute_path).await {
            Ok(metadata) if metadata.is_file() => {
                validated_paths.push(relative_path);
            },
            _ => {
                debug!("Path doesn't exist or isn't a regular file: {}", absolute_path.display());
                unverified_paths.push(relative_path);
            }
        }
    }
    
    info!("Path finder found {} verified and {} unverified paths", validated_paths.len(), unverified_paths.len());
    Ok((validated_paths, unverified_paths))
}

async fn run_initial_path_finder_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    included_files: &[String],
    excluded_files: &[String],
    app_handle: &AppHandle
) -> AppResult<(Vec<String>, Vec<String>)> {
    run_path_finder_internal(
        session_id,
        project_directory,
        task_description,
        directory_tree,
        included_files,
        excluded_files,
        TaskType::PathFinder,
        app_handle
    ).await
}

async fn run_extended_path_finder_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    current_verified: &[String],
    excluded_files: &[String],
    app_handle: &AppHandle
) -> AppResult<(Vec<String>, Vec<String>)> {
    run_path_finder_internal(
        session_id,
        project_directory,
        task_description,
        directory_tree,
        current_verified,
        excluded_files,
        TaskType::PathFinder,
        app_handle
    ).await
}

async fn run_path_correction_internal(
    session_id: &str,
    project_directory: &str,
    paths_to_correct: &[String],
    task_description: &str,
    directory_tree: &str,
    app_handle: &AppHandle
) -> AppResult<Vec<String>> {
    if paths_to_correct.is_empty() {
        return Ok(vec![]);
    }
    
    info!("Running path correction for {} paths", paths_to_correct.len());
    
    // Get model configuration
    let model = crate::config::get_model_for_task_with_project(TaskType::PathCorrection, project_directory, app_handle).await?;
    let temperature = crate::config::get_temperature_for_task_with_project(TaskType::PathCorrection, project_directory, app_handle).await?;
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(TaskType::PathCorrection, project_directory, app_handle).await?;
    
    // Get settings repository for PromptComposer
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create composition context with paths as task description
    let paths_description = paths_to_correct.join("\n");
    let composition_context = CompositionContextBuilder::new(
        session_id.to_string(),
        TaskType::PathCorrection,
        paths_description.clone(),
    )
    .project_directory(Some(project_directory.to_string()))
    .codebase_structure(Some(directory_tree.to_string()))
    .build();

    // Use PromptComposer to generate the complete prompt
    let prompt_composer = PromptComposer::new();
    let composed_prompt = prompt_composer
        .compose_prompt(&composition_context, &settings_repo)
        .await?;

    // Extract system and user prompts from the composed result
    let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
    let system_prompt = parts.get(0).unwrap_or(&"").to_string();
    let user_prompt = parts.get(1).unwrap_or(&"").to_string();

    // Get LLM client
    let llm_client = crate::api_clients::client_factory::get_api_client(app_handle)?;
    
    // Create messages for the LLM
    let messages = vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt,
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt,
            }],
        },
    ];
    
    // Create API client options
    let api_options = ApiClientOptions {
        model: model.clone(),
        max_tokens: Some(max_tokens),
        temperature: Some(temperature),
        stream: false,
    };
    
    // Call LLM
    info!("Calling LLM for path correction with model {}", &model);
    let llm_response = llm_client.chat_completion(messages, api_options).await?;
    
    // Extract the response content
    let response_content = llm_response.choices[0].message.content.clone();
    
    // Parse corrected paths from XML response
    let corrected_paths = parse_corrected_paths_from_xml(&response_content)?;
    
    info!("Path correction returned {} corrected paths", corrected_paths.len());
    Ok(corrected_paths)
}

// Helper function to parse paths from simple text response (one path per line)
fn parse_paths_from_text_response(response_text: &str, project_directory: &str) -> AppResult<Vec<String>> {
    debug!("Parsing paths from text response");
    let mut paths = Vec::new();
    
    // Split by newlines and process each line
    for line in response_text.lines() {
        let line = line.trim();
        
        // Filter out empty lines or lines that are clearly not paths
        if line.is_empty() || 
           line.starts_with("//") || 
           line.starts_with("#") ||
           line.starts_with("Note:") ||
           line.starts_with("Analysis:") ||
           line.len() < 2 {
            continue;
        }
        
        // Clean the line of potential prefixes/suffixes
        let cleaned_path = line
            .trim_matches(|c| c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == '-' || c == '*')
            .trim();
        
        if cleaned_path.is_empty() {
            continue;
        }
        
        // Normalize the path and make it relative to project directory
        let normalized_path = if Path::new(cleaned_path).is_absolute() {
            match path_utils::make_relative_to(cleaned_path, project_directory) {
                Ok(rel_path) => rel_path.to_string_lossy().to_string(),
                Err(e) => {
                    debug!("Failed to make path relative, skipping: {} - {}", cleaned_path, e);
                    continue;
                }
            }
        } else {
            // Normalize relative path
            let normalized = path_utils::normalize_path(cleaned_path);
            normalized.to_string_lossy().to_string()
        };
        
        paths.push(normalized_path);
    }
    
    // Remove duplicates while preserving order
    let mut unique_paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in paths {
        if seen.insert(path.clone()) {
            unique_paths.push(path);
        }
    }
    
    Ok(unique_paths)
}

// Helper function to parse corrected paths from XML response
fn parse_corrected_paths_from_xml(xml_response: &str) -> AppResult<Vec<String>> {
    // Extract corrected paths using regex
    let path_regex = Regex::new(r#"<path[^>]+original="([^"]*)"[^>]+corrected="([^"]*)"[^>]*>([^<]*)</path>"#)
        .map_err(|e| AppError::JobError(format!("Failed to create regex: {}", e)))?;
    
    let mut corrected_paths = Vec::new();
    
    for captures in path_regex.captures_iter(xml_response) {
        let corrected = captures.get(2).map_or("", |m| m.as_str()).trim();
        if !corrected.is_empty() {
            corrected_paths.push(corrected.to_string());
        }
    }
    
    // If no paths were found, try fallback parsing
    if corrected_paths.is_empty() {
        // Look for any corrected="..." attributes
        let fallback_regex = Regex::new(r#"corrected="([^"]*)""#)
            .map_err(|e| AppError::JobError(format!("Failed to create fallback regex: {}", e)))?;
        
        for captures in fallback_regex.captures_iter(xml_response) {
            if let Some(corrected) = captures.get(1) {
                let path = corrected.as_str().trim();
                if !path.is_empty() {
                    corrected_paths.push(path.to_string());
                }
            }
        }
    }
    
    Ok(corrected_paths)
}