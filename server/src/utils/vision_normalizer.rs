use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct VisionMessage {
    pub role: String,
    pub parts: Vec<VisionPart>,
}

#[derive(Debug, Clone)]
pub enum VisionPart {
    Text { text: String },
    Image { image: VisionImage },
}

#[derive(Debug, Clone)]
pub struct VisionImage {
    pub source: ImageSource,
    pub detail: Option<String>,      // "low" | "high" | "auto"
    pub media_type: Option<String>,  // image/jpeg, etc.
}

#[derive(Debug, Clone)]
pub enum ImageSource {
    Url { url: String },
    DataUrl { data_url: String },
    Base64 { mime_type: String, data_base64: String },
    ProviderFileId { file_id: String, provider: Option<String> },
}

/// Parse messages from JSON value into VisionMessage format
pub fn parse_messages(messages_value: &Value) -> Result<Vec<VisionMessage>, AppError> {
    let messages_array = messages_value.as_array().ok_or_else(|| {
        AppError::BadRequest("messages must be an array".to_string())
    })?;

    let mut vision_messages = Vec::new();

    for msg_value in messages_array {
        let msg_obj = msg_value.as_object().ok_or_else(|| {
            AppError::BadRequest("each message must be an object".to_string())
        })?;

        let role = msg_obj
            .get("role")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::BadRequest("message missing 'role' field".to_string()))?
            .to_string();

        let content = msg_obj.get("content").ok_or_else(|| {
            AppError::BadRequest("message missing 'content' field".to_string())
        })?;

        let parts = parse_content(content)?;

        vision_messages.push(VisionMessage { role, parts });
    }

    Ok(vision_messages)
}

/// Parse content field which can be string or array of parts
fn parse_content(content: &Value) -> Result<Vec<VisionPart>, AppError> {
    match content {
        Value::String(text) => {
            // Simple string content
            Ok(vec![VisionPart::Text {
                text: text.clone(),
            }])
        }
        Value::Array(parts_array) => {
            let mut parts = Vec::new();
            for part_value in parts_array {
                let part = parse_content_part(part_value)?;
                parts.push(part);
            }
            Ok(parts)
        }
        _ => Err(AppError::BadRequest(
            "content must be string or array".to_string(),
        )),
    }
}

/// Parse individual content part
fn parse_content_part(part_value: &Value) -> Result<VisionPart, AppError> {
    let part_obj = part_value.as_object().ok_or_else(|| {
        AppError::BadRequest("content part must be an object".to_string())
    })?;

    let part_type = part_obj
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("content part missing 'type' field".to_string()))?;

    match part_type {
        "text" | "input_text" => {
            let text = part_obj
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::BadRequest("text part missing 'text' field".to_string()))?
                .to_string();
            Ok(VisionPart::Text { text })
        }
        "image_url" => {
            // OpenAI Chat-style: { "type": "image_url", "image_url": { "url": "...", "detail"?: "..." } }
            let image_url_obj = part_obj
                .get("image_url")
                .and_then(|v| v.as_object())
                .ok_or_else(|| {
                    AppError::BadRequest("image_url part missing 'image_url' object".to_string())
                })?;

            let url = image_url_obj
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::BadRequest("image_url object missing 'url' field".to_string())
                })?
                .to_string();

            let detail = image_url_obj
                .get("detail")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let (source, media_type) = parse_url_source(&url)?;

            Ok(VisionPart::Image {
                image: VisionImage {
                    source,
                    detail,
                    media_type,
                },
            })
        }
        "input_image" => {
            // OpenAI Responses-style: { "type": "input_image", "image_url": "..." } or { "type": "input_image", "file_id": "..." }
            if let Some(url_value) = part_obj.get("image_url") {
                let url = url_value.as_str().ok_or_else(|| {
                    AppError::BadRequest("input_image 'image_url' must be a string".to_string())
                })?;

                let (source, media_type) = parse_url_source(url)?;

                Ok(VisionPart::Image {
                    image: VisionImage {
                        source,
                        detail: None,
                        media_type,
                    },
                })
            } else if let Some(file_id_value) = part_obj.get("file_id") {
                let file_id = file_id_value.as_str().ok_or_else(|| {
                    AppError::BadRequest("input_image 'file_id' must be a string".to_string())
                })?;

                Ok(VisionPart::Image {
                    image: VisionImage {
                        source: ImageSource::ProviderFileId {
                            file_id: file_id.to_string(),
                            provider: Some("openai".to_string()),
                        },
                        detail: None,
                        media_type: None,
                    },
                })
            } else {
                Err(AppError::BadRequest(
                    "input_image must have 'image_url' or 'file_id'".to_string(),
                ))
            }
        }
        "image" => {
            // Anthropic-style: { "type": "image", "source": { "type": "base64"|"url"|"file", ... } }
            let source_obj = part_obj
                .get("source")
                .and_then(|v| v.as_object())
                .ok_or_else(|| {
                    AppError::BadRequest("image part missing 'source' object".to_string())
                })?;

            let source_type = source_obj
                .get("type")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::BadRequest("image source missing 'type' field".to_string())
                })?;

            let source = match source_type {
                "base64" => {
                    let mime_type = source_obj
                        .get("media_type")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| {
                            AppError::BadRequest(
                                "base64 image source missing 'media_type'".to_string(),
                            )
                        })?
                        .to_string();

                    let data_base64 = source_obj
                        .get("data")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| {
                            AppError::BadRequest("base64 image source missing 'data'".to_string())
                        })?
                        .to_string();

                    validate_image_mime(&mime_type)?;

                    ImageSource::Base64 {
                        mime_type: mime_type.clone(),
                        data_base64,
                    }
                }
                "url" => {
                    let url = source_obj
                        .get("url")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| {
                            AppError::BadRequest("url image source missing 'url'".to_string())
                        })?
                        .to_string();

                    if url.starts_with("data:") {
                        ImageSource::DataUrl { data_url: url }
                    } else {
                        ImageSource::Url { url }
                    }
                }
                "file" => {
                    let file_id = source_obj
                        .get("file_id")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| {
                            AppError::BadRequest("file image source missing 'file_id'".to_string())
                        })?
                        .to_string();

                    ImageSource::ProviderFileId {
                        file_id,
                        provider: Some("anthropic".to_string()),
                    }
                }
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "unknown image source type: {}",
                        source_type
                    )))
                }
            };

            let media_type = match &source {
                ImageSource::Base64 { mime_type, .. } => Some(mime_type.clone()),
                ImageSource::DataUrl { data_url } => {
                    parse_data_url(data_url).ok().map(|(mime, _)| mime)
                }
                _ => None,
            };

            Ok(VisionPart::Image {
                image: VisionImage {
                    source,
                    detail: None,
                    media_type,
                },
            })
        }
        _ => Err(AppError::BadRequest(format!(
            "unknown content part type: {}",
            part_type
        ))),
    }
}

/// Parse URL source, distinguishing between data URLs and regular URLs
fn parse_url_source(url: &str) -> Result<(ImageSource, Option<String>), AppError> {
    if url.starts_with("data:") {
        let (mime_type, _) = parse_data_url(url)?;
        validate_image_mime(&mime_type)?;
        Ok((
            ImageSource::DataUrl {
                data_url: url.to_string(),
            },
            Some(mime_type),
        ))
    } else {
        Ok((
            ImageSource::Url {
                url: url.to_string(),
            },
            None,
        ))
    }
}

/// Concatenate all text parts for token estimation
pub fn flatten_text(messages: &[VisionMessage]) -> String {
    let mut result = String::new();
    for msg in messages {
        for part in &msg.parts {
            if let VisionPart::Text { text } = part {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str(text);
            }
        }
    }
    result
}

/// Check if any VisionPart::Image present
pub fn contains_images(messages: &[VisionMessage]) -> bool {
    messages
        .iter()
        .any(|msg| msg.parts.iter().any(|part| matches!(part, VisionPart::Image { .. })))
}

/// Extract MIME type and base64 data from data URL
/// Expected format: data:<mime_type>;base64,<data>
pub fn parse_data_url(data_url: &str) -> Result<(String, String), AppError> {
    if !data_url.starts_with("data:") {
        return Err(AppError::BadRequest(
            "data URL must start with 'data:'".to_string(),
        ));
    }

    let without_prefix = &data_url[5..]; // Remove "data:"

    let parts: Vec<&str> = without_prefix.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err(AppError::BadRequest(
            "data URL must contain comma separator".to_string(),
        ));
    }

    let header = parts[0];
    let data = parts[1];

    // Parse header: <mime_type>;base64 or just <mime_type>
    let header_parts: Vec<&str> = header.split(';').collect();
    if header_parts.is_empty() {
        return Err(AppError::BadRequest(
            "data URL header is empty".to_string(),
        ));
    }

    let mime_type = header_parts[0].to_string();

    // Check if base64 is specified
    let is_base64 = header_parts.iter().any(|&part| part == "base64");
    if !is_base64 {
        return Err(AppError::BadRequest(
            "data URL must be base64 encoded".to_string(),
        ));
    }

    Ok((mime_type, data.to_string()))
}

/// Validate image MIME type against whitelist
pub fn validate_image_mime(mime: &str) -> Result<(), AppError> {
    match mime {
        "image/jpeg" | "image/jpg" | "image/png" | "image/webp" | "image/gif" => Ok(()),
        _ => Err(AppError::BadRequest(format!(
            "unsupported image MIME type: {}. Supported types: image/jpeg, image/png, image/webp, image/gif",
            mime
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_simple_text_message() {
        let messages = json!([
            {
                "role": "user",
                "content": "Hello, world!"
            }
        ]);

        let result = parse_messages(&messages).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].role, "user");
        assert_eq!(result[0].parts.len(), 1);
        match &result[0].parts[0] {
            VisionPart::Text { text } => assert_eq!(text, "Hello, world!"),
            _ => panic!("Expected text part"),
        }
    }

    #[test]
    fn test_parse_openai_chat_style() {
        let messages = json!([
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "What's in this image?"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "https://example.com/image.jpg",
                            "detail": "high"
                        }
                    }
                ]
            }
        ]);

        let result = parse_messages(&messages).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].parts.len(), 2);

        match &result[0].parts[0] {
            VisionPart::Text { text } => assert_eq!(text, "What's in this image?"),
            _ => panic!("Expected text part"),
        }

        match &result[0].parts[1] {
            VisionPart::Image { image } => {
                match &image.source {
                    ImageSource::Url { url } => {
                        assert_eq!(url, "https://example.com/image.jpg")
                    }
                    _ => panic!("Expected URL source"),
                }
                assert_eq!(image.detail.as_deref(), Some("high"));
            }
            _ => panic!("Expected image part"),
        }
    }

    #[test]
    fn test_parse_data_url() {
        let data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";
        let (mime_type, data) = parse_data_url(data_url).unwrap();
        assert_eq!(mime_type, "image/png");
        assert_eq!(data, "iVBORw0KGgoAAAANSUhEUgAAAAUA");
    }

    #[test]
    fn test_validate_image_mime() {
        assert!(validate_image_mime("image/jpeg").is_ok());
        assert!(validate_image_mime("image/png").is_ok());
        assert!(validate_image_mime("image/webp").is_ok());
        assert!(validate_image_mime("image/gif").is_ok());
        assert!(validate_image_mime("image/bmp").is_err());
        assert!(validate_image_mime("text/plain").is_err());
    }

    #[test]
    fn test_flatten_text() {
        let messages = vec![
            VisionMessage {
                role: "user".to_string(),
                parts: vec![
                    VisionPart::Text {
                        text: "First message".to_string(),
                    },
                    VisionPart::Image {
                        image: VisionImage {
                            source: ImageSource::Url {
                                url: "https://example.com/img.jpg".to_string(),
                            },
                            detail: None,
                            media_type: None,
                        },
                    },
                ],
            },
            VisionMessage {
                role: "assistant".to_string(),
                parts: vec![VisionPart::Text {
                    text: "Second message".to_string(),
                }],
            },
        ];

        let text = flatten_text(&messages);
        assert_eq!(text, "First message\nSecond message");
    }

    #[test]
    fn test_contains_images() {
        let messages_with_image = vec![VisionMessage {
            role: "user".to_string(),
            parts: vec![VisionPart::Image {
                image: VisionImage {
                    source: ImageSource::Url {
                        url: "https://example.com/img.jpg".to_string(),
                    },
                    detail: None,
                    media_type: None,
                },
            }],
        }];

        let messages_text_only = vec![VisionMessage {
            role: "user".to_string(),
            parts: vec![VisionPart::Text {
                text: "Hello".to_string(),
            }],
        }];

        assert!(contains_images(&messages_with_image));
        assert!(!contains_images(&messages_text_only));
    }

    #[test]
    fn test_parse_anthropic_style() {
        let messages = json!([
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Analyze this"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": "base64data..."
                        }
                    }
                ]
            }
        ]);

        let result = parse_messages(&messages).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].parts.len(), 2);

        match &result[0].parts[1] {
            VisionPart::Image { image } => match &image.source {
                ImageSource::Base64 {
                    mime_type,
                    data_base64,
                } => {
                    assert_eq!(mime_type, "image/jpeg");
                    assert_eq!(data_base64, "base64data...");
                }
                _ => panic!("Expected Base64 source"),
            },
            _ => panic!("Expected image part"),
        }
    }
}
