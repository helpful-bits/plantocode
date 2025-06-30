//! LLM API Utilities
//! 
//! This module provides utilities for interacting with LLM APIs including
//! message formatting, client options creation, and API execution.

use std::sync::Arc;
use tauri::AppHandle;

use crate::error::AppResult;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent, OpenRouterResponse};
use crate::api_clients::{client_factory, client_trait::{ApiClient, ApiClientOptions}};

/// Create OpenRouter messages for LLM API calls
/// Standardized message format for system and user prompts
pub fn create_openrouter_messages(
    system_prompt: &str,
    user_prompt: &str,
) -> Vec<OpenRouterRequestMessage> {
    vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt.to_string(),
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt.to_string(),
            }],
        },
    ]
}


/// Creates API client options for LLM calls using provided model settings
pub fn create_api_client_options(
    model: String,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
) -> AppResult<ApiClientOptions> {
    Ok(ApiClientOptions {
        model,
        max_tokens,
        temperature,
        stream,
    })
}

/// Executes non-streaming LLM chat completion
pub async fn execute_llm_chat_completion(
    app_handle: &AppHandle,
    messages: Vec<OpenRouterRequestMessage>,
    api_options: ApiClientOptions,
) -> AppResult<OpenRouterResponse> {
    let llm_client = get_api_client(app_handle)?;
    llm_client.chat_completion(messages, api_options).await
}

/// Get API client from app state
/// Convenience wrapper for client_factory::get_api_client
pub fn get_api_client(
    app_handle: &AppHandle,
) -> AppResult<Arc<dyn ApiClient>> {
    client_factory::get_api_client(app_handle)
}

