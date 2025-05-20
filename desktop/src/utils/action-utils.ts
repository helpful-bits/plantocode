import { type ActionState } from "@/types";

/**
 * Tauri Error structure from invoke()
 */
interface TauriError {
  message: string;
  source?: string;
  payload?: Record<string, unknown>;
  type?: string;
  stack?: string;
}

/**
 * Type guard to check if an error has the Tauri error structure
 */
function isTauriError(error: unknown): error is TauriError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Error | { message?: string }).message === "string"
  );
}

/**
 * Helper function to handle errors in actions when invoking Tauri commands
 */
export function handleActionError(
  error: unknown,
  _actionName: string
): ActionState<unknown> {
  // Error logging is removed per lint requirements

  // Handle TauriError format (specific format of errors from tauri.invoke)
  if (isTauriError(error)) {
    // Extract error category and details from the error if available
    const category = error.type || "TauriError";
    const details = error.payload ? JSON.stringify(error.payload) : "";

    return {
      isSuccess: false,
      message: `${error.message}${details ? `: ${details}` : ""}`,
      error: new Error(error.message),
      metadata: {
        category,
        source: error.source || "unknown",
        payload: error.payload,
        stack: error.stack,
      },
    };
  }

  // Standard error handling
  return {
    isSuccess: false,
    message: `Action failed: ${error instanceof Error ? error.message : String(error)}`,
    error: error instanceof Error ? error : new Error(String(error)),
    metadata: {
      category: "unknown",
      source: "client",
    },
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
  result: ActionState<T>,
  _actionName: string
): ActionState<T> {
  // Console logging removed per lint requirements
  return result;
}
