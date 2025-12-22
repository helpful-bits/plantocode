use crate::error::AppError;
use std::time::Duration;

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024; // 20MB max
const ALLOWED_MIME_PREFIXES: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/// Fetch an image from a URL and return as (mime_type, base64_data)
///
/// Safety measures:
/// - Only allows http/https URLs
/// - Validates Content-Type is an image
/// - Enforces size limit (20MB)
/// - Timeout of 30 seconds
pub async fn fetch_image_as_base64(url: &str) -> Result<(String, String), AppError> {
    use base64::{Engine as _, engine::general_purpose};
    use futures_util::StreamExt;

    // Validate URL scheme
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(AppError::BadRequest(
            "Only http/https image URLs are allowed".to_string()
        ));
    }

    // Create client with timeout
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to create HTTP client: {}", e)))?;

    // Fetch the URL
    let response = client.get(url)
        .send()
        .await
        .map_err(|e| AppError::External(format!("Failed to fetch image: {}", e)))?;

    // Check status
    if !response.status().is_success() {
        return Err(AppError::External(format!(
            "Failed to fetch image: HTTP {}",
            response.status()
        )));
    }

    // Validate content type - extract and own the mime_type before consuming response
    let mime_type = {
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream");

        let mime = content_type.split(';').next().unwrap_or(content_type).trim();
        mime.to_string() // Convert to owned String before response is moved
    };

    if !ALLOWED_MIME_PREFIXES.iter().any(|&allowed| mime_type == allowed) {
        return Err(AppError::BadRequest(format!(
            "Invalid image content type: {}. Allowed: jpeg, png, webp, gif",
            mime_type
        )));
    }

    // Read bytes with size limit
    let mut bytes: Vec<u8> = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::External(format!("Error reading image: {}", e)))?;
        if bytes.len() + chunk.len() > MAX_IMAGE_BYTES {
            return Err(AppError::BadRequest(format!(
                "Image exceeds maximum size of {} MB",
                MAX_IMAGE_BYTES / (1024 * 1024)
            )));
        }
        bytes.extend_from_slice(&chunk);
    }

    // Encode to base64
    let base64_data = general_purpose::STANDARD.encode(&bytes);

    Ok((mime_type, base64_data))
}

/// Validate that a MIME type is an allowed image type
pub fn validate_image_mime_type(mime: &str) -> Result<(), AppError> {
    let mime_lower = mime.to_lowercase();
    if ALLOWED_MIME_PREFIXES.iter().any(|&allowed| mime_lower == allowed) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "Unsupported image type: {}. Allowed: image/jpeg, image/png, image/webp, image/gif",
            mime
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_image_mime_type() {
        assert!(validate_image_mime_type("image/jpeg").is_ok());
        assert!(validate_image_mime_type("image/png").is_ok());
        assert!(validate_image_mime_type("image/webp").is_ok());
        assert!(validate_image_mime_type("image/gif").is_ok());
        assert!(validate_image_mime_type("image/JPEG").is_ok()); // case insensitive
        assert!(validate_image_mime_type("application/pdf").is_err());
        assert!(validate_image_mime_type("text/plain").is_err());
    }
}
