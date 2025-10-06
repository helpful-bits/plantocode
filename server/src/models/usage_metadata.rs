use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct UsageMetadata {
    // Reasoning tokens (for o1, DeepSeek, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<i64>,

    // Google's version of reasoning tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thoughts_tokens: Option<i64>,

    // Multimodal tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_tokens_input: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_tokens_output: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_tokens_input: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_tokens_output: Option<i64>,

    // Cache tokens details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<i64>,

    // Prediction tokens (for speculative decoding)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accepted_prediction_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rejected_prediction_tokens: Option<i64>,

    // Provider cost details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_byok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_inference_cost: Option<f64>,

    // Token modalities (Google)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_details: Option<Vec<TokenModalityDetail>>,

    // System info
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,

    // Raw provider-specific data for future fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_specific: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TokenModalityDetail {
    pub modality: String, // "TEXT", "IMAGE", "AUDIO"
    pub token_count: i64,
}

impl UsageMetadata {
    pub fn merge_with(&mut self, other: &UsageMetadata) {
        // Merge non-None values from other into self
        if other.reasoning_tokens.is_some() {
            self.reasoning_tokens = other.reasoning_tokens;
        }
        if other.thoughts_tokens.is_some() {
            self.thoughts_tokens = other.thoughts_tokens;
        }
        if other.audio_tokens_input.is_some() {
            self.audio_tokens_input = other.audio_tokens_input;
        }
        if other.audio_tokens_output.is_some() {
            self.audio_tokens_output = other.audio_tokens_output;
        }
        if other.image_tokens.is_some() {
            self.image_tokens = other.image_tokens;
        }
        if other.video_tokens.is_some() {
            self.video_tokens = other.video_tokens;
        }
        if other.text_tokens.is_some() {
            self.text_tokens = other.text_tokens;
        }
        if other.text_tokens_input.is_some() {
            self.text_tokens_input = other.text_tokens_input;
        }
        if other.text_tokens_output.is_some() {
            self.text_tokens_output = other.text_tokens_output;
        }
        if other.cache_creation_input_tokens.is_some() {
            self.cache_creation_input_tokens = other.cache_creation_input_tokens;
        }
        if other.cache_read_input_tokens.is_some() {
            self.cache_read_input_tokens = other.cache_read_input_tokens;
        }
        if other.accepted_prediction_tokens.is_some() {
            self.accepted_prediction_tokens = other.accepted_prediction_tokens;
        }
        if other.rejected_prediction_tokens.is_some() {
            self.rejected_prediction_tokens = other.rejected_prediction_tokens;
        }
        if other.is_byok.is_some() {
            self.is_byok = other.is_byok;
        }
        if other.upstream_inference_cost.is_some() {
            self.upstream_inference_cost = other.upstream_inference_cost;
        }
        if other.prompt_tokens_details.is_some() {
            self.prompt_tokens_details = other.prompt_tokens_details.clone();
        }
        if other.model_version.is_some() {
            self.model_version = other.model_version.clone();
        }
        if other.system_fingerprint.is_some() {
            self.system_fingerprint = other.system_fingerprint.clone();
        }
        if other.response_id.is_some() {
            self.response_id = other.response_id.clone();
        }
        if other.provider.is_some() {
            self.provider = other.provider.clone();
        }
        if other.provider_specific.is_some() {
            self.provider_specific = other.provider_specific.clone();
        }
    }
}
