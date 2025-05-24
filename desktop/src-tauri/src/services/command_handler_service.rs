use tauri::AppHandle;
use std::collections::HashMap;
use log::{info, debug, error};
use std::str::FromStr;
use regex::Regex;
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};
use crate::models::{FetchRequestArgs, FetchResponse};

// Handle API requests from the fetch polyfill
pub async fn handle_command(command: String, args: FetchRequestArgs, app_handle: AppHandle) -> AppResult<FetchResponse> {
    debug!("Command: {}", command);
    
    // Extract path parameter for commands that use it
    let url_parts: Vec<&str> = args.url.split('/').collect();
    let path_param = url_parts.get(url_parts.len() - 1).and_then(|p| {
        // If the last part is the command itself, there's no path parameter
        if *p == command {
            None
        } else {
            Some(*p)
        }
    });
    
    // Handle different commands
    match command.as_str() {
        // Session management
        "get_sessions" => crate::services::api_handlers::handle_get_sessions(app_handle).await,
        "get_session" => crate::services::api_handlers::handle_get_session(app_handle, path_param).await,
        "create_session" => crate::services::api_handlers::handle_create_session(app_handle, &args).await,
        "update_session" => crate::services::api_handlers::handle_update_session(app_handle, &args).await,
        "delete_session" => crate::services::api_handlers::handle_delete_session(app_handle, path_param).await,
        "get_active_session" => crate::services::api_handlers::handle_get_active_session(app_handle).await,
        "set_active_session" => crate::services::api_handlers::handle_set_active_session(app_handle, &args).await,
        
        // Background job management
        "get_jobs" => crate::services::api_handlers::handle_get_jobs(app_handle).await,
        "get_job" => crate::services::api_handlers::handle_get_job(app_handle, path_param).await,
        "get_jobs_by_session" => crate::services::api_handlers::handle_get_jobs_by_session(app_handle, path_param).await,
        "get_active_jobs" => crate::services::api_handlers::handle_get_active_jobs(app_handle).await,
        "cancel_job" => crate::services::api_handlers::handle_cancel_job(app_handle, path_param).await,
        "cancel_session_jobs" => crate::services::api_handlers::handle_cancel_session_jobs(app_handle, path_param).await,
        "update_job_cleared_status" => crate::services::api_handlers::handle_update_job_cleared_status(app_handle, &args).await,
        "clear_job_history" => crate::services::api_handlers::handle_clear_job_history(app_handle, &args).await,
        "delete_job" => crate::services::api_handlers::handle_delete_job(app_handle, path_param).await,
        
        // LLM task actions
        "create_implementation_plan" => {
            // Deserialize args.body into CreateImplementationPlanArgs
            let impl_plan_args = serde_json::from_value::<crate::commands::implementation_plan_commands::CreateImplementationPlanArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse implementation plan args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::implementation_plan_commands::create_implementation_plan_command(
                impl_plan_args.session_id,
                impl_plan_args.task_description,
                impl_plan_args.project_directory,
                impl_plan_args.relevant_files,
                impl_plan_args.project_structure,
                impl_plan_args.model,
                impl_plan_args.temperature,
                impl_plan_args.max_tokens,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result.job_id }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        "create_path_finder" => {
            // Deserialize args.body into PathFinderRequestArgs
            let path_finder_args = serde_json::from_value::<crate::commands::path_finding_commands::PathFinderRequestArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse path finder args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::path_finding_commands::find_relevant_files_command(
                path_finder_args.session_id,
                path_finder_args.task_description,
                path_finder_args.project_directory,
                path_finder_args.model_override,
                path_finder_args.temperature_override,
                path_finder_args.max_tokens_override,
                path_finder_args.options,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result.job_id }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        "create_text_improvement" => {
            // Deserialize args.body into ImproveTextArgs
            let improve_text_args = serde_json::from_value::<crate::commands::text_commands::ImproveTextArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse text improvement args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::text_commands::improve_text_command(
                improve_text_args.session_id,
                improve_text_args.text,
                improve_text_args.improvement_type,
                improve_text_args.language,
                improve_text_args.project_directory,
                improve_text_args.model_override,
                improve_text_args.temperature_override,
                improve_text_args.max_tokens_override,
                improve_text_args.target_field,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result.job_id }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        "create_voice_transcription" => {
            // Deserialize args.body into TranscribeAudioArgs
            let transcribe_args = serde_json::from_value::<crate::commands::voice_commands::TranscribeAudioArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse voice transcription args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::voice_commands::create_transcription_job_command(
                transcribe_args.session_id,
                transcribe_args.audio_data,
                transcribe_args.filename,
                transcribe_args.project_directory,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result.job_id }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        "create_voice_correction" => {
            // Deserialize args.body into CorrectTranscriptionArgs
            let correct_args = serde_json::from_value::<crate::commands::voice_commands::CorrectTranscriptionArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse voice correction args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::voice_commands::correct_transcription_command(
                correct_args.session_id,
                correct_args.text_to_correct,
                correct_args.language,
                correct_args.original_job_id,
                correct_args.project_directory,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result.job_id }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        "create_regex_generation" => {
            // Deserialize args.body into GenerateRegexArgs
            let regex_args = serde_json::from_value::<crate::commands::regex_commands::GenerateRegexArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse regex generation args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::regex_commands::generate_regex_command(
                regex_args.session_id,
                regex_args.project_directory,
                regex_args.description,
                regex_args.examples,
                regex_args.target_language,
                regex_args.model_override,
                regex_args.temperature_override,
                regex_args.max_tokens_override,
                regex_args.target_field,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        "create_guidance_generation" => {
            // Deserialize args.body into GenerateGuidanceArgs
            let guidance_args = serde_json::from_value::<crate::commands::guidance_commands::GenerateGuidanceArgs>(
                args.body.clone().ok_or(AppError::ValidationError("Request body is required".to_string()))?
            ).map_err(|e| AppError::ValidationError(format!("Failed to parse guidance generation args: {}", e)))?;
            
            // Call the Tauri command directly
            match crate::commands::guidance_commands::generate_guidance_command(
                guidance_args.session_id,
                guidance_args.project_directory,
                guidance_args.task_description,
                guidance_args.paths,
                guidance_args.file_contents_summary,
                guidance_args.system_prompt_override,
                guidance_args.model_override,
                guidance_args.temperature_override,
                guidance_args.max_tokens_override,
                app_handle.clone()
            ).await {
                Ok(result) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 201, // Created
                        headers,
                        body: json!({ "job_id": result }),
                    })
                },
                Err(e) => {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    
                    Ok(FetchResponse {
                        status: 400, // Bad Request
                        headers,
                        body: json!({ "error": e.to_string() }),
                    })
                }
            }
        },
        
        // File system actions
        "read_directory" => crate::services::api_handlers::handle_read_directory(app_handle, &args).await,
        "read_file" => crate::services::api_handlers::handle_read_file(app_handle, &args).await,
        "write_file" => crate::services::api_handlers::handle_write_file(app_handle, &args).await,
        "list_files" => crate::services::api_handlers::handle_list_files(app_handle, &args).await,
        "get_home_directory" => crate::services::api_handlers::handle_get_home_directory(app_handle).await,
        "create-unique-filepath" => crate::services::api_handlers::handle_create_unique_filepath(app_handle, &args).await,
        
        // Settings actions
        "get_settings" => crate::services::api_handlers::handle_get_settings(app_handle).await,
        "set_settings" => crate::services::api_handlers::handle_set_settings(app_handle, &args).await,
        
        // Unknown command
        _ => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 404,
                headers,
                body: json!({
                    "error": format!("Unknown command: {}", command)
                }),
            })
        }
    }
}