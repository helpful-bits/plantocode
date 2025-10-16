use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::job_commands;
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use crate::db_utils::SessionRepository;
use std::sync::Arc;

struct CacheEntry {
    inserted_at: Instant,
    value: serde_json::Value,
}

static JOB_LIST_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CACHE_TTL: Duration = Duration::from_secs(5);
const MAX_ENTRIES: usize = 128;

// Job list filtering architecture:
//
// This handler implements server-side filtering to ensure all clients receive
// pre-filtered, session-scoped job data. This approach eliminates:
// - Client-side filtering complexity
// - UI flicker from over-fetching (100 jobs → 15 after filtering)
// - Inconsistent filtering logic across multiple client platforms
//
// Filtering strategy:
// 1. Workflow exclusion: Filter out internal orchestrator jobs
//    (file_finder_workflow, web_search_workflow) at the SQL query level
//    for optimal performance
//
// This pattern mirrors the implementation in plans.rs and ensures
// mobile and desktop clients operate on identical, pre-filtered datasets.

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "job.list" => handle_job_list(&app_handle, req).await,
        "job.get" => handle_job_get(&app_handle, req).await,
        "job.cancel" => handle_job_cancel(&app_handle, req).await,
        "job.delete" => handle_job_delete(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_job_list(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
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

    // OPTIMIZATION: Check cache BEFORE session validation to avoid DB lookup
    // Build preliminary cache key using session_id directly
    let preliminary_cache_key = format!(
        "jobs::session::{}",
        session_id
    );

    // Fast path: return cached result without DB lookup
    {
        let cache = JOB_LIST_CACHE.lock().unwrap();
        if let Some(entry) = cache.get(&preliminary_cache_key) {
            if entry.inserted_at.elapsed() < CACHE_TTL {
                log::debug!("Cache hit for session {}, skipping DB validation", session_id);
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: Some(entry.value.clone()),
                    error: None,
                    is_final: true,
                };
            }
        }
    }

    // Cache miss: validate session and fetch jobs
    // Resolve effective project directory from session - no fallbacks
    let pool = match app_handle.try_state::<Arc<sqlx::SqlitePool>>() {
        Some(p) => p.inner().clone(),
        None => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Database not available".to_string()),
                is_final: true,
            };
        }
    };
    let session_repo = SessionRepository::new(pool.clone());
    let effective_project_directory = match session_repo.get_session_by_id(&session_id).await {
        Ok(Some(session)) => {
            log::debug!("Validated session {} with project directory {}", session_id, session.project_directory);
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

    // Execute actual query
    match job_commands::get_all_visible_jobs_command_with_content(
        effective_project_directory,
        Some(session_id.clone()),
        true,
        app_handle.clone()
    ).await {
        Ok(jobs) => {
            let result_value = json!({ "jobs": jobs });

            // Store in cache using preliminary key (no project_directory needed)
            {
                let mut cache = JOB_LIST_CACHE.lock().unwrap();
                if cache.len() >= MAX_ENTRIES {
                    // Evict oldest
                    if let Some(oldest_key) = cache.iter().min_by_key(|(_, v)| v.inserted_at).map(|(k, _)| k.clone()) {
                        cache.remove(&oldest_key);
                    }
                }
                cache.insert(preliminary_cache_key, CacheEntry {
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

async fn handle_job_get(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid jobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: job_id, app_handle
    match job_commands::get_background_job_by_id_command(job_id.clone(), app_handle.clone()).await {
        Ok(Some(job)) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "job": job })),
            error: None,
            is_final: true,
        },
        Ok(None) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Job not found: {}", job_id)),
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

async fn handle_job_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid jobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: job_id, app_handle
    match job_commands::cancel_background_job_command(job_id, app_handle.clone()).await {
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

async fn handle_job_delete(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid jobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match job_commands::delete_background_job_command(job_id, app_handle.clone()).await {
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
