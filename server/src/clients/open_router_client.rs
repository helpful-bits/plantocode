use crate::error::AppError;
use actix_web::web;
use futures_util::{Stream, StreamExt, TryStreamExt};
use reqwest::{Client, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::config::settings::AppSettings;
use crate::clients::usage_extractor::{UsageExtractor, ProviderUsage};
use tracing::{debug, instrument};
use bigdecimal::BigDecimal;
use std::str::FromStr;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageInclude {
    pub include: bool,
}

// Base URL for OpenRouter API
// This client is specifically used for DeepSeek models routed through OpenRouter
const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

// OpenRouter Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterChatRequest {
    pub model: String,
    pub messages: Vec<OpenRouterMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInclude>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterMessage {
    pub role: String,
    pub content: OpenRouterContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenRouterContent {
    Text(String),
    Parts(Vec<OpenRouterContentPart>),
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub image_url: Option<OpenRouterImageUrl>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterImageUrl {
    pub url: String,
}

// OpenRouter Chat Completion Response Structs
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterChatResponse {
    pub id: String,
    pub choices: Vec<OpenRouterChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenRouterUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterResponseMessage,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterResponseMessage {
    pub role: String,
    pub content: String,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenRouterUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cost: Option<f64>,
    #[serde(default)]
    pub cached_input_tokens: i32,
    #[serde(default)]
    pub cache_write_tokens: i32,
    #[serde(default)]
    pub cache_read_tokens: i32,
    pub prompt_tokens_details: Option<OpenRouterPromptTokensDetails>,
}


#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenRouterPromptTokensDetails {
    pub cached_tokens: Option<i32>,
}

// OpenRouter Streaming Structs
#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenRouterStreamChunk {
    pub id: String,
    pub choices: Vec<OpenRouterStreamChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenRouterUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenRouterStreamChoice {
    pub delta: OpenRouterStreamDelta,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenRouterStreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}


// OpenRouter Client
pub struct OpenRouterClient {
    client: Client,
    api_key: String,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
    model_repo: Arc<crate::db::repositories::model_repository::ModelRepository>,
}

impl OpenRouterClient {
    pub fn new(app_settings: &AppSettings, model_repo: Arc<crate::db::repositories::model_repository::ModelRepository>) -> Result<Self, crate::error::AppError> {
        let api_key = app_settings.api_keys.openrouter_api_key.clone()
            .ok_or_else(|| crate::error::AppError::Configuration("OpenRouter API key must be configured".to_string()))?;
        
        let client = crate::utils::http_client::new_api_client();
        
        Ok(Self {
            client,
            api_key,
            base_url: OPENROUTER_BASE_URL.to_string(),
            request_id_counter: Arc::new(Mutex::new(0)),
            model_repo,
        })
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }


    async fn get_next_request_id(&self) -> u64 {
        let mut counter = self.request_id_counter.lock().await;
        *counter += 1;
        *counter
    }

    /// Get the provider-specific model ID for OpenRouter
    /// Falls back to the internal ID if no mapping is found
    async fn get_provider_model_id(&self, internal_model_id: &str) -> Result<String, AppError> {
        // Query the repository for the OpenRouter provider model ID
        match self.model_repo.find_provider_model_id(internal_model_id, "openrouter").await {
            Ok(Some(provider_model_id)) => {
                Ok(provider_model_id)
            },
            Ok(None) => {
                // No OpenRouter mapping found, fall back to internal ID
                Ok(internal_model_id.to_string())
            },
            Err(e) => {
                // Database error, fall back to internal ID
                tracing::warn!("Failed to query model repository for OpenRouter mapping of {}: {}. Using fallback.", internal_model_id, e);
                Ok(internal_model_id.to_string())
            }
        }
    }

    // Chat Completions
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn chat_completion(&self, request: OpenRouterChatRequest, user_id: &str) -> Result<(OpenRouterChatResponse, HeaderMap, i32, i32, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/chat/completions", self.base_url);
        
        let mut request_with_usage = request;
        request_with_usage.usage = Some(UsageInclude { include: true });
        
        // Map model ID to OpenRouter-compatible format
        request_with_usage.model = self.get_provider_model_id(&request_with_usage.model).await?;
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("HTTP-Referer", "https://vibe-manager.app")
            .header("X-Title", "Vibe Manager")
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&request_with_usage)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenRouter request failed: {}", e.to_string())))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "OpenRouter request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<OpenRouterChatResponse>().await
            .map_err(|e| AppError::Internal(format!("OpenRouter deserialization failed: {}", e.to_string())))?;
        
        let (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens) = if let Some(usage) = &result.usage {
            // Extract cache_read_tokens from prompt_tokens_details.cached_tokens if available
            let cache_read = usage.prompt_tokens_details
                .as_ref()
                .and_then(|details| details.cached_tokens)
                .unwrap_or(0);
            // prompt_tokens already represents total input tokens per CONTRACT
            (usage.prompt_tokens, 0, cache_read, usage.completion_tokens)
        } else {
            (0, 0, 0, 0)
        };
        
        Ok((result, headers, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self, 
        request: OpenRouterChatRequest,
        user_id: String
    ) -> Result<(HeaderMap, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>), AppError> {
        // Map model ID to OpenRouter-compatible format before the async move
        let mut streaming_request = request.clone();
        streaming_request.stream = Some(true);
        streaming_request.usage = Some(UsageInclude { include: true });
        streaming_request.model = self.get_provider_model_id(&streaming_request.model).await?;
        
        // Clone necessary parts for 'static lifetime
        let client = self.client.clone();
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();
        
        // Create the stream in an async move block to ensure 'static lifetime
        let result = async move {
            let request_id = {
                let mut counter = request_id_counter.lock().await;
                *counter += 1;
                *counter
            };
            let url = format!("{}/chat/completions", base_url);
            
            let response = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("HTTP-Referer", "https://vibe-manager.app")
                .header("X-Title", "Vibe Manager")
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&streaming_request)
                .send()
                .await
                .map_err(|e| AppError::External(format!("OpenRouter request failed: {}", e.to_string())))?;
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenRouter streaming request failed with status {}: {}",
                    status, error_text
                )));
            }
            
            // Return a stream that can be consumed by actix-web
            let stream = response.bytes_stream()
                .map(|result| {
                    match result {
                        Ok(bytes) => Ok(web::Bytes::from(bytes)),
                        Err(e) => Err(AppError::External(format!("OpenRouter network error: {}", e.to_string()))),
                    }
                });
                
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
            Ok((headers, boxed_stream))
        }.await?;
        
        Ok(result)
    }
    

    
    // Convert a generic JSON Value into an OpenRouterChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<OpenRouterChatRequest, AppError> {
        serde_json::from_value(payload)
            .map_err(|e| AppError::BadRequest(format!("Failed to convert payload to chat request: {}", e)))
    }
    
    /// Parse a streaming chunk and extract OpenRouter usage if present
    /// This method is used to properly handle cost extraction from streaming chunks
    pub fn parse_streaming_chunk(&self, chunk_data: &str) -> Option<OpenRouterUsage> {
        if chunk_data.starts_with("data: ") {
            let json_str = &chunk_data[6..]; // Remove "data: " prefix
            if json_str.trim() == "[DONE]" {
                return None;
            }
            
            // Try to parse the chunk as an OpenRouter stream chunk
            if let Ok(chunk) = serde_json::from_str::<OpenRouterStreamChunk>(json_str.trim()) {
                if let Some(usage) = chunk.usage {
                    debug!("Parsed OpenRouter streaming usage: prompt_tokens={}, completion_tokens={}, cost={:?}", 
                           usage.prompt_tokens, usage.completion_tokens, usage.cost);
                    return Some(usage);
                }
            }
        }
        None
    }
    
    
    /// Extract usage from parsed JSON (handles OpenRouter response format)
    fn extract_usage_from_json(&self, json_value: &serde_json::Value, model_id: &str) -> Option<ProviderUsage> {
        let usage = json_value.get("usage")?;
        
        // Handle OpenRouter format: {"prompt_tokens", "completion_tokens", "cost", "prompt_tokens_details": {"cached_tokens"}}
        // OpenRouter's prompt_tokens already represents total input tokens
        let prompt_tokens = match usage.get("prompt_tokens").and_then(|v| v.as_i64()) {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid prompt_tokens in OpenRouter response");
                return None;
            }
        };
        
        let completion_tokens = match usage.get("completion_tokens").and_then(|v| v.as_i64()) {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid completion_tokens in OpenRouter response");
                return None;
            }
        };
        
        // Parse prompt_tokens_details.cached_tokens for cache_read_tokens
        let cache_read_tokens = usage
            .get("prompt_tokens_details")
            .and_then(|details| details.get("cached_tokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        
        // Set cache_write_tokens to 0 unless OpenRouter provides explicit fields
        let cache_write_tokens = 0;
        
        // Improve the cost parsing logic to robustly handle both numbers and strings
        let cost = usage.get("cost")
            .and_then(|v| match v {
                serde_json::Value::Number(n) => n.as_f64(),
                serde_json::Value::String(s) => {
                    // Try to parse string as float
                    s.parse::<f64>()
                        .map_err(|e| {
                            tracing::warn!("Failed to parse cost string '{}': {}", s, e);
                            e
                        })
                        .ok()
                },
                _ => {
                    tracing::warn!("Invalid cost format in OpenRouter response: {:?}", v);
                    None
                }
            })
            .and_then(|f| {
                // Validate cost is non-negative
                if f < 0.0 {
                    tracing::warn!("Negative cost value in OpenRouter response: {}", f);
                    None
                } else if f.is_nan() || f.is_infinite() {
                    tracing::warn!("Invalid cost value (NaN or Infinite) in OpenRouter response: {}", f);
                    None
                } else {
                    // Convert to BigDecimal with proper precision handling
                    BigDecimal::from_str(&format!("{:.10}", f))  // Use fixed precision to avoid scientific notation
                        .map_err(|e| {
                            tracing::warn!("Failed to convert cost to BigDecimal: {} - {}", f, e);
                            e
                        })
                        .ok()
                }
            });
        
        if let Some(ref cost_value) = cost {
            debug!("OpenRouter cost extracted: ${} for model: {} (total_input_tokens: {}, output_tokens: {}, cache_read: {})", 
                   cost_value, model_id, prompt_tokens, completion_tokens, cache_read_tokens);
        } else {
            debug!("No valid cost found in OpenRouter response for model: {} (total_input_tokens: {}, output_tokens: {}, cache_read: {})", 
                   model_id, prompt_tokens, completion_tokens, cache_read_tokens);
            // Log the cost field for debugging if it exists
            if let Some(cost_field) = usage.get("cost") {
                debug!("OpenRouter cost field value: {:?}", cost_field);
            }
        }
        
        // Use the with_cost constructor for consistency with other providers
        let usage = if let Some(cost_val) = cost {
            ProviderUsage::with_cost(
                prompt_tokens,      // Total input tokens (follows CONTRACT)
                completion_tokens,  // Output tokens
                cache_write_tokens, // Set to 0 unless OpenRouter provides explicit fields
                cache_read_tokens,  // Parsed from prompt_tokens_details.cached_tokens
                model_id.to_string(),
                cost_val            // Provider-calculated cost
            )
        } else {
            ProviderUsage::new(
                prompt_tokens,      // Total input tokens (follows CONTRACT)
                completion_tokens,  // Output tokens
                cache_write_tokens, // Set to 0 unless OpenRouter provides explicit fields
                cache_read_tokens,  // Parsed from prompt_tokens_details.cached_tokens
                model_id.to_string(),
            )
        };
        
        usage.validate().ok()?;
        
        Some(usage)
    }
}

impl UsageExtractor for OpenRouterClient {
    fn extract_usage(&self, raw_json: &serde_json::Value) -> Option<ProviderUsage> {
        let usage = raw_json.get("usage")?;
        
        let prompt_tokens = usage.get("prompt_tokens")?.as_i64()? as i32;
        let completion_tokens = usage.get("completion_tokens")?.as_i64()? as i32;
        
        let usage = ProviderUsage::new(
            prompt_tokens,
            completion_tokens,
            0, // cache_write_tokens
            0, // cache_read_tokens  
            String::new(), // model_id will be empty for trait method
        );
        
        usage.validate().ok()?;
        Some(usage)
    }

    /// Extract usage information from OpenRouter HTTP response body
    /// Supports usage: {prompt_tokens, completion_tokens, cost}
    /// Note: OpenRouter's prompt_tokens already represents total input tokens (no separate cache tracking)
    async fn extract_from_response_body(&self, body: &[u8], model_id: &str) -> Result<ProviderUsage, AppError> {
        let body_str = std::str::from_utf8(body)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid UTF-8: {}", e)))?;
        
        debug!("OpenRouter extract_from_response_body called - model: {}, body_length: {}", 
               model_id, body.len());
        
        // Handle JSON response
        debug!("Processing OpenRouter non-streaming response for model: {}", model_id);
        let json_value: serde_json::Value = serde_json::from_str(body_str)
            .map_err(|e| AppError::External(format!("Failed to parse JSON: {}", e)))?;
        
        // Extract usage from parsed JSON
        self.extract_usage_from_json(&json_value, model_id)
            .map(|mut usage| {
                usage.model_id = model_id.to_string();
                debug!("Successfully extracted usage from OpenRouter response: total_input={}, output={}, cost={:?}", 
                       usage.prompt_tokens, usage.completion_tokens, usage.cost);
                usage
            })
            .ok_or_else(|| AppError::External("Failed to extract usage from OpenRouter response".to_string()))
    }
    
}

impl Clone for OpenRouterClient {
    fn clone(&self) -> Self {
        Self {
            client: crate::utils::http_client::new_api_client(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
            model_repo: self.model_repo.clone(),
        }
    }
}