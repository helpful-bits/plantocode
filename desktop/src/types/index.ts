/**
 * Types index file
 * Re-exports all types from various type definition files
 */

// Export session-related types (prioritized for job types)
export * from "./session-types";

// Export action-related types
export type {
  ActionState,
  FileInfo,
} from "./action-types";

// Export error types
export type * from "./error-types";

// Export task settings types
export type * from "./task-settings-types";

// Export stream event types
export type * from "./stream-event-types";

// Export consolidated task type definitions and validation utilities
export * from "./task-type-defs";

// Export system prompt types (excluding TaskType to avoid conflict)
export type {
  DefaultSystemPrompt,
  GetDefaultSystemPromptsResponse,
  GetDefaultSystemPromptResponse,
  SystemPromptDisplayData,
  SystemPromptFormData,
  TaskTypeSupportingSystemPrompts
} from "./system-prompts";

// Authentication types
export interface FrontendUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  sub: string;
}

export interface AuthDataResponse {
  user: FrontendUser;
  token: string;
  expires_in: number;
}
