use tauri::AppHandle;
use serde_json::json;
use std::collections::HashMap;
use log::{info, error};

use crate::error::{AppError, AppResult};
use crate::models::FetchResponse;

// File system action handlers
pub async fn handle_read_directory(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling read_directory command");
    
    if let Some(body) = &args.body {
        // Parse path from request body
        let path = body.get("path").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::ValidationError("path is required".to_string()))?;
        
        // Parse exclude patterns (optional)
        let exclude_patterns = body.get("excludePatterns")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .map(String::from)
                    .collect::<Vec<String>>()
            });
        
        // Call the appropriate function from file_service or utils
        match crate::utils::fs_utils::list_directory(path).await {
            Ok(files) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(files),
                })
            },
            Err(e) => {
                error!("Failed to read directory {}: {}", path, e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!({
                        "error": format!("Failed to read directory: {}", e)
                    }),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!({
                "error": "Request body is required"
            }),
        })
    }
}

pub async fn handle_read_file(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling read_file command");
    
    if let Some(body) = &args.body {
        // Parse path from request body
        let path = body.get("path").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::ValidationError("path is required".to_string()))?;
        
        // Call the appropriate function from file_service or utils
        match crate::utils::fs_utils::read_file_to_string(path).await {
            Ok(content) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "text/plain".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(content),
                })
            },
            Err(e) => {
                error!("Failed to read file {}: {}", path, e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!({
                        "error": format!("Failed to read file: {}", e)
                    }),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!({
                "error": "Request body is required"
            }),
        })
    }
}

pub async fn handle_write_file(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling write_file command");
    
    if let Some(body) = &args.body {
        // Parse path and content from request body
        let path = body.get("path").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::ValidationError("path is required".to_string()))?;
        
        let content = body.get("content").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::ValidationError("content is required".to_string()))?;
        
        // Call the appropriate function from file_service or utils
        match crate::utils::fs_utils::write_string_to_file(path, content).await {
            Ok(_) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!({
                        "success": true
                    }),
                })
            },
            Err(e) => {
                error!("Failed to write file {}: {}", path, e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!({
                        "error": format!("Failed to write file: {}", e)
                    }),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!({
                "error": "Request body is required"
            }),
        })
    }
}

pub async fn handle_list_files(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling list_files command");
    
    if let Some(body) = &args.body {
        // Parse path from request body
        let path = body.get("path").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::ValidationError("path is required".to_string()))?;
        
        // Call the appropriate function from file_service or utils
        match crate::utils::fs_utils::list_directory(path).await {
            Ok(files) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(files),
                })
            },
            Err(e) => {
                error!("Failed to list files in {}: {}", path, e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!({
                        "error": format!("Failed to list files: {}", e)
                    }),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!({
                "error": "Request body is required"
            }),
        })
    }
}

pub async fn handle_get_home_directory(app_handle: AppHandle) -> AppResult<FetchResponse> {
    info!("Handling get_home_directory command");
    
    match crate::utils::fs_utils::get_home_directory() {
        Ok(home_dir) => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 200,
                headers,
                body: json!({
                    "path": home_dir
                }),
            })
        },
        Err(e) => {
            error!("Failed to get home directory: {}", e);
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 500,
                headers,
                body: json!({
                    "error": format!("Failed to get home directory: {}", e)
                }),
            })
        }
    }
}

pub async fn handle_create_unique_filepath(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling create-unique-filepath command");
    
    if let Some(body) = &args.body {
        // Parse args.body into CreateUniqueFilepathArgs
        let unique_path_args = serde_json::from_value::<crate::commands::file_system_commands::CreateUniqueFilePathArgs>(
            args.body.clone().ok_or_else(|| AppError::ValidationError("Request body is required".to_string()))?
        ).map_err(|e| AppError::ValidationError(format!("Failed to parse create unique filepath args: {}", e)))?;

        // Call the Tauri command directly
        match crate::commands::file_system_commands::create_unique_filepath_command(
            unique_path_args.request_id,
            unique_path_args.session_name,
            unique_path_args.extension,
            unique_path_args.project_directory,
            unique_path_args.target_dir_name,
            app_handle.clone()
        ).await {
            Ok(unique_path) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!({ "path": unique_path }),
                })
            },
            Err(e) => {
                error!("Failed to create unique filepath: {}", e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!({
                        "error": format!("Failed to create unique filepath: {}", e)
                    }),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!({
                "error": "Request body is required"
            }),
        })
    }
}