use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use crate::commands::{
    file_system_commands, session_commands, job_commands,
    workflow_commands, app_commands, implementation_plan_commands,
    web_search_commands, generic_task_commands, terminal_commands
};
use crate::models::CreateSessionRequest;
use log::{info, warn, error, debug};
use serde_json::{Value, json};
use tauri::AppHandle;
use chrono::Utc;
use base64;

/// Dispatch RPC requests to appropriate handlers
///
/// This function routes incoming RPC requests to the appropriate handler
/// based on the method name in the request.
pub async fn dispatch(
    app_handle: &AppHandle,
    request: RpcRequest,
    user_context: &UserContext,
) -> RpcResponse {
    info!("Dispatching RPC request: method={}, correlation_id={}", request.method, request.correlation_id);
    debug!("User context: user_id={}, device_id={}", user_context.user_id, user_context.device_id);

    // Check user permissions for certain operations
    if !user_context.permissions.contains(&"rpc".to_string()) {
        return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Insufficient permissions for RPC operations".to_string()),
        };
    }

    match request.method.as_str() {
        // Basic utility methods
        "ping" => handle_ping(request).await,
        "echo" => handle_echo(request).await,
        "get_status" => handle_get_status(request).await,

        // File system operations
        "fs.getHomeDirectory" => handle_fs_get_home_directory(app_handle, request).await,
        "fs.listProjectFiles" => handle_fs_list_project_files(app_handle, request).await,
        "fs.readFileContent" => handle_fs_read_file_content(app_handle, request).await,
        "fs.writeFileContent" => handle_fs_write_file_content(app_handle, request).await,
        "fs.createDirectory" => handle_fs_create_directory(app_handle, request).await,
        "fs.deleteFile" => handle_fs_delete_file(app_handle, request).await,
        "files.search" => handle_files_search(app_handle, request).await,

        // Session management
        "session.create" => handle_session_create(app_handle, request).await,
        "session.get" => handle_session_get(app_handle, request).await,
        "session.list" => handle_session_list(app_handle, request).await,
        "session.update" => handle_session_update(app_handle, request).await,
        "session.delete" => handle_session_delete(app_handle, request).await,

        // Job management
        "job.list" => handle_job_list(app_handle, request).await,
        "job.get" => handle_job_get(app_handle, request).await,
        "job.cancel" => handle_job_cancel(app_handle, request).await,

        // Workflow operations
        "workflow.getStatus" => handle_workflow_get_status(app_handle, request).await,
        "workflow.cancel" => handle_workflow_cancel(app_handle, request).await,
        "workflow.getResults" => handle_workflow_get_results(app_handle, request).await,

        // App information
        "app.getInfo" => handle_app_get_info(app_handle, request).await,

        // Terminal operations
        "terminal.start" => handle_terminal_start(app_handle, request).await,
        "terminal.write" => handle_terminal_write(app_handle, request).await,
        "terminal.resize" => handle_terminal_resize(app_handle, request).await,
        "terminal.kill" => handle_terminal_kill(app_handle, request).await,
        "terminal.sendCtrlC" => handle_terminal_send_ctrl_c(app_handle, request).await,
        "terminal.detach" => handle_terminal_detach(app_handle, request).await,

        // Action endpoints
        "actions.readImplementationPlan" => handle_actions_read_implementation_plan(app_handle, request).await,
        "actions.findRelevantFiles" => handle_actions_find_relevant_files(app_handle, request).await,
        "actions.createImplementationPlan" => handle_actions_create_implementation_plan(app_handle, request).await,
        "actions.deepResearch" => handle_actions_deep_research(app_handle, request).await,
        "actions.mergePlans" => handle_actions_merge_plans(app_handle, request).await,
        "actions.refineTaskDescription" => handle_actions_refine_task_description(app_handle, request).await,
        "actions.continueWebSearchFromJob" => handle_actions_continue_web_search_from_job(app_handle, request).await,
        "actions.retryWorkflowStage" => handle_actions_retry_workflow_stage(app_handle, request).await,
        "actions.cancelWorkflowStage" => handle_actions_cancel_workflow_stage(app_handle, request).await,

        // Workflow operations
        "workflows.startFileFinder" => handle_workflows_start_file_finder(app_handle, request).await,
        "workflows.startWebSearch" => handle_workflows_start_web_search(app_handle, request).await,

        _ => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", request.method)),
        }
    }
}

/// Handle ping request
async fn handle_ping(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(serde_json::json!({
            "message": "pong",
            "timestamp": Utc::now().to_rfc3339()
        })),
        error: None,
    }
}

/// Handle echo request
async fn handle_echo(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(request.params),
        error: None,
    }
}

/// Handle get status request
async fn handle_get_status(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(serde_json::json!({
            "status": "online",
            "version": "1.0.0",
            "timestamp": Utc::now().to_rfc3339(),
            "capabilities": [
                "websocket",
                "rpc",
                "authentication",
                "filesystem",
                "sessions",
                "jobs",
                "workflows"
            ]
        })),
        error: None,
    }
}

// File System Handlers

async fn handle_fs_get_home_directory(_app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    match file_system_commands::get_home_directory_command() {
        Ok(home_dir) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "homeDirectory": home_dir })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

async fn handle_fs_list_project_files(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    match file_system_commands::list_project_files_command(project_directory, app_handle.clone()).await {
        Ok(files) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "files": files })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

async fn handle_fs_read_file_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_path = match request.params.get("filePath") {
        Some(Value::String(path)) => path.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid filePath parameter".to_string()),
        },
    };

    // Fixed parameter order: path, project_directory, encoding, app_handle
    match file_system_commands::read_file_content_command(file_path, None, None, app_handle.clone()).await {
        Ok(content) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "content": content })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_fs_write_file_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_path = match request.params.get("filePath") {
        Some(Value::String(path)) => path.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid filePath parameter".to_string()),
        },
    };

    let content = match request.params.get("content") {
        Some(Value::String(content)) => content.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid content parameter".to_string()),
        },
    };

    // Fixed parameter order: path, content, project_directory, app_handle
    match file_system_commands::write_file_content_command(file_path, content, None, app_handle.clone()).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_fs_create_directory(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let directory_path = match request.params.get("directoryPath") {
        Some(Value::String(path)) => path.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid directoryPath parameter".to_string()),
        },
    };

    // Fixed parameter order: path, project_directory, app_handle
    match file_system_commands::create_directory_command(directory_path, None, app_handle.clone()).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_fs_delete_file(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let file_path = match request.params.get("filePath") {
        Some(Value::String(path)) => path.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid filePath parameter".to_string()),
        },
    };

    // Fixed parameter order: path, project_directory, app_handle
    match file_system_commands::delete_file_command(file_path, None, app_handle.clone()).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_files_search(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    let query = match request.params.get("query") {
        Some(Value::String(q)) => q.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid query parameter".to_string()),
        },
    };

    let include_content = request.params.get("includeContent")
        .and_then(|v| v.as_bool());

    let max_results = request.params.get("maxResults")
        .and_then(|v| v.as_u64())
        .map(|u| u as u32);

    match file_system_commands::search_files_command(
        app_handle.clone(),
        project_directory,
        query,
        include_content,
        max_results,
    ).await {
        Ok(result) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(result),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

// Session Handlers

async fn handle_session_create(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_request: CreateSessionRequest = match serde_json::from_value(request.params) {
        Ok(req) => req,
        Err(error) => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Invalid session request: {}", error)),
        },
    };

    match session_commands::create_session_command(app_handle.clone(), session_request).await {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_session_get(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    match session_commands::get_session_command(app_handle.clone(), session_id).await {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_session_list(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    match session_commands::get_sessions_for_project_command(app_handle.clone(), project_directory).await {
        Ok(sessions) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "sessions": sessions })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_session_update(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    let update_data = match request.params.get("updateData") {
        Some(data) => data.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid updateData parameter".to_string()),
        },
    };

    match session_commands::update_session_fields_command(app_handle.clone(), session_id, update_data).await {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_session_delete(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    match session_commands::delete_session_command(app_handle.clone(), session_id).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

// Job Handlers

async fn handle_job_list(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    match job_commands::get_all_visible_jobs_command(project_directory, app_handle.clone()).await {
        Ok(jobs) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobs": jobs })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_job_get(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    // Fixed parameter order: job_id, app_handle
    match job_commands::get_background_job_by_id_command(job_id, app_handle.clone()).await {
        Ok(job) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "job": job })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_job_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    // Fixed parameter order: job_id, app_handle
    match job_commands::cancel_background_job_command(job_id, app_handle.clone()).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

// Workflow Handlers

async fn handle_workflow_get_status(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid workflowId parameter".to_string()),
        },
    };

    // Fixed parameter order: workflow_id, app_handle
    match workflow_commands::get_workflow_status(workflow_id, app_handle.clone()).await {
        Ok(status) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "status": status })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_workflow_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid workflowId parameter".to_string()),
        },
    };

    // Fixed parameter order: workflow_id, app_handle
    match workflow_commands::cancel_workflow(workflow_id, app_handle.clone()).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_workflow_get_results(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid workflowId parameter".to_string()),
        },
    };

    // Use the legacy version that takes AppHandle instead of State<AppState>
    match workflow_commands::get_workflow_results_legacy(workflow_id, app_handle.clone()).await {
        Ok(results) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "results": results })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

// App Handlers

async fn handle_app_get_info(_app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // Fixed: get_app_info takes no parameters and is not async
    let info = app_commands::get_app_info();
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({ "appInfo": info })),
        error: None,
    }
}

// Action Handlers

/// Handle actions.findRelevantFiles request
/// Params: sessionId (String), taskDescription (String), projectDirectory (String), excludedPaths (Option<Vec<String>>), timeoutMs (Option<u64>)
/// Response: {"workflowId": workflow_id}
async fn handle_actions_find_relevant_files(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid taskDescription parameter".to_string()),
        },
    };

    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    let excluded_paths = request.params.get("excludedPaths")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(Vec::new);

    let timeout_ms = request.params.get("timeoutMs")
        .and_then(|v| v.as_u64());

    match workflow_commands::start_file_finder_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone()
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "workflowId": response.job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

/// Handle actions.createImplementationPlan request
/// Params: sessionId, taskDescription, projectDirectory, relevantFiles (Vec<String>), selectedRootDirectories (Option<Vec<String>>), model (Option<String>), temperature (Option<f32>), maxTokens (Option<u32>)
/// Response: {"jobId": job_id}
async fn handle_actions_create_implementation_plan(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid taskDescription parameter".to_string()),
        },
    };

    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    let relevant_files = match request.params.get("relevantFiles") {
        Some(Value::Array(arr)) => arr.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid relevantFiles parameter".to_string()),
        },
    };

    let selected_root_directories = request.params.get("selectedRootDirectories")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect());

    let model = request.params.get("model")
        .and_then(|v| v.as_str())
        .map(String::from);

    let temperature = request.params.get("temperature")
        .and_then(|v| v.as_f64())
        .map(|f| f as f32);

    let max_tokens = request.params.get("maxTokens")
        .and_then(|v| v.as_u64())
        .map(|u| u as u32);

    match implementation_plan_commands::create_implementation_plan_command(
        session_id,
        task_description,
        project_directory,
        relevant_files,
        selected_root_directories,
        None, // project_structure - not provided in RPC interface
        model,
        temperature,
        max_tokens,
        app_handle.clone()
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle actions.deepResearch request
/// Params: sessionId (String), taskDescription (String), projectDirectory (String), excludedPaths (Option<Vec<String>>), timeoutMs (Option<u64>)
/// Response: {"workflowId": workflow_id}
async fn handle_actions_deep_research(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid taskDescription parameter".to_string()),
        },
    };

    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    let excluded_paths = request.params.get("excludedPaths")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(Vec::new);

    let timeout_ms = request.params.get("timeoutMs")
        .and_then(|v| v.as_u64());

    match web_search_commands::start_web_search_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone()
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "workflowId": response.job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

/// Handle actions.mergePlans request
/// Params: sessionId, sourceJobIds (Vec<String>), mergeInstructions (Option<String>)
/// Response: {"jobId": job_id}
async fn handle_actions_merge_plans(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    let source_job_ids = match request.params.get("sourceJobIds") {
        Some(Value::Array(arr)) => arr.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sourceJobIds parameter".to_string()),
        },
    };

    let merge_instructions = request.params.get("mergeInstructions")
        .and_then(|v| v.as_str())
        .map(String::from);

    match implementation_plan_commands::create_merged_implementation_plan_command(
        app_handle.clone(),
        session_id,
        source_job_ids,
        merge_instructions
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle actions.refineTaskDescription request
/// Params: sessionId, taskDescription, projectDirectory, relevantFiles (Vec<String>)
/// Response: {"jobId": job_id}
async fn handle_actions_refine_task_description(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid sessionId parameter".to_string()),
        },
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid taskDescription parameter".to_string()),
        },
    };

    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid projectDirectory parameter".to_string()),
        },
    };

    let relevant_files = match request.params.get("relevantFiles") {
        Some(Value::Array(arr)) => arr.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid relevantFiles parameter".to_string()),
        },
    };

    match generic_task_commands::refine_task_description_command(
        session_id,
        task_description,
        relevant_files,
        project_directory,
        app_handle.clone()
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle actions.continueWebSearchFromJob request
/// Params: jobId (String)
/// Response: {"jobId": job_id}
async fn handle_actions_continue_web_search_from_job(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    match web_search_commands::continue_workflow_from_job_command(
        job_id,
        app_handle.clone()
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

/// Handle actions.retryWorkflowStage request
/// Params: workflowId (String), failedStageJobId (String)
/// Response: {"newJobId": job_id}
async fn handle_actions_retry_workflow_stage(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid workflowId parameter".to_string()),
        },
    };

    let failed_stage_job_id = match request.params.get("failedStageJobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid failedStageJobId parameter".to_string()),
        },
    };

    match workflow_commands::retry_workflow_stage_command(
        workflow_id,
        failed_stage_job_id,
        app_handle.clone()
    ).await {
        Ok(new_job_id) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "newJobId": new_job_id })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

/// Handle actions.cancelWorkflowStage request
/// Params: workflowId (String), stageJobId (String)
/// Response: {"success": true}
async fn handle_actions_cancel_workflow_stage(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid workflowId parameter".to_string()),
        },
    };

    let stage_job_id = match request.params.get("stageJobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid stageJobId parameter".to_string()),
        },
    };

    match workflow_commands::cancel_workflow_stage_command(
        workflow_id,
        stage_job_id,
        app_handle.clone()
    ).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
        },
    }
}

// Terminal Handlers

/// Handle terminal.start request
/// Params: jobId (String), options (Optional<TerminalSessionOptions>), clientId (String)
/// Response: {"success": true}
async fn handle_terminal_start(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    let client_id = match request.params.get("clientId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid clientId parameter".to_string()),
        },
    };

    let options = request.params.get("options")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    match terminal_commands::start_terminal_session_remote_command(
        app_handle.clone(),
        job_id,
        options,
        client_id
    ).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle terminal.write request
/// Params: jobId (String), data (String - base64 encoded bytes)
/// Response: {"success": true}
async fn handle_terminal_write(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    let data_base64 = match request.params.get("data") {
        Some(Value::String(data)) => data.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid data parameter".to_string()),
        },
    };

    let data = match base64::decode(&data_base64) {
        Ok(bytes) => bytes,
        Err(_) => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Invalid base64 data".to_string()),
        },
    };

    match terminal_commands::write_terminal_input_command(app_handle.clone(), job_id, data).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle terminal.resize request
/// Params: jobId (String), cols (Number), rows (Number)
/// Response: {"success": true}
async fn handle_terminal_resize(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    let cols = match request.params.get("cols") {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(80) as u16,
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid cols parameter".to_string()),
        },
    };

    let rows = match request.params.get("rows") {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(24) as u16,
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid rows parameter".to_string()),
        },
    };

    match terminal_commands::resize_terminal_session_command(app_handle.clone(), job_id, cols, rows).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle terminal.kill request
/// Params: jobId (String)
/// Response: {"success": true}
async fn handle_terminal_kill(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    match terminal_commands::kill_terminal_session_command(app_handle.clone(), job_id).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

/// Handle terminal.sendCtrlC request
/// Params: jobId (String)
/// Response: {"success": true}
async fn handle_terminal_send_ctrl_c(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    match terminal_commands::send_ctrl_c_to_terminal_command(app_handle.clone(), job_id).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

async fn handle_terminal_detach(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    let client_id = match request.params.get("clientId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid clientId parameter".to_string()),
        },
    };

    match terminal_commands::detach_terminal_remote_client_command(app_handle.clone(), job_id, client_id).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

// Action Handlers (Additional)

/// Handle actions.readImplementationPlan request
/// Params: jobId (String)
/// Response: {"plan": plan_content}
async fn handle_actions_read_implementation_plan(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing or invalid jobId parameter".to_string()),
        },
    };

    match implementation_plan_commands::read_implementation_plan_command(job_id, app_handle.clone()).await {
        Ok(plan) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "plan": plan })),
            error: None,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
        },
    }
}

// Workflow Handlers (Additional)

/// Handle workflows.startFileFinder request
/// Params: sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Response: {"workflowId": workflow_id}
async fn handle_workflows_start_file_finder(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // Reuse the existing implementation from actions.findRelevantFiles
    handle_actions_find_relevant_files(app_handle, request).await
}

/// Handle workflows.startWebSearch request
/// Params: sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Response: {"workflowId": workflow_id}
async fn handle_workflows_start_web_search(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // Reuse the existing implementation from actions.deepResearch
    handle_actions_deep_research(app_handle, request).await
}