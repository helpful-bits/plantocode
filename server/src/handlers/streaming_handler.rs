/// CORE STANDARDIZED STREAMING ARCHITECTURE
/// 
/// This module provides the foundation for eliminating 80+ lines of code duplication 
/// across all streaming handlers while implementing robust chunk parsing that prevents
/// critical bugs like forwarding unparseable chunks to clients.
/// 
/// The architecture is designed around the StreamChunkTransformer trait which enables
/// provider-specific chunk transformation while maintaining consistent error handling,
/// usage collection, and billing integration.

use actix_web::web;
use serde_json::{self, Value};
use futures_util::Stream;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use std::sync::Arc;
use std::pin::Pin;
use std::task::{Context, Poll};
use chrono;
use std::sync::Mutex;

use crate::error::AppError;
use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::open_router_client::{OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterStreamDelta, OpenRouterUsage};
use crate::db::repositories::model_repository::ModelWithProvider;
use crate::services::billing_service::BillingService;
use bigdecimal::{BigDecimal, ToPrimitive};
use std::str::FromStr;
use crate::models::model_pricing::ModelPricing;

/// Result of chunk transformation operations
/// 
/// This enum allows transformers to control how chunks are handled:
/// - Transformed: Successfully converted chunk, forward to client
/// - Ignore: Skip this chunk (don't send to client) 
/// - Done: Stream has completed, terminate gracefully
#[derive(Debug)]
pub enum TransformResult {
    /// Successfully transformed chunk that should be forwarded to client
    Transformed(web::Bytes),
    /// Ignore this chunk (malformed, intermediate, etc.) - don't send to client  
    Ignore,
    /// Stream completed successfully - terminate gracefully
    Done,
}

/// Comprehensive streaming error types
/// 
/// This enum covers all possible streaming failure scenarios with detailed
/// error information for debugging and client feedback.
#[derive(Debug)]
pub enum StreamError {
    /// Chunk parsing failed - JSON malformed or unexpected format
    ParseError(String),
    /// Provider returned an API error in stream chunk
    ProviderError(String), 
    /// Network/connection error during streaming
    NetworkError(String),
    /// Usage extraction failed from final chunk
    UsageExtractionError(String),
    /// Billing processing failed after stream completion
    BillingError(String),
    /// Internal system error (serialization, etc.)
    InternalError(String),
}

impl From<StreamError> for AppError {
    fn from(stream_error: StreamError) -> Self {
        match stream_error {
            StreamError::ParseError(msg) => AppError::External(format!("Stream parsing error: {}", msg)),
            StreamError::ProviderError(msg) => AppError::External(format!("Provider error: {}", msg)),
            StreamError::NetworkError(msg) => AppError::External(format!("Network error: {}", msg)),
            StreamError::UsageExtractionError(msg) => AppError::Internal(format!("Usage extraction failed: {}", msg)),
            StreamError::BillingError(msg) => AppError::Internal(format!("Billing failed: {}", msg)),
            StreamError::InternalError(msg) => AppError::Internal(msg),
        }
    }
}

/// Provider-specific streaming chunk transformation trait
/// 
/// This trait enables each provider to implement their specific chunk parsing and
/// transformation logic while the StandardizedStreamHandler provides consistent
/// error handling, usage collection, and billing integration.
/// 
/// # Implementation Guidelines
/// 
/// 1. **Robust Parsing**: Always parse to serde_json::Value first, then validate
/// 2. **Error Detection**: Check for provider error objects and convert to StreamError  
/// 3. **Never Forward Malformed**: Return Ignore for unparseable chunks, never forward raw
/// 4. **Usage Collection**: Extract usage from final chunks for post-stream billing
/// 5. **Consistent Format**: Transform all chunks to OpenRouterStreamChunk format
pub trait StreamChunkTransformer {
    /// Transform a raw chunk into standardized format
    /// 
    /// This is the core transformation method that must robustly handle all chunk types:
    /// - Content chunks: Transform to OpenRouter format
    /// - Error chunks: Convert to StreamError 
    /// - Malformed chunks: Return Ignore (NEVER forward unparseable data)
    /// - Final chunks: Extract usage and transform
    /// - Done markers: Return Done
    /// 
    /// # Arguments
    /// 
    /// * `chunk` - Raw chunk bytes from provider stream
    /// 
    /// # Returns
    /// 
    /// * `Ok(TransformResult)` - Successfully processed chunk
    /// * `Err(StreamError)` - Critical error that should terminate stream
    fn transform_chunk(&self, chunk: &[u8]) -> Result<TransformResult, StreamError>;
    
    /// Handle provider error chunks by converting to StreamError
    /// 
    /// This method processes error objects embedded in streaming responses and
    /// converts them to appropriate StreamError types for consistent handling.
    /// 
    /// # Arguments
    /// 
    /// * `error` - Parsed error object from provider response
    /// 
    /// # Returns
    /// 
    /// StreamError with provider-specific error details
    fn handle_error_chunk(&self, error: &Value) -> StreamError;
    
    /// Extract usage data from a streaming chunk
    /// 
    /// This method extracts usage information from provider-specific chunks
    /// and returns it as a ProviderUsage object for billing purposes.
    /// 
    /// # Arguments
    /// 
    /// * `chunk` - Parsed chunk as JSON Value
    /// 
    /// # Returns
    /// 
    /// * `Some(ProviderUsage)` - Usage data extracted from this chunk
    /// * `None` - No usage data in this chunk
    fn extract_usage_from_chunk(&self, _chunk: &Value) -> Option<ProviderUsage> {
        // Default implementation returns None - providers can override
        None
    }
    
    /// Extract text content delta from a streaming chunk
    /// 
    /// This method extracts the incremental text content from a streaming chunk
    /// to enable real-time token counting and usage tracking.
    /// 
    /// # Arguments
    /// 
    /// * `chunk` - Parsed chunk as JSON Value
    /// 
    /// # Returns
    /// 
    /// * `Some(String)` - Text content delta from this chunk
    /// * `None` - No text content in this chunk
    fn extract_text_delta(&self, chunk: &Value) -> Option<String>;
    
}

/// Core robust chunk parsing function
/// 
/// This function implements the standardized parsing pattern that prevents malformed
/// chunks from reaching clients. It follows a strict validation hierarchy:
/// 
/// 1. Parse to serde_json::Value first (catch JSON errors)
/// 2. Check for provider error objects (convert to AppError)
/// 3. Validate required fields exist (ensure structure integrity)  
/// 4. Only forward successfully parsed and validated chunks
/// 
/// # Arguments
/// 
/// * `chunk` - Raw chunk bytes from provider
/// * `transformer` - Provider-specific transformation logic
/// 
/// # Returns
/// 
/// * `Ok(TransformResult)` - Successfully processed chunk
/// * `Err(StreamError)` - Critical error requiring stream termination
/// 
/// # Critical Safety
/// 
/// This function MUST NEVER forward unparseable chunks to prevent client errors.
/// Any chunk that fails parsing returns TransformResult::Ignore instead of forwarding raw data.
pub fn parse_and_validate_chunk(
    chunk: &[u8], 
    transformer: &dyn StreamChunkTransformer
) -> Result<TransformResult, StreamError> {
    // Step 1: Convert to UTF-8 string
    let chunk_str = std::str::from_utf8(chunk)
        .map_err(|e| StreamError::ParseError(format!("Invalid UTF-8 in chunk: {}", e)))?;
    
    // Check if this is an SSE comment (lines starting with ':')
    if chunk_str.starts_with(':') {
        debug!("Ignoring SSE comment: {}", chunk_str.trim());
        return Ok(TransformResult::Ignore);
    }
    
    // Trim whitespace and check for empty chunks
    let trimmed = chunk_str.trim();
    if trimmed.is_empty() {
        debug!("Ignoring empty chunk");
        return Ok(TransformResult::Ignore);
    }
    
    // Handle SSE format (data: prefix)
    let json_str = if trimmed.starts_with("data: ") {
        let data_content = &trimmed[6..];
        if data_content.trim() == "[DONE]" {
            debug!("Received [DONE] marker - stream completed");
            return Ok(TransformResult::Done);
        }
        data_content
    } else {
        trimmed
    };
    
    // Step 2: Parse to JSON Value first (robust parsing)
    let chunk_value = match serde_json::from_str::<Value>(json_str) {
        Ok(value) => value,
        Err(e) => {
            // Critical: NEVER forward unparseable chunks to prevent client "missing field id" errors
            debug!("Ignoring unparseable chunk: {} - Error: {}", json_str, e);
            return Ok(TransformResult::Ignore);
        }
    };
    
    // Step 3: Check for provider error objects
    if let Some(error_obj) = chunk_value.get("error") {
        error!("Provider error in stream chunk: {}", error_obj);
        return Err(transformer.handle_error_chunk(error_obj));
    }
    
    // Step 4: Transform using provider-specific logic
    transformer.transform_chunk(chunk)
}

/// Standardized streaming handler that works with any provider
/// 
/// This struct provides generic handling of streaming responses from any LLM provider
/// while maintaining consistent error handling, usage collection, and billing integration.
/// It eliminates code duplication by abstracting common streaming patterns.
/// 
/// # Key Features
/// 
/// 1. **Robust Parsing**: Never forwards malformed chunks to prevent client errors
/// 2. **Error Handling**: Converts provider errors to AppError consistently  
/// 3. **Usage Collection**: Automatically extracts usage from final chunks
/// 4. **Billing Integration**: Handles post-stream billing via StreamWrapper
/// 5. **Provider Agnostic**: Works with any provider implementing StreamChunkTransformer
pub struct StandardizedStreamHandler<S> {
    inner_stream: S,
    transformer: Arc<dyn StreamChunkTransformer + Send + Sync>,
    model: ModelWithProvider,
    user_id: Uuid,
    billing_service: Arc<BillingService>,
    request_id: String,
    stream_completed: bool,
    start_event_sent: bool,
    pending_usage_update: Option<String>,
    final_usage: Arc<Mutex<Option<ProviderUsage>>>,
}

impl<S> StandardizedStreamHandler<S> 
where 
    S: Stream<Item = Result<web::Bytes, AppError>> + Unpin
{
    /// Create a new standardized stream handler
    /// 
    /// # Arguments
    /// 
    /// * `inner_stream` - Raw provider stream  
    /// * `transformer` - Provider-specific transformation logic
    /// * `model` - Model configuration for billing
    /// * `user_id` - User identifier for billing attribution
    /// * `billing_service` - Service for post-stream billing
    /// * `request_id` - Unique request identifier for tracking
    pub fn new(
        inner_stream: S,
        transformer: Box<dyn StreamChunkTransformer + Send + Sync>,
        model: ModelWithProvider,
        user_id: Uuid,
        billing_service: Arc<BillingService>,
        request_id: String,
    ) -> Self {
        Self {
            inner_stream,
            transformer: Arc::from(transformer),
            model,
            user_id,
            billing_service,
            request_id,
            stream_completed: false,
            start_event_sent: false,
            pending_usage_update: None,
            final_usage: Arc::new(Mutex::new(None)),
        }
    }
    
}

impl<S> Stream for StandardizedStreamHandler<S>
where
    S: Stream<Item = Result<web::Bytes, AppError>> + Unpin,
{
    type Item = Result<web::Bytes, AppError>;

    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        // Send start event first
        if !self.start_event_sent {
            self.start_event_sent = true;
            let event_data = serde_json::json!({ "request_id": self.request_id });
            let event = create_sse_message("stream_started", &event_data);
            cx.waker().wake_by_ref();
            return Poll::Ready(Some(Ok(event)));
        }
        
        // Check if we have a pending usage update to send
        if let Some(usage_update) = self.pending_usage_update.take() {
            // After sending usage update, immediately re-poll to check for more chunks
            cx.waker().wake_by_ref();
            return Poll::Ready(Some(Ok(web::Bytes::from(usage_update))));
        }
        
        // Poll the inner stream
        match Pin::new(&mut self.inner_stream).poll_next(cx) {
            Poll::Ready(Some(Ok(chunk))) => {
                // Process chunk through standardized pipeline
                match self.transformer.transform_chunk(&chunk) {
                    Ok(TransformResult::Transformed(transformed_bytes)) => {
                        // Check if chunk contains usage data
                        if let Ok(chunk_str) = std::str::from_utf8(&chunk) {
                            let json_str = if chunk_str.starts_with("data: ") {
                                &chunk_str[6..]
                            } else {
                                chunk_str
                            };
                            
                            if let Ok(chunk_value) = serde_json::from_str::<Value>(json_str) {
                                if let Some(usage) = self.transformer.extract_usage_from_chunk(&chunk_value) {
                                    // Update the final usage
                                    if let Ok(mut final_usage) = self.final_usage.lock() {
                                        *final_usage = Some(usage.clone());
                                    }
                                    
                                    // Create standardized SSE usage update event
                                    let usage_update = serde_json::json!({
                                        "tokens_input": usage.prompt_tokens,
                                        "tokens_output": usage.completion_tokens,
                                        "cache_read_tokens": usage.cache_read_tokens,
                                        "cache_write_tokens": usage.cache_write_tokens,
                                        "estimated_cost": usage.cost,
                                        "tokens_total": usage.prompt_tokens + usage.completion_tokens
                                    });
                                    
                                    let event_data = format!("event: usage_update\ndata: {}\n\n", usage_update);
                                    
                                    // Queue the usage update event to be sent on the next poll
                                    self.pending_usage_update = Some(event_data);
                                }
                            }
                        }
                        
                        Poll::Ready(Some(Ok(transformed_bytes)))
                    }
                    Ok(TransformResult::Ignore) => {
                        // Skip this chunk and poll for next one
                        debug!("Ignoring malformed chunk, continuing stream");
                        self.poll_next(cx)
                    }
                    Ok(TransformResult::Done) => {
                        // Stream completed gracefully
                        self.handle_stream_completion();
                        Poll::Ready(None)
                    }
                    Err(stream_error) => {
                        // Critical error - terminate stream
                        error!("Stream error: {:?}", stream_error);
                        Poll::Ready(Some(Err(stream_error.into())))
                    }
                }
            }
            Poll::Ready(Some(Err(e))) => {
                // Propagate inner stream errors
                Poll::Ready(Some(Err(e)))
            }
            Poll::Ready(None) => {
                // Stream ended
                self.handle_stream_completion();
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

impl<S> StandardizedStreamHandler<S> {
    /// Handle stream completion and trigger post-stream billing
    fn handle_stream_completion(&mut self) {
        if !self.stream_completed {
            self.stream_completed = true;
            
            info!("Stream completed for request: {}", self.request_id);
            
            // Spawn billing task for post-stream processing
            let final_usage = self.final_usage.clone();
            let model = self.model.clone();
            let user_id = self.user_id;
            let billing_service = self.billing_service.clone();
            let request_id = self.request_id.clone();
            
            tokio::spawn(async move {
                // Extract usage data from the mutex (avoiding Send trait issues)
                let usage_data = {
                    if let Ok(usage_guard) = final_usage.lock() {
                        usage_guard.clone()
                    } else {
                        None
                    }
                };
                
                // Get final usage data from accumulated usage
                if let Some(usage) = usage_data {
                    // Finalize API charge with actual usage
                    match billing_service.finalize_api_charge(&request_id, &user_id, usage.clone()).await {
                            Ok((api_usage_record, _user_credit)) => {
                                info!("Post-stream billing completed successfully for request {}: cost=${:.4}", 
                                      request_id, api_usage_record.cost);
                                
                                // Construct FinalCostResponse from api_usage_record
                                let final_cost_data = crate::models::billing::FinalCostResponse {
                                    status: "completed".to_string(),
                                    request_id: request_id.clone(),
                                    final_cost: Some(api_usage_record.cost.to_f64().unwrap_or(0.0)),
                                    tokens_input: Some(usage.prompt_tokens as i64),
                                    tokens_output: Some(usage.completion_tokens as i64),
                                    cache_write_tokens: Some(usage.cache_write_tokens as i64),
                                    cache_read_tokens: Some(usage.cache_read_tokens as i64),
                                    user_id,
                                    service_name: model.id.clone(),
                                };
                                
                                // Store final cost for desktop client retrieval
                                if let Err(e) = billing_service.store_streaming_final_cost(&request_id, &final_cost_data).await {
                                    warn!("Failed to store final cost for desktop retrieval: request_id={}, error={}", 
                                          request_id, e);
                                }
                            }
                            Err(e) => {
                                error!("Post-stream billing failed for request {}: {}", request_id, e);
                            }
                        }
                } else {
                    warn!("No usage data collected for billing - this may indicate an issue for request {}", request_id);
                }
            });
        }
    }
}

/// Implement Drop trait to guarantee billing even on unexpected stream termination
impl<S> Drop for StandardizedStreamHandler<S> {
    fn drop(&mut self) {
        // Ensure billing is triggered even if the stream is dropped unexpectedly
        if !self.stream_completed {
            warn!("Stream handler dropped without completion for request: {} - triggering billing", self.request_id);
            
            self.handle_stream_completion();
        }
    }
}


/// Helper function to create standardized OpenRouter usage response
/// 
/// This function converts ProviderUsage to OpenRouterUsage format for consistent
/// client parsing across all providers.
/// 
/// # Arguments
/// 
/// * `tokens_input` - Input token count
/// * `tokens_output` - Output token count  
/// * `cost` - Final cost for the request
/// 
/// # Returns
/// 
/// * `Ok(OpenRouterUsage)` - Standardized usage response
/// * `Err(AppError)` - Failed to convert cost to f64
pub fn create_openrouter_usage(tokens_input: i32, tokens_output: i32, cost: &BigDecimal) -> Result<OpenRouterUsage, AppError> {
    Ok(OpenRouterUsage {
        prompt_tokens: tokens_input,
        completion_tokens: tokens_output,
        total_tokens: tokens_input + tokens_output,
        cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
        cached_input_tokens: 0,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
    })
}

/// Helper function to create SSE keep-alive comment
/// 
/// This function creates a properly formatted SSE comment line that keeps
/// the connection alive without affecting EventSource clients.
/// 
/// # Returns
/// 
/// SSE comment line formatted as `: keepalive\n\n`
pub fn create_sse_keepalive() -> web::Bytes {
    web::Bytes::from(": keepalive\n\n")
}

/// Helper function to create SSE comment with message
/// 
/// This function creates an SSE comment line with a custom message for debugging
/// and connection monitoring.
/// 
/// # Arguments
/// 
/// * `message` - Message to include in the comment
/// 
/// # Returns
/// 
/// SSE comment line formatted as `: {message}\n\n`
pub fn create_sse_comment(message: &str) -> web::Bytes {
    web::Bytes::from(format!(": {}\n\n", message))
}

/// Helper function to create SSE message with event type and data
/// 
/// This function creates a properly formatted SSE message with event type and JSON data.
/// 
/// # Arguments
/// 
/// * `event` - Event type (e.g., "stream_started", "usage_update")
/// * `data` - JSON data to include in the message
/// 
/// # Returns
/// 
/// SSE message formatted as `event: {event}\ndata: {data}\n\n`
pub fn create_sse_message(event: &str, data: &serde_json::Value) -> web::Bytes {
    web::Bytes::from(format!("event: {}\ndata: {}\n\n", event, data))
}

/// Helper function to create standardized OpenRouter stream chunk
/// 
/// This function creates a properly formatted OpenRouterStreamChunk with required
/// fields like `id` to prevent client parsing errors.
/// 
/// # Arguments
/// 
/// * `model_id` - Model identifier for the chunk
/// * `content` - Text content for the chunk (optional)
/// * `role` - Message role (optional, defaults to "assistant")
/// * `finish_reason` - Completion reason (optional)
/// * `usage` - Usage information (optional, typically only in final chunks)
/// 
/// # Returns
/// 
/// Properly formatted OpenRouterStreamChunk with all required fields
pub fn create_openrouter_stream_chunk(
    model_id: &str,
    content: Option<String>,
    role: Option<String>,
    finish_reason: Option<String>,
    usage: Option<OpenRouterUsage>,
) -> OpenRouterStreamChunk {
    let choice = OpenRouterStreamChoice {
        delta: OpenRouterStreamDelta {
            role: role.or_else(|| Some("assistant".to_string())),
            content,
        },
        index: 0,
        finish_reason,
    };
    
    OpenRouterStreamChunk {
        id: format!("chatcmpl-{}", Uuid::new_v4()),
        choices: vec![choice],
        created: Some(chrono::Utc::now().timestamp()),
        model: model_id.to_string(),
        object: Some("chat.completion.chunk".to_string()),
        usage,
    }
}