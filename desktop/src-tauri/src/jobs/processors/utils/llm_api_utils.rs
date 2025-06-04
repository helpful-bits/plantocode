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

/// Extract system and user prompts from composed prompt
/// Splits the composed prompt into system and user components
pub fn extract_prompts_from_composed(
    composed_prompt: &crate::utils::unified_prompt_system::ComposedPrompt,
) -> (String, String, String) {
    let system_prompt_text = composed_prompt
        .final_prompt
        .split("\n\n")
        .next()
        .unwrap_or("")
        .to_string();
    let user_prompt_text = composed_prompt
        .final_prompt
        .split("\n\n")
        .skip(1)
        .collect::<Vec<&str>>()
        .join("\n\n");
    let system_prompt_id = composed_prompt.system_prompt_id.clone();
    
    (system_prompt_text, user_prompt_text, system_prompt_id)
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