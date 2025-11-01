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
use crate::utils::hash_utils::generate_project_hash;

struct CacheEntry {
    inserted_at: Instant,
    value: serde_json::Value,
}

struct SessionProjectEntry {
    inserted_at: Instant,
    project_cache_key: String,
}

static JOB_LIST_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CACHE_TTL: Duration = Duration::from_secs(2);
const MAX_ENTRIES: usize = 128;

const MAX_SESSION_MAP_ENTRIES: usize = 512;
static SESSION_PROJECT_MAP: Lazy<Mutex<HashMap<String, SessionProjectEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn invalidate_job_list_cache_for_session(session_id: &str) {
    // Remove session-scoped cache key
    let session_key = format!("jobs::session::{}", session_id);
    {
        let mut cache = JOB_LIST_CACHE.lock().unwrap();
        cache.remove(&session_key);
    }

    // Remove mapped project-scoped cache key
    let maybe_project_key = {
        let mut map = SESSION_PROJECT_MAP.lock().unwrap();
        map.remove(session_id).map(|e| e.project_cache_key)
    };

    if let Some(project_key) = maybe_project_key {
        let mut cache = JOB_LIST_CACHE.lock().unwrap();
        cache.remove(&project_key);
    }
}

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
    let mut project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if matches!(project_directory.as_deref(), Some("")) {
        project_directory = None;
    }

    let mut session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if matches!(session_id.as_deref(), Some("")) {
        session_id = None;
    }

    if session_id.is_none() && project_directory.is_none() {
        return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing required sessionId or projectDirectory".to_string()),
            is_final: true,
        };
    }

    let cache_key = if let Some(ref session_id) = session_id {
        format!("jobs::session::{}", session_id)
    } else {
        let dir = project_directory
            .as_ref()
            .expect("projectDirectory must be present when sessionId is missing");
        let hash = generate_project_hash(dir);
        format!("jobs::project::{}", hash)
    };

    // Fast path: return cached result without DB lookup
    {
        let cache = JOB_LIST_CACHE.lock().unwrap();
        if let Some(entry) = cache.get(&cache_key) {
            if entry.inserted_at.elapsed() < CACHE_TTL {
                log::debug!("Cache hit for key {}, skipping DB validation", cache_key);
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: Some(entry.value.clone()),
                    error: None,
                    is_final: true,
                };
            }
        }
    }

    // Cache miss: ensure we have the right scope and fetch jobs
    // Track effective project directory for session→project mapping
    let mut effective_project_directory: Option<String> = None;
    
    let jobs_result = if let Some(session_id) = session_id.clone() {
        // Resolve effective project directory from session to maintain existing invariants
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
        let resolved_dir = match session_repo.get_session_by_id(&session_id).await {
            Ok(Some(session)) => {
                log::debug!(
                    "Validated session {} with project directory {}",
                    session_id,
                    session.project_directory
                );
                Some(session.project_directory)
            }
            Ok(None) | Err(_) => {
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: None,
                    error: Some("Invalid sessionId: not found".to_string()),
                    is_final: true,
                };
            }
        };

        // Store for mapping
        effective_project_directory = resolved_dir.clone();

        job_commands::get_all_visible_jobs_command_with_content(
            resolved_dir,
            Some(session_id),
            true,
            app_handle.clone(),
        )
        .await
    } else {
        let project_directory = project_directory
            .clone()
            .expect("projectDirectory must be present when sessionId is missing");

        job_commands::get_all_visible_jobs_command_with_content(
            Some(project_directory),
            None,
            true,
            app_handle.clone(),
        )
        .await
    };

    match jobs_result {
        Ok(jobs) => {
            let result_value = json!({ "jobs": jobs });

            // Store in cache and update session→project mapping
            {
                let mut cache = JOB_LIST_CACHE.lock().unwrap();
                if cache.len() >= MAX_ENTRIES {
                    // Evict oldest
                    if let Some(oldest_key) = cache.iter().min_by_key(|(_, v)| v.inserted_at).map(|(k, _)| k.clone()) {
                        // Clean up SESSION_PROJECT_MAP if we're evicting a session key
                        if let Some(session_id) = oldest_key.strip_prefix("jobs::session::") {
                            let mut map = SESSION_PROJECT_MAP.lock().unwrap();
                            map.remove(session_id);
                        }
                        cache.remove(&oldest_key);
                    }
                }
                cache.insert(cache_key.clone(), CacheEntry {
                    inserted_at: Instant::now(),
                    value: result_value.clone(),
                });
            }

            // Update SESSION_PROJECT_MAP if this was a session-scoped query
            if let Some(ref session_id) = session_id {
                // Compute project key for mapping using effective project directory
                if let Some(ref proj_dir) = effective_project_directory {
                    let project_hash = generate_project_hash(proj_dir);
                    let project_key = format!("jobs::project::{}", project_hash);
                    
                    let mut map = SESSION_PROJECT_MAP.lock().unwrap();
                    // Evict oldest if at capacity
                    if map.len() >= MAX_SESSION_MAP_ENTRIES {
                        if let Some(old_k) = map.iter().min_by_key(|(_, v)| v.inserted_at).map(|(k, _)| k.clone()) {
                            map.remove(&old_k);
                        }
                    }
                    map.insert(session_id.clone(), SessionProjectEntry {
                        inserted_at: Instant::now(),
                        project_cache_key: project_key,
                    });
                }
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
