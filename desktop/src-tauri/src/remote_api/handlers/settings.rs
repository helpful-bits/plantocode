use tauri::AppHandle;
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::{config_commands, settings_commands};

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "settings.getProvidersWithModels" => handle_get_providers_with_models(app_handle, req).await,
        "settings.getDefaultTaskModelSettings" => handle_get_default_task_model_settings(app_handle, req).await,
        "settings.getProjectTaskModelSettings" => handle_get_project_task_model_settings(app_handle, req).await,
        "settings.setProjectTaskSetting" => handle_set_project_task_setting(app_handle, req).await,
        "settings.resetProjectTaskSetting" => handle_reset_project_task_setting(app_handle, req).await,
        "settings.getAppSetting" => handle_get_app_setting(app_handle, req).await,
        "settings.setAppSetting" => handle_set_app_setting(app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_get_providers_with_models(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match config_commands::get_providers_with_models(app_handle).await {
        Ok(providers) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "providers": providers })),
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

async fn handle_get_default_task_model_settings(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match settings_commands::get_server_default_task_model_settings_command(app_handle).await {
        Ok(settings) => {
            match serde_json::from_str::<serde_json::Value>(&settings) {
                Ok(settings_json) => RpcResponse {
                    correlation_id: req.correlation_id,
                    result: Some(settings_json),
                    error: None,
                    is_final: true,
                },
                Err(e) => RpcResponse {
                    correlation_id: req.correlation_id,
                    result: None,
                    error: Some(format!("Failed to parse settings: {}", e)),
                    is_final: true,
                },
            }
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_get_project_task_model_settings(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
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

    match settings_commands::get_project_task_model_settings_command(app_handle, project_directory).await {
        Ok(settings) => {
            match serde_json::from_str::<serde_json::Value>(&settings) {
                Ok(settings_json) => RpcResponse {
                    correlation_id: req.correlation_id,
                    result: Some(settings_json),
                    error: None,
                    is_final: true,
                },
                Err(e) => RpcResponse {
                    correlation_id: req.correlation_id,
                    result: None,
                    error: Some(format!("Failed to parse settings: {}", e)),
                    is_final: true,
                },
            }
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_set_project_task_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
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

    let task_key = match req.params.get("taskKey") {
        Some(serde_json::Value::String(key)) => key.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskKey parameter".to_string()),
                is_final: true,
            };
        }
    };

    let setting_key = match req.params.get("settingKey") {
        Some(serde_json::Value::String(key)) => key.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid settingKey parameter".to_string()),
                is_final: true,
            };
        }
    };

    let value = match req.params.get("value") {
        Some(v) => v.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing value parameter".to_string()),
                is_final: true,
            };
        }
    };

    let value_json = serde_json::to_string(&value).unwrap_or_else(|_| value.to_string());

    match settings_commands::set_project_task_setting_command(
        app_handle,
        project_directory,
        task_key,
        setting_key,
        value_json,
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

async fn handle_reset_project_task_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
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

    let task_key = match req.params.get("taskKey") {
        Some(serde_json::Value::String(key)) => key.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid taskKey parameter".to_string()),
                is_final: true,
            };
        }
    };

    let setting_key = match req.params.get("settingKey") {
        Some(serde_json::Value::String(key)) => key.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid settingKey parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::reset_project_task_setting_command(
        app_handle,
        project_directory,
        task_key,
        setting_key,
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

async fn handle_get_app_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let key = match req.params.get("key") {
        Some(serde_json::Value::String(k)) => k.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid key parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::get_app_setting(app_handle, key).await {
        Ok(value) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "value": value })),
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

async fn handle_set_app_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let key = match req.params.get("key") {
        Some(serde_json::Value::String(k)) => k.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid key parameter".to_string()),
                is_final: true,
            };
        }
    };

    let value = match req.params.get("value") {
        Some(serde_json::Value::String(v)) => v.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid value parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::set_app_setting(app_handle, key, value).await {
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
