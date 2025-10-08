use tauri::AppHandle;
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::{implementation_plan_commands, job_commands};
use serde_json::Value;

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

    match job_commands::get_all_visible_jobs_command(project_directory, session_id, app_handle.clone()).await {
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

                    let title = metadata["planTitle"].as_str().or(
                        metadata["title"].as_str()
                    );

                    let file_path = metadata["planFilePath"].as_str().or(
                        metadata["filePath"].as_str()
                    );

                    // Calculate size from response content
                    let size_bytes = job.response.as_ref().map(|r| r.len() as u64);

                    json!({
                        "id": job.id,
                        "session_id": job.session_id,
                        "task_type": job.task_type,
                        "status": job.status,
                        "title": title,
                        "file_path": file_path,
                        "created_at": job.created_at,
                        "updated_at": job.updated_at,
                        "size_bytes": size_bytes,
                    })
                })
                .collect();
            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(json!({ "plans": plans })),
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
    let plan_id = match request.params.get("planId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid planId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match implementation_plan_commands::read_implementation_plan_command(
        plan_id,
        app_handle.clone(),
    )
    .await
    {
        Ok(plan) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "plan": plan })),
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

async fn handle_plans_save(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let plan_id = match request.params.get("planId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid planId parameter".to_string()),
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
    let plan_id = match request.params.get("planId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid planId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match job_commands::cancel_background_job_command(plan_id, app_handle.clone()).await {
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
