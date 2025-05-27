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
 * Prioritizes exact code matches, then falls back to substring matching
 */
function mapRustErrorCodeToErrorType(rustCode: string): ErrorType {
  // First, try exact code matches for better reliability
  switch (rustCode.toUpperCase()) {
    case "VALIDATION_ERROR":
    case "VALIDATION":
      return ErrorType.VALIDATION_ERROR;
    case "NOT_FOUND_ERROR":
    case "NOT_FOUND":
      return ErrorType.NOT_FOUND_ERROR;
    case "AUTH_ERROR":
    case "AUTHORIZATION_ERROR":
    case "PERMISSION_ERROR":
    case "AUTH":
      return ErrorType.PERMISSION_ERROR;
    case "BILLING_ERROR":
    case "BILLING":
      return ErrorType.BILLING_ERROR;
    case "NETWORK_ERROR":
    case "NETWORK":
      return ErrorType.NETWORK_ERROR;
    case "CONFIGURATION_ERROR":
    case "CONFIG_ERROR":
    case "CONFIGURATION":
      return ErrorType.CONFIGURATION_ERROR;
    case "INTERNAL_ERROR":
    case "INTERNAL":
      return ErrorType.INTERNAL_ERROR;
    default:
      // Fallback to substring matching for partial matches
      const upperCode = rustCode.toUpperCase();
      if (upperCode.includes("VALIDATION")) return ErrorType.VALIDATION_ERROR;
      if (upperCode.includes("NOT_FOUND")) return ErrorType.NOT_FOUND_ERROR;
      if (upperCode.includes("AUTH") || upperCode.includes("PERMISSION")) return ErrorType.PERMISSION_ERROR;
      if (upperCode.includes("BILLING")) return ErrorType.BILLING_ERROR;
      if (upperCode.includes("NETWORK")) return ErrorType.NETWORK_ERROR;
      if (upperCode.includes("CONFIG")) return ErrorType.CONFIGURATION_ERROR;
      return ErrorType.INTERNAL_ERROR;
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
      const parsed = JSON.parse(error) as { code?: string; message?: string; details?: string; type?: string /* legacy */ };
      if (parsed && typeof parsed.message === 'string') {
        const rustCode = parsed.code || parsed.type; // Prefer code, fallback to type
        const errorType = rustCode ? mapRustErrorCodeToErrorType(rustCode) : ErrorType.UNKNOWN_ERROR;
        appError = new AppError(parsed.message, errorType, { metadata: { details: parsed.details, source: 'backend-serialized' } });
      } else {
        // String is not our expected JSON structure
        const message = error.trim() || "An unspecified error occurred.";
        appError = new AppError(message, ErrorType.INTERNAL_ERROR, { metadata: { source: 'client-string-error' }});
      }
    } catch (e) {
      // String is not JSON at all - try to infer error type from content
      const errorLower = error.toLowerCase();
      let inferredType = ErrorType.INTERNAL_ERROR;
      
      if (errorLower.includes('error:') || errorLower.includes('failed') || errorLower.includes('invalid')) {
        if (errorLower.includes('not found')) {
          inferredType = ErrorType.NOT_FOUND_ERROR;
        } else if (errorLower.includes('permission') || errorLower.includes('auth')) {
          inferredType = ErrorType.PERMISSION_ERROR;
        } else if (errorLower.includes('billing') || errorLower.includes('payment')) {
          inferredType = ErrorType.BILLING_ERROR;
        } else if (errorLower.includes('network') || errorLower.includes('connection')) {
          inferredType = ErrorType.NETWORK_ERROR;
        } else if (errorLower.includes('config')) {
          inferredType = ErrorType.CONFIGURATION_ERROR;
        } else if (errorLower.includes('validation')) {
          inferredType = ErrorType.VALIDATION_ERROR;
        }
      }
      
      appError = new AppError(error, inferredType, { metadata: { source: 'client-string-error' }});
    }
    return { isSuccess: false, message: appError.message, error: appError, metadata: appError.metadata };
  } else if (isTauriError(error)) {
    potentialTauriError = error;
  }

  if (potentialTauriError) {
    logger.debug("Detected Tauri-originated Error:", potentialTauriError);
    
    const errorMessage = (typeof potentialTauriError.message === 'string') 
      ? potentialTauriError.message 
      : "Tauri error with undefined message";
    
    // Determine ErrorType, prioritizing the code field from Tauri
    let errorType: ErrorType;
    
    if (potentialTauriError.code) {
      // Use the code field for reliable mapping
      errorType = mapRustErrorCodeToErrorType(potentialTauriError.code);
    } else {
      // Fallback to message-based detection for backward compatibility
      const lowerMessage = errorMessage.toLowerCase();
      if (lowerMessage.includes("billing") || lowerMessage.includes("payment required")) {
        errorType = ErrorType.BILLING_ERROR;
      } else if (lowerMessage.includes("not found")) {
        errorType = ErrorType.NOT_FOUND_ERROR;
      } else if (lowerMessage.includes("auth") || lowerMessage.includes("permission")) {
        errorType = ErrorType.PERMISSION_ERROR;
      } else if (lowerMessage.includes("validation")) {
        errorType = ErrorType.VALIDATION_ERROR;
      } else if (lowerMessage.includes("network") || lowerMessage.includes("connection")) {
        errorType = ErrorType.NETWORK_ERROR;
      } else if (lowerMessage.includes("config")) {
        errorType = ErrorType.CONFIGURATION_ERROR;
      } else {
        errorType = ErrorType.INTERNAL_ERROR;
      }
    }

    const appError = new AppError(
      errorMessage,
      errorType,
      {
        metadata: {
          category: potentialTauriError.type || potentialTauriError.code || "TauriError",
          source: potentialTauriError.source || "backend",
          payload: potentialTauriError.payload,
          stack: potentialTauriError.stack,
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
    const message = error.message.trim() || "An error occurred.";
    finalMessage = `Action failed: ${message}`;
    finalError = new AppError(message, ErrorType.INTERNAL_ERROR, { cause: error });
  } else {
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
