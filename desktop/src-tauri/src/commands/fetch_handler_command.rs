use tauri::{command, AppHandle, State};
use log::{info, error};
use crate::error::{AppError, AppResult};
use crate::services::command_handler_service::handle_command;
use crate::auth::token_manager::TokenManager;
use crate::models::{FetchRequestArgs, FetchResponse, StreamRequestArgs};
use reqwest::Client;
use std::sync::Arc;
use std::collections::HashMap;
use futures::StreamExt;

#[command]
pub async fn handle_fetch_request(method: String, headers: Option<HashMap<String, String>>, body: Option<serde_json::Value>, url: String, app_handle: AppHandle) -> AppResult<FetchResponse> {
    // Parse the URL to extract the command from the path
    let url_parts: Vec<&str> = url.split('/').collect();
    let command = url_parts.last().unwrap_or(&"unknown").to_string();
    
    info!("Handling fetch request: {} {}", method, url);
    
    // Create args struct for service call
    let args = FetchRequestArgs { method, headers, body, url };
    
    // Call the command handler service
    handle_command(command, args, app_handle).await
        .map_err(|e| AppError::InternalError(format!("Command handler error: {}", e)))
}

/// Dedicated handler for AI proxy API calls
/// This ensures all AI API calls go through the server proxy
#[command]
pub async fn invoke_fetch_handler(
    url: String,
    method: String,
    headers: Option<serde_json::Value>,
    body: Option<String>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<String> {
    info!("Invoking fetch handler for AI proxy: {} {}", method, url);
    
    let client = Client::new();
    
    // Build the request
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(AppError::InvalidArgument("Unsupported HTTP method".to_string())),
    };
    
    // Add headers if provided
    if let Some(headers_value) = headers {
        if let Some(headers_obj) = headers_value.as_object() {
            for (key, value) in headers_obj {
                if let Some(value_str) = value.as_str() {
                    request_builder = request_builder.header(key, value_str);
                }
            }
        }
    }
    
    // Add body if provided
    if let Some(body_str) = body {
        request_builder = request_builder.body(body_str);
    }
    
    // Execute the request
    let response = request_builder
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    
    // Check for errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await
            .unwrap_or_else(|_| "Failed to read error response".to_string());
        
        error!("AI proxy request failed: {} - {}", status, error_text);
        return Err(AppError::ExternalServiceError(format!(
            "AI proxy request failed: {}: {}", 
            status, 
            error_text
        )));
    }
    
    // Parse response
    let response_text = response.text().await
        .map_err(|e| AppError::InvalidResponse(e.to_string()))?;
    
    Ok(response_text)
}

/// Handler for streaming responses from the AI proxy
#[command]
pub async fn invoke_stream_handler(
    url: String,
    method: String,
    headers: Option<serde_json::Value>,
    body: Option<String>,
    token_manager: State<'_, Arc<TokenManager>>,
    on_chunk: impl Fn(String) + Send + 'static,
) -> AppResult<()> {
    info!("Invoking stream handler for AI proxy: {} {}", method, url);
    
    let client = Client::new();
    
    // Build the request
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(AppError::InvalidArgument("Unsupported HTTP method".to_string())),
    };
    
    // Add headers if provided
    if let Some(headers_value) = headers {
        if let Some(headers_obj) = headers_value.as_object() {
            for (key, value) in headers_obj {
                if let Some(value_str) = value.as_str() {
                    request_builder = request_builder.header(key, value_str);
                }
            }
        }
    }
    
    // Add body if provided
    if let Some(body_str) = body {
        request_builder = request_builder.body(body_str);
    }
    
    // Execute the request and process the stream
    let response = request_builder
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    
    // Check for errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await
            .unwrap_or_else(|_| "Failed to read error response".to_string());
        
        error!("AI proxy stream request failed: {} - {}", status, error_text);
        return Err(AppError::ExternalServiceError(format!(
            "AI proxy stream request failed: {}: {}", 
            status, 
            error_text
        )));
    }
    
    // Process the stream using the response body bytes stream
    let mut stream = response.bytes_stream();
    
    // Buffer for partial chunks
    let mut buffer = String::new();
    
    while let Some(result_item) = stream.next().await {
        match result_item {
            Ok(chunk_bytes) => {
                // Convert bytes to string
                let chunk_str = String::from_utf8_lossy(&chunk_bytes);
                buffer.push_str(&chunk_str);
                
                // Process complete SSE messages
                if let Some(last_newline_pos) = buffer.rfind('\n') {
                    let (messages, remainder) = buffer.split_at(last_newline_pos + 1);
                    
                    for line in messages.lines() {
                        if line.starts_with("data: ") {
                            on_chunk(line.to_string());
                        }
                    }
                    
                    // Keep the remainder for the next iteration
                    buffer = remainder.to_string();
                }
            },
            Err(req_err) => {
                error!("Error reading stream chunk: {}", req_err);
                return Err(AppError::NetworkError(format!("Stream error: {}", req_err)));
            }
        }
    }
    
    // Process any remaining data in the buffer
    if !buffer.is_empty() {
        for line in buffer.lines() {
            if line.starts_with("data: ") {
                on_chunk(line.to_string());
            }
        }
    }
    
    Ok(())
}