// TypeScript types for system prompt management


export interface DefaultSystemPrompt {
  id: string;
  taskType: string;
  systemPrompt: string;
  description?: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}

export interface GetDefaultSystemPromptsResponse {
  data: DefaultSystemPrompt[];
  error?: string;
}

export interface GetDefaultSystemPromptResponse {
  data?: DefaultSystemPrompt;
  error?: string;
}


// Import task types from consolidated definitions
import type { TaskType, TaskTypeSupportingSystemPrompts } from './task-type-defs';
export type { TaskType, TaskTypeSupportingSystemPrompts };

// UI-specific types
export interface SystemPromptFormData {
  taskType: TaskTypeSupportingSystemPrompts;
  systemPrompt: string;
  isActive: boolean;
}

export interface SystemPromptDisplayData {
  taskType: TaskType;
  title: string;
  description: string;
  currentPrompt: string;
  isCustom: boolean;
  lastUpdated?: number;
}

// Placeholder types for template rendering
export interface PromptPlaceholders {
  taskDescription?: string;
  projectContext?: string;
  customInstructions?: string;
  fileContents?: string;
  directoryTree?: string;
  modelName?: string;
  sessionName?: string;
  taskType?: string;
}

// Template rendering utilities
export interface TemplateDisplayOptions {
  showPlaceholders: boolean;
  maxLength?: number;
  truncateContent?: boolean;
}

// Validation types
export interface SystemPromptValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Settings UI types
export interface SystemPromptSettings {
  taskType: TaskType;
  enabled: boolean;
  customPrompt?: string;
  isActive: boolean;
}

export interface SystemPromptSettingsGroup {
  category: string;
  tasks: SystemPromptSettings[];
}