use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use reqwest::{Client, header};
use serde_json::{json, Value};
use std::env;
use uuid::Uuid;
use log::{debug, error, info, warn};
use futures::{Stream, StreamExt};
use std::pin::Pin;
use actix_web::web::Bytes;
use tokio::sync::Mutex;
use std::sync::Arc;

pub struct ProxyService {
    client: Client,
    billing_service: Arc<BillingService>,
    api_usage_repository: Arc<ApiUsageRepository>,
    gemini_api_key: String,
    claude_api_key: String,
    groq_api_key: String,
}

impl ProxyService {
    pub fn new(
        billing_service: Arc<BillingService>,
        api_usage_repository: Arc<ApiUsageRepository>,
        api_keys_config: &crate::config::settings::ApiKeysConfig,
    ) -> Result<Self, AppError> {
        // Initialize HTTP client
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to create HTTP client: {}", e)))?;
        
        // Get API keys from config
        let gemini_api_key = api_keys_config.gemini_api_key.clone();
        let claude_api_key = api_keys_config.anthropic_api_key.clone();
        let groq_api_key = api_keys_config.groq_api_key.clone();
        
        Ok(Self {
            client,
            billing_service,
            api_usage_repository,
            gemini_api_key,
            claude_api_key,
            groq_api_key,
        })
    }
    
    // Forward a request to the appropriate service
    pub async fn forward_request(
        &self,
        user_id: &Uuid,
        service: &str,
        payload: Value,
    ) -> Result<Value, AppError> {
        // Check if user has access to this service
        self.billing_service.check_service_access(user_id, service).await?;
        
        // Get the appropriate API key and endpoint
        let (api_key, endpoint) = self.get_service_config(service)?;
        
        // Prepare request headers
        let mut headers = header::HeaderMap::new();
        
        match service {
            "gemini" => {
                // Gemini uses query parameter for API key
                let endpoint = format!("{}?key={}", endpoint, api_key);
                
                // Make request to Gemini
                let response = self.client.post(&endpoint)
                    .json(&payload)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("Gemini API request failed: {}", e)))?;
                
                // Check response status
                if !response.status().is_success() {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| "Failed to read error response".to_string());
                    
                    return Err(AppError::External(format!("Gemini API error: {}", error_text)));
                }
                
                // Parse response
                let response_json = response.json::<Value>().await
                    .map_err(|e| AppError::External(format!("Failed to parse Gemini response: {}", e)))?;
                
                // Record usage
                self.record_usage(user_id, service, &payload, &response_json).await?;
                
                Ok(response_json)
            },
            "claude" => {
                // Claude uses Authorization header
                headers.insert(
                    header::AUTHORIZATION,
                    format!("Bearer {}", api_key).parse().unwrap(),
                );
                
                // Make request to Claude
                let response = self.client.post(endpoint)
                    .headers(headers)
                    .json(&payload)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("Claude API request failed: {}", e)))?;
                
                // Check response status
                if !response.status().is_success() {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| "Failed to read error response".to_string());
                    
                    return Err(AppError::External(format!("Claude API error: {}", error_text)));
                }
                
                // Parse response
                let response_json = response.json::<Value>().await
                    .map_err(|e| AppError::External(format!("Failed to parse Claude response: {}", e)))?;
                
                // Record usage
                self.record_usage(user_id, service, &payload, &response_json).await?;
                
                Ok(response_json)
            },
            "groq" => {
                // Groq uses Authorization header
                headers.insert(
                    header::AUTHORIZATION,
                    format!("Bearer {}", api_key).parse().unwrap(),
                );
                
                // Make request to Groq
                let response = self.client.post(endpoint)
                    .headers(headers)
                    .json(&payload)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("Groq API request failed: {}", e)))?;
                
                // Check response status
                if !response.status().is_success() {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| "Failed to read error response".to_string());
                    
                    return Err(AppError::External(format!("Groq API error: {}", error_text)));
                }
                
                // Parse response
                let response_json = response.json::<Value>().await
                    .map_err(|e| AppError::External(format!("Failed to parse Groq response: {}", e)))?;
                
                // Record usage
                self.record_usage(user_id, service, &payload, &response_json).await?;
                
                Ok(response_json)
            },
            _ => Err(AppError::InvalidArgument(format!("Unsupported service: {}", service))),
        }
    }
    
    // Forward a streaming request
    pub async fn forward_stream_request(
        &self,
        user_id: &Uuid,
        service: &str,
        payload: Value,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, actix_web::Error>>>>, AppError> {
        // Check if user has access to this service
        self.billing_service.check_service_access(user_id, service).await?;
        
        // Get the appropriate API key and endpoint
        let (api_key, endpoint) = self.get_service_config(service)?;
        
        // Create usage counters
        let tokens_input = Arc::new(Mutex::new(0));
        let tokens_output = Arc::new(Mutex::new(0));
        let user_id_clone = user_id.clone();
        let service_clone = service.to_string();
        let self_clone = Arc::new(self.clone());
        
        match service {
            "gemini" => {
                // Gemini uses query parameter for API key
                let endpoint = format!("{}?key={}", endpoint, api_key);
                
                // Add streaming parameter to payload
                let mut streaming_payload = payload.clone();
                streaming_payload["stream"] = json!(true);
                
                // Make streaming request to Gemini
                let response = self.client.post(&endpoint)
                    .json(&streaming_payload)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("Gemini streaming request failed: {}", e)))?;
                
                // Check response status
                if !response.status().is_success() {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| "Failed to read error response".to_string());
                    
                    return Err(AppError::External(format!("Gemini API error: {}", error_text)));
                }
                
                // Estimate input tokens
                if let Some(prompt) = payload.get("contents") {
                    let input_tokens = self.estimate_tokens(prompt.to_string());
                    *tokens_input.lock().await = input_tokens;
                }
                
                // Create the stream
                let stream = response.bytes_stream().map(move |chunk| {
                    match chunk {
                        Ok(bytes) => {
                            // Process chunk and update token count
                            let bytes_clone = bytes.clone();
                            let tokens_output_clone = tokens_output.clone();
                            let user_id_clone = user_id_clone.clone();
                            let service_clone = service_clone.clone();
                            let self_clone = self_clone.clone();
                            let tokens_input_clone = tokens_input.clone();
                            
                            tokio::spawn(async move {
                                // Parse chunk as JSON
                                if let Ok(text) = String::from_utf8(bytes_clone.to_vec()) {
                                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                                        // Extract token count if available
                                        if let Some(candidates) = json.get("candidates") {
                                            if let Some(candidate) = candidates.get(0) {
                                                if let Some(content) = candidate.get("content") {
                                                    let chunk_tokens = self_clone.estimate_tokens(content.to_string());
                                                    let mut counter = tokens_output_clone.lock().await;
                                                    *counter += chunk_tokens;
                                                }
                                            }
                                        }
                                        
                                        // If this is the final chunk, record usage
                                        if json.get("promptFeedback").is_some() {
                                            let input_tokens = *tokens_input_clone.lock().await;
                                            let output_tokens = *tokens_output_clone.lock().await;
                                            
                                            if let Err(e) = self_clone.api_usage_repository.record_usage(
                                                &user_id_clone,
                                                &service_clone,
                                                input_tokens,
                                                output_tokens,
                                            ).await {
                                                error!("Failed to record API usage: {}", e);
                                            }
                                        }
                                    }
                                }
                            });
                            
                            Ok(bytes)
                        },
                        Err(e) => Err(actix_web::error::ErrorInternalServerError(format!("Stream error: {}", e))),
                    }
                });
                
                Ok(Box::pin(stream))
            },
            "claude" => {
                // Claude uses Authorization header
                let mut headers = header::HeaderMap::new();
                headers.insert(
                    header::AUTHORIZATION,
                    format!("Bearer {}", api_key).parse().unwrap(),
                );
                
                // Add streaming parameter to payload
                let mut streaming_payload = payload.clone();
                streaming_payload["stream"] = json!(true);
                
                // Make streaming request to Claude
                let response = self.client.post(endpoint)
                    .headers(headers)
                    .json(&streaming_payload)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("Claude streaming request failed: {}", e)))?;
                
                // Check response status
                if !response.status().is_success() {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| "Failed to read error response".to_string());
                    
                    return Err(AppError::External(format!("Claude API error: {}", error_text)));
                }
                
                // Estimate input tokens
                if let Some(messages) = payload.get("messages") {
                    let input_tokens = self.estimate_tokens(messages.to_string());
                    *tokens_input.lock().await = input_tokens;
                }
                
                // Create the stream
                let stream = response.bytes_stream().map(move |chunk| {
                    match chunk {
                        Ok(bytes) => {
                            // Process chunk and update token count
                            let bytes_clone = bytes.clone();
                            let tokens_output_clone = tokens_output.clone();
                            let user_id_clone = user_id_clone.clone();
                            let service_clone = service_clone.clone();
                            let self_clone = self_clone.clone();
                            let tokens_input_clone = tokens_input.clone();
                            
                            tokio::spawn(async move {
                                // Parse chunk as JSON
                                if let Ok(text) = String::from_utf8(bytes_clone.to_vec()) {
                                    // Claude sends "data: " prefix for each chunk
                                    let text = text.trim().strip_prefix("data: ").unwrap_or(&text);
                                    
                                    if let Ok(json) = serde_json::from_str::<Value>(text) {
                                        // Extract token count if available
                                        if let Some(delta) = json.get("delta") {
                                            if let Some(text) = delta.get("text") {
                                                let chunk_tokens = self_clone.estimate_tokens(text.to_string());
                                                let mut counter = tokens_output_clone.lock().await;
                                                *counter += chunk_tokens;
                                            }
                                        }
                                        
                                        // If this is the final chunk, record usage
                                        if json.get("type") == Some(&json!("message_stop")) {
                                            let input_tokens = *tokens_input_clone.lock().await;
                                            let output_tokens = *tokens_output_clone.lock().await;
                                            
                                            if let Err(e) = self_clone.api_usage_repository.record_usage(
                                                &user_id_clone,
                                                &service_clone,
                                                input_tokens,
                                                output_tokens,
                                            ).await {
                                                error!("Failed to record API usage: {}", e);
                                            }
                                        }
                                    }
                                }
                            });
                            
                            Ok(bytes)
                        },
                        Err(e) => Err(actix_web::error::ErrorInternalServerError(format!("Stream error: {}", e))),
                    }
                });
                
                Ok(Box::pin(stream))
            },
            _ => Err(AppError::InvalidArgument(format!("Streaming not supported for service: {}", service))),
        }
    }
    
    // Get API key and endpoint for a service
    fn get_service_config(&self, service: &str) -> Result<(String, String), AppError> {
        match service {
            "gemini" => Ok((
                self.gemini_api_key.clone(),
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent".to_string(),
            )),
            "claude" => Ok((
                self.claude_api_key.clone(),
                "https://api.anthropic.com/v1/messages".to_string(),
            )),
            "groq" => Ok((
                self.groq_api_key.clone(),
                "https://api.groq.com/openai/v1/chat/completions".to_string(),
            )),
            _ => Err(AppError::InvalidArgument(format!("Unsupported service: {}", service))),
        }
    }
    
    // Record API usage
    async fn record_usage(
        &self,
        user_id: &Uuid,
        service: &str,
        request: &Value,
        response: &Value,
    ) -> Result<(), AppError> {
        // Extract input and output token counts based on service
        let (input_tokens, output_tokens) = match service {
            "gemini" => {
                let input_tokens = self.estimate_gemini_input_tokens(request);
                let output_tokens = self.extract_gemini_output_tokens(response);
                (input_tokens, output_tokens)
            },
            "claude" => {
                let input_tokens = self.extract_claude_input_tokens(response);
                let output_tokens = self.extract_claude_output_tokens(response);
                (input_tokens, output_tokens)
            },
            "groq" => {
                let input_tokens = self.extract_groq_input_tokens(response);
                let output_tokens = self.extract_groq_output_tokens(response);
                (input_tokens, output_tokens)
            },
            _ => (0, 0),
        };
        
        // Record usage in database
        self.api_usage_repository.record_usage(
            user_id,
            service,
            input_tokens,
            output_tokens,
        ).await?;
        
        Ok(())
    }
    
    // Extract token counts from different APIs
    
    fn extract_gemini_output_tokens(&self, response: &Value) -> i32 {
        if let Some(usage) = response.get("usageMetadata") {
            if let Some(tokens) = usage.get("candidatesTokenCount") {
                if let Some(count) = tokens.as_i64() {
                    return count as i32;
                }
            }
        }
        0
    }
    
    fn estimate_gemini_input_tokens(&self, request: &Value) -> i32 {
        if let Some(contents) = request.get("contents") {
            return self.estimate_tokens(contents.to_string());
        }
        0
    }
    
    fn extract_claude_input_tokens(&self, response: &Value) -> i32 {
        if let Some(usage) = response.get("usage") {
            if let Some(tokens) = usage.get("input_tokens") {
                if let Some(count) = tokens.as_i64() {
                    return count as i32;
                }
            }
        }
        0
    }
    
    fn extract_claude_output_tokens(&self, response: &Value) -> i32 {
        if let Some(usage) = response.get("usage") {
            if let Some(tokens) = usage.get("output_tokens") {
                if let Some(count) = tokens.as_i64() {
                    return count as i32;
                }
            }
        }
        0
    }
    
    fn extract_groq_input_tokens(&self, response: &Value) -> i32 {
        if let Some(usage) = response.get("usage") {
            if let Some(tokens) = usage.get("prompt_tokens") {
                if let Some(count) = tokens.as_i64() {
                    return count as i32;
                }
            }
        }
        0
    }
    
    fn extract_groq_output_tokens(&self, response: &Value) -> i32 {
        if let Some(usage) = response.get("usage") {
            if let Some(tokens) = usage.get("completion_tokens") {
                if let Some(count) = tokens.as_i64() {
                    return count as i32;
                }
            }
        }
        0
    }
    
    // Simple token estimation (4 characters per token)
    fn estimate_tokens(&self, text: String) -> i32 {
        // Very rough estimate: 4 characters per token
        (text.len() / 4) as i32
    }
}

impl Clone for ProxyService {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            billing_service: self.billing_service.clone(),
            api_usage_repository: self.api_usage_repository.clone(),
            gemini_api_key: self.gemini_api_key.clone(),
            claude_api_key: self.claude_api_key.clone(),
            groq_api_key: self.groq_api_key.clone(),
        }
    }
}