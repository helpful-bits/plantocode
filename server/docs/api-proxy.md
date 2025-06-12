# API Proxy for Desktop Application

The server component of Vibe Manager includes API proxy functionality to support the desktop application. This document explains how the proxy works and how to configure it.

## Overview

The desktop application needs to access various AI services (Gemini, Claude, Replicate, etc.) but cannot store API keys securely. The server acts as a proxy, adding the necessary API keys and authentication before forwarding requests to these services.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Desktop App    │─────▶│  Rust Server    │─────▶│  AI Services    │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
      │                        │
      │                        │
      ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  SQLite         │      │  PostgreSQL     │
│  (Local Data)   │      │  (User Data)    │
│                 │      │                 │
└─────────────────┘      └─────────────────┘
```

## Proxy Endpoints

The server exposes the following proxy endpoints:

- `/api/proxy/openrouter/chat/completions` - OpenRouter API for LLM requests
- `/api/proxy/audio/transcriptions` - Replicate API for audio transcription (OpenAI GPT-4o)

## Authentication Flow

1. The desktop app authenticates with Firebase
2. The Firebase token is sent to the server's `/auth/firebase/token` endpoint
3. The server verifies the Firebase token and issues a JWT
4. This JWT is used for all subsequent requests to the proxy endpoints

## Request Flow

1. The desktop app sends a request to a proxy endpoint with its JWT
2. The server validates the JWT and extracts the user ID
3. The server checks the user's subscription status and rate limits
4. If the user has access, the server adds the appropriate API key to the request
5. The server forwards the request to the actual AI service
6. The server receives the response from the AI service
7. The server records usage information for billing/tracking
8. The server streams/returns the response to the desktop app

## Usage Tracking

Each API request is tracked in the `api_usage` table with:

- `user_id`: The ID of the user making the request
- `service_name`: The API service being used (e.g., "openai/gpt-4o-transcribe", "anthropic/claude-sonnet-4")
- `tokens_input`: Number of input tokens used
- `tokens_output`: Number of output tokens generated
- `cost`: Calculated cost of the request
- `timestamp`: When the request was made
- `input_duration_ms`: Duration of audio input in milliseconds (for transcription services)

## Configuration

The server needs the following environment variables:

```
# API Keys
OPENROUTER_API_KEY=...  # For LLM requests
REPLICATE_API_TOKEN=... # For streaming transcription requests

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
RATE_LIMIT_MAX_REQUESTS=60  # 60 requests per minute

# Subscription Defaults
DEFAULT_TRIAL_DAYS=7
```

## Implementation Notes

- Each proxy endpoint has its own handler in `src/handlers/proxy_handlers.rs`
- The actual proxy logic is in `src/services/proxy_service.rs`
- LLM requests are routed through OpenRouter, transcription requests through Replicate
- Default transcription model is `openai/gpt-4o-transcribe`
- Subscription status is checked in `src/services/billing_service.rs`
- Rate limiting is handled by middleware in `src/middleware/rate_limiter.rs`
- Audio transcription requests must include `duration_ms` field for accurate billing