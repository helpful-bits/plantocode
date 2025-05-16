use tauri::{command, AppHandle};
use log::info;
use crate::error::{AppError, AppResult};
use crate::services::command_handler_service::handle_command;
use crate::models::{FetchRequestArgs, FetchResponse};

#[command]
pub async fn handle_fetch_request(args: FetchRequestArgs, app_handle: AppHandle) -> AppResult<FetchResponse> {
    // Parse the URL to extract the command from the path
    let url_parts: Vec<&str> = args.url.split('/').collect();
    let command = url_parts.last().unwrap_or(&"unknown").to_string();
    
    info!("Handling fetch request: {} {}", args.method, args.url);
    
    // Call the command handler service
    handle_command(command, args, app_handle).await
        .map_err(|e| AppError::InternalError(format!("Command handler error: {}", e)))
}