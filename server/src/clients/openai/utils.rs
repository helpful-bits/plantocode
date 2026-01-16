use crate::error::AppError;
use chrono;
use uuid;

use super::structs::{
    OpenAIChatRequest, OpenAIContent, OpenAIMessage, OpenAIResponsesContentPart,
    OpenAIResponsesFormatType, OpenAIResponsesInputItem, OpenAIResponsesReasoning,
    OpenAIResponsesRequest, OpenAIResponsesTextFormat, OpenAIResponsesTool,
};

/// OpenAI's hard limit for the `instructions` field is 1,048,576 characters (1MB).
/// We use a slightly lower limit to provide a safety buffer.
const MAX_INSTRUCTIONS_LENGTH: usize = 1_000_000;

pub fn endpoint_for_model(_model: &str) -> &'static str {
    "responses"
}

pub fn convert_messages_to_responses_input(
    messages: &[OpenAIMessage],
) -> Vec<OpenAIResponsesInputItem> {
    messages
        .iter()
        .map(|message| {
            // Determine the text part type based on role:
            // - assistant role uses "output_text" (for conversation history)
            // - user/system/developer roles use "input_text"
            let is_assistant = message.role == "assistant";
            let text_part_type = if is_assistant { "output_text" } else { "input_text" };

            let content = match &message.content {
                OpenAIContent::Text(text) => {
                    vec![OpenAIResponsesContentPart {
                        part_type: text_part_type.to_string(),
                        text: Some(text.clone()),
                        image_url: None,
                        file_id: None,
                        detail: None,
                    }]
                }
                OpenAIContent::Parts(parts) => {
                    parts
                        .iter()
                        .map(|part| {
                            match part.part_type.as_str() {
                                "text" => {
                                    OpenAIResponsesContentPart {
                                        part_type: text_part_type.to_string(),
                                        text: part.text.clone(),
                                        image_url: None,
                                        file_id: None,
                                        detail: None,
                                    }
                                }
                                "image_url" => {
                                    // Convert OpenAIImageUrl object to string URL
                                    // Preserve the detail field from the image_url
                                    let (url_string, detail) = part.image_url.as_ref()
                                        .map(|img| (Some(img.url.clone()), img.detail.clone()))
                                        .unwrap_or((None, None));
                                    OpenAIResponsesContentPart {
                                        part_type: "input_image".to_string(),
                                        text: None,
                                        image_url: url_string,
                                        file_id: part.file_id.clone(),
                                        detail,
                                    }
                                }
                                "input_text" | "output_text" => {
                                    // Already in Responses API format, pass through
                                    // Use appropriate type based on role
                                    OpenAIResponsesContentPart {
                                        part_type: text_part_type.to_string(),
                                        text: part.text.clone(),
                                        image_url: None,
                                        file_id: None,
                                        detail: None,
                                    }
                                }
                                "input_image" => {
                                    // Already in Responses API format
                                    // Extract URL from image_url object if present
                                    let (url_string, detail) = part.image_url.as_ref()
                                        .map(|img| (Some(img.url.clone()), img.detail.clone()))
                                        .unwrap_or((None, None));
                                    OpenAIResponsesContentPart {
                                        part_type: "input_image".to_string(),
                                        text: None,
                                        image_url: url_string,
                                        file_id: part.file_id.clone(),
                                        detail,
                                    }
                                }
                                "input_file" => {
                                    OpenAIResponsesContentPart {
                                        part_type: "input_file".to_string(),
                                        text: None,
                                        image_url: None,
                                        file_id: part.file_id.clone(),
                                        detail: None,
                                    }
                                }
                                "document" => {
                                    OpenAIResponsesContentPart {
                                        part_type: "input_file".to_string(),
                                        text: None,
                                        image_url: None,
                                        file_id: part.file_id.clone(),
                                        detail: None,
                                    }
                                }
                                _ => {
                                    // Fallback: treat as text if text is available
                                    if part.text.is_some() {
                                        OpenAIResponsesContentPart {
                                            part_type: text_part_type.to_string(),
                                            text: part.text.clone(),
                                            image_url: None,
                                            file_id: None,
                                            detail: None,
                                        }
                                    } else if part.image_url.is_some() {
                                        let (url_string, detail) = part.image_url.as_ref()
                                            .map(|img| (Some(img.url.clone()), img.detail.clone()))
                                            .unwrap_or((None, None));
                                        OpenAIResponsesContentPart {
                                            part_type: "input_image".to_string(),
                                            text: None,
                                            image_url: url_string,
                                            file_id: part.file_id.clone(),
                                            detail,
                                        }
                                    } else {
                                        // Empty fallback
                                        OpenAIResponsesContentPart {
                                            part_type: text_part_type.to_string(),
                                            text: Some(String::new()),
                                            image_url: None,
                                            file_id: None,
                                            detail: None,
                                        }
                                    }
                                }
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
    // Only allow web search for OpenAI models
    // Models may have provider prefixes like "openrouter/openai/gpt-4"
    let model_lower = model.to_lowercase();
    let is_openai_model = model_lower.contains("openai/")
        || model_lower.contains("/gpt-")
        || model_lower.contains("/o1-")
        || model_lower.contains("/o3-")
        || model_lower.contains("/o4-")
        || model_lower.starts_with("gpt-")
        || model_lower.starts_with("o1-")
        || model_lower.starts_with("o3-")
        || model_lower.starts_with("o4-");

    if model.contains("deep-research") || (web_mode && is_openai_model) {
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
    // Models may have provider prefixes like "openrouter/openai/gpt-4"
    let model_lower = model.to_lowercase();
    let is_openai_model = model_lower.contains("openai/")
        || model_lower.contains("/gpt-")
        || model_lower.contains("/o1-")
        || model_lower.contains("/o3-")
        || model_lower.contains("/o4-")
        || model_lower.starts_with("gpt-")
        || model_lower.starts_with("o1-")
        || model_lower.starts_with("o3-")
        || model_lower.starts_with("o4-");

    model.contains("deep-research") || (web_mode && is_openai_model)
}

pub fn prepare_request_body(
    request: &OpenAIChatRequest,
    web_mode: bool,
    force_background: Option<bool>,
) -> Result<(String, serde_json::Value), AppError> {
    for msg in &request.messages {
        if let OpenAIContent::Parts(parts) = &msg.content {
            for part in parts {
                if part.part_type == "document" {
                    return Err(AppError::BadRequest(
                        "OpenAI document parts must be uploaded before request preparation".to_string(),
                    ));
                }
                if part.part_type == "input_file" && part.file_id.is_none() {
                    return Err(AppError::BadRequest(
                        "OpenAI input_file parts must include a file_id".to_string(),
                    ));
                }
            }
        }
    }

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

    // Handle instructions overflow: OpenAI limits the `instructions` field to 1MB.
    // If exceeded, split the content and move overflow to a context message in input.
    let (instructions, instructions_overflow) = match instructions {
        Some(instr) if instr.len() > MAX_INSTRUCTIONS_LENGTH => {
            // Find a safe split point (prefer splitting at newline or space)
            let split_point = instr[..MAX_INSTRUCTIONS_LENGTH]
                .rfind('\n')
                .or_else(|| instr[..MAX_INSTRUCTIONS_LENGTH].rfind(' '))
                .unwrap_or(MAX_INSTRUCTIONS_LENGTH);

            let (main_part, overflow_part) = instr.split_at(split_point);
            tracing::info!(
                "Instructions exceeded {} chars (was {}), splitting {} chars to input context",
                MAX_INSTRUCTIONS_LENGTH,
                instr.len(),
                overflow_part.len()
            );
            (Some(main_part.to_string()), Some(overflow_part.trim_start().to_string()))
        }
        other => (other, None),
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
        let mut input_items = convert_messages_to_responses_input(&non_system_messages);

        // Prepend instructions overflow as a context message if it exists
        if let Some(overflow) = &instructions_overflow {
            let overflow_message = OpenAIResponsesInputItem {
                item_type: "message".to_string(),
                role: Some("user".to_string()),
                content: Some(vec![OpenAIResponsesContentPart {
                    part_type: "input_text".to_string(),
                    text: Some(format!("[Additional System Context]\n{}", overflow)),
                    image_url: None,
                    file_id: None,
                    detail: None,
                }]),
            };
            input_items.insert(0, overflow_message);
        }

        Some(serde_json::to_value(input_items)?)
    };

    let tools = model_requires_tools(&request.model, web_mode);

    // Only use background when explicitly forced
    let background = force_background;

    // Use model ID directly as it's already resolved by the mapping service
    let resolved_model_id = request.model.clone();

    // Web search specific configurations
    let (text_format, reasoning_config, store_config, tool_choice, parallel_tool_calls, truncation) =
        if web_mode {
            (
                Some(OpenAIResponsesTextFormat {
                    format: OpenAIResponsesFormatType {
                        format_type: "text".to_string(),
                    },
                }),
                Some(OpenAIResponsesReasoning {
                    effort: "xhigh".to_string(),
                    summary: "auto".to_string(),
                }),
                Some(false), // Store is set to false for web search
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
