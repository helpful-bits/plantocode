use crate::error::AppError;
use chrono;
use uuid;

use super::structs::{
    OpenAIChatRequest, OpenAIContent, OpenAIMessage, OpenAIResponsesContentPart,
    OpenAIResponsesFormatType, OpenAIResponsesInputItem, OpenAIResponsesReasoning,
    OpenAIResponsesRequest, OpenAIResponsesTextFormat, OpenAIResponsesTool,
};

pub fn endpoint_for_model(_model: &str) -> &'static str {
    "responses"
}

pub fn convert_messages_to_responses_input(
    messages: &[OpenAIMessage],
) -> Vec<OpenAIResponsesInputItem> {
    messages
        .iter()
        .map(|message| {
            let content = match &message.content {
                OpenAIContent::Text(text) => {
                    vec![OpenAIResponsesContentPart {
                        part_type: "input_text".to_string(),
                        text: Some(text.clone()),
                        image_url: None,
                    }]
                }
                OpenAIContent::Parts(parts) => {
                    parts
                        .iter()
                        .map(|part| {
                            let part_type = match part.part_type.as_str() {
                                "text" => "input_text",
                                "image_url" => "input_image",
                                _ => "input_text", // fallback
                            };
                            OpenAIResponsesContentPart {
                                part_type: part_type.to_string(),
                                text: part.text.clone(),
                                image_url: part.image_url.clone(),
                            }
                        })
                        .collect()
                }
            };

            OpenAIResponsesInputItem {
                item_type: "message".to_string(),
                role: Some(if message.role == "system" {
                    "developer".to_string()
                } else {
                    message.role.clone()
                }),
                content: Some(content),
            }
        })
        .collect()
}

pub fn model_requires_tools(model: &str, web_mode: bool) -> Option<Vec<OpenAIResponsesTool>> {
    if model.contains("deep-research") || web_mode {
        // Web search tool with location and context configuration
        Some(vec![OpenAIResponsesTool::WebSearch {
            tool_type: "web_search_preview".to_string(),
            user_location: Some(serde_json::json!({
                "type": "approximate"
            })),
            search_context_size: Some("low".to_string()),
        }])
    } else {
        None
    }
}

pub fn model_requires_background(model: &str, web_mode: bool) -> bool {
    model.contains("deep-research") || web_mode
}

pub fn prepare_request_body(
    request: &OpenAIChatRequest,
    web_mode: bool,
    force_background: Option<bool>,
) -> Result<(String, serde_json::Value), AppError> {
    let max_output_tokens = if web_mode {
        None // Don't set max_output_tokens for web search models
    } else {
        request.max_completion_tokens
    };

    // Extract system/developer message and user messages
    let (instructions, user_messages): (Option<String>, Vec<&OpenAIMessage>) = {
        let mut instructions = None;
        let mut user_msgs = Vec::new();

        for msg in &request.messages {
            if msg.role == "system" || msg.role == "developer" {
                // Combine system messages into instructions
                let text = match &msg.content {
                    OpenAIContent::Text(t) => t.clone(),
                    OpenAIContent::Parts(parts) => parts
                        .iter()
                        .filter_map(|p| p.text.as_ref())
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n"),
                };
                instructions = Some(match instructions {
                    Some(existing) => format!("{} {}", existing, text),
                    None => text,
                });
            } else {
                user_msgs.push(msg);
            }
        }
        (instructions, user_msgs)
    };

    // For web search, input is typically just the user's query as a string
    // For regular requests, it's the conversation array (excluding system/developer messages)
    let input = if web_mode {
        // Extract just the last user message for web search
        user_messages.last().and_then(|msg| match &msg.content {
            OpenAIContent::Text(text) => Some(serde_json::Value::String(text.clone())),
            OpenAIContent::Parts(parts) => {
                let text = parts
                    .iter()
                    .filter_map(|p| p.text.as_ref())
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ");
                Some(serde_json::Value::String(text))
            }
        })
    } else {
        // For non-web requests, convert only non-system messages to the input array format
        let non_system_messages: Vec<OpenAIMessage> = request
            .messages
            .iter()
            .filter(|msg| msg.role != "system" && msg.role != "developer")
            .cloned()
            .collect();
        Some(serde_json::to_value(
            convert_messages_to_responses_input(&non_system_messages),
        )?)
    };

    let tools = model_requires_tools(&request.model, web_mode);

    // Only use background when explicitly forced
    let background = force_background;

    // Use model ID directly as it's already resolved by the mapping service
    let resolved_model_id = request.model.clone();

    // Web search specific configurations
    let (
        text_format,
        reasoning_config,
        store_config,
        tool_choice,
        parallel_tool_calls,
        truncation,
    ) = if web_mode {
        (
            Some(OpenAIResponsesTextFormat {
                format: OpenAIResponsesFormatType {
                    format_type: "text".to_string(),
                },
            }),
            Some(OpenAIResponsesReasoning {
                effort: "medium".to_string(),
                summary: "auto".to_string(),
            }),
            Some(true), // Store is typically true for web search
            Some("auto".to_string()),
            Some(true),
            Some("disabled".to_string()),
        )
    } else {
        (None, None, None, None, None, None)
    };

    // Ensure request uniqueness to prevent OpenAI response ID deduplication
    let unique_user_id = if background.unwrap_or(false) || web_mode {
        // For background requests and web mode, append unique timestamp and UUID to prevent deduplication
        let timestamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let unique_suffix = format!("_{}_{}", timestamp, uuid::Uuid::new_v4());
        match &request.user {
            Some(existing_user) => {
                // Truncate original user ID to ensure total length stays under 100 chars
                let max_base_len = 100 - unique_suffix.len();
                let truncated_user = if existing_user.len() > max_base_len {
                    &existing_user[..max_base_len]
                } else {
                    existing_user
                };
                format!("{}{}", truncated_user, unique_suffix)
            }
            None => format!("user{}", unique_suffix),
        }
    } else {
        request.user.clone().unwrap_or_default()
    };

    let responses_request = OpenAIResponsesRequest {
        model: resolved_model_id,
        input,
        instructions,
        stream: request.stream,
        background,
        max_output_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stop: request.stop.clone(),
        user: Some(unique_user_id),
        tools,
        text: text_format,
        reasoning: reasoning_config,
        store: store_config,
        tool_choice,
        parallel_tool_calls,
        truncation,
    };
    let request_body = serde_json::to_value(responses_request)?;
    Ok(("responses".to_string(), request_body))
}