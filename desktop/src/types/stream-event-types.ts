/**
 * Stream event types for SSE communication between desktop and server
 * These types match the Rust StreamEvent enum structure
 */

import { ErrorDetails } from './error-details';

// OpenRouter stream chunk types
export interface OpenRouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    cached_input_tokens?: number;
    cache_write_tokens?: number;
    cache_read_tokens?: number;
  };
}

// Usage update information sent during streaming
export interface UsageUpdate {
  request_id: string;
  tokens_input: number;
  tokens_output: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  estimated_cost: number;
  tokens_total: number;
  is_final: boolean;
}

// Stream event types
export type StreamEvent = 
  | { event: 'content_chunk'; data: OpenRouterStreamChunk }
  | { event: 'usage_update'; data: UsageUpdate }
  | { event: 'stream_started'; data: { request_id: string } }
  | { event: 'stream_cancelled'; data: { request_id: string; reason: string } }
  | { event: 'error_details'; data: { request_id: string; error: ErrorDetails } }
  | { event: 'stream_completed'; data: {
      request_id: string;
      final_cost: number;
      tokens_input: number;
      tokens_output: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
    }
  };

// Helper type guards
export const isContentChunk = (event: StreamEvent): event is { event: 'content_chunk'; data: OpenRouterStreamChunk } => 
  event.event === 'content_chunk';

export const isUsageUpdate = (event: StreamEvent): event is { event: 'usage_update'; data: UsageUpdate } => 
  event.event === 'usage_update';

export const isStreamStarted = (event: StreamEvent): event is { event: 'stream_started'; data: { request_id: string } } => 
  event.event === 'stream_started';

export const isStreamCancelled = (event: StreamEvent): event is { event: 'stream_cancelled'; data: { request_id: string; reason: string } } => 
  event.event === 'stream_cancelled';

export const isErrorDetails = (event: StreamEvent): event is { event: 'error_details'; data: { request_id: string; error: ErrorDetails } } => 
  event.event === 'error_details';

export const isStreamCompleted = (event: StreamEvent): event is { event: 'stream_completed'; data: { request_id: string; final_cost: number; tokens_input: number; tokens_output: number; cache_read_tokens: number; cache_write_tokens: number } } => 
  event.event === 'stream_completed';