use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::file_system_commands;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

// Cache configuration
const MAX_CACHE_ENTRIES: usize = 256;
const CACHE_TTL_MS: u64 = 1000;

#[derive(Clone, Debug)]
struct CacheEntry {
    inserted_at: Instant,
    value: serde_json::Value,
}

#[derive(Clone, Debug, Hash, Eq, PartialEq)]
struct CacheKey {
    project_directory: String,
    query: String,
    include_content: bool,
    max_results: u32,
}

static SEARCH_CACHE: Lazy<Mutex<HashMap<CacheKey, CacheEntry>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "fs.getHomeDirectory" => handle_fs_get_home_directory(&app_handle, req).await,
        "fs.listProjectFiles" => handle_fs_list_project_files(&app_handle, req).await,
        "fs.readFileContent" => handle_fs_read_file_content(&app_handle, req).await,
        "fs.writeFileContent" => handle_fs_write_file_content(&app_handle, req).await,
        "fs.createDirectory" => handle_fs_create_directory(&app_handle, req).await,
        "fs.deleteFile" => handle_fs_delete_file(&app_handle, req).await,
        "files.search" => handle_files_search(&app_handle, req).await,
        "files.getMetadata" => handle_files_get_metadata(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_fs_get_home_directory(_app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    match file_system_commands::get_home_directory_command() {
        Ok(home_dir) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "homeDirectory": home_dir })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_fs_list_project_files(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    match file_system_commands::list_project_files_command(project_directory, app_handle.clone())
        .await
    {
        Ok(files) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "files": files })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_fs_read_file_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_path = match request.params.get("filePath") {
        Some(Value::String(path)) => path.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid filePath parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: path, project_directory, encoding, app_handle
    match file_system_commands::read_file_content_command(file_path, None, None, app_handle.clone())
        .await
    {
        Ok(content) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "content": content })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_fs_write_file_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_path = match request.params.get("filePath") {
        Some(Value::String(path)) => path.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid filePath parameter".to_string()),
                is_final: true,
            };
        }
    };

    let content = match request.params.get("content") {
        Some(Value::String(content)) => content.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid content parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: path, content, project_directory, app_handle
    match file_system_commands::write_file_content_command(
        file_path,
        content,
        None,
        app_handle.clone(),
    )
    .await
    {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_fs_create_directory(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let directory_path = match request.params.get("directoryPath") {
        Some(Value::String(path)) => path.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid directoryPath parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: path, project_directory, app_handle
    match file_system_commands::create_directory_command(directory_path, None, app_handle.clone())
        .await
    {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_fs_delete_file(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_path = match request.params.get("filePath") {
        Some(Value::String(path)) => path.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid filePath parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: path, project_directory, app_handle
    match file_system_commands::delete_file_command(file_path, None, app_handle.clone()).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_files_search(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let query = match request.params.get("query") {
        Some(Value::String(q)) => q.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid query parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Empty queries return all files (useful for listing all project files)

    let include_content = request
        .params
        .get("includeContent")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let max_results = request
        .params
        .get("maxResults")
        .and_then(|v| v.as_u64())
        .map(|u| u as u32)
        .unwrap_or(100);

    // Create cache key
    let cache_key = CacheKey {
        project_directory: project_directory.clone(),
        query: query.to_lowercase(),
        include_content,
        max_results,
    };

    // Check cache
    if let Ok(mut cache) = SEARCH_CACHE.lock() {
        if let Some(entry) = cache.get(&cache_key) {
            let age = entry.inserted_at.elapsed();
            if age < Duration::from_millis(CACHE_TTL_MS) {
                // Cache hit
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: Some(entry.value.clone()),
                    error: None,
                    is_final: true,
                };
            } else {
                // Entry expired, remove it
                cache.remove(&cache_key);
            }
        }
    }

    // Call search command
    match file_system_commands::search_files_command(
        app_handle.clone(),
        project_directory,
        query,
        Some(include_content),
        Some(max_results),
    )
    .await
    {
        Ok(result) => {
            // Store in cache
            if let Ok(mut cache) = SEARCH_CACHE.lock() {
                // Evict oldest entry if cache is full
                if cache.len() >= MAX_CACHE_ENTRIES {
                    if let Some(oldest_key) = cache
                        .iter()
                        .min_by_key(|(_, entry)| entry.inserted_at)
                        .map(|(key, _)| key.clone())
                    {
                        cache.remove(&oldest_key);
                    }
                }

                // Insert new entry
                cache.insert(
                    cache_key,
                    CacheEntry {
                        inserted_at: Instant::now(),
                        value: result.clone(),
                    },
                );
            }

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(result),
                error: None,
                is_final: true,
            }
        }
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_files_get_metadata(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_paths = match request.params.get("filePaths") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid filePaths parameter".to_string()),
                is_final: true,
            };
        }
    };

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(String::from);

    match file_system_commands::get_files_metadata_command(
        file_paths,
        project_directory,
        app_handle.clone(),
    )
    .await
    {
        Ok(metadata) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "metadata": metadata })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}
