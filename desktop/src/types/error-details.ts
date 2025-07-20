/**
 * Detailed error information for rich error reporting
 */
export interface ErrorDetails {
  /** Error code for categorization (e.g., "context_length_exceeded") */
  code: string;
  /** User-friendly error message */
  message: string;
  /** Provider-specific error information if available */
  providerError?: ProviderErrorInfo;
  /** Whether a fallback to another provider was attempted */
  fallbackAttempted: boolean;
}

/**
 * Provider-specific error information
 */
export interface ProviderErrorInfo {
  /** Provider name (e.g., "openai", "google", "anthropic") */
  provider: string;
  /** HTTP status code from the provider */
  statusCode: number;
  /** Provider's error type (e.g., "invalid_request_error") */
  errorType: string;
  /** Full error details from the provider */
  details: string;
  /** Additional context about the error */
  context?: ErrorContext;
}

/**
 * Additional context for specific error types
 */
export interface ErrorContext {
  /** Number of tokens requested */
  requestedTokens?: number;
  /** Maximum tokens allowed by the model */
  maxTokens?: number;
  /** Model's context length limit */
  modelLimit?: number;
  /** Any other relevant context */
  additionalInfo?: string;
}