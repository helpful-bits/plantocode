use tauri::AppHandle;
use serde_json::{json, Value};
use serde::Deserialize;
use crate::remote_api::types::RpcRequest;
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::{
    workflow_commands, implementation_plan_commands,
    web_search_commands, generic_task_commands
};
use crate::utils::token_estimator;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FindRelevantFilesParams {
    session_id: String,
    task_description: String,
    project_directory: String,
    #[serde(default)]
    excluded_paths: Vec<String>,
    timeout_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePlanParams {
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    selected_root_directories: Option<Vec<String>>,
    project_structure: Option<serde_json::Value>,
    model: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    enable_web_search: Option<bool>,
    include_project_structure: Option<bool>,
}

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
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
        "actions.estimatePromptTokens" => handle_actions_estimate_prompt_tokens(&app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

/// Handle actions.findRelevantFiles request
/// Params: sessionId (String), taskDescription (String), projectDirectory (String), excludedPaths (Option<Vec<String>>), timeoutMs (Option<u64>)
/// Response: {"workflowId": workflow_id}
async fn handle_actions_find_relevant_files(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let params: FindRelevantFilesParams = serde_json::from_value(request.params.clone())
        .map_err(|e| RpcError::invalid_params(format!("Invalid parameters: {}", e)))?;

    let response = workflow_commands::start_file_finder_workflow(
        params.session_id,
        params.task_description,
        params.project_directory,
        params.excluded_paths,
        params.timeout_ms,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "workflowId": response.job_id }))
}

/// Handle actions.createImplementationPlan request
/// Params: sessionId, taskDescription, projectDirectory, relevantFiles (Vec<String>), selectedRootDirectories (Option<Vec<String>>), projectStructure (Option<Value>), model (Option<String>), temperature (Option<f32>), maxTokens (Option<u32>)
/// Response: {"jobId": job_id}
async fn handle_actions_create_implementation_plan(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let params: CreatePlanParams = serde_json::from_value(request.params.clone())
        .map_err(|e| RpcError::invalid_params(format!("Invalid parameters: {}", e)))?;

    let response = implementation_plan_commands::create_implementation_plan_command(
        params.session_id,
        params.task_description,
        params.project_directory,
        params.relevant_files,
        params.selected_root_directories,
        params.project_structure.and_then(|v| serde_json::to_string(&v).ok()),
        params.model,
        params.temperature,
        params.max_tokens,
        params.enable_web_search,
        params.include_project_structure,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "jobId": response.job_id }))
}

/// Handle actions.deepResearch request
/// Params: sessionId (String), taskDescription (String), projectDirectory (String), excludedPaths (Option<Vec<String>>), timeoutMs (Option<u64>)
/// Response: {"workflowId": workflow_id}
async fn handle_actions_deep_research(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let task_description = request.params.get("taskDescription")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskDescription"))?
        .to_string();

    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

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

    let response = web_search_commands::start_web_search_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "workflowId": response.job_id }))
}

/// Handle actions.mergePlans request
/// Params: sessionId, sourceJobIds (Vec<String>), mergeInstructions (Option<String>)
/// Response: {"jobId": job_id}
async fn handle_actions_merge_plans(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let source_job_ids = request.params.get("sourceJobIds")
        .and_then(|v| v.as_array())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sourceJobIds"))?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();

    let merge_instructions = request
        .params
        .get("mergeInstructions")
        .and_then(|v| v.as_str())
        .map(String::from);

    let response = implementation_plan_commands::create_merged_implementation_plan_command(
        app_handle.clone(),
        session_id,
        source_job_ids,
        merge_instructions,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "jobId": response.job_id }))
}

/// Handle actions.refineTaskDescription request
/// Params: sessionId, taskDescription, projectDirectory, relevantFiles (Vec<String>)
/// Response: {"jobId": job_id}
async fn handle_actions_refine_task_description(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let task_description = request.params.get("taskDescription")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskDescription"))?
        .to_string();

    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let relevant_files = request.params.get("relevantFiles")
        .and_then(|v| v.as_array())
        .ok_or_else(|| RpcError::invalid_params("Missing param: relevantFiles"))?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();

    let response = generic_task_commands::refine_task_description_command(
        session_id,
        task_description,
        relevant_files,
        project_directory,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "jobId": response.job_id }))
}

/// Handle actions.continueWebSearchFromJob request
/// Params: jobId (String)
/// Response: {"jobId": job_id}
async fn handle_actions_continue_web_search_from_job(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let job_id = request.params.get("jobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: jobId"))?
        .to_string();

    let response = web_search_commands::continue_workflow_from_job_command(job_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "jobId": response.job_id }))
}

/// Handle actions.retryWorkflowStage request
/// Params: workflowId (String), failedStageJobId (String)
/// Response: {"newJobId": job_id}
async fn handle_actions_retry_workflow_stage(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let workflow_id = request.params.get("workflowId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: workflowId"))?
        .to_string();

    let failed_stage_job_id = request.params.get("failedStageJobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: failedStageJobId"))?
        .to_string();

    let new_job_id = workflow_commands::retry_workflow_stage_command(
        workflow_id,
        failed_stage_job_id,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "newJobId": new_job_id }))
}

/// Handle actions.cancelWorkflowStage request
/// Params: workflowId (String), stageJobId (String)
/// Response: {"success": true}
async fn handle_actions_cancel_workflow_stage(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let workflow_id = request.params.get("workflowId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: workflowId"))?
        .to_string();

    let stage_job_id = request.params.get("stageJobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: stageJobId"))?
        .to_string();

    workflow_commands::cancel_workflow_stage_command(
        workflow_id,
        stage_job_id,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

/// Handle actions.readImplementationPlan request
/// Params: jobId (String)
/// Response: {"plan": plan_content}
async fn handle_actions_read_implementation_plan(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let job_id = request.params.get("jobId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: jobId"))?
        .to_string();

    let plan = implementation_plan_commands::read_implementation_plan_command(job_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "plan": plan }))
}

async fn handle_actions_get_implementation_plan_prompt(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let task_description = request.params.get("taskDescription")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskDescription"))?
        .to_string();

    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let relevant_files = request.params.get("relevantFiles")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(Vec::new);

    let prompt = implementation_plan_commands::get_prompt_command(
        "implementation_plan".to_string(),
        session_id,
        task_description,
        project_directory,
        relevant_files,
        None,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "prompt": prompt }))
}

async fn handle_actions_estimate_prompt_tokens(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let task_description = request.params.get("taskDescription")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskDescription"))?
        .to_string();

    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let relevant_files = request.params.get("relevantFiles")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(Vec::new);

    let task_type = request.params.get("taskType")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| "implementation_plan".to_string());

    let model = request.params.get("model")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| "claude-3-5-sonnet-20241022".to_string());

    let prompt_response = implementation_plan_commands::get_prompt_command(
        task_type,
        session_id,
        task_description,
        project_directory,
        relevant_files,
        None,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    let system_tokens = token_estimator::estimate_tokens(&prompt_response.system_prompt, &model);
    let user_tokens = token_estimator::estimate_tokens(&prompt_response.user_prompt, &model);
    let total_tokens = system_tokens + user_tokens;

    Ok(json!({ "totalTokens": total_tokens }))
}
