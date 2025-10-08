use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::{
    workflow_commands, implementation_plan_commands,
    web_search_commands, generic_task_commands
};

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "actions.findRelevantFiles" => handle_actions_find_relevant_files(&app_handle, req).await,
        "actions.createImplementationPlan" => handle_actions_create_implementation_plan(&app_handle, req).await,
        "actions.deepResearch" => handle_actions_deep_research(&app_handle, req).await,
        "actions.mergePlans" => handle_actions_merge_plans(&app_handle, req).await,
        "actions.refineTaskDescription" => handle_actions_refine_task_description(&app_handle, req).await,
        "actions.continueWebSearchFromJob" => handle_actions_continue_web_search_from_job(&app_handle, req).await,
        "actions.retryWorkflowStage" => handle_actions_retry_workflow_stage(&app_handle, req).await,
        "actions.cancelWorkflowStage" => handle_actions_cancel_workflow_stage(&app_handle, req).await,
        "actions.readImplementationPlan" => handle_actions_read_implementation_plan(&app_handle, req).await,
        "actions.getImplementationPlanPrompt" => handle_actions_get_implementation_plan_prompt(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

/// Handle actions.findRelevantFiles request
/// Params: sessionId (String), taskDescription (String), projectDirectory (String), excludedPaths (Option<Vec<String>>), timeoutMs (Option<u64>)
/// Response: {"workflowId": workflow_id}
async fn handle_actions_find_relevant_files(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid taskDescription parameter".to_string()),
                is_final: true,
            };
        }
    };

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

    let excluded_paths = request
        .params
        .get("excludedPaths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let timeout_ms = request.params.get("timeoutMs").and_then(|v| v.as_u64());

    match workflow_commands::start_file_finder_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "workflowId": response.job_id })),
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

/// Handle actions.createImplementationPlan request
/// Params: sessionId, taskDescription, projectDirectory, relevantFiles (Vec<String>), selectedRootDirectories (Option<Vec<String>>), model (Option<String>), temperature (Option<f32>), maxTokens (Option<u32>)
/// Response: {"jobId": job_id}
async fn handle_actions_create_implementation_plan(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid taskDescription parameter".to_string()),
                is_final: true,
            };
        }
    };

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

    let relevant_files = match request.params.get("relevantFiles") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid relevantFiles parameter".to_string()),
                is_final: true,
            };
        }
    };

    let selected_root_directories = request
        .params
        .get("selectedRootDirectories")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        });

    let model = request
        .params
        .get("model")
        .and_then(|v| v.as_str())
        .map(String::from);

    let temperature = request
        .params
        .get("temperature")
        .and_then(|v| v.as_f64())
        .map(|f| f as f32);

    let max_tokens = request
        .params
        .get("maxTokens")
        .and_then(|v| v.as_u64())
        .map(|u| u as u32);

    let enable_web_search = request
        .params
        .get("enableWebSearch")
        .and_then(|v| v.as_bool());

    let include_project_structure = request
        .params
        .get("includeProjectStructure")
        .and_then(|v| v.as_bool());

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
        enable_web_search,
        include_project_structure,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
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

/// Handle actions.deepResearch request
/// Params: sessionId (String), taskDescription (String), projectDirectory (String), excludedPaths (Option<Vec<String>>), timeoutMs (Option<u64>)
/// Response: {"workflowId": workflow_id}
async fn handle_actions_deep_research(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid taskDescription parameter".to_string()),
                is_final: true,
            };
        }
    };

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

    let excluded_paths = request
        .params
        .get("excludedPaths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let timeout_ms = request.params.get("timeoutMs").and_then(|v| v.as_u64());

    match web_search_commands::start_web_search_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "workflowId": response.job_id })),
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

/// Handle actions.mergePlans request
/// Params: sessionId, sourceJobIds (Vec<String>), mergeInstructions (Option<String>)
/// Response: {"jobId": job_id}
async fn handle_actions_merge_plans(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let source_job_ids = match request.params.get("sourceJobIds") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sourceJobIds parameter".to_string()),
                is_final: true,
            };
        }
    };

    let merge_instructions = request
        .params
        .get("mergeInstructions")
        .and_then(|v| v.as_str())
        .map(String::from);

    match implementation_plan_commands::create_merged_implementation_plan_command(
        app_handle.clone(),
        session_id,
        source_job_ids,
        merge_instructions,
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
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

/// Handle actions.refineTaskDescription request
/// Params: sessionId, taskDescription, projectDirectory, relevantFiles (Vec<String>)
/// Response: {"jobId": job_id}
async fn handle_actions_refine_task_description(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid taskDescription parameter".to_string()),
                is_final: true,
            };
        }
    };

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

    let relevant_files = match request.params.get("relevantFiles") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid relevantFiles parameter".to_string()),
                is_final: true,
            };
        }
    };

    match generic_task_commands::refine_task_description_command(
        session_id,
        task_description,
        relevant_files,
        project_directory,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
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

/// Handle actions.continueWebSearchFromJob request
/// Params: jobId (String)
/// Response: {"jobId": job_id}
async fn handle_actions_continue_web_search_from_job(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
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

    match web_search_commands::continue_workflow_from_job_command(job_id, app_handle.clone()).await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
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

/// Handle actions.retryWorkflowStage request
/// Params: workflowId (String), failedStageJobId (String)
/// Response: {"newJobId": job_id}
async fn handle_actions_retry_workflow_stage(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid workflowId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let failed_stage_job_id = match request.params.get("failedStageJobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid failedStageJobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match workflow_commands::retry_workflow_stage_command(
        workflow_id,
        failed_stage_job_id,
        app_handle.clone(),
    )
    .await
    {
        Ok(new_job_id) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "newJobId": new_job_id })),
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

/// Handle actions.cancelWorkflowStage request
/// Params: workflowId (String), stageJobId (String)
/// Response: {"success": true}
async fn handle_actions_cancel_workflow_stage(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid workflowId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let stage_job_id = match request.params.get("stageJobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid stageJobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match workflow_commands::cancel_workflow_stage_command(
        workflow_id,
        stage_job_id,
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
            error: Some(error),
            is_final: true,
        },
    }
}

/// Handle actions.readImplementationPlan request
/// Params: jobId (String)
/// Response: {"plan": plan_content}
async fn handle_actions_read_implementation_plan(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
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

    match implementation_plan_commands::read_implementation_plan_command(job_id, app_handle.clone())
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

async fn handle_actions_get_implementation_plan_prompt(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid taskDescription parameter".to_string()),
                is_final: true,
            };
        }
    };

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

    let relevant_files = match request.params.get("relevantFiles") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => vec![],
    };

    match implementation_plan_commands::get_prompt_command(
        "implementation_plan".to_string(),
        session_id,
        task_description,
        project_directory,
        relevant_files,
        None,
        app_handle.clone(),
    )
    .await
    {
        Ok(prompt) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "prompt": prompt })),
            error: None,
            is_final: true,
        },
        Err(e) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("{}", e)),
            is_final: true,
        },
    }
}
