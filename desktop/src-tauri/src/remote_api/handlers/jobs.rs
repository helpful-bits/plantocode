use tauri::{AppHandle, Emitter, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::job_commands;
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use crate::db_utils::BackgroundJobRepository;
use std::sync::Arc;
use crate::utils::hash_utils::generate_project_hash;

const MAX_PAGE_SIZE: u32 = 200;
const DEFAULT_PAGE_SIZE: u32 = 50;

fn optional_string_vec(params: &Value, key: &str) -> RpcResult<Option<Vec<String>>> {
    match params.get(key) {
        None => Ok(None),
        Some(Value::Null) => Ok(None),
        Some(Value::Array(arr)) => {
            let mut result = Vec::with_capacity(arr.len());
            for (i, item) in arr.iter().enumerate() {
                match item.as_str() {
                    Some(s) => result.push(s.to_string()),
                    None => {
                        return Err(RpcError::invalid_params(format!(
                            "{}[{}] must be a string",
                            key, i
                        )));
                    }
                }
            }
            Ok(Some(result))
        }
        Some(_) => Err(RpcError::invalid_params(format!(
            "{} must be an array of strings",
            key
        ))),
    }
}

fn optional_u32(params: &Value, key: &str) -> RpcResult<Option<u32>> {
    match params.get(key) {
        None => Ok(None),
        Some(Value::Null) => Ok(None),
        Some(v) => {
            if let Some(n) = v.as_u64() {
                if n <= u32::MAX as u64 {
                    Ok(Some(n as u32))
                } else {
                    Err(RpcError::invalid_params(format!("{} exceeds maximum value", key)))
                }
            } else if let Some(n) = v.as_i64() {
                if n >= 0 && n <= u32::MAX as i64 {
                    Ok(Some(n as u32))
                } else {
                    Err(RpcError::invalid_params(format!("{} must be a non-negative integer", key)))
                }
            } else {
                Err(RpcError::invalid_params(format!("{} must be an integer", key)))
            }
        }
    }
}

struct CacheEntry {
    inserted_at: Instant,
    value: serde_json::Value,
}

static JOB_LIST_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CACHE_TTL: Duration = Duration::from_secs(2);
const MAX_ENTRIES: usize = 128;

pub fn invalidate_job_list_cache_for_session(session_id: &str) {
    let session_prefix = format!("jobs::session::{}::", session_id);
    let mut cache = JOB_LIST_CACHE.lock().unwrap();
    cache.retain(|key, _| !key.starts_with(&session_prefix));
}

fn invalidate_job_list_cache_for_project_hash(project_hash: &str) {
    let project_prefix = format!("jobs::project::{}::", project_hash);
    let mut cache = JOB_LIST_CACHE.lock().unwrap();
    cache.retain(|key, _| !key.starts_with(&project_prefix));
}

pub fn invalidate_job_list_for_project(app_handle: &AppHandle, project_hash: &str) {
    invalidate_job_list_cache_for_project_hash(project_hash);
    let _ = app_handle.emit("device-link-event", json!({
        "type": "jobs:list-invalidated",
        "payload": { "projectHash": project_hash }
    }));
}

pub fn invalidate_job_list_for_session(app_handle: &AppHandle, session_id: &str) {
    invalidate_job_list_cache_for_session(session_id);
    let _ = app_handle.emit("device-link-event", json!({
        "type": "jobs:list-invalidated",
        "payload": { "sessionId": session_id }
    }));
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
    let correlation_id = req.correlation_id.clone();
    let result = match req.method.as_str() {
        "job.list" => handle_job_list(&app_handle, req).await,
        "job.get" => handle_job_get(&app_handle, req).await,
        "job.cancel" => handle_job_cancel(&app_handle, req).await,
        "job.delete" => handle_job_delete(&app_handle, req).await,
        "job.updateContent" => handle_job_update_content(&app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    };

    match result {
        Ok(value) => RpcResponse {
            correlation_id,
            result: Some(value),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_job_list(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
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

    if session_id.is_some() {
        project_directory = None;
    }

    let bypass_cache = request
        .params
        .get("bypassCache")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let include_content = request
        .params
        .get("includeContent")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let status_filter = optional_string_vec(&request.params, "statusFilter")?;
    let task_type_filter = optional_string_vec(&request.params, "taskTypeFilter")?;
    let page = optional_u32(&request.params, "page")?.unwrap_or(0);
    let mut page_size = optional_u32(&request.params, "pageSize")?.unwrap_or(DEFAULT_PAGE_SIZE);
    if page_size > MAX_PAGE_SIZE {
        page_size = MAX_PAGE_SIZE;
    }
    if page_size == 0 {
        page_size = DEFAULT_PAGE_SIZE;
    }

    log::debug!("[job.list] Received params: session_id={:?}, project_directory={:?}, bypass_cache={}", session_id, project_directory, bypass_cache);

    if session_id.is_none() && project_directory.is_none() {
        return Err(RpcError::invalid_params("Missing required sessionId or projectDirectory"));
    }

    let pool = app_handle.try_state::<Arc<sqlx::SqlitePool>>()
        .ok_or_else(|| RpcError::database_error("Database not available"))?
        .inner()
        .clone();

    let project_hash = if session_id.is_none() {
        project_directory.as_ref().map(|dir| generate_project_hash(dir))
    } else {
        None
    };

    let cache_key = {
        let scope = if let Some(ref sid) = session_id {
            format!("session::{}", sid)
        } else {
            let hash = project_hash.as_ref().expect("project_hash must be present when sessionId is missing");
            format!("project::{}", hash)
        };
        let status_str = status_filter.as_ref().map(|v| v.join(",")).unwrap_or_default();
        let task_type_str = task_type_filter.as_ref().map(|v| v.join(",")).unwrap_or_default();
        format!("jobs::{}::p{}::s{}::st[{}]::tt[{}]::ic{}", scope, page, page_size, status_str, task_type_str, include_content)
    };

    if !bypass_cache {
        let cache = JOB_LIST_CACHE.lock().unwrap();
        if let Some(entry) = cache.get(&cache_key) {
            if entry.inserted_at.elapsed() < CACHE_TTL {
                return Ok(entry.value.clone());
            }
        }
    }

    let job_repo = BackgroundJobRepository::new(pool.clone());

    let effective_project_hash = if session_id.is_some() {
        None
    } else if let Some(ref ph) = project_hash {
        Some(ph.clone())
    } else {
        None
    };

    let result_value = if include_content {
        let (jobs_result, total_count, has_more) = job_repo
            .get_jobs_filtered(
                effective_project_hash,
                session_id.clone(),
                status_filter,
                task_type_filter,
                page,
                page_size,
            )
            .await
            .map_err(RpcError::from)?;

        // Explicitly type as Vec to guarantee stable envelope fields
        let jobs: Vec<_> = jobs_result;

        json!({
            "jobs": jobs,
            "totalCount": total_count,
            "page": page,
            "pageSize": page_size,
            "hasMore": has_more
        })
    } else {
        let (summaries_result, total_count, has_more) = job_repo
            .get_job_summaries_filtered(
                effective_project_hash,
                session_id.clone(),
                status_filter,
                task_type_filter,
                page,
                page_size,
            )
            .await
            .map_err(RpcError::from)?;

        // Explicitly type as Vec to guarantee stable envelope fields
        let jobs: Vec<_> = summaries_result;

        json!({
            "jobs": jobs,
            "totalCount": total_count,
            "page": page,
            "pageSize": page_size,
            "hasMore": has_more
        })
    };

    {
        let mut cache = JOB_LIST_CACHE.lock().unwrap();
        if cache.len() >= MAX_ENTRIES {
            if let Some(oldest_key) = cache.iter().min_by_key(|(_, v)| v.inserted_at).map(|(k, _)| k.clone()) {
                cache.remove(&oldest_key);
            }
        }
        cache.insert(cache_key, CacheEntry {
            inserted_at: Instant::now(),
            value: result_value.clone(),
        });
    }

    Ok(result_value)
}

async fn handle_job_get(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let job_id = request.params.get("jobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: jobId"))?
        .to_string();

    // Fixed parameter order: job_id, app_handle
    let job = job_commands::get_background_job_by_id_command(job_id.clone(), app_handle.clone())
        .await
        .map_err(RpcError::from)?
        .ok_or_else(|| RpcError::not_found(format!("Job not found: {}", job_id)))?;

    Ok(json!({ "job": job }))
}

async fn handle_job_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let job_id = request.params.get("jobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: jobId"))?
        .to_string();

    // Fixed parameter order: job_id, app_handle
    job_commands::cancel_background_job_command(job_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_job_delete(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let job_id = request.params.get("jobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: jobId"))?
        .to_string();

    job_commands::delete_background_job_command(job_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_job_update_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let job_id = request.params.get("jobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: jobId"))?
        .to_string();

    let content = request.params.get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: content"))?
        .to_string();

    crate::commands::implementation_plan_commands::update_implementation_plan_content_command(
        job_id,
        content,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}
