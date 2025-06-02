/**
 * Utility functions for error handling and retry logic
 */

import { type ActionState } from "@/types";

/**
 * Standard error types used across the application
 */
export enum ErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  API_ERROR = "API_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  PERMISSION_ERROR = "PERMISSION_ERROR",
  NOT_FOUND_ERROR = "NOT_FOUND_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  BILLING_ERROR = "BILLING_ERROR",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  WORKFLOW_ERROR = "WORKFLOW_ERROR",
  TOKEN_LIMIT_ERROR = "TOKEN_LIMIT_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}


/**
 * Standard response codes and messages used across the application
 */
export const ApiResponseCode = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Maps HTTP status codes to error types
 */
export function mapStatusToErrorType(status: number): ErrorType {
  switch (status) {
    case ApiResponseCode.BAD_REQUEST:
      return ErrorType.VALIDATION_ERROR;
    case ApiResponseCode.UNAUTHORIZED:
    case ApiResponseCode.FORBIDDEN:
      return ErrorType.PERMISSION_ERROR;
    case ApiResponseCode.NOT_FOUND:
      return ErrorType.NOT_FOUND_ERROR;
    case ApiResponseCode.TOO_MANY_REQUESTS:
      return ErrorType.API_ERROR;
    case ApiResponseCode.INTERNAL_ERROR:
      return ErrorType.INTERNAL_ERROR;
    case ApiResponseCode.SERVICE_UNAVAILABLE:
      return ErrorType.API_ERROR;
    default:
      return ErrorType.UNKNOWN_ERROR;
  }
}

/**
 * Workflow-specific context for error tracking
 */
export interface WorkflowErrorContext {
  workflowId?: string;
  stageName?: string;
  stageId?: string;
  stageJobId?: string;
  retryAttempt?: number;
  originalJobId?: string;
}

/**
 * Extended Error class with additional properties for better error handling
 */
export class AppError extends Error {
  type: ErrorType;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  workflowContext?: WorkflowErrorContext;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN_ERROR,
    options: {
      statusCode?: number;
      metadata?: Record<string, unknown>;
      cause?: Error;
      workflowContext?: WorkflowErrorContext;
    } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.statusCode = options.statusCode;
    this.metadata = options.metadata;
    this.workflowContext = options.workflowContext;

    // Capture original stack trace if available
    if (options.cause && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

/**
 * Helper to create a standardized error object
 */
export function createError(
  message: string,
  type: ErrorType = ErrorType.UNKNOWN_ERROR,
  options: {
    statusCode?: number;
    metadata?: Record<string, unknown>;
    cause?: Error;
    workflowContext?: WorkflowErrorContext;
  } = {}
): AppError {
  return new AppError(message, type, options);
}

/**
 * Helper to create a workflow-specific error
 */
export function createWorkflowError(
  message: string,
  workflowContext: WorkflowErrorContext,
  options: {
    statusCode?: number;
    metadata?: Record<string, unknown>;
    cause?: Error;
  } = {}
): AppError {
  return new AppError(message, ErrorType.WORKFLOW_ERROR, {
    ...options,
    workflowContext,
  });
}

/**
 * Helper to create a standardized error state for actions
 */
export function createErrorState<T>(
  error: Error | string,
  metadata?: Record<string, unknown>
): ActionState<T> {
  const message = typeof error === "string" ? error : error.message;
  const errorObj = typeof error === "string" ? new Error(error) : error;

  return {
    isSuccess: false,
    message,
    error: errorObj,
    metadata,
  };
}

/**
 * Helper to create a standardized success state for actions
 */
export function createSuccessState<T>(
  data: T,
  message?: string,
  metadata?: Record<string, unknown>
): ActionState<T> {
  return {
    isSuccess: true,
    data,
    message,
    metadata,
  };
}


/**
 * Interface for structured Tauri errors that may be returned as JSON strings
 */
interface TauriErrorPayload {
  message?: string;
  errorType?: ErrorType;
  errorCode?: string;
  errorCategory?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  workflowContext?: WorkflowErrorContext;
}

/**
 * Recursively attempts to parse nested JSON error structures
 */
function parseNestedJsonError(input: string, depth = 0): TauriErrorPayload | null {
  // Prevent infinite recursion
  if (depth > 3) return null;
  
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object") {
      // If parsed object has a message field that's also stringified JSON, parse it recursively
      if (parsed.message && typeof parsed.message === "string") {
        const nestedParsed = parseNestedJsonError(parsed.message, depth + 1);
        if (nestedParsed) {
          // Merge nested error info with current level, with nested taking precedence for message
          return {
            ...parsed,
            message: nestedParsed.message || parsed.message,
            errorType: nestedParsed.errorType || parsed.errorType,
            errorCode: nestedParsed.errorCode || parsed.errorCode,
            errorCategory: nestedParsed.errorCategory || parsed.errorCategory,
            statusCode: nestedParsed.statusCode || parsed.statusCode,
            metadata: { ...parsed.metadata, ...nestedParsed.metadata },
            workflowContext: nestedParsed.workflowContext || parsed.workflowContext
          };
        }
      }
      
      return parsed as TauriErrorPayload;
    }
  } catch {
    // Not JSON, return null
  }
  return null;
}

/**
 * Attempts to parse a Tauri error from a string that may contain JSON
 */
function parseTauriError(errorString: string): TauriErrorPayload | null {
  return parseNestedJsonError(errorString);
}

/**
 * Safely extracts an error message from any error type
 * Enhanced to handle AppError instances and their structured information
 */
export function getErrorMessage(error: unknown, contextHint?: 'transcription' | 'generic'): string {
  if (!error) {
    return contextHint === 'transcription' 
      ? "Unknown error occurred during transcription"
      : "An unknown error occurred";
  }

  // Get the basic error message first
  let errorMessage = "";
  let parsedTauriError: TauriErrorPayload | null = null;
  let appErrorInfo: { type: ErrorType; workflowContext?: WorkflowErrorContext } | null = null;

  if (error instanceof AppError) {
    // Handle AppError instances specially to preserve structured information
    errorMessage = error.message || "An error occurred.";
    appErrorInfo = {
      type: error.type,
      workflowContext: error.workflowContext
    };
    
    // Also try to parse the message as a Tauri error for additional context
    if (error.message) {
      parsedTauriError = parseTauriError(error.message);
    }
  } else if (error instanceof Error) {
    // Handle case where error.message might be empty
    if (!error.message || error.message.trim() === "") {
      errorMessage = error.name || "An error occurred.";
    } else {
      errorMessage = error.message;
      // Try to parse the message as a Tauri error
      parsedTauriError = parseTauriError(error.message);
    }
  } else if (typeof error === "string") {
    // Handle empty or whitespace-only error messages for transcription
    if (contextHint === 'transcription' && !error.trim()) {
      return "Voice processing failed. Please try again.";
    }

    // Try to parse as Tauri error first
    parsedTauriError = parseTauriError(error);
    
    if (parsedTauriError) {
      // Use the structured error message if available
      errorMessage = parsedTauriError.message || error;
    } else {
      // Attempt to parse string as JSON to extract structured error, including nested structures
      try {
        const parsed = JSON.parse(error);
        if (parsed && typeof parsed === "object") {
          // Check for nested JSON in message field and parse recursively
          let finalMessage = parsed.message;
          if (parsed.message && typeof parsed.message === "string") {
            const nestedParsed = parseNestedJsonError(parsed.message);
            if (nestedParsed?.message) {
              finalMessage = nestedParsed.message;
            }
          }
          
          // Check for AppError-specific fields in the parsed structure
          if (parsed.type && typeof parsed.type === "string") {
            // This looks like a serialized AppError
            appErrorInfo = {
              type: parsed.type as ErrorType || ErrorType.UNKNOWN_ERROR,
              workflowContext: parsed.workflowContext
            };
          }
          
          // Use the final message if it's a non-empty string
          if (finalMessage && typeof finalMessage === "string" && finalMessage.trim()) {
            errorMessage = finalMessage;
          } else if (error.trim() && error !== "[object Object]") {
            // If parsed.message was not useful, and the original string 'error'
            // is not just a generic placeholder, return the original string.
            errorMessage = error;
          } else {
            // Final fallback for parsed JSON without useful content or generic original string
            errorMessage = "A structured error occurred";
          }
        } else {
          // If JSON but not an object, fall back to original string
          errorMessage = error;
        }
      } catch {
        // Not JSON, check for common error patterns
        if (error.includes("FOREIGN KEY constraint failed")) {
          errorMessage = contextHint === 'transcription' 
            ? "Session validation error. Please try again or create a new session."
            : "Database constraint error occurred";
        } else {
          errorMessage = error;
        }
      }
    }
  } else if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    // Handle case where error.message might be empty
    if (!error.message || error.message.trim() === "") {
      // Try to stringify the object for more context
      try {
        const stringified = JSON.stringify(error);
        if (stringified === "{}" || stringified === "") {
          errorMessage = "An object error occurred";
        } else {
          errorMessage = stringified;
        }
      } catch {
        errorMessage = "An object error occurred";
      }
    } else {
      errorMessage = error.message;
      // Try to parse the message as a Tauri error
      parsedTauriError = parseTauriError(error.message);
    }

    // For transcription context, check additional object properties
    if (contextHint === 'transcription' && (!errorMessage || !errorMessage.trim())) {
      if ('error' in error && typeof (error as {error: unknown}).error === "string") {
        errorMessage = (error as {error: string}).error;
      } else if ('reason' in error && typeof (error as {reason: unknown}).reason === "string") {
        errorMessage = (error as {reason: string}).reason;
      } else {
        // Final fallback - stringify the object
        try {
          const stringifiedError = JSON.stringify(error);
          if (stringifiedError === "{}") {
            errorMessage = "An unspecified object error occurred during transcription.";
          } else {
            errorMessage = stringifiedError;
          }
        } catch (_e) {
          errorMessage = "Unknown error format";
        }
      }
    }
  } else {
    errorMessage = contextHint === 'transcription' 
      ? "Error during voice transcription. Please try again."
      : "An unknown error occurred";
  }

  // Apply context-specific error message transformations
  errorMessage = applyContextSpecificTransformations(errorMessage, contextHint, parsedTauriError, appErrorInfo);

  return errorMessage || (contextHint === 'transcription' 
    ? "Error during voice transcription. Please try again."
    : "An unknown error occurred");
}

/**
 * Apply context-specific transformations to error messages
 * Enhanced to handle AppError information for better user messages
 */
function applyContextSpecificTransformations(
  errorMessage: string, 
  contextHint?: 'transcription' | 'generic',
  parsedTauriError?: TauriErrorPayload | null,
  appErrorInfo?: { type: ErrorType; workflowContext?: WorkflowErrorContext } | null
): string {
  // Enhanced error type detection - combine info from both sources
  const errorType = appErrorInfo?.type || parsedTauriError?.errorType || 
    (parsedTauriError?.errorCode ? mapRustErrorCodeToErrorType(parsedTauriError.errorCode) : null);
  
  const workflowContext = appErrorInfo?.workflowContext || parsedTauriError?.workflowContext;
  
  // Handle billing errors from AppError or structured Tauri errors
  if (errorType === ErrorType.BILLING_ERROR || parsedTauriError?.errorCategory === 'billing') {
    return "This feature is not available on your current plan. Please upgrade to access this functionality.";
  }

  // Handle workflow errors with more context from AppError or Tauri errors
  if (errorType === ErrorType.WORKFLOW_ERROR && workflowContext) {
    const { stageName, retryAttempt } = workflowContext;
    if (stageName && retryAttempt) {
      return `Workflow failed at stage "${stageName}" (attempt ${retryAttempt}): ${errorMessage}`;
    } else if (stageName) {
      return `Workflow failed at stage "${stageName}": ${errorMessage}`;
    }
  }
  
  // Handle structured error types with user-friendly messages
  if (errorType) {
    switch (errorType) {
      case ErrorType.TOKEN_LIMIT_ERROR:
        return "The prompt is too long for the selected model. Please reduce the number of selected files, shorten the task description, or choose a model with a larger context window.";
      
      case ErrorType.PERMISSION_ERROR:
        if (contextHint === 'transcription') {
          return "Microphone access was denied. Please allow microphone access and try again.";
        }
        return "You don't have permission to perform this action. Please check your account settings.";
      
      case ErrorType.NETWORK_ERROR:
        if (contextHint === 'transcription') {
          return "Network error during voice processing. Please check your internet connection and try again.";
        }
        return "Network connection failed. Please check your internet connection and try again.";
      
      case ErrorType.TIMEOUT_ERROR:
        if (contextHint === 'transcription') {
          return "Voice processing timed out. Please try a shorter recording or try again later.";
        }
        return "The operation timed out. Please try again or contact support if the issue persists.";
      
      case ErrorType.DATABASE_ERROR:
        return "A database error occurred. Please try refreshing the page or contact support.";
      
      case ErrorType.CONFIGURATION_ERROR:
        return "Configuration error. Please check your settings or contact support.";
      
      case ErrorType.NOT_FOUND_ERROR:
        return "The requested resource was not found.";
      
      case ErrorType.VALIDATION_ERROR:
        return `Invalid input: ${errorMessage}`;
      
      case ErrorType.API_ERROR:
        if (contextHint === 'transcription') {
          return "Voice transcription service error. Please try again or contact support if the issue persists.";
        }
        return "API service error occurred. Please try again or contact support if the issue persists.";
    }
  }

  // Check for token limit patterns in the raw error message
  const lowerMessage = errorMessage.toLowerCase();
  if (
    lowerMessage.includes("is too long") ||
    lowerMessage.includes("maximum context length") ||
    lowerMessage.includes("prompt is too large") ||
    lowerMessage.includes("context window exceeded") ||
    lowerMessage.includes("token limit exceeded") ||
    lowerMessage.includes("too many tokens") ||
    lowerMessage.includes("context length exceeded") ||
    lowerMessage.includes("maximum tokens exceeded") ||
    lowerMessage.includes("input too long")
  ) {
    return "The prompt is too long for the selected model. Please reduce the number of selected files, shorten the task description, or choose a model with a larger context window.";
  }

  // Apply transcription-specific error message transformations
  if (contextHint === 'transcription' && errorMessage) {
    // If it mentions permission, provide more helpful message
    if (errorMessage.toLowerCase().includes("permission")) {
      return "Microphone access was denied. Please allow microphone access and try again.";
    }

    // For network-related errors
    if (
      errorMessage.toLowerCase().includes("network") ||
      errorMessage.toLowerCase().includes("connect") ||
      errorMessage.toLowerCase().includes("offline")
    ) {
      return "Network error during voice processing. Please check your internet connection and try again.";
    }

    // For timeout errors
    if (
      errorMessage.toLowerCase().includes("timeout") ||
      errorMessage.toLowerCase().includes("timed out")
    ) {
      return "Voice processing timed out. Please try a shorter recording or try again later.";
    }
  }

  return errorMessage;
}


/**
 * Extract structured error information from various error types
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  type: ErrorType;
  metadata?: Record<string, unknown>;
  workflowContext?: WorkflowErrorContext;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      type: error.type,
      metadata: error.metadata,
      workflowContext: error.workflowContext,
    };
  }

  // Try to extract structured information from string errors (e.g., from Tauri)
  if (typeof error === "string") {
    const parsedTauriError = parseTauriError(error);
    if (parsedTauriError) {
      // Map Rust error codes to TypeScript ErrorType if available
      const mappedType = parsedTauriError.errorCode 
        ? mapRustErrorCodeToErrorType(parsedTauriError.errorCode)
        : parsedTauriError.errorType || ErrorType.UNKNOWN_ERROR;
      
      return {
        message: parsedTauriError.message || error,
        type: mappedType,
        metadata: parsedTauriError.metadata,
        workflowContext: parsedTauriError.workflowContext,
      };
    }
    
    // Additional parsing for workflow context in plain error strings
    try {
      const parsed = JSON.parse(error);
      if (parsed && typeof parsed === "object" && parsed.workflowContext) {
        return {
          message: parsed.message || error,
          type: parsed.errorType ? mapRustErrorCodeToErrorType(parsed.errorType) : ErrorType.WORKFLOW_ERROR,
          metadata: parsed.metadata,
          workflowContext: parsed.workflowContext,
        };
      }
    } catch {
      // Not JSON, continue with fallback
    }
  }

  // Try to extract workflow context from object errors
  if (error && typeof error === "object" && "workflowContext" in error) {
    const errorObj = error as any;
    return {
      message: errorObj.message || getErrorMessage(error),
      type: errorObj.type || ErrorType.WORKFLOW_ERROR,
      metadata: errorObj.metadata,
      workflowContext: errorObj.workflowContext,
    };
  }

  return {
    message: getErrorMessage(error),
    type: ErrorType.UNKNOWN_ERROR,
  };
}

/**
 * Maps Rust AppError codes to ErrorType
 */
export function mapRustErrorCodeToErrorType(code: string): ErrorType {
  switch (code) {
    case "BILLING_ERROR":
      return ErrorType.BILLING_ERROR;
    case "TOKEN_LIMIT_EXCEEDED_ERROR":
      return ErrorType.TOKEN_LIMIT_ERROR;
    case "JOB_ERROR":
    case "WORKFLOW_ERROR":
    case "STAGE_FAILED":
      return ErrorType.WORKFLOW_ERROR;
    case "ACCESS_DENIED_ERROR":
    case "AUTH_ERROR":
    case "SECURITY_ERROR":
      return ErrorType.PERMISSION_ERROR;
    case "NETWORK_ERROR":
    case "HTTP_ERROR":
      return ErrorType.NETWORK_ERROR;
    case "DATABASE_ERROR":
    case "SQLX_ERROR":
      return ErrorType.DATABASE_ERROR;
    case "CONFIG_ERROR":
    case "INITIALIZATION_ERROR":
      return ErrorType.CONFIGURATION_ERROR;
    case "VALIDATION_ERROR":
    case "INVALID_ARGUMENT_ERROR":
      return ErrorType.VALIDATION_ERROR;
    case "NOT_FOUND_ERROR":
      return ErrorType.NOT_FOUND_ERROR;
    case "EXTERNAL_SERVICE_ERROR":
    case "OPENROUTER_ERROR":
    case "SERVER_PROXY_ERROR":
      return ErrorType.API_ERROR;
    case "IO_ERROR":
    case "FILE_SYSTEM_ERROR":
    case "FILE_LOCK_ERROR":
    case "STORAGE_ERROR":
      return ErrorType.INTERNAL_ERROR;
    default:
      return ErrorType.UNKNOWN_ERROR;
  }
}

/**
 * Create a user-friendly error message based on error type and context
 * Enhanced to provide more specific messages and handle AppError instances
 */
export function createUserFriendlyErrorMessage(
  errorInfo: ReturnType<typeof extractErrorInfo>,
  userContext?: string
): string {
  const { type, message, workflowContext } = errorInfo;

  switch (type) {
    case ErrorType.BILLING_ERROR:
      return "This feature requires a subscription upgrade. Please check your billing settings.";
    
    case ErrorType.TOKEN_LIMIT_ERROR:
      return "The prompt is too long for the selected model. Please reduce the number of selected files, shorten the task description, or choose a model with a larger context window.";
    
    case ErrorType.PERMISSION_ERROR:
      return "You don't have permission to perform this action. Please check your account settings.";
    
    case ErrorType.NETWORK_ERROR:
      return "Network connection failed. Please check your internet connection and try again.";
    
    case ErrorType.TIMEOUT_ERROR:
      return "The operation timed out. Please try again or contact support if the issue persists.";
    
    case ErrorType.API_ERROR:
      return "API service error occurred. Please try again or contact support if the issue persists.";
    
    case ErrorType.DATABASE_ERROR:
      if (userContext === "database") {
        return "Database connection or integrity issue detected. Run database health check for detailed diagnostics.";
      }
      return "A database error occurred. Please try refreshing the page or contact support.";
    
    case ErrorType.WORKFLOW_ERROR:
      if (workflowContext?.stageName) {
        const retryText = workflowContext.retryAttempt && workflowContext.retryAttempt > 1 
          ? ` (retry attempt ${workflowContext.retryAttempt})` 
          : '';
        const stageDisplayName = getWorkflowStageDisplayName(workflowContext.stageName);
        return `Failed at stage: "${stageDisplayName || workflowContext.stageName}"${retryText}. ${message}`;
      }
      return `Workflow execution failed: ${message}. The workflow may be retried or restarted.`;
    
    case ErrorType.VALIDATION_ERROR:
      return `Invalid input: ${message}`;
    
    case ErrorType.NOT_FOUND_ERROR:
      return userContext 
        ? `The requested ${userContext} was not found.`
        : "The requested resource was not found.";
    
    case ErrorType.CONFIGURATION_ERROR:
      return "Configuration error. Please check your model settings, API keys, or system prompts.";
    
    case ErrorType.UNKNOWN_ERROR:
      return message || "An unexpected error occurred. Please try again.";
    
    default:
      return message || "An error occurred. Please try again.";
  }
}

/**
 * Get user-friendly display name for workflow stages
 */
function getWorkflowStageDisplayName(stageName: string): string | null {
  const stageMap: Record<string, string> = {
    "GeneratingDirTree": "Directory Tree Generation",
    "GeneratingRegex": "Pattern Generation", 
    "LocalFiltering": "Local File Filtering",
    "InitialPathFinder": "Initial Path Finding",
    "InitialPathCorrection": "Initial Path Correction",
    "ExtendedPathFinder": "Extended Path Finding",
    "ExtendedPathCorrection": "Extended Path Correction",
    "GENERATING_DIR_TREE": "Directory Tree Generation",
    "GENERATING_REGEX": "Pattern Generation",
    "LOCAL_FILTERING": "Local File Filtering",
    "INITIAL_PATH_FINDER": "Initial Path Finding",
    "INITIAL_PATH_CORRECTION": "Initial Path Correction",
    "EXTENDED_PATH_FINDER": "Extended Path Finding",
    "EXTENDED_PATH_CORRECTION": "Extended Path Correction",
  };
  return stageMap[stageName] || null;
}

/**
 * Safely logs errors with standardized format
 */
export async function logError(
  error: unknown,
  context: string = "",
  metadata: Record<string, unknown> = {}
): Promise<void> {
  // Extract structured error information
  const errorInfo = extractErrorInfo(error);
  
  // Create enriched metadata with error information
  let enrichedMetadata: Record<string, unknown> = { 
    ...metadata,
    errorType: errorInfo.type,
    ...errorInfo.metadata,
  };
  
  if (errorInfo.workflowContext) {
    enrichedMetadata = {
      ...enrichedMetadata,
      workflowId: errorInfo.workflowContext.workflowId,
      stageName: errorInfo.workflowContext.stageName,
      stageJobId: errorInfo.workflowContext.stageJobId,
      retryAttempt: errorInfo.workflowContext.retryAttempt,
      originalJobId: errorInfo.workflowContext.originalJobId,
    };
  }

  // Error logging is disabled by default. This is a placeholder for future implementation.
  // In a production setting, this would send errors to a monitoring service.
  if (import.meta.env.DEV) {
    // Use structured logging in development
    const logger = await import('./logger').then(m => m.createLogger({ namespace: 'ErrorHandling' }));
    logger.error(`${context}:`, errorInfo.message, enrichedMetadata);
    return;
  }

  const serverUrl = import.meta.env.VITE_MAIN_SERVER_BASE_URL;
  if (!serverUrl) {
    return;
  }

  try {
    await fetch(`${serverUrl}/api/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: errorInfo.message, 
        errorType: errorInfo.type,
        context, 
        metadata: enrichedMetadata 
      }),
    });
  } catch (_e) {
    // Swallow errors in production logging to avoid recursive failures
  }
}

