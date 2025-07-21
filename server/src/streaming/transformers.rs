use serde_json::Value;
use crate::clients::usage_extractor::ProviderUsage;
use crate::error::AppError;

/// Result of chunk transformation operations
/// 
/// This enum allows transformers to control how chunks are handled:
/// - Transformed: Successfully converted chunk, forward to client
/// - Ignore: Skip this chunk (don't send to client) 
/// - Done: Stream has completed, terminate gracefully
#[derive(Debug)]
pub enum TransformResult {
    /// Successfully transformed chunk that should be forwarded to client
    Transformed(crate::clients::open_router_client::OpenRouterStreamChunk),
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
/// transformation logic while the ModernStreamHandler provides consistent
/// error handling, usage collection, and billing integration.
pub trait StreamChunkTransformer: Send + Sync {
    /// Transform a parsed JSON chunk into standardized format
    fn transform_chunk(&self, chunk: &Value) -> Result<TransformResult, StreamError>;
    
    /// Handle provider error chunks by converting to StreamError
    fn handle_error_chunk(&self, error: &Value) -> StreamError;
    
    /// Extract usage data from a streaming chunk
    fn extract_usage_from_chunk(&self, _chunk: &Value) -> Option<ProviderUsage> {
        None
    }
    
    /// Extract text delta from a streaming chunk (provider-specific)
    fn extract_text_delta(&self, _chunk: &Value) -> Option<String> {
        None
    }
}