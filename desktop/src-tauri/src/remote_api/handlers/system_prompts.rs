use tauri::AppHandle;
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::settings_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "systemPrompts.getProject" => handle_get_project(app_handle, req).await,
        "systemPrompts.setProject" => handle_set_project(app_handle, req).await,
        "systemPrompts.resetProject" => handle_reset_project(app_handle, req).await,
        "systemPrompts.getDefault" => handle_get_default(app_handle, req).await,
        "systemPrompts.isProjectCustomized" => handle_is_project_customized(app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_get_project(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let project_directory = match req.params.get("projectDirectory") {
        Some(serde_json::Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_type = match req.params.get("taskType") {
        Some(serde_json::Value::String(t)) => t.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskType parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::get_project_system_prompt_command(app_handle, project_directory, task_type).await {
        Ok(prompt) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "systemPrompt": prompt })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_set_project(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let project_directory = match req.params.get("projectDirectory") {
        Some(serde_json::Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_type = match req.params.get("taskType") {
        Some(serde_json::Value::String(t)) => t.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskType parameter".to_string()),
                is_final: true,
            };
        }
    };

    let system_prompt = match req.params.get("systemPrompt") {
        Some(serde_json::Value::String(p)) => p.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid systemPrompt parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::set_project_system_prompt_command(
        app_handle,
        project_directory,
        task_type,
        system_prompt,
    ).await {
        Ok(_) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_reset_project(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let project_directory = match req.params.get("projectDirectory") {
        Some(serde_json::Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_type = match req.params.get("taskType") {
        Some(serde_json::Value::String(t)) => t.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskType parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::reset_project_system_prompt_command(
        app_handle,
        project_directory,
        task_type,
    ).await {
        Ok(_) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_get_default(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let task_type = match req.params.get("taskType") {
        Some(serde_json::Value::String(t)) => t.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskType parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::fetch_default_system_prompt_from_server(app_handle, task_type).await {
        Ok(prompt) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "systemPrompt": prompt })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_is_project_customized(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let project_directory = match req.params.get("projectDirectory") {
        Some(serde_json::Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_type = match req.params.get("taskType") {
        Some(serde_json::Value::String(t)) => t.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskType parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::is_project_system_prompt_customized_command(
        app_handle,
        project_directory,
        task_type,
    ).await {
        Ok(is_customized) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "isCustomized": is_customized })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}
