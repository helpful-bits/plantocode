import { type ActionState } from "@/types";
import { AppError, ErrorType, logError } from "@/utils/error-handling";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "ActionUtils" });

/**
 * Recursively attempts to parse nested JSON error structures
 */
function parseNestedJsonError(input: string, depth = 0): any | null {
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
            code: nestedParsed.code || parsed.code,
            type: nestedParsed.type || parsed.type,
            details: nestedParsed.details || parsed.details,
            workflowContext: nestedParsed.workflowContext || parsed.workflowContext,
            category: nestedParsed.category || parsed.category
          };
        }
      }
      
      return parsed;
    }
  } catch {
    // Not JSON, return null
  }
  return null;
}

/**
 * Tauri Error structure from invoke()
 */
interface TauriError {
  message: string;
  source?: string;
  payload?: Record<string, unknown>;
  type?: string;
  stack?: string;
  code?: string; // Add code field for SerializableError
}

/**
 * Type guard to check if an error has the Tauri error structure
 */
function isTauriError(error: unknown): error is TauriError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  );
}

/**
 * Maps Rust error codes to frontend ErrorType enum values
 * Comprehensive mapping covering all AppError variants from Rust backend
 */
function mapRustErrorCodeToErrorType(rustCode: string): ErrorType {
  // First, try exact code matches for better reliability
  switch (rustCode.toUpperCase()) {
    // Validation errors
    case "VALIDATION_ERROR":
    case "VALIDATION":
    case "INVALID_ARGUMENT_ERROR":
    case "INVALID_ARGUMENT":
    case "INVALID_INPUT":
    case "VALIDATION_FAILED":
      return ErrorType.VALIDATION_ERROR;
    
    // Not found errors
    case "NOT_FOUND_ERROR":
    case "NOT_FOUND":
    case "RESOURCE_NOT_FOUND":
    case "FILE_NOT_FOUND":
    case "ENTITY_NOT_FOUND":
      return ErrorType.NOT_FOUND_ERROR;
    
    // Permission/Auth errors
    case "AUTH_ERROR":
    case "AUTHORIZATION_ERROR":
    case "PERMISSION_ERROR":
    case "ACCESS_DENIED_ERROR":
    case "SECURITY_ERROR":
    case "AUTH":
    case "UNAUTHORIZED":
    case "FORBIDDEN":
    case "TOKEN_EXPIRED":
    case "TOKEN_INVALID":
    case "AUTHENTICATION_FAILED":
      return ErrorType.PERMISSION_ERROR;
    
    // Billing errors
    case "BILLING_ERROR":
    case "BILLING":
    case "PAYMENT_ERROR":
    case "PAYMENT_REQUIRED":
    case "QUOTA_EXCEEDED":
    case "INSUFFICIENT_CREDITS":
      return ErrorType.CREDIT_INSUFFICIENT;
    case "PLAN_UPGRADE_REQUIRED":
      return ErrorType.CREDIT_UPGRADE_REQUIRED;
    
    // Token limit errors
    case "TOKEN_LIMIT_EXCEEDED_ERROR":
    case "TOKEN_LIMIT_ERROR":
    case "TOKEN_LIMIT_EXCEEDED":
    case "CONTEXT_LENGTH_EXCEEDED":
    case "MAXIMUM_CONTEXT_LENGTH":
    case "PROMPT_TOO_LARGE":
      return ErrorType.TOKEN_LIMIT_ERROR;
    
    // Network/API errors
    case "NETWORK_ERROR":
    case "NETWORK":
    case "HTTP_ERROR":
    case "EXTERNAL_SERVICE_ERROR":
    case "INVALID_RESPONSE_ERROR":
    case "CONNECTION_ERROR":
    case "TIMEOUT_ERROR":
    case "REQUEST_FAILED":
    case "OPENROUTER_ERROR":
    case "SERVER_PROXY_ERROR":
    case "API_ERROR":
    case "SERVICE_UNAVAILABLE":
      return ErrorType.NETWORK_ERROR;
    
    // Configuration errors
    case "CONFIGURATION_ERROR":
    case "CONFIG_ERROR":
    case "CONFIGURATION":
    case "INITIALIZATION_ERROR":
    case "SETUP_ERROR":
    case "ENV_ERROR":
    case "MISSING_CONFIGURATION":
    case "INVALID_CONFIGURATION":
      return ErrorType.CONFIGURATION_ERROR;
    
    // Database errors
    case "DATABASE_ERROR":
    case "SQLX_ERROR":
    case "STORAGE_ERROR":
    case "DB_CONNECTION_ERROR":
    case "DB_QUERY_ERROR":
    case "DB_TRANSACTION_ERROR":
    case "MIGRATION_ERROR":
    case "CONSTRAINT_VIOLATION":
    case "DATA_INTEGRITY_ERROR":
      return ErrorType.DATABASE_ERROR;
    
    // Workflow errors (mapped to WORKFLOW_ERROR instead of INTERNAL_ERROR)
    case "WORKFLOW_ERROR":
    case "WORKFLOW_STAGE_FAILED":
    case "WORKFLOW_DATA_EXTRACTION_FAILED":
    case "WORKFLOW_CHAIN_BROKEN":
    case "WORKFLOW_TIMEOUT_EXCEEDED":
    case "WORKFLOW_CANCELLATION_FAILED":
    case "WORKFLOW_RESOURCE_CLEANUP_FAILED":
    case "JOB_ERROR":
    case "JOB_EXECUTION_FAILED":
    case "PROCESSOR_ERROR":
    case "STAGE_FAILED":
      return ErrorType.WORKFLOW_ERROR;
    
    // Internal/System errors
    case "INTERNAL_ERROR":
    case "INTERNAL":
    case "APPLICATION_ERROR":
    case "SERIALIZATION_ERROR":
    case "SERDE_ERROR":
    case "IO_ERROR":
    case "TAURI_ERROR":
    case "KEYRING_ERROR":
    case "FILE_SYSTEM_ERROR":
    case "FILE_LOCK_ERROR":
    case "GIT_ERROR":
    case "SYSTEM_ERROR":
    case "RUNTIME_ERROR":
    case "PANIC":
    case "THREAD_ERROR":
    case "MEMORY_ERROR":
      return ErrorType.INTERNAL_ERROR;
    
    default:
      // All error codes should be explicitly defined above
      throw new Error(`Unknown error code '${rustCode}' - add it to mapRustErrorCodeToErrorType mapping`);
  }
}

/**
 * Helper function to handle errors in actions when invoking Tauri commands
 */
export function handleActionError(
  error: unknown
): ActionState<unknown> {
  // Debug log to see the error structure
  logger.debug("handleActionError received:", error);

  // Log all errors centrally (fire and forget)
  void logError(error, 'Action Error Handler', { 
    source: 'handleActionError',
    errorType: typeof error 
  }).catch(() => {
    // Ignore logging failures to prevent recursive errors
  });

  // If error is already an AppError, return it directly in an ActionState
  if (error instanceof AppError) {
    return {
      isSuccess: false,
      message: error.message,
      error: error,
      metadata: error.metadata,
    };
  }

  let potentialTauriError: TauriError | null = null;

  if (typeof error === 'string') {
    let appError: AppError;
    try {
      // Parse the error string, handling nested JSON structures
      const parsed = parseNestedJsonError(error);
      if (parsed && typeof parsed === 'object') {
        // Use only the modern code field from SerializableError
        const rustCode = (typeof parsed.code === 'string' && parsed.code) ? parsed.code : null;
        
        // Extract workflow context if available - ensure proper structure
        const workflowContext = parsed.workflowContext;
        
        // Extract error message from parsed JSON
        let errorMessage: string;
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          errorMessage = parsed.message;
        } else if (rustCode) {
          errorMessage = `Backend operation failed: ${rustCode}`;
        } else {
          errorMessage = "An unexpected backend error occurred";
        }
        
        // Only use modern error codes - no message parsing
        let errorType: ErrorType;
        if (rustCode) {
          errorType = mapRustErrorCodeToErrorType(rustCode);
        } else {
          // No error code available - backend should provide proper error codes
          throw new Error(`Backend error missing error code: ${errorMessage}`);
        }
        
        // Ensure workflowContext is properly structured when creating AppError
        const finalWorkflowContext = workflowContext && typeof workflowContext === 'object' ? workflowContext : undefined;
        
        appError = new AppError(errorMessage, errorType, { 
          metadata: { 
            details: parsed.details, 
            source: 'backend-serialized',
            rustCode: rustCode,
            errorCode: parsed.code,
            errorCategory: parsed.category
          },
          workflowContext: finalWorkflowContext
        });
      } else {
        // String is not JobWorkerMetadata JSON structure - create fallback AppError
        appError = new AppError(
          `Backend error: ${error.substring(0, 200)}`,
          ErrorType.INTERNAL_ERROR,
          {
            metadata: {
              source: 'backend-raw',
              rawError: error,
              parseError: 'Non-JSON structure'
            }
          }
        );
      }
    } catch (jsonParseError) {
      // String is not JSON - create fallback AppError with raw error info
      appError = new AppError(
        `Backend error: ${error.substring(0, 200)}`,
        ErrorType.INTERNAL_ERROR,
        {
          metadata: {
            source: 'backend-raw',
            rawError: error,
            parseError: 'Invalid JSON format'
          }
        }
      );
    }
    return { isSuccess: false, message: appError.message, error: appError, metadata: appError.metadata };
  } else if (isTauriError(error)) {
    potentialTauriError = error;
  }

  if (potentialTauriError) {
    logger.debug("Detected Tauri-originated Error:", potentialTauriError);
    
    let errorMessage = (typeof potentialTauriError.message === 'string' && potentialTauriError.message.trim()) 
      ? potentialTauriError.message 
      : "Tauri error with undefined message";
    
    let errorCode: string | undefined = potentialTauriError.code;
    let errorDetails: string | undefined;
    
    // Try to parse the message as SerializableError JSON if no direct code is available
    if (!errorCode && typeof potentialTauriError.message === 'string') {
      const parsedMessage = parseNestedJsonError(potentialTauriError.message);
      if (parsedMessage && typeof parsedMessage.code === 'string' && typeof parsedMessage.message === 'string') {
        // Message contains a stringified SerializableError
        errorCode = parsedMessage.code;
        errorMessage = parsedMessage.message;
        errorDetails = parsedMessage.details;
      }
    }
    
    // Determine ErrorType, prioritizing the code field from SerializableError
    let errorType: ErrorType;
    
    if (errorCode && typeof errorCode === 'string') {
      // Prioritize code field from SerializableError for reliable mapping
      errorType = mapRustErrorCodeToErrorType(errorCode);
    } else {
      // No error code available - Tauri errors should have proper error codes
      throw new Error(`Tauri error missing error code: ${errorMessage}`);
    }

    const appError = new AppError(
      errorMessage,
      errorType,
      {
        metadata: {
          category: potentialTauriError.type || errorCode || "TauriError",
          source: potentialTauriError.source || "backend",
          payload: potentialTauriError.payload,
          stack: potentialTauriError.stack,
          rustCode: errorCode,
          details: errorDetails,
        }
      }
    );
    
    return {
      isSuccess: false,
      message: appError.message,
      error: appError,
      metadata: appError.metadata,
    };
  }

  // All errors should be handled by the cases above - no fallback handling
  throw new Error(`Unhandled error type in handleActionError: ${typeof error} - ${String(error).substring(0, 100)}`);
}

/**
 * Helper to create a standardized success ActionState
 */
export function createSuccessActionState<T>(
  data: T,
  message?: string,
  metadata?: Record<string, unknown>
): ActionState<T> {
  return {
    isSuccess: true,
    message,
    data,
    metadata,
  };
}

/**
 * Type guard to check if an object is a valid ActionState
 */
export function isActionState(obj: unknown): obj is ActionState<unknown> {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "isSuccess" in obj &&
    typeof (obj as ActionState<unknown>).isSuccess === "boolean"
  );
}

/**
 * Helper to process and trace an action result with standard logging
 */
export function traceActionResult<T>(
  result: ActionState<T>
): ActionState<T> {
  // Console logging removed per lint requirements
  return result;
}
