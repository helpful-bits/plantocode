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
    billing_finalized: bool,
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
            billing_finalized: false,
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
    
    /// Handle stream termination for billable cases (successful completion or user cancellation)
    fn handle_stream_termination(&mut self, was_cancelled: bool) -> Poll<Option<Result<StreamEvent, AppError>>> {
        // PREVENT DUPLICATE FINALIZATION
        if self.billing_finalized {
            warn!("Stream termination called multiple times for request {}, ignoring duplicate call", self.request_id);
            return Poll::Ready(None);
        }
        
        // Note: stream_completed might already be true if set by [DONE] marker
        self.stream_completed = true;
        self.billing_finalized = true;  // SET FLAG TO PREVENT RACE CONDITIONS
        self.debug_logger.log_stream_end();

        let usage = self.final_usage.take().unwrap_or_else(|| {
            warn!("Stream terminated with no usage data for request {}.", self.request_id);
            ProviderUsage::new(0, 0, 0, 0, self.model.id.clone())
        });

        // CHECK FOR ZERO USAGE - MARK AS FAILED INSTEAD OF COMPLETED
        if usage.prompt_tokens == 0 && usage.completion_tokens == 0 {
            warn!("Stream {} terminated without processing any tokens, marking as failed", self.request_id);
            
            let billing_service = self.billing_service.clone();
            let request_id = self.request_id.clone();
            let user_id = self.user_id;
            let usage_clone = usage.clone();
            let reason = if was_cancelled {
                "Stream cancelled before processing any tokens"
            } else {
                "Stream completed without processing any tokens"
            };
            
            // Create metadata to indicate failure with proper status
            let metadata = Some(serde_json::json!({
                "status": "failed",
                "error": reason,
                "streaming": true,
                "cancelled": was_cancelled
            }));
            
            tokio::spawn(async move {
                match billing_service.finalize_api_charge_with_metadata(
                    &request_id,
                    &user_id,
                    usage_clone,
                    metadata
                ).await {
                    Ok(_) => {
                        tracing::debug!("Successfully marked zero-token request {} as failed", request_id);
                    }
                    Err(e) => {
                        tracing::error!("Failed to mark zero-token request {} as failed: {:?}", request_id, e);
                    }
                }
            });
            
            return Poll::Ready(Some(Ok(StreamEvent::StreamCancelled {
                request_id: self.request_id.clone(),
                reason: reason.to_string(),
            })));
        }

        // NORMAL FINALIZATION FOR NON-ZERO USAGE
        let final_cost = self.model.calculate_total_cost(&usage).unwrap_or_else(|e| {
            error!("Failed to calculate cost for request {}: {}", self.request_id, e);
            BigDecimal::from(0)
        });

        let billing_service = self.billing_service.clone();
        let request_id = self.request_id.clone();
        let user_id = self.user_id;
        let usage_clone = usage.clone();
        let metadata = Some(serde_json::json!({
            "streaming": true,
            "cancelled": was_cancelled
        }));

        tokio::spawn(async move {
            match billing_service.finalize_api_charge_with_metadata(
                &request_id,
                &user_id,
                usage_clone,
                metadata
            ).await {
                Ok(_) => {
                    tracing::debug!("Successfully finalized billing for request {}", request_id);
                }
                Err(e) => {
                    tracing::error!("Failed to finalize billing for request {}: {:?}", request_id, e);
                }
            }
        });

        if was_cancelled {
            Poll::Ready(Some(Ok(StreamEvent::StreamCancelled {
                request_id: self.request_id.clone(),
                reason: "Cancelled by client".to_string(),
            })))
        } else {
            Poll::Ready(Some(Ok(StreamEvent::StreamCompleted {
                request_id: self.request_id.clone(),
                final_cost: final_cost.to_f64().unwrap_or(0.0),
                tokens_input: usage.prompt_tokens as i64,
                tokens_output: usage.completion_tokens as i64,
                cache_read_tokens: usage.cache_read_tokens as i64,
                cache_write_tokens: usage.cache_write_tokens as i64,
            })))
        }
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
        // 1. Handle user cancellation
        if self.cancellation_token.is_cancelled() && !self.was_cancelled && !self.billing_finalized {
            self.was_cancelled = true;
            self.debug_logger.log_error("Stream cancelled by client");
            return self.handle_stream_termination(true);
        }
        
        // 2. Check if stream was marked as completed (e.g., by [DONE] marker)
        if self.stream_completed && !self.billing_finalized {
            return self.handle_stream_termination(false);
        }
        
        if !self.start_event_sent {
            self.start_event_sent = true;
            info!("Sending StreamStarted event for request_id={}", self.request_id);
            return Poll::Ready(Some(Ok(StreamEvent::StreamStarted {
                request_id: self.request_id.clone(),
            })));
        }
        
        if self.last_activity.elapsed() > Duration::from_secs(10) {
            if self.keep_alive_interval.poll_tick(cx).is_ready() {
                self.last_activity = std::time::Instant::now();
            }
        }
        
        // Check if we have pending events to process
        match self.sse_stream.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(sse_event))) => {
                self.last_activity = std::time::Instant::now();

                // Special handling for OpenRouter to detect usage patterns
                if self.model.provider_code == "openrouter" {
                    // Check if this looks like a usage-only chunk
                    if sse_event.data.contains("\"usage\"") && !sse_event.data.contains("\"delta\"") {
                        info!("OpenRouter potential usage-only SSE event detected: {}", sse_event.data);
                    }
                }

                // Check for [DONE] marker which signals end of stream
                if sse_event.data.trim() == "[DONE]" {
                    debug!("Received [DONE] marker from {}", self.model.provider_code);
                    // Don't process [DONE] as JSON, just mark stream as completed
                    self.stream_completed = true;
                    cx.waker().wake_by_ref();
                    return Poll::Pending;
                }

                self.debug_logger.log_chunk(sse_event.data.as_bytes());
                
                let parsed_value = match serde_json::from_str::<Value>(&sse_event.data) {
                    Ok(value) => {
                        // Log chunks for OpenRouter to debug missing usage
                        if self.model.provider_code == "openrouter" {
                            if let Some(usage) = value.get("usage") {
                                info!("OpenRouter chunk with usage data: {}", serde_json::to_string_pretty(&usage).unwrap_or_default());
                            }
                            if let Some(choices) = value.get("choices") {
                                if choices.as_array().map(|arr| arr.is_empty()).unwrap_or(false) {
                                    info!("OpenRouter chunk with empty choices: {}", serde_json::to_string_pretty(&value).unwrap_or_default());
                                }
                            }
                        }
                        value
                    },
                    Err(e) => {
                        warn!("Failed to parse JSON: {} - Data: {}", e, sse_event.data);
                        cx.waker().wake_by_ref();
                        return Poll::Pending;
                    }
                };
                
                if let Some(error_obj) = parsed_value.get("error") {
                    error!("Provider error in stream: {}", error_obj);
                    self.debug_logger.log_error(&format!("Provider error: {}", error_obj));
                    
                    let stream_error = self.transformer.handle_error_chunk(error_obj);
                    let app_error: AppError = stream_error.into();

                    // Spawn task to mark job as FAILED
                    let billing_service = self.billing_service.clone();
                    let request_id = self.request_id.clone();
                    let user_id = self.user_id;
                    let error_message = app_error.to_string();
                    tokio::spawn(async move {
                        if let Err(fail_err) = billing_service.fail_api_charge(&request_id, &user_id, &error_message).await {
                            error!("Could not mark request {} as failed: {:?}", request_id, fail_err);
                        }
                    });

                    return Poll::Ready(Some(Err(app_error)));
                }
                
                if let Some(usage) = self.transformer.extract_usage_from_chunk(&parsed_value) {
                    if self.model.provider_code == "openrouter" {
                        info!("Extracted usage from OpenRouter chunk: prompt_tokens={}, completion_tokens={}, cost={:?}", 
                              usage.prompt_tokens, usage.completion_tokens, usage.cost);
                    }
                    if let Some(final_usage) = self.final_usage.as_mut() {
                        final_usage.merge_with(&usage);
                    } else {
                        self.final_usage = Some(usage);
                    }
                }
                
                match self.transformer.transform_chunk(&parsed_value) {
                    Ok(TransformResult::Transformed(chunk)) => {
                        return Poll::Ready(Some(Ok(StreamEvent::ContentChunk(chunk))));
                    }
                    Ok(TransformResult::Ignore) => {
                        cx.waker().wake_by_ref();
                        return Poll::Pending;
                    }
                    Ok(TransformResult::Done) => {
                        self.stream_completed = true;
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
            // 2. Handle provider stream error
            Poll::Ready(Some(Err(e))) => {
                error!("Provider SSE stream error: {}", e);
                self.debug_logger.log_error(&format!("Stream error: {}", e));
                
                let billing_service = self.billing_service.clone();
                let request_id = self.request_id.clone();
                let user_id = self.user_id;
                let error_message = e.to_string();
                
                tokio::spawn(async move {
                    if let Err(fail_err) = billing_service.fail_api_charge(&request_id, &user_id, &error_message).await {
                        error!("Could not mark request {} as failed after stream error: {:?}", request_id, fail_err);
                    }
                });

                return Poll::Ready(Some(Err(e)));
            }
            // 3. Handle normal completion
            Poll::Ready(None) => {
                if self.model.provider_code == "openrouter" {
                    info!("OpenRouter stream ended. Final usage collected: {}", 
                         self.final_usage.is_some());
                    if let Some(ref usage) = self.final_usage {
                        info!("Final OpenRouter usage: prompt_tokens={}, completion_tokens={}, cost={:?}", 
                              usage.prompt_tokens, usage.completion_tokens, usage.cost);
                    }
                }
                return self.handle_stream_termination(false);
            }
            Poll::Pending => Poll::Pending,
        }
    }
}