use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::RpcRequest;
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::file_system_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "fs.getHomeDirectory" => handle_fs_get_home_directory(&app_handle, req).await,
        "fs.listProjectFiles" => handle_fs_list_project_files(&app_handle, req).await,
        "fs.readFileContent" => handle_fs_read_file_content(&app_handle, req).await,
        "fs.writeFileContent" => handle_fs_write_file_content(&app_handle, req).await,
        "fs.createDirectory" => handle_fs_create_directory(&app_handle, req).await,
        "fs.deleteFile" => handle_fs_delete_file(&app_handle, req).await,
        "files.search" => handle_files_search(&app_handle, req).await,
        "files.getMetadata" => handle_files_get_metadata(&app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_fs_get_home_directory(_app_handle: &AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    let home_dir = file_system_commands::get_home_directory_command()
        .map_err(RpcError::from)?;

    Ok(json!({ "homeDirectory": home_dir }))
}

async fn handle_fs_list_project_files(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let files = file_system_commands::list_project_files_command(project_directory, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "files": files }))
}

async fn handle_fs_read_file_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let file_path = request.params.get("filePath")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: filePath"))?
        .to_string();

    // Fixed parameter order: path, project_directory, encoding, app_handle
    let content = file_system_commands::read_file_content_command(file_path, None, None, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "content": content.content }))
}

async fn handle_fs_write_file_content(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let file_path = request.params.get("filePath")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: filePath"))?
        .to_string();

    let content = request.params.get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: content"))?
        .to_string();

    // Fixed parameter order: path, content, project_directory, app_handle
    file_system_commands::write_file_content_command(
        file_path,
        content,
        None,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_fs_create_directory(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let directory_path = request.params.get("directoryPath")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: directoryPath"))?
        .to_string();

    // Fixed parameter order: path, project_directory, app_handle
    file_system_commands::create_directory_command(directory_path, None, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_fs_delete_file(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let file_path = request.params.get("filePath")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: filePath"))?
        .to_string();

    // Fixed parameter order: path, project_directory, app_handle
    file_system_commands::delete_file_command(file_path, None, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_files_search(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let query = request.params.get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: query"))?
        .to_string();

    let include_content = request
        .params
        .get("includeContent")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let max_results = request
        .params
        .get("maxResults")
        .and_then(|v| v.as_u64())
        .map(|u| u as u32)
        .unwrap_or(100);

    // Call search command directly without cache
    let result = file_system_commands::search_files_command(
        app_handle.clone(),
        project_directory,
        query,
        Some(include_content),
        Some(max_results),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(result)
}

async fn handle_files_get_metadata(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let file_paths = request.params.get("filePaths")
        .and_then(|v| v.as_array())
        .ok_or_else(|| RpcError::invalid_params("Missing param: filePaths"))?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(String::from);

    let metadata = file_system_commands::get_files_metadata_command(
        file_paths,
        project_directory,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "metadata": metadata }))
}
