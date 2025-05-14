/**
 * API Module Index
 *
 * Provides a centralized export point for all API client-related functionality
 * with standardized interfaces and error handling.
 *
 * USAGE RECOMMENDATIONS:
 * 1. Always import from '@core/lib/api' instead of direct client imports
 * 2. Use apiClients.gemini or apiClients.claude to access specific clients
 * 3. Use getApiClient(apiType) when the client type is dynamic
 */

// Export the client factory and related utilities
export {
  default as apiClients,
  getApiClient,
  isClientAvailable,
  getAvailableClientTypes
} from './client-factory';

// Re-export the clients directly for better discoverability and auto-completion
export { default as geminiClient } from './clients/gemini';
export { default as claudeClient } from './claude-client';
export { default as groqClient } from './clients/groq';

// Export the API interfaces
export type { ApiClient, ApiClientOptions } from './api-client-interface';

// Export error handling utilities
export {
  ApiErrorType,
  handleApiClientError,
  createApiSuccessResponse,
  mapStatusCodeToErrorType,
  parseApiErrorResponse
} from './api-error-handling';

// Export streaming request pool
export { default as streamingRequestPool } from './streaming-request-pool';
export { RequestType } from './streaming-request-pool-types';

// Re-export the client types only
export type { ClaudeRequestPayload, ClaudeResponse } from './claude-client';

// Export response utilities
export {
  ensureString,
  isBackgroundJob,
  getJobId
} from './response-utils';