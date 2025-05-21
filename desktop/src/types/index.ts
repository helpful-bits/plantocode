/**
 * Types index file
 * Re-exports all types from various type definition files
 */

// Export session-related types (prioritized for job types)
export * from "./session-types";

// Export action-related types with renamed conflicts
export type {
  TaskType as ActionTaskType,
  TaskSettings as ActionTaskSettings,
  ActionState,
  FileInfo,
} from "./action-types";

// Export error types
export type * from "./error-types";

// Export task settings types
export type * from "./task-settings-types";

// Authentication types
export interface FrontendUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

export interface AuthDataResponse {
  user: FrontendUser;
  token: string;
  expires_in: number;
  firebase_uid?: string; // Added for the new auth flow
}
