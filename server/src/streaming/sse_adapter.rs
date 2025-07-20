use actix_web::web;
use eventsource_stream::{Eventsource, Event as SseEvent};
use futures_util::{Stream, StreamExt, TryStreamExt};
use pin_project_lite::pin_project;
use std::pin::Pin;
use std::task::{Context, Poll};
use tracing::{debug, error};

use crate::error::AppError;

/// Represents a parsed SSE event with optional event type and data
#[derive(Debug, Clone)]
pub struct ParsedSseEvent {
    pub event_type: Option<String>,
    pub data: String,
}

pin_project! {
    /// Adapter that converts a byte stream into parsed SSE events
    /// 
    /// This wraps eventsource-stream to provide a clean interface for
    /// consuming SSE streams from various LLM providers.
    pub struct SseAdapter<S> 
    where 
        S: Stream<Item = Result<web::Bytes, AppError>>
    {
        #[pin]
        inner: Pin<Box<dyn Stream<Item = Result<eventsource_stream::Event, eventsource_stream::EventStreamError<std::io::Error>>> + Send>>,
        _phantom: std::marker::PhantomData<S>,
    }
}

impl<S> SseAdapter<S>
where
    S: Stream<Item = Result<web::Bytes, AppError>> + Send + 'static,
{
    /// Create a new SSE adapter for the given byte stream
    pub fn new(stream: S) -> Self {
        // Convert AppError to io::Error for eventsource-stream
        let mapped_stream = stream.map(|result| {
            result
                .map(|bytes| bytes.to_vec())
                .map_err(|e| {
                    std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Stream error: {}", e)
                    )
                })
        });
        
        let eventsource = mapped_stream.eventsource();
        
        Self {
            inner: Box::pin(eventsource),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<S> Stream for SseAdapter<S>
where
    S: Stream<Item = Result<web::Bytes, AppError>> + Send,
{
    type Item = Result<ParsedSseEvent, AppError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut this = self.project();
        loop {
            match this.inner.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(event))) => {
                    // Check for [DONE] marker
                    if event.data == "[DONE]" {
                        debug!("Received [DONE] marker");
                        return Poll::Ready(Some(Ok(ParsedSseEvent {
                            event_type: Some(event.event),
                            data: "[DONE]".to_string(),
                        })));
                    }
                    
                    let parsed_event = ParsedSseEvent {
                        event_type: Some(event.event),
                        data: event.data,
                    };
                    
                    debug!("Parsed SSE event: {:?}", parsed_event);
                    return Poll::Ready(Some(Ok(parsed_event)));
                }
                Poll::Ready(Some(Err(e))) => {
                    error!("SSE parsing error: {:?}", e);
                    let app_error = AppError::External(format!("SSE parsing error: {}", e));
                    return Poll::Ready(Some(Err(app_error)));
                }
                Poll::Ready(None) => {
                    debug!("SSE stream ended");
                    return Poll::Ready(None);
                }
                Poll::Pending => {
                    return Poll::Pending;
                }
            }
        }
    }
}

/// Extension trait to easily convert byte streams to SSE event streams
pub trait IntoSseStream {
    /// Convert this stream into an SSE event stream
    fn into_sse_stream(self) -> SseAdapter<Self>
    where
        Self: Stream<Item = Result<web::Bytes, AppError>> + Sized + Send + 'static;
}

impl<S> IntoSseStream for S
where
    S: Stream<Item = Result<web::Bytes, AppError>> + Send + 'static,
{
    fn into_sse_stream(self) -> SseAdapter<Self> {
        SseAdapter::new(self)
    }
}