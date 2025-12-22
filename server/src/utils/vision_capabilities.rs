use serde_json::Value;

/// Check if a model supports vision/image inputs based on its capabilities JSON
///
/// Checks multiple capability formats:
/// - `{"vision": true}`
/// - `{"multimodal": {"vision": true}}`
/// - `{"modalities": ["image", ...]}` or `{"modalities": ["vision", ...]}`
pub fn model_supports_vision(capabilities: &Value) -> bool {
    // Check direct vision flag
    if let Some(b) = capabilities.get("vision").and_then(|v| v.as_bool()) {
        return b;
    }

    // Check nested multimodal.vision
    if let Some(b) = capabilities.get("multimodal")
        .and_then(|m| m.get("vision"))
        .and_then(|v| v.as_bool()) {
        return b;
    }

    // Check modalities array for "image" or "vision"
    if let Some(arr) = capabilities.get("modalities").and_then(|v| v.as_array()) {
        if arr.iter().any(|v| v.as_str() == Some("image") || v.as_str() == Some("vision")) {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_direct_vision_flag() {
        assert!(model_supports_vision(&json!({"vision": true})));
        assert!(!model_supports_vision(&json!({"vision": false})));
    }

    #[test]
    fn test_nested_multimodal_vision() {
        assert!(model_supports_vision(&json!({"multimodal": {"vision": true}})));
        assert!(!model_supports_vision(&json!({"multimodal": {"vision": false}})));
    }

    #[test]
    fn test_modalities_array() {
        assert!(model_supports_vision(&json!({"modalities": ["text", "image"]})));
        assert!(model_supports_vision(&json!({"modalities": ["vision"]})));
        assert!(!model_supports_vision(&json!({"modalities": ["text", "audio"]})));
    }

    #[test]
    fn test_empty_capabilities() {
        assert!(!model_supports_vision(&json!({})));
        assert!(!model_supports_vision(&json!(null)));
    }
}
