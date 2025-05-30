// TypeScript types for system prompt management

export interface SystemPrompt {
  id: string;
  sessionId: string;
  taskType: string;
  systemPrompt: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DefaultSystemPrompt {
  id: string;
  taskType: string;
  systemPrompt: string;
  description?: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}

export interface SystemPromptResponse {
  sessionId: string;
  taskType: string;
  systemPrompt: string;
  isDefault: boolean;
  isCustom: boolean;
}

export interface GetSystemPromptRequest {
  sessionId: string;
  taskType: string;
}

export interface SetSystemPromptRequest {
  sessionId: string;
  taskType: string;
  systemPrompt: string;
}

export interface ResetSystemPromptRequest {
  sessionId: string;
  taskType: string;
}

// API Response types
export interface GetSystemPromptResponse {
  data?: SystemPromptResponse;
  error?: string;
}

export interface SetSystemPromptResponse {
  success: boolean;
  error?: string;
}

export interface GetDefaultSystemPromptsResponse {
  data: DefaultSystemPrompt[];
  error?: string;
}

export interface GetDefaultSystemPromptResponse {
  data?: DefaultSystemPrompt;
  error?: string;
}

export interface HasCustomSystemPromptResponse {
  hasCustom: boolean;
  error?: string;
}

// Task types that support system prompts - using snake_case to match backend TaskType::to_string()
export type TaskType = 
  | 'path_finder'
  | 'text_improvement' 
  | 'guidance_generation'
  | 'text_correction'
  | 'implementation_plan'
  | 'path_correction'
  | 'task_enhancement'
  | 'regex_pattern_generation'
  | 'regex_summary_generation'
  | 'generic_llm_stream';

// UI-specific types
export interface SystemPromptFormData {
  taskType: TaskType;
  systemPrompt: string;
  isDefault: boolean;
}

export interface SystemPromptDisplayData {
  taskType: TaskType;
  title: string;
  description: string;
  currentPrompt: string;
  isCustom: boolean;
  isDefault: boolean;
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
  useDefault: boolean;
}

export interface SystemPromptSettingsGroup {
  category: string;
  tasks: SystemPromptSettings[];
}