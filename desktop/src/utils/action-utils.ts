import { type ActionState } from "@/types";
import { AppError, ErrorType } from "@/utils/error-handling";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "ActionUtils" });

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
    case "SUBSCRIPTION_ERROR":
    case "QUOTA_EXCEEDED":
    case "INSUFFICIENT_CREDITS":
    case "PLAN_UPGRADE_REQUIRED":
    case "SUBSCRIPTION_EXPIRED":
      return ErrorType.BILLING_ERROR;
    
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
      // Fallback to substring matching for partial matches
      const upperCode = rustCode.toUpperCase();
      if (upperCode.includes("VALIDATION") || upperCode.includes("INVALID")) return ErrorType.VALIDATION_ERROR;
      if (upperCode.includes("NOT_FOUND") || upperCode.includes("MISSING")) return ErrorType.NOT_FOUND_ERROR;
      if (upperCode.includes("AUTH") || upperCode.includes("PERMISSION") || upperCode.includes("ACCESS") || upperCode.includes("SECURITY") || upperCode.includes("TOKEN") || upperCode.includes("UNAUTHORIZED") || upperCode.includes("FORBIDDEN")) return ErrorType.PERMISSION_ERROR;
      if (upperCode.includes("BILLING") || upperCode.includes("PAYMENT") || upperCode.includes("SUBSCRIPTION") || upperCode.includes("QUOTA") || upperCode.includes("CREDITS") || upperCode.includes("PLAN")) return ErrorType.BILLING_ERROR;
      if (upperCode.includes("NETWORK") || upperCode.includes("HTTP") || upperCode.includes("CONNECTION") || upperCode.includes("SERVICE") || upperCode.includes("API") || upperCode.includes("TIMEOUT") || upperCode.includes("REQUEST")) return ErrorType.NETWORK_ERROR;
      if (upperCode.includes("CONFIG") || upperCode.includes("INITIALIZATION") || upperCode.includes("SETUP") || upperCode.includes("ENV")) return ErrorType.CONFIGURATION_ERROR;
      if (upperCode.includes("DATABASE") || upperCode.includes("STORAGE") || upperCode.includes("SQLX") || upperCode.includes("MIGRATION") || upperCode.includes("CONSTRAINT")) return ErrorType.DATABASE_ERROR;
      if (upperCode.includes("WORKFLOW") || upperCode.includes("JOB") || upperCode.includes("STAGE") || upperCode.includes("PROCESSOR")) return ErrorType.WORKFLOW_ERROR;
      return ErrorType.UNKNOWN_ERROR;
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
      const parsed = JSON.parse(error) as { 
        code?: string; 
        message?: string; 
        details?: string; 
        type?: string; /* legacy */
        workflowContext?: any;
        workflow_context?: any;
        category?: string;
      };
      if (parsed && typeof parsed === 'object') {
        // Prioritize code field for SerializableError, then fallback to type (legacy)
        const rustCode = (typeof parsed.code === 'string' && parsed.code) ? parsed.code : 
                        (typeof parsed.type === 'string' && parsed.type) ? parsed.type : null;
        
        // Extract workflow context if available - ensure proper structure
        const workflowContext = parsed.workflowContext || parsed.workflow_context;
        
        // Provide more meaningful fallback messages based on context
        let errorMessage: string;
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          errorMessage = parsed.message;
        } else if (rustCode) {
          errorMessage = `Backend operation failed: ${rustCode}`;
        } else {
          errorMessage = "An unexpected backend error occurred";
        }
        
        // Use rustCode for mapping if available, otherwise fall back to message-based inference
        let errorType: ErrorType;
        if (rustCode) {
          errorType = mapRustErrorCodeToErrorType(rustCode);
        } else {
          // Fallback to message-based inference when no code/type is available
          const messageLower = errorMessage.toLowerCase();
          if (messageLower.includes('not found')) {
            errorType = ErrorType.NOT_FOUND_ERROR;
          } else if (messageLower.includes('permission') || messageLower.includes('auth') || messageLower.includes('access denied')) {
            errorType = ErrorType.PERMISSION_ERROR;
          } else if (messageLower.includes('billing') || messageLower.includes('payment')) {
            errorType = ErrorType.BILLING_ERROR;
          } else if (messageLower.includes('network') || messageLower.includes('connection') || messageLower.includes('http') || messageLower.includes('service')) {
            errorType = ErrorType.NETWORK_ERROR;
          } else if (messageLower.includes('config') || messageLower.includes('initialization')) {
            errorType = ErrorType.CONFIGURATION_ERROR;
          } else if (messageLower.includes('validation') || messageLower.includes('invalid')) {
            errorType = ErrorType.VALIDATION_ERROR;
          } else if (messageLower.includes('database') || messageLower.includes('storage') || messageLower.includes('sqlx')) {
            errorType = ErrorType.DATABASE_ERROR;
          } else if (messageLower.includes('workflow') || messageLower.includes('stage') || messageLower.includes('job') || messageLower.includes('processor')) {
            errorType = ErrorType.WORKFLOW_ERROR; // Workflow/job errors get their own type
          } else {
            errorType = ErrorType.UNKNOWN_ERROR;
          }
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
        // String is not our expected JSON structure - provide meaningful fallback
        const message = error.trim() || "An unspecified backend error occurred";
        appError = new AppError(message, ErrorType.INTERNAL_ERROR, { metadata: { source: 'client-string-error', rawError: error }});
      }
    } catch (jsonParseError) {
      // String is not JSON at all - provide robust error type inference and meaningful fallback
      const errorLower = error.toLowerCase();
      let inferredType = ErrorType.INTERNAL_ERROR;
      let meaningfulMessage = error;
      
      // Enhanced pattern matching for better error categorization
      if (errorLower.includes('workflow') || errorLower.includes('stage') || errorLower.includes('job') || errorLower.includes('processor')) {
        inferredType = ErrorType.WORKFLOW_ERROR;
        if (!meaningfulMessage.toLowerCase().includes('workflow')) {
          meaningfulMessage = `Workflow error: ${meaningfulMessage}`;
        }
      } else if (errorLower.includes('not found')) {
        inferredType = ErrorType.NOT_FOUND_ERROR;
      } else if (errorLower.includes('permission') || errorLower.includes('auth') || errorLower.includes('access denied') || errorLower.includes('unauthorized') || errorLower.includes('forbidden')) {
        inferredType = ErrorType.PERMISSION_ERROR;
      } else if (errorLower.includes('billing') || errorLower.includes('payment') || errorLower.includes('subscription') || errorLower.includes('quota')) {
        inferredType = ErrorType.BILLING_ERROR;
      } else if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('http') || errorLower.includes('service') || errorLower.includes('timeout')) {
        inferredType = ErrorType.NETWORK_ERROR;
      } else if (errorLower.includes('config') || errorLower.includes('initialization') || errorLower.includes('setup')) {
        inferredType = ErrorType.CONFIGURATION_ERROR;
      } else if (errorLower.includes('validation') || errorLower.includes('invalid')) {
        inferredType = ErrorType.VALIDATION_ERROR;
      } else if (errorLower.includes('database') || errorLower.includes('storage') || errorLower.includes('sqlx')) {
        inferredType = ErrorType.DATABASE_ERROR;
      }
      
      // Ensure we have a meaningful message even for empty/whitespace strings
      if (!meaningfulMessage || meaningfulMessage.trim() === '') {
        meaningfulMessage = "An unknown error occurred during the operation";
      }
      
      appError = new AppError(meaningfulMessage, inferredType, { 
        metadata: { 
          source: 'client-string-error',
          rawError: error,
          jsonParseError: jsonParseError instanceof Error ? jsonParseError.message : String(jsonParseError)
        }
      });
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
      try {
        const parsedMessage = JSON.parse(potentialTauriError.message);
        if (parsedMessage && typeof parsedMessage === 'object' && 
            typeof parsedMessage.code === 'string' && typeof parsedMessage.message === 'string') {
          // Message contains a stringified SerializableError
          errorCode = parsedMessage.code;
          errorMessage = parsedMessage.message;
          errorDetails = parsedMessage.details;
        }
      } catch (e) {
        // Message is not JSON, continue with original message
      }
    }
    
    // Determine ErrorType, prioritizing the code field from SerializableError
    let errorType: ErrorType;
    
    if (errorCode && typeof errorCode === 'string') {
      // Prioritize code field from SerializableError for reliable mapping
      errorType = mapRustErrorCodeToErrorType(errorCode);
    } else {
      // Fallback to message-based detection for backward compatibility
      const lowerMessage = errorMessage.toLowerCase();
      if (lowerMessage.includes("billing") || lowerMessage.includes("payment required")) {
        errorType = ErrorType.BILLING_ERROR;
      } else if (lowerMessage.includes("not found")) {
        errorType = ErrorType.NOT_FOUND_ERROR;
      } else if (lowerMessage.includes("auth") || lowerMessage.includes("permission") || lowerMessage.includes("access denied")) {
        errorType = ErrorType.PERMISSION_ERROR;
      } else if (lowerMessage.includes("validation") || lowerMessage.includes("invalid")) {
        errorType = ErrorType.VALIDATION_ERROR;
      } else if (lowerMessage.includes("network") || lowerMessage.includes("connection") || lowerMessage.includes("http") || lowerMessage.includes("service")) {
        errorType = ErrorType.NETWORK_ERROR;
      } else if (lowerMessage.includes("config") || lowerMessage.includes("initialization")) {
        errorType = ErrorType.CONFIGURATION_ERROR;
      } else if (lowerMessage.includes("database") || lowerMessage.includes("storage") || lowerMessage.includes("sqlx")) {
        errorType = ErrorType.DATABASE_ERROR;
      } else if (lowerMessage.includes("workflow") || lowerMessage.includes("stage") || lowerMessage.includes("job") || lowerMessage.includes("processor")) {
        errorType = ErrorType.WORKFLOW_ERROR; // Workflow/job errors get their own type
      } else {
        errorType = ErrorType.INTERNAL_ERROR;
      }
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

  // Fallback for non-Tauri errors or unparseable strings
  let finalMessage: string;
  let finalError: AppError;
  
  if (error instanceof Error) {
    logger.error("Unhandled Error in action:", error);
    const message = error.message.trim() || "An error occurred.";
    finalMessage = `Action failed: ${message}`;
    finalError = new AppError(message, ErrorType.INTERNAL_ERROR, { cause: error });
  } else {
    logger.error("Unhandled unknown error in action:", error);
    const stringified = String(error);
    const message = (stringified === "[object Object]" || stringified.trim() === "") 
      ? "An error occurred." 
      : stringified;
    finalMessage = `Action failed: ${message}`;
    finalError = new AppError(message, ErrorType.UNKNOWN_ERROR);
  }
  
  return {
    isSuccess: false,
    message: finalMessage,
    error: finalError,
    metadata: { category: "unknown", source: "client" },
  };
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
