//! Provider-aware validation for vision/image content.
//!
//! This module provides validation logic to ensure that vision/image content
//! conforms to the constraints imposed by different AI providers.

use crate::error::AppError;

/// Constraints for vision/image content specific to each provider.
#[derive(Debug, Clone)]
pub struct ProviderVisionConstraints {
    /// Allowed MIME types for images (e.g., "image/jpeg", "image/png").
    pub allowed_image_mime_types: Vec<&'static str>,
    /// Allowed MIME types for documents (e.g., "application/pdf").
    pub allowed_document_mime_types: Vec<&'static str>,
    /// Maximum number of images allowed in a single request.
    pub max_images: Option<usize>,
    /// Maximum number of documents allowed in a single request.
    pub max_documents: Option<usize>,
    /// Maximum total bytes across all images in a request.
    pub max_total_bytes: Option<u64>,
    /// Maximum total bytes across all documents in a request.
    pub max_total_document_bytes: Option<u64>,
    /// Maximum bytes for a single image.
    pub max_single_image_bytes: Option<u64>,
    /// Maximum bytes for a single document.
    pub max_single_document_bytes: Option<u64>,
}

impl ProviderVisionConstraints {
    /// Check if a MIME type is allowed for this provider.
    pub fn is_mime_allowed(&self, mime: &str) -> bool {
        let canonical = canonicalize_mime(mime);
        self.allowed_image_mime_types
            .iter()
            .any(|&allowed| canonicalize_mime(allowed) == canonical)
    }

    /// Check if a document MIME type is allowed for this provider.
    pub fn is_document_mime_allowed(&self, mime: &str) -> bool {
        let canonical = canonicalize_mime(mime);
        self.allowed_document_mime_types
            .iter()
            .any(|&allowed| canonicalize_mime(allowed) == canonical)
    }
}

/// Returns vision constraints for a given provider code.
///
/// Provider codes are typically lowercase identifiers like "openai", "anthropic", etc.
pub fn constraints_for_provider(provider_code: &str) -> ProviderVisionConstraints {
    match provider_code.to_lowercase().as_str() {
        "openai" => ProviderVisionConstraints {
            allowed_image_mime_types: vec![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
            ],
            allowed_document_mime_types: vec!["application/pdf"],
            max_images: Some(500),
            max_documents: None,
            max_total_bytes: Some(50 * 1024 * 1024), // 50MB
            max_total_document_bytes: None,
            max_single_image_bytes: None,
            max_single_document_bytes: None,
        },
        "anthropic" => ProviderVisionConstraints {
            allowed_image_mime_types: vec![
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
            ],
            allowed_document_mime_types: vec!["application/pdf"],
            max_images: Some(100),
            max_documents: None,
            max_total_bytes: Some(32 * 1024 * 1024), // 32MB
            max_total_document_bytes: Some(32 * 1024 * 1024), // 32MB
            max_single_image_bytes: None,
            max_single_document_bytes: Some(32 * 1024 * 1024),
        },
        "google" => ProviderVisionConstraints {
            // Google does NOT support GIF
            allowed_image_mime_types: vec![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/heic",
                "image/heif",
            ],
            allowed_document_mime_types: vec!["application/pdf"],
            max_images: None,
            max_documents: None,
            max_total_bytes: Some(20 * 1024 * 1024), // 20MB
            max_total_document_bytes: Some(20 * 1024 * 1024), // 20MB
            max_single_image_bytes: None,
            max_single_document_bytes: Some(20 * 1024 * 1024),
        },
        "openrouter" => ProviderVisionConstraints {
            allowed_image_mime_types: vec![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
            ],
            allowed_document_mime_types: vec![],
            max_images: None,
            max_documents: None,
            max_total_bytes: None,
            max_total_document_bytes: None,
            max_single_image_bytes: None,
            max_single_document_bytes: None,
        },
        "xai" => ProviderVisionConstraints {
            // xAI only supports JPEG and PNG
            allowed_image_mime_types: vec!["image/jpeg", "image/png"],
            allowed_document_mime_types: vec![],
            max_images: None,
            max_documents: None,
            max_total_bytes: None,
            max_total_document_bytes: None,
            max_single_image_bytes: Some(20 * 1024 * 1024), // 20MB per image
            max_single_document_bytes: None,
        },
        // Default: permissive constraints for unknown providers
        _ => ProviderVisionConstraints {
            allowed_image_mime_types: vec![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
            ],
            allowed_document_mime_types: vec![],
            max_images: None,
            max_documents: None,
            max_total_bytes: None,
            max_total_document_bytes: None,
            max_single_image_bytes: None,
            max_single_document_bytes: None,
        },
    }
}

/// The kind of vision media item.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VisionMediaKind {
    /// An image (JPEG, PNG, WebP, GIF, etc.)
    Image,
    /// A document (PDF, etc.)
    Document,
}

/// Represents a single vision media item for validation purposes.
#[derive(Debug, Clone)]
pub struct VisionMediaItem {
    /// The kind of media (image or document).
    pub kind: VisionMediaKind,
    /// The MIME type of the media (e.g., "image/jpeg").
    pub mime_type: String,
    /// The length of the base64-encoded data, if known.
    /// Used to approximate the actual byte size.
    pub base64_len: Option<usize>,
}

/// Approximates the byte size from the length of base64-encoded data.
///
/// Base64 encoding increases the size by approximately 4/3, so decoding
/// reduces it by approximately 3/4.
pub fn approximate_bytes_from_base64_len(len: usize) -> u64 {
    (3 * len / 4) as u64
}

/// Validates vision media items against provider-specific constraints.
///
/// # Arguments
///
/// * `provider_code` - The provider identifier (e.g., "openai", "anthropic", "google").
/// * `items` - The vision media items to validate.
///
/// # Returns
///
/// * `Ok(())` if all items pass validation.
/// * `Err(AppError::Validation(...))` if validation fails.
///
/// # Validation Checks
///
/// 1. Each item's MIME type is allowed for the provider.
/// 2. The number of images does not exceed the provider's limit.
/// 3. The total size of all images does not exceed the provider's limit.
/// 4. Each individual image does not exceed the provider's per-image limit.
/// 5. For Google, GIF images are explicitly rejected with a clear error message.
pub fn validate_vision_media_for_provider(
    provider_code: &str,
    items: &[VisionMediaItem],
) -> Result<(), AppError> {
    let constraints = constraints_for_provider(provider_code);
    let provider_lower = provider_code.to_lowercase();

    // Count images
    let image_count = items
        .iter()
        .filter(|item| item.kind == VisionMediaKind::Image)
        .count();

    let document_count = items
        .iter()
        .filter(|item| item.kind == VisionMediaKind::Document)
        .count();

    // Check max images limit
    if let Some(max_images) = constraints.max_images {
        if image_count > max_images {
            return Err(AppError::Validation(format!(
                "{}: image count {} exceeds maximum of {} images",
                provider_lower, image_count, max_images
            )));
        }
    }

    // Check max documents limit
    if let Some(max_documents) = constraints.max_documents {
        if document_count > max_documents {
            return Err(AppError::Validation(format!(
                "{}: document count {} exceeds maximum of {} documents",
                provider_lower, document_count, max_documents
            )));
        }
    }

    let mut total_image_bytes: u64 = 0;
    let mut total_document_bytes: u64 = 0;

    for item in items {
        match item.kind {
            VisionMediaKind::Image => {
                let canonical_mime = canonicalize_mime(&item.mime_type);

                // Special case for Google: explicitly reject GIF with clear message
                if provider_lower == "google" && canonical_mime == "image/gif" {
                    return Err(AppError::Validation(
                        "google: GIF format is not supported; use JPEG, PNG, WebP, HEIC, or HEIF".to_string()
                    ));
                }

                // Check MIME type is allowed
                if !constraints.is_mime_allowed(&item.mime_type) {
                    return Err(AppError::Validation(format!(
                        "{}: MIME type '{}' is not supported; allowed types: {}",
                        provider_lower,
                        item.mime_type,
                        constraints.allowed_image_mime_types.join(", ")
                    )));
                }

                // Calculate byte size if base64 length is known
                if let Some(base64_len) = item.base64_len {
                    let item_bytes = approximate_bytes_from_base64_len(base64_len);

                    // Check single image size limit
                    if let Some(max_single) = constraints.max_single_image_bytes {
                        if item_bytes > max_single {
                            let max_mb = max_single / (1024 * 1024);
                            let item_mb = item_bytes / (1024 * 1024);
                            return Err(AppError::Validation(format!(
                                "{}: image size ~{}MB exceeds {}MB limit",
                                provider_lower, item_mb, max_mb
                            )));
                        }
                    }

                    total_image_bytes += item_bytes;
                }
            }
            VisionMediaKind::Document => {
                if constraints.allowed_document_mime_types.is_empty() {
                    return Err(AppError::Validation(format!(
                        "{}: document inputs are not supported",
                        provider_lower
                    )));
                }

                if !constraints.is_document_mime_allowed(&item.mime_type) {
                    return Err(AppError::Validation(format!(
                        "{}: document MIME type '{}' is not supported; allowed types: {}",
                        provider_lower,
                        item.mime_type,
                        constraints.allowed_document_mime_types.join(", ")
                    )));
                }

                if let Some(base64_len) = item.base64_len {
                    let item_bytes = approximate_bytes_from_base64_len(base64_len);

                    if let Some(max_single) = constraints.max_single_document_bytes {
                        if item_bytes > max_single {
                            let max_mb = max_single / (1024 * 1024);
                            let item_mb = item_bytes / (1024 * 1024);
                            return Err(AppError::Validation(format!(
                                "{}: document size ~{}MB exceeds {}MB limit",
                                provider_lower, item_mb, max_mb
                            )));
                        }
                    }

                    total_document_bytes += item_bytes;
                }
            }
        }
    }

    // Check total size limit
    if let Some(max_total) = constraints.max_total_bytes {
        if total_image_bytes > max_total {
            let max_mb = max_total / (1024 * 1024);
            let total_mb = total_image_bytes / (1024 * 1024);
            return Err(AppError::Validation(format!(
                "{}: total image size ~{}MB exceeds {}MB limit",
                provider_lower, total_mb, max_mb
            )));
        }
    }

    if let Some(max_total) = constraints.max_total_document_bytes {
        if total_document_bytes > max_total {
            let max_mb = max_total / (1024 * 1024);
            let total_mb = total_document_bytes / (1024 * 1024);
            return Err(AppError::Validation(format!(
                "{}: total document size ~{}MB exceeds {}MB limit",
                provider_lower, total_mb, max_mb
            )));
        }
    }

    Ok(())
}

/// Canonicalizes a MIME type to a standard form.
///
/// - Converts to lowercase.
/// - Converts "image/jpg" to "image/jpeg".
pub fn canonicalize_mime(mime: &str) -> String {
    let lower = mime.to_lowercase();
    if lower == "image/jpg" {
        "image/jpeg".to_string()
    } else {
        lower
    }
}

/// Removes whitespace from a base64 string.
///
/// Some base64 encodings include line breaks or spaces for formatting.
/// This function strips all whitespace characters.
pub fn scrub_base64(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constraints_for_openai() {
        let constraints = constraints_for_provider("openai");
        assert_eq!(constraints.max_images, Some(500));
        assert_eq!(constraints.max_total_bytes, Some(50 * 1024 * 1024));
        assert!(constraints.is_mime_allowed("image/jpeg"));
        assert!(constraints.is_mime_allowed("image/gif"));
        assert!(constraints.is_document_mime_allowed("application/pdf"));
    }

    #[test]
    fn test_constraints_for_anthropic() {
        let constraints = constraints_for_provider("anthropic");
        assert_eq!(constraints.max_images, Some(100));
        assert_eq!(constraints.max_total_bytes, Some(32 * 1024 * 1024));
        assert!(constraints.is_mime_allowed("image/jpeg"));
        assert!(constraints.is_mime_allowed("image/webp"));
    }

    #[test]
    fn test_constraints_for_google() {
        let constraints = constraints_for_provider("google");
        assert_eq!(constraints.max_total_bytes, Some(20 * 1024 * 1024));
        assert!(constraints.is_mime_allowed("image/jpeg"));
        assert!(constraints.is_mime_allowed("image/heic"));
        assert!(!constraints.is_mime_allowed("image/gif")); // Google doesn't support GIF
    }

    #[test]
    fn test_constraints_for_xai() {
        let constraints = constraints_for_provider("xai");
        assert_eq!(constraints.max_single_image_bytes, Some(20 * 1024 * 1024));
        assert!(constraints.is_mime_allowed("image/jpeg"));
        assert!(constraints.is_mime_allowed("image/png"));
        assert!(!constraints.is_mime_allowed("image/gif"));
        assert!(!constraints.is_mime_allowed("image/webp"));
    }

    #[test]
    fn test_canonicalize_mime() {
        assert_eq!(canonicalize_mime("image/jpg"), "image/jpeg");
        assert_eq!(canonicalize_mime("IMAGE/JPEG"), "image/jpeg");
        assert_eq!(canonicalize_mime("image/png"), "image/png");
        assert_eq!(canonicalize_mime("IMAGE/PNG"), "image/png");
    }

    #[test]
    fn test_scrub_base64() {
        assert_eq!(scrub_base64("abc def"), "abcdef");
        assert_eq!(scrub_base64("abc\ndef\n"), "abcdef");
        assert_eq!(scrub_base64("abc\r\ndef"), "abcdef");
        assert_eq!(scrub_base64("  abc  "), "abc");
    }

    #[test]
    fn test_approximate_bytes_from_base64_len() {
        // 4 base64 chars = 3 bytes
        assert_eq!(approximate_bytes_from_base64_len(4), 3);
        assert_eq!(approximate_bytes_from_base64_len(100), 75);
        assert_eq!(approximate_bytes_from_base64_len(1000), 750);
    }

    #[test]
    fn test_validate_valid_items() {
        let items = vec![
            VisionMediaItem {
                kind: VisionMediaKind::Image,
                mime_type: "image/jpeg".to_string(),
                base64_len: Some(1000),
            },
            VisionMediaItem {
                kind: VisionMediaKind::Image,
                mime_type: "image/png".to_string(),
                base64_len: Some(2000),
            },
        ];

        assert!(validate_vision_media_for_provider("openai", &items).is_ok());
    }

    #[test]
    fn test_validate_google_rejects_gif() {
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Image,
            mime_type: "image/gif".to_string(),
            base64_len: Some(1000),
        }];

        let result = validate_vision_media_for_provider("google", &items);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("google: GIF format is not supported"));
    }

    #[test]
    fn test_validate_exceeds_max_images() {
        // Create 101 images for Anthropic (which has limit of 100)
        let items: Vec<VisionMediaItem> = (0..101)
            .map(|_| VisionMediaItem {
                kind: VisionMediaKind::Image,
                mime_type: "image/jpeg".to_string(),
                base64_len: Some(100),
            })
            .collect();

        let result = validate_vision_media_for_provider("anthropic", &items);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("anthropic: image count 101 exceeds maximum of 100 images"));
    }

    #[test]
    fn test_validate_exceeds_total_bytes() {
        // Create image that exceeds 20MB limit for Google
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Image,
            mime_type: "image/jpeg".to_string(),
            // 30MB worth of base64 (30 * 1024 * 1024 * 4 / 3 = ~40MB base64 length)
            base64_len: Some(40 * 1024 * 1024),
        }];

        let result = validate_vision_media_for_provider("google", &items);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("google: total image size"));
        assert!(err.to_string().contains("exceeds 20MB limit"));
    }

    #[test]
    fn test_validate_exceeds_single_image_bytes() {
        // Create image that exceeds 20MB per-image limit for xAI
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Image,
            mime_type: "image/jpeg".to_string(),
            // 25MB worth of base64
            base64_len: Some(34 * 1024 * 1024),
        }];

        let result = validate_vision_media_for_provider("xai", &items);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("xai: image size"));
        assert!(err.to_string().contains("exceeds 20MB limit"));
    }

    #[test]
    fn test_validate_unsupported_mime_type() {
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Image,
            mime_type: "image/webp".to_string(),
            base64_len: Some(1000),
        }];

        // xAI doesn't support webp
        let result = validate_vision_media_for_provider("xai", &items);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("xai: MIME type 'image/webp' is not supported"));
    }

    #[test]
    fn test_validate_documents_allowed_for_anthropic() {
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Document,
            mime_type: "application/pdf".to_string(),
            base64_len: Some(1024 * 1024),
        }];

        assert!(validate_vision_media_for_provider("anthropic", &items).is_ok());
    }

    #[test]
    fn test_validate_documents_allowed_for_openai() {
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Document,
            mime_type: "application/pdf".to_string(),
            base64_len: Some(1024 * 1024),
        }];

        let result = validate_vision_media_for_provider("openai", &items);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_case_insensitive_provider() {
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Image,
            mime_type: "image/jpeg".to_string(),
            base64_len: Some(1000),
        }];

        assert!(validate_vision_media_for_provider("OpenAI", &items).is_ok());
        assert!(validate_vision_media_for_provider("OPENAI", &items).is_ok());
        assert!(validate_vision_media_for_provider("Anthropic", &items).is_ok());
    }

    #[test]
    fn test_validate_jpg_as_jpeg() {
        let items = vec![VisionMediaItem {
            kind: VisionMediaKind::Image,
            mime_type: "image/jpg".to_string(), // Non-canonical
            base64_len: Some(1000),
        }];

        // Should work because image/jpg is canonicalized to image/jpeg
        assert!(validate_vision_media_for_provider("openai", &items).is_ok());
    }
}
