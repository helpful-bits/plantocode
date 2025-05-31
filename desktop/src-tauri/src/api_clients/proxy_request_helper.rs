use crate::models::{OpenRouterRequest, OpenRouterRequestMessage, OpenRouterContent};
use super::client_trait::ApiClientOptions;

pub fn create_open_router_request(prompt: &str, options: &ApiClientOptions) -> OpenRouterRequest {
    let message = OpenRouterRequestMessage {
        role: "user".to_string(),
        content: vec![
            OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: prompt.to_string(),
            },
        ],
    };

    OpenRouterRequest {
        model: options.model.clone(),
        messages: vec![message],
        stream: options.stream,
        max_tokens: Some(options.max_tokens),
        temperature: Some(options.temperature),
    }
}