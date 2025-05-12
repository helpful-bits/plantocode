# API Client Usage Guide

This document outlines best practices for using the API clients in the O1 Pro Flow application.

## Overview

The application provides a centralized module for accessing all API clients (Gemini, Claude, etc.) with standardized interfaces, error handling, and response formatting.

## Recommended Usage Pattern

Always import API clients from the centralized module:

```typescript
// ✅ RECOMMENDED: Import from centralized API module
import { geminiClient, claudeClient, apiClients } from '@/lib/api';

// ❌ AVOID: Direct imports from specific client files
// import geminiClient from '@/lib/api/gemini-client';
// import claudeClient from '@/lib/api/claude-client';
```

## Access Patterns

### 1. Direct Client Access (when client type is known)

When you know which client you need, use the direct imports:

```typescript
import { geminiClient } from '@/lib/api';

// Using the client directly
const result = await geminiClient.sendRequest(promptText, {
  model: 'gemini-pro',
  temperature: 0.7
});
```

### 2. Dynamic Client Selection (when client type is determined at runtime)

When the client is determined at runtime:

```typescript
import { apiClients, getApiClient } from '@/lib/api';
import { ApiType } from '@/types/session-types';

// Method 1: Using apiClients.get()
const clientType: ApiType = 'gemini'; // Determined at runtime
const client = apiClients.get(clientType);

// Method 2: Using getApiClient function
const client = getApiClient(clientType);

// Using the dynamically selected client
const result = await client.sendRequest(promptText, options);
```

### 3. Helper Functions

The API module also provides utility functions:

```typescript
import { isClientAvailable, getAvailableClientTypes } from '@/lib/api';

// Check if a specific client is available
if (isClientAvailable('claude')) {
  // Use Claude client
}

// Get all available client types
const availableClients = getAvailableClientTypes();
```

## Error Handling

All API clients provide standardized error handling:

```typescript
import { geminiClient, handleApiClientError } from '@/lib/api';

try {
  const result = await geminiClient.sendRequest(promptText, options);
  // Handle success
} catch (error) {
  // Use standardized error handling
  const formattedError = handleApiClientError(error);
  console.error('API request failed:', formattedError.message);
}
```

## Background Jobs

API clients automatically handle large requests as background jobs:

```typescript
const result = await geminiClient.sendRequest(longPrompt, options);

if (result.isSuccess) {
  // Check if this is a background job
  if (typeof result.data === 'object' && 'isBackgroundJob' in result.data) {
    const jobId = result.data.jobId;
    // Handle background job (show progress indicator, etc.)
  } else {
    // Handle immediate response
    const responseText = result.data as string;
    // Process the response text
  }
}
```

## Response Format

All API clients return responses in a consistent `ActionState<T>` format:

```typescript
{
  isSuccess: boolean;       // Whether the operation succeeded
  data?: T;                 // Response data (if successful)
  message?: string;         // Human-readable status/error message
  error?: Error;            // Error object (if unsuccessful)
  metadata?: {...};         // Additional context about the request/response
}
```

## Streaming Requests

For streaming responses, use the `sendStreamingRequest` method:

```typescript
const streamResult = await geminiClient.sendStreamingRequest(promptText, {
  sessionId: 'user-session-123',
  model: 'gemini-pro',
  temperature: 0.7
});

if (streamResult.isSuccess && streamResult.data) {
  const { requestId } = streamResult.data;
  // Use requestId to track/cancel the streaming request
}
```

## API Client Registry

The system supports multiple API clients through a centralized registry:

| Client Type | Status    | Description                         |
|-------------|-----------|-------------------------------------|
| `gemini`    | Available | Google Gemini models                |
| `claude`    | Available | Anthropic Claude models             |
| `groq`      | Available | Groq LLM access for Whisper and others |
| `whisper`   | Planned   | OpenAI Whisper for speech-to-text   |