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

// Export consolidated task type definitions and validation utilities
export * from "./task-type-defs";

// Export system prompt types (excluding TaskType to avoid conflict)
export type {
  SystemPrompt,
  DefaultSystemPrompt,
  SystemPromptResponse,
  GetSystemPromptRequest,
  SetSystemPromptRequest,
  ResetSystemPromptRequest,
  GetSystemPromptResponse,
  SetSystemPromptResponse,
  GetDefaultSystemPromptsResponse,
  GetDefaultSystemPromptResponse,
  HasCustomSystemPromptResponse,
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
