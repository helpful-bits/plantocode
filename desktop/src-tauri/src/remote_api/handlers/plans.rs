use tauri::{AppHandle, Manager};
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::{implementation_plan_commands, job_commands};
use serde_json::Value;
use std::sync::Arc;
use crate::db_utils::SessionRepository;
use log::{debug, warn};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::collections::HashMap;

struct CacheEntry {
    inserted_at: Instant,
    value: serde_json::Value,
}

static PLANS_LIST_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CACHE_TTL: Duration = Duration::from_millis(750);
const MAX_ENTRIES: usize = 128;

fn utf8_safe_slice(s: &str, start: usize, end: usize) -> String {
    let len = s.len();
    let mut s_start = start.min(len);
    let mut s_end = end.min(len);
    while s_start < len && !s.is_char_boundary(s_start) { s_start += 1; }
    while s_end > s_start && !s.is_char_boundary(s_end) { s_end -= 1; }
    s[s_start..s_end].to_string()
}

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "plans.list" => handle_plans_list(&app_handle, req).await,
        "plans.get" => handle_plans_get(&app_handle, req).await,
        "plans.save" => handle_plans_save(&app_handle, req).await,
        "plans.activate" => handle_plans_activate(&app_handle, req).await,
        "plans.delete" => handle_plans_delete(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

// MARK: - Session-based Project Directory Resolution
// When sessionId is provided, we resolve the canonical project directory
// from the session record to prevent path normalization mismatches.
// This follows the same pattern used in prompt commands.
// Fallback to None returns all visible jobs; mobile filters client-side.
async fn handle_plans_list(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Require sessionId to be present
    let session_id = match session_id {
        Some(id) if !id.is_empty() => id,
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing required sessionId".to_string()),
                is_final: true,
            };
        }
    };

    // Resolve effective project directory from session - no fallbacks
    let pool = app_handle.state::<sqlx::SqlitePool>().inner().clone();
    let session_repo = SessionRepository::new(Arc::new(pool));
    let effective_project_directory = match session_repo.get_session_by_id(&session_id).await {
        Ok(Some(session)) => {
            debug!("Validated session {} with project directory {}", session_id, session.project_directory);
            Some(session.project_directory)
        },
        Ok(None) => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Invalid sessionId: not found".to_string()),
                is_final: true,
            };
        },
        Err(_) => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Invalid sessionId: not found".to_string()),
                is_final: true,
            };
        }
    };

    // Build cache key
    let cache_key = format!(
        "plans::{}::{}",
        effective_project_directory.as_deref().unwrap_or(""),
        session_id
    );

    // Check cache
    {
        let cache = PLANS_LIST_CACHE.lock().unwrap();
        if let Some(entry) = cache.get(&cache_key) {
            if entry.inserted_at.elapsed() < CACHE_TTL {
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: Some(entry.value.clone()),
                    error: None,
                    is_final: true,
                };
            }
        }
    }

    // Execute actual query
    match job_commands::get_all_visible_jobs_command_with_content(
        effective_project_directory,
        Some(session_id.clone()),
        false,
        app_handle.clone()
    ).await {
        Ok(jobs) => {
            let plans: Vec<serde_json::Value> = jobs
                .into_iter()
                .filter(|job| job.task_type == "implementation_plan" || job.task_type == "implementation_plan_merge")
                .map(|job| {
                    // Parse metadata to extract title, file_path, etc.
                    let metadata: serde_json::Value = job.metadata
                        .as_ref()
                        .and_then(|m| serde_json::from_str(m).ok())
                        .unwrap_or(json!({}));

                    let title = metadata["planTitle"].as_str()
                        .or(metadata["generated_title"].as_str())
                        .or(metadata["title"].as_str());

                    let file_path = metadata["planFilePath"].as_str().or(
                        metadata["filePath"].as_str()
                    );

                    // Content-free listing; no size calculation from response
                    let size_bytes = None::<u64>;

                    json!({
                        "id": job.id,
                        "sessionId": job.session_id,
                        "taskType": job.task_type,
                        "status": job.status,
                        "title": title,
                        "filePath": file_path,
                        "createdAt": job.created_at,
                        "updatedAt": job.updated_at,
                        "sizeBytes": size_bytes,
                        "tokensSent": job.tokens_sent,
                        "tokensReceived": job.tokens_received,
                    })
                })
                .collect();

            let result_value = json!({ "plans": plans });

            // Store in cache
            {
                let mut cache = PLANS_LIST_CACHE.lock().unwrap();
                if cache.len() >= MAX_ENTRIES {
                    // Evict oldest
                    if let Some(oldest_key) = cache.iter().min_by_key(|(_, v)| v.inserted_at).map(|(k, _)| k.clone()) {
                        cache.remove(&oldest_key);
                    }
                }
                cache.insert(cache_key, CacheEntry {
                    inserted_at: Instant::now(),
                    value: result_value.clone(),
                });
            }

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(result_value),
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

async fn handle_plans_get(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // Read-only handler; NEVER mutate job.response. Content returned verbatim, only sliced on UTF-8 boundaries for transport.

    let plan_id = match request.params.get("planId").or_else(|| request.params.get("id")) {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid planId/id parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Parse optional chunking parameters
    let chunk_size = request.params.get("chunkSize")
        .and_then(|v| v.as_u64());

    let chunk_index = request.params.get("chunkIndex")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    match implementation_plan_commands::read_implementation_plan_command(
        plan_id,
        app_handle.clone(),
    )
    .await
    {
        Ok(plan) => {
            // Extract content and compute total size
            let content = plan.content
                .clone()
                .unwrap_or_default();

            let total_size = content.len();

            // Check if chunking is requested and needed
            if let Some(chunk_sz) = chunk_size {
                if total_size as u64 > chunk_sz {
                    // Calculate chunk boundaries
                    let total_chunks = ((total_size as f64) / (chunk_sz as f64)).ceil() as u64;
                    let start_byte = ((chunk_index * chunk_sz).min(total_size as u64)) as usize;
                    let end_byte = ((start_byte as u64 + chunk_sz).min(total_size as u64)) as usize;

                    // Get UTF-8 safe chunk
                    let chunk_str = utf8_safe_slice(&content, start_byte, end_byte);

                    // Build chunked response
                    let response = json!({
                        "id": plan.id,
                        "title": plan.title,
                        "description": plan.description,
                        "content": chunk_str,
                        "contentFormat": plan.content_format,
                        "createdAt": plan.created_at,
                        "status": plan.status,
                        "isChunked": true,
                        "chunkInfo": {
                            "chunkIndex": chunk_index,
                            "totalChunks": total_chunks,
                            "chunkSize": chunk_sz,
                            "totalSize": total_size,
                            "hasMore": chunk_index < total_chunks - 1
                        },
                        "sizeBytes": total_size
                    });

                    return RpcResponse {
                        correlation_id: request.correlation_id,
                        result: Some(json!({ "plan": response })),
                        error: None,
                        is_final: true,
                    };
                }
            }

            // No chunking - return full content
            let response = json!({
                "id": plan.id,
                "title": plan.title,
                "description": plan.description,
                "content": plan.content,
                "contentFormat": plan.content_format,
                "createdAt": plan.created_at,
                "status": plan.status,
                "isChunked": false,
                "sizeBytes": total_size
            });

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(json!({ "plan": response })),
                error: None,
                is_final: true,
            }
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_plans_save(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let plan_id = match request.params.get("planId").or_else(|| request.params.get("id")) {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid planId/id parameter".to_string()),
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

    match implementation_plan_commands::update_implementation_plan_content_command(
        plan_id,
        content,
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

async fn handle_plans_activate(_app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: None,
        error: Some("Plan activation not implemented".to_string()),
        is_final: true,
    }
}

async fn handle_plans_delete(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let plan_id = match request.params.get("planId").or_else(|| request.params.get("id")) {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid planId/id parameter".to_string()),
                is_final: true,
            };
        }
    };

    match job_commands::delete_background_job_command(plan_id, app_handle.clone()).await {
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
