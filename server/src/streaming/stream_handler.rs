use actix_web::web;
use actix_web_lab::sse;
use futures_util::{Stream, StreamExt};
use serde_json::Value;
use bigdecimal::{BigDecimal, ToPrimitive};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::time::{interval, Interval};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::clients::usage_extractor::ProviderUsage;
use crate::db::repositories::model_repository::ModelWithProvider;
use crate::error::AppError;
use super::transformers::{StreamChunkTransformer, TransformResult};
use crate::models::stream_event::{StreamEvent, UsageUpdate};
use crate::models::model_pricing::ModelPricing;
use crate::services::billing_service::BillingService;
use crate::utils::stream_debug_logger::StreamDebugLogger;

use super::sse_adapter::SseAdapter;

/// Modern SSE-based stream handler that:
/// 1. Consumes SSE events from providers using eventsource-stream
/// 2. Transforms provider-specific chunks to standardized format
/// 3. Produces SSE output using actix-web-lab
/// 4. Handles billing and usage tracking
pub struct ModernStreamHandler<S> 
where
    S: Stream<Item = Result<web::Bytes, AppError>>,
{
    sse_stream: Pin<Box<SseAdapter<S>>>,
    transformer: Arc<dyn StreamChunkTransformer + Send + Sync>,
    model: ModelWithProvider,
    user_id: Uuid,
    billing_service: Arc<BillingService>,
    request_id: String,
    stream_completed: bool,
    start_event_sent: bool,
    final_usage: Option<ProviderUsage>,
    cancellation_token: CancellationToken,
    was_cancelled: bool,
    debug_logger: StreamDebugLogger,
    keep_alive_interval: Interval,
    last_activity: std::time::Instant,
}

impl<S> ModernStreamHandler<S>
where
    S: Stream<Item = Result<web::Bytes, AppError>> + Send + Unpin + 'static,
{
    pub fn new(
        stream: S,
        transformer: Box<dyn StreamChunkTransformer + Send + Sync>,
        model: ModelWithProvider,
        user_id: Uuid,
        billing_service: Arc<BillingService>,
        request_id: String,
        cancellation_token: CancellationToken,
    ) -> Self {
        let debug_logger = StreamDebugLogger::new(&model.provider_code, &request_id);
        debug_logger.log_stream_start();
        
        let mut keep_alive_interval = interval(Duration::from_secs(15));
        keep_alive_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        
        // Convert the byte stream to SSE events
        let sse_stream = SseAdapter::new(stream);
        
        Self {
            sse_stream: Box::pin(sse_stream),
            transformer: Arc::from(transformer),
            model,
            user_id,
            billing_service,
            request_id,
            stream_completed: false,
            start_event_sent: false,
            final_usage: None,
            cancellation_token,
            was_cancelled: false,
            debug_logger,
            keep_alive_interval,
            last_activity: std::time::Instant::now(),
        }
    }
    
    /// Convert to an SSE stream for actix-web response
    pub fn into_sse_stream(self) -> sse::Sse<impl Stream<Item = Result<sse::Event, actix_web::Error>>> {
        sse::Sse::from_stream(
            futures_util::stream::unfold(self, |mut handler| async move {
                match handler.next_event().await {
                    Some(Ok(event)) => {
                        let sse_event = match event {
                            StreamEvent::StreamStarted { request_id } => {
                                sse::Event::Data(
                                    sse::Data::new(serde_json::to_string(&serde_json::json!({
                                        "request_id": request_id
                                    })).unwrap())
                                    .event("stream_started")
                                )
                            }
                            StreamEvent::ContentChunk(chunk) => {
                                sse::Event::Data(
                                    sse::Data::new(serde_json::to_string(&chunk).unwrap())
                                )
                            }
                            StreamEvent::UsageUpdate(usage) => {
                                sse::Event::Data(
                                    sse::Data::new(serde_json::to_string(&usage).unwrap())
                                    .event("usage_update")
                                )
                            }
                            StreamEvent::StreamCancelled { request_id, reason } => {
                                sse::Event::Data(
                                    sse::Data::new(serde_json::to_string(&serde_json::json!({
                                        "request_id": request_id,
                                        "reason": reason
                                    })).unwrap())
                                    .event("stream_cancelled")
                                )
                            }
                            StreamEvent::ErrorDetails { request_id, error } => {
                                sse::Event::Data(
                                    sse::Data::new(serde_json::to_string(&serde_json::json!({
                                        "request_id": request_id,
                                        "error": error
                                    })).unwrap())
                                    .event("error_details")
                                )
                            }
                            StreamEvent::StreamCompleted { 
                                request_id, 
                                final_cost,
                                tokens_input,
                                tokens_output,
                                cache_read_tokens,
                                cache_write_tokens 
                            } => {
                                sse::Event::Data(
                                    sse::Data::new(serde_json::to_string(&serde_json::json!({
                                        "request_id": request_id,
                                        "final_cost": final_cost,
                                        "tokens_input": tokens_input,
                                        "tokens_output": tokens_output,
                                        "cache_read_tokens": cache_read_tokens,
                                        "cache_write_tokens": cache_write_tokens
                                    })).unwrap())
                                    .event("stream_completed")
                                )
                            }
                        };
                        Some((Ok(sse_event), handler))
                    }
                    Some(Err(e)) => {
                        error!("Stream error: {}", e);
                        Some((Err(actix_web::error::ErrorInternalServerError(e)), handler))
                    }
                    None => None,
                }
            })
        ).with_keep_alive(Duration::from_secs(15))
    }
    
    async fn next_event(&mut self) -> Option<Result<StreamEvent, AppError>> {
        use futures_util::future::poll_fn;
        
        poll_fn(|cx| Pin::new(&mut *self).poll_next(cx)).await
    }
    
}

impl<S> Stream for ModernStreamHandler<S>
where
    S: Stream<Item = Result<web::Bytes, AppError>> + Send + Unpin + 'static,
{
    type Item = Result<StreamEvent, AppError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // Check cancellation
        if self.cancellation_token.is_cancelled() && !self.was_cancelled {
            self.was_cancelled = true;
            self.debug_logger.log_error("Stream cancelled by cancellation token");
            return Poll::Ready(Some(Ok(StreamEvent::StreamCancelled {
                request_id: self.request_id.clone(),
                reason: "Cancelled by user".to_string(),
            })));
        }
        
        // Send start event immediately after connection establishment
        if !self.start_event_sent {
            self.start_event_sent = true;
            info!("Sending StreamStarted event for request_id={}", self.request_id);
            return Poll::Ready(Some(Ok(StreamEvent::StreamStarted {
                request_id: self.request_id.clone(),
            })));
        }
        
        // Check if we need to send a keep-alive
        if self.last_activity.elapsed() > Duration::from_secs(10) {
            if self.keep_alive_interval.poll_tick(cx).is_ready() {
                self.last_activity = std::time::Instant::now();
                debug!("Would send keep-alive, but continuing to process events");
                // Don't actually send keep-alive as comment, let actix-web-lab handle it
            }
        }
        
        // Poll the SSE stream
        match self.sse_stream.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(sse_event))) => {
                self.last_activity = std::time::Instant::now();
                
                // Log the raw event
                self.debug_logger.log_chunk(sse_event.data.as_bytes());
                
                // Parse JSON data
                let parsed_value = match serde_json::from_str::<Value>(&sse_event.data) {
                    Ok(value) => value,
                    Err(e) => {
                        warn!("Failed to parse JSON: {} - Data: {}", e, sse_event.data);
                        // Continue to next event
                        cx.waker().wake_by_ref();
                        return Poll::Pending;
                    }
                };
                
                // Check for provider error
                if let Some(error_obj) = parsed_value.get("error") {
                    error!("Provider error in stream: {}", error_obj);
                    self.debug_logger.log_error(&format!("Provider error: {}", error_obj));
                    
                    // Let transformer handle the error
                    let stream_error = self.transformer.handle_error_chunk(error_obj);
                    let app_error: AppError = stream_error.into();
                    return Poll::Ready(Some(Err(app_error)));
                }
                
                // Try to extract usage from any chunk
                if let Some(usage) = self.transformer.extract_usage_from_chunk(&parsed_value) {
                    self.final_usage = Some(usage);
                }
                
                // Transform the chunk
                match self.transformer.transform_chunk(&parsed_value) {
                    Ok(TransformResult::Transformed(chunk)) => {
                        // Directly return the OpenRouterStreamChunk
                        return Poll::Ready(Some(Ok(StreamEvent::ContentChunk(chunk))));
                    }
                    Ok(TransformResult::Ignore) => {
                        // Skip this chunk
                        cx.waker().wake_by_ref();
                        return Poll::Pending;
                    }
                    Ok(TransformResult::Done) => {
                        self.stream_completed = true;
                        // Continue processing - the stream will end naturally
                        cx.waker().wake_by_ref();
                        return Poll::Pending;
                    }
                    Err(e) => {
                        error!("Transform error: {:?}", e);
                        let app_error: AppError = e.into();
                        return Poll::Ready(Some(Err(app_error)));
                    }
                }
            }
            Poll::Ready(Some(Err(e))) => {
                error!("SSE stream error: {}", e);
                self.debug_logger.log_error(&format!("Stream error: {}", e));
                return Poll::Ready(Some(Err(e)));
            }
            Poll::Ready(None) => {
                self.stream_completed = true;
                self.debug_logger.log_stream_end();
                
                // If we have final usage, calculate cost and send StreamCompleted with cost data
                if let Some(usage) = self.final_usage.take() {
                    // Calculate the final cost synchronously
                    let final_cost = match self.model.calculate_total_cost(&usage) {
                        Ok(cost) => cost.to_f64().unwrap_or(0.0),
                        Err(e) => {
                            error!("Failed to calculate cost for request {}: {}", self.request_id, e);
                            // Use provider-reported cost or zero as fallback
                            usage.cost
                                .as_ref()
                                .and_then(|c| c.to_f64())
                                .unwrap_or(0.0)
                        }
                    };
                    
                    // Clone variables for the spawned task (must satisfy 'static lifetime)
                    let billing_service = self.billing_service.clone();
                    let request_id = self.request_id.clone();
                    let user_id = self.user_id.clone();
                    let usage_clone = usage.clone();

                    // Spawn billing finalization as a background task
                    tokio::spawn(async move {
                        match billing_service.finalize_api_charge_with_metadata(
                            &request_id,
                            &user_id,
                            usage_clone,
                            Some(serde_json::json!({ "streaming": true }))
                        ).await {
                            Ok(_) => {
                                tracing::debug!("Successfully finalized billing for request {}", request_id);
                            }
                            Err(e) => {
                                tracing::error!("Failed to finalize billing for request {}: {:?}", request_id, e);
                            }
                        }
                    });
                    
                    // Send StreamCompleted with all cost data
                    return Poll::Ready(Some(Ok(StreamEvent::StreamCompleted {
                        request_id: self.request_id.clone(),
                        final_cost,
                        tokens_input: usage.prompt_tokens as i64,
                        tokens_output: usage.completion_tokens as i64,
                        cache_read_tokens: usage.cache_read_tokens as i64,
                        cache_write_tokens: usage.cache_write_tokens as i64,
                    })));
                }
                
                // If no usage data available, send StreamCompleted with zeros
                // This shouldn't normally happen but provides a fallback
                return Poll::Ready(Some(Ok(StreamEvent::StreamCompleted {
                    request_id: self.request_id.clone(),
                    final_cost: 0.0,
                    tokens_input: 0,
                    tokens_output: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                })));
            }
            Poll::Pending => Poll::Pending,
        }
    }
}