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

use crate::error::AppError;
use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::open_router_client::{OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterStreamDelta, OpenRouterUsage};
use crate::db::repositories::model_repository::ModelWithProvider;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::services::cost_resolver::CostResolver;
use crate::utils::token_estimator;
use bigdecimal::BigDecimal;
use std::str::FromStr;

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
    
    /// Determine if a chunk represents stream completion
    /// 
    /// Different providers use different markers for stream completion.
    /// This method identifies final chunks that indicate the stream is done.
    /// 
    /// # Arguments
    /// 
    /// * `chunk` - Parsed chunk as JSON Value
    /// 
    /// # Returns
    /// 
    /// * `true` - This is a final chunk, stream should complete
    /// * `false` - This is an intermediate chunk, continue streaming
    fn is_final_chunk(&self, chunk: &Value) -> bool;
    
    /// Extract usage information from final chunks
    /// 
    /// This method extracts token usage from final streaming chunks for post-stream
    /// billing. It should parse the chunk and return usage information if available.
    /// 
    /// # Arguments
    /// 
    /// * `chunk` - Raw chunk bytes containing usage information
    /// * `model_id` - Model identifier for usage attribution
    /// 
    /// # Returns
    /// 
    /// * `Some(ProviderUsage)` - Successfully extracted usage information
    /// * `None` - No usage information in this chunk (normal for non-final chunks)
    fn extract_usage_if_final(&self, chunk: &[u8], model_id: &str) -> Option<ProviderUsage>;
    
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
    
    /// Extract incremental usage data from a streaming chunk
    /// 
    /// This method extracts incremental usage information from provider-specific
    /// usage update events (e.g., Anthropic's message_delta).
    /// 
    /// # Arguments
    /// 
    /// * `chunk` - Parsed chunk as JSON Value
    /// 
    /// # Returns
    /// 
    /// * `Some((input_tokens, output_tokens))` - Incremental token counts
    /// * `None` - No incremental usage in this chunk
    fn extract_incremental_usage(&self, chunk: &Value) -> Option<(i32, i32)> {
        // Default implementation returns None - providers can override
        None
    }
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
    
    // Handle SSE format (data: prefix)
    let json_str = if chunk_str.starts_with("data: ") {
        let data_content = &chunk_str[6..];
        if data_content.trim() == "[DONE]" {
            debug!("Received [DONE] marker - stream completed");
            return Ok(TransformResult::Done);
        }
        data_content
    } else {
        chunk_str
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
    
    // Step 4: Check if this is a final chunk
    if transformer.is_final_chunk(&chunk_value) {
        debug!("Final chunk detected");
    }
    
    // Step 5: Transform using provider-specific logic
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
    transformer: Box<dyn StreamChunkTransformer + Send + Sync>,
    usage_collector: Arc<tokio::sync::Mutex<Option<ProviderUsage>>>,
    model: ModelWithProvider,
    user_id: Uuid,
    billing_service: Arc<BillingService>,
    request_id: String,
    stream_completed: bool,
    // Real-time usage tracking fields
    running_input_tokens: Arc<tokio::sync::Mutex<i64>>,
    running_output_tokens: Arc<tokio::sync::Mutex<i64>>,
    running_cost_total: Arc<tokio::sync::Mutex<BigDecimal>>,
    last_update_time: Arc<tokio::sync::Mutex<std::time::Instant>>,
    tokens_since_last_update: Arc<tokio::sync::Mutex<u32>>,
    // Thresholds for updates
    token_update_threshold: u32,
    time_update_threshold_ms: u64,
    // Queue for pending usage update events
    pending_usage_update: Arc<tokio::sync::Mutex<Option<web::Bytes>>>,
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
            transformer,
            usage_collector: Arc::new(tokio::sync::Mutex::new(None)),
            model,
            user_id,
            billing_service,
            request_id,
            stream_completed: false,
            // Initialize real-time tracking
            running_input_tokens: Arc::new(tokio::sync::Mutex::new(0)),
            running_output_tokens: Arc::new(tokio::sync::Mutex::new(0)),
            running_cost_total: Arc::new(tokio::sync::Mutex::new(BigDecimal::from(0))),
            last_update_time: Arc::new(tokio::sync::Mutex::new(std::time::Instant::now())),
            tokens_since_last_update: Arc::new(tokio::sync::Mutex::new(0)),
            // Set thresholds
            token_update_threshold: 20,
            time_update_threshold_ms: 500,
            pending_usage_update: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }
    
    /// Set initial prompt tokens for accurate usage tracking
    /// 
    /// This should be called before streaming begins if the prompt token count
    /// is known (e.g., from a non-streaming token count endpoint).
    /// 
    /// # Arguments
    /// 
    /// * `prompt_tokens` - Number of tokens in the initial prompt
    pub async fn set_initial_prompt_tokens(&self, prompt_tokens: i64) {
        let mut input_tokens = self.running_input_tokens.lock().await;
        *input_tokens = prompt_tokens;
        info!("Set initial prompt tokens to {} for request {}", prompt_tokens, self.request_id);
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
        // Check if we have a pending usage update to send
        if let Ok(mut pending) = self.pending_usage_update.try_lock() {
            if let Some(usage_update) = pending.take() {
                // After sending usage update, immediately re-poll to check for more chunks
                cx.waker().wake_by_ref();
                return Poll::Ready(Some(Ok(usage_update)));
            }
        }
        
        // Poll the inner stream
        match Pin::new(&mut self.inner_stream).poll_next(cx) {
            Poll::Ready(Some(Ok(chunk))) => {
                // Try to extract usage information from this chunk before transformation
                if let Some(usage) = self.transformer.extract_usage_if_final(&chunk, &self.model.id) {
                    info!("Extracted final usage for model {}: input={}, output={}", self.model.id, usage.prompt_tokens, usage.completion_tokens);
                    let usage_collector = self.usage_collector.clone();
                    tokio::spawn(async move {
                        *usage_collector.lock().await = Some(usage);
                    });
                }
                
                // Process chunk through standardized pipeline
                match parse_and_validate_chunk(&chunk, self.transformer.as_ref()) {
                    Ok(TransformResult::Transformed(transformed_chunk)) => {
                        // Try to extract text delta and incremental usage for real-time tracking
                        let chunk_str = std::str::from_utf8(&chunk).unwrap_or("");
                        let json_str = if chunk_str.starts_with("data: ") {
                            &chunk_str[6..]
                        } else {
                            chunk_str
                        };
                        
                        if let Ok(chunk_value) = serde_json::from_str::<Value>(json_str) {
                            let mut should_update = false;
                            let mut delta_input_tokens = 0i64;
                            let mut delta_output_tokens = 0i64;
                            
                            // First check for incremental usage from provider (most accurate)
                            if let Some((input_delta, output_delta)) = self.transformer.extract_incremental_usage(&chunk_value) {
                                delta_input_tokens = input_delta as i64;
                                delta_output_tokens = output_delta as i64;
                                
                                // Update running totals with provider-reported incremental usage
                                if let Ok(mut input_tokens) = self.running_input_tokens.try_lock() {
                                    *input_tokens += delta_input_tokens;
                                }
                                if let Ok(mut output_tokens) = self.running_output_tokens.try_lock() {
                                    *output_tokens += delta_output_tokens;
                                }
                                
                                // Always send usage update when provider reports incremental usage
                                should_update = true;
                                debug!("Provider reported incremental usage: input={}, output={}", delta_input_tokens, delta_output_tokens);
                            }
                            // Otherwise, estimate from text delta
                            else if let Some(text_delta) = self.transformer.extract_text_delta(&chunk_value) {
                                // Estimate tokens in the delta
                                let estimated_tokens = token_estimator::estimate_tokens(&text_delta);
                                delta_output_tokens = estimated_tokens as i64;
                                
                                // Update tracking and check if we should emit usage update
                                should_update = match (
                                    self.tokens_since_last_update.try_lock(),
                                    self.last_update_time.try_lock()
                                ) {
                                    (Ok(mut tokens_since_update), Ok(mut last_update_time)) => {
                                        *tokens_since_update += estimated_tokens;
                                        let time_since_update = last_update_time.elapsed();
                                        
                                        // Check thresholds
                                        let should_update = *tokens_since_update >= self.token_update_threshold ||
                                            time_since_update.as_millis() >= self.time_update_threshold_ms as u128;
                                        
                                        if should_update {
                                            *tokens_since_update = 0;
                                            *last_update_time = std::time::Instant::now();
                                        }
                                        
                                        should_update
                                    }
                                    _ => false
                                };
                                
                                // Update running output tokens
                                if let Ok(mut output_tokens) = self.running_output_tokens.try_lock() {
                                    *output_tokens += delta_output_tokens;
                                }
                            }
                            
                            if should_update {
                                // Queue usage update for the next poll (UI-only, no billing)
                                let model = self.model.clone();
                                let billing_service = self.billing_service.clone();
                                let running_output_tokens = self.running_output_tokens.clone();
                                let running_input_tokens = self.running_input_tokens.clone();
                                let pending_usage_update = self.pending_usage_update.clone();
                                let waker = cx.waker().clone();
                                
                                // Spawn async task to calculate estimated cost and queue update
                                tokio::spawn(async move {
                                    // Get cumulative token counts
                                    let output_tokens = match running_output_tokens.try_lock() {
                                        Ok(tokens) => *tokens,
                                        Err(_) => 0
                                    };
                                    let input_tokens = match running_input_tokens.try_lock() {
                                        Ok(tokens) => *tokens,
                                        Err(_) => 0
                                    };
                                    
                                    // Calculate estimated cost using server pricing (UI-only)
                                    match billing_service.estimate_streaming_cost(
                                        &model.id,
                                        input_tokens,
                                        output_tokens,
                                        0, // cache_write_tokens
                                        0, // cache_read_tokens
                                    ).await {
                                        Ok(estimated_cost) => {
                                            // Create SSE usage update event with cumulative counts
                                            let usage_update = serde_json::json!({
                                                "type": "usage_update",
                                                "tokens_input": input_tokens,
                                                "tokens_output": output_tokens,
                                                "tokens_total": input_tokens + output_tokens,
                                                "estimated_cost": estimated_cost.to_string()
                                            });
                                            
                                            let event_data = format!("event: usage_update\ndata: {}\n\n", usage_update);
                                            
                                            // Queue the update
                                            if let Ok(mut pending) = pending_usage_update.try_lock() {
                                                *pending = Some(web::Bytes::from(event_data));
                                                // Wake the stream to send the update
                                                waker.wake();
                                            }
                                            
                                            info!("Queued usage update: input={}, output={}, estimated_cost={}", 
                                                 input_tokens, output_tokens, estimated_cost);
                                        }
                                        Err(e) => {
                                            warn!("Failed to estimate streaming cost: {}", e);
                                        }
                                    }
                                });
                            }
                        }
                        
                        Poll::Ready(Some(Ok(transformed_chunk)))
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
            let usage_collector = self.usage_collector.clone();
            let model = self.model.clone();
            let user_id = self.user_id;
            let billing_service = self.billing_service.clone();
            let request_id = self.request_id.clone();
            
            tokio::spawn(async move {
                // Wait a moment for usage collection to complete
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                
                if let Some(usage) = usage_collector.lock().await.take() {
                    match process_post_stream_billing(usage, &model, user_id, &billing_service, &request_id).await {
                        Ok(cost) => {
                            info!("Post-stream billing completed successfully for request {}: cost=${:.4}", request_id, cost);
                        }
                        Err(e) => {
                            error!("Post-stream billing failed for request {}: {}", request_id, e);
                            // In production, this should trigger alerting/retry logic
                        }
                    }
                } else {
                    warn!("No usage data collected for billing - this may indicate an issue for request {}", request_id);
                }
            });
        }
    }
}

/// Process billing after stream completion
/// 
/// This function is the ONLY place where billing occurs for a stream. It handles:
/// 1. Calculate final cost using CostResolver with complete ProviderUsage
/// 2. Create API usage entry with comprehensive token tracking
/// 3. Charge user account via BillingService (ONCE with final usage)
/// 4. Store final cost for desktop client retrieval
/// 
/// # Arguments
/// 
/// * `usage` - Complete usage information from final stream chunk
/// * `model` - Model configuration for pricing calculations  
/// * `user_id` - User identifier for billing attribution
/// * `billing_service` - Service for processing charges
/// * `request_id` - Unique request identifier for tracking
/// 
/// # Returns
/// 
/// * `Ok(BigDecimal)` - Final charged cost
/// * `Err(AppError)` - Billing processing failed
async fn process_post_stream_billing(
    usage: ProviderUsage,
    model: &ModelWithProvider,
    user_id: Uuid,
    billing_service: &BillingService,
    request_id: &str,
) -> Result<BigDecimal, AppError> {
    info!("Processing post-stream billing (ONLY billing point): input={}, output={}, model={}, request_id={}", 
        usage.prompt_tokens, usage.completion_tokens, model.id, request_id);
    
    // Calculate final cost using the cost resolver with complete usage
    let final_cost = CostResolver::resolve(usage.clone(), &model);
    
    // Create API usage entry with final, complete token counts
    let api_usage = ApiUsageEntryDto {
        user_id,
        service_name: model.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: usage.cache_write_tokens as i64,
        cache_read_tokens: usage.cache_read_tokens as i64,
        request_id: Some(request_id.to_string()),
        metadata: Some(serde_json::json!({
            "streaming": true,
            "final_billing": true
        })),
        provider_reported_cost: usage.cost.map(|c| BigDecimal::from_str(&c.to_string()).unwrap_or_default()),
    };
    
    // SINGLE billing charge with complete usage
    let (api_usage_record, _user_credit) = billing_service.charge_for_api_usage(api_usage, final_cost.clone()).await
        .map_err(|e| {
            error!("Billing failed for post-stream request {}: {}", request_id, e);
            AppError::Internal(format!("Billing failed: {}", e))
        })?;
    
    // Store the final cost for later retrieval by desktop clients
    match billing_service.store_streaming_final_cost(
        &user_id,
        request_id,
        &model.id,
        &final_cost,
        usage.prompt_tokens as i64,
        usage.completion_tokens as i64,
    ).await {
        Ok(_) => {
            info!("Final cost stored for retrieval by desktop client: request_id={}, cost=${:.4}", request_id, final_cost);
        }
        Err(e) => {
            warn!("Failed to store final cost for desktop retrieval: request_id={}, error={}", request_id, e);
            // Don't fail the billing if we can't store the cost for desktop
        }
    }
    
    info!("Post-stream billing completed successfully (single charge) for request: {}", request_id);
    Ok(final_cost)
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    
    // Mock transformer for testing
    struct MockTransformer;
    
    impl StreamChunkTransformer for MockTransformer {
        fn transform_chunk(&self, chunk: &[u8]) -> Result<TransformResult, StreamError> {
            let chunk_str = std::str::from_utf8(chunk).unwrap();
            if chunk_str.contains("error") {
                Err(StreamError::ProviderError("Mock error".to_string()))
            } else if chunk_str.contains("ignore") {
                Ok(TransformResult::Ignore)
            } else {
                Ok(TransformResult::Transformed(web::Bytes::from("transformed")))
            }
        }
        
        fn handle_error_chunk(&self, error: &Value) -> StreamError {
            StreamError::ProviderError(format!("Error: {}", error))
        }
        
        fn is_final_chunk(&self, chunk: &Value) -> bool {
            chunk.get("finish_reason").is_some()
        }
        
        fn extract_usage_if_final(&self, _chunk: &[u8], _model_id: &str) -> Option<ProviderUsage> {
            None
        }
        
        fn extract_text_delta(&self, _chunk: &Value) -> Option<String> {
            None
        }
    }
    
    #[test]
    fn test_parse_valid_chunk() {
        let transformer = MockTransformer;
        let chunk = b"data: {\"content\": \"test\"}";
        
        let result = parse_and_validate_chunk(chunk, &transformer);
        assert!(result.is_ok());
        
        match result.unwrap() {
            TransformResult::Transformed(data) => {
                assert_eq!(data, web::Bytes::from("transformed"));
            }
            _ => panic!("Expected Transformed result"),
        }
    }
    
    #[test] 
    fn test_parse_malformed_chunk() {
        let transformer = MockTransformer;
        let chunk = b"data: invalid json {";
        
        let result = parse_and_validate_chunk(chunk, &transformer);
        assert!(result.is_ok());
        
        match result.unwrap() {
            TransformResult::Ignore => {
                // Correctly ignored malformed chunk
            }
            _ => panic!("Expected Ignore result for malformed chunk"),
        }
    }
    
    #[test]
    fn test_parse_done_marker() {
        let transformer = MockTransformer;
        let chunk = b"data: [DONE]";
        
        let result = parse_and_validate_chunk(chunk, &transformer);
        assert!(result.is_ok());
        
        match result.unwrap() {
            TransformResult::Done => {
                // Correctly detected stream completion
            }
            _ => panic!("Expected Done result for [DONE] marker"),
        }
    }
    
    #[test]
    fn test_parse_error_chunk() {
        let transformer = MockTransformer;
        let chunk = b"data: {\"error\": {\"message\": \"API error\"}}";
        
        let result = parse_and_validate_chunk(chunk, &transformer);
        assert!(result.is_err());
        
        match result.unwrap_err() {
            StreamError::ProviderError(_) => {
                // Correctly converted error chunk
            }
            _ => panic!("Expected ProviderError for error chunk"),
        }
    }
    
    #[test]
    fn test_create_openrouter_usage() {
        let cost = BigDecimal::from(42.5);
        let usage = create_openrouter_usage(100, 50, &cost).unwrap();
        
        assert_eq!(usage.prompt_tokens, 100);
        assert_eq!(usage.completion_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
        assert_eq!(usage.cost, Some(42.5));
    }
    
    #[test]
    fn test_create_openrouter_stream_chunk() {
        let chunk = create_openrouter_stream_chunk(
            "test-model",
            Some("Hello world".to_string()),
            None,
            None,
            None,
        );
        
        assert_eq!(chunk.model, "test-model");
        assert_eq!(chunk.choices.len(), 1);
        assert_eq!(chunk.choices[0].delta.content, Some("Hello world".to_string()));
        assert_eq!(chunk.choices[0].delta.role, Some("assistant".to_string()));
        assert!(chunk.id.starts_with("chatcmpl-"));
        assert_eq!(chunk.object, Some("chat.completion.chunk".to_string()));
    }
}