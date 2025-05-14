// Key for storing the *last used* global project directory in the database cache
export const GLOBAL_PROJECT_DIR_KEY = "global-project-dir";
// Key for storing project directory history (global scope)
export const PROJECT_DIR_HISTORY_CACHE_KEY = "project-dir-history";
export const MAX_PROJECT_DIR_HISTORY = 15;

// Key for storing model settings per project
export const MODEL_SETTINGS_KEY = "project-model-settings";

// Output file editor command key for project settings
export const OUTPUT_FILE_EDITOR_COMMAND_KEY = "output-file-editor-command";

// Gemini model constants
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash-preview-04-17";
export const GEMINI_PRO_PREVIEW_MODEL = "gemini-2.5-pro-preview-05-06";

// Auto-save interval (in milliseconds)
export const AUTO_SAVE_INTERVAL = 5000;
export const AUTO_RETRY_INTERVAL = 5000;
export const GEMINI_MODEL = GEMINI_FLASH_MODEL;

import { TaskSettings } from '@core/types';
// Default task settings for all task types

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  pathfinder: {
    model: GEMINI_FLASH_MODEL,
    maxTokens: 8192,
    temperature: 0.3 // Lower temperature for more accurate path finding
  },
  transcription: {
    model: "whisper-large-v3",
    maxTokens: 4096
    // No temperature for transcription
  },
  regex_generation: {
    model: "claude-3-7-sonnet-20250219",
    maxTokens: 4096,
    temperature: 0.2 // Low temperature for accurate regex generation
  },
  path_correction: {
    model: GEMINI_FLASH_MODEL,
    maxTokens: 8192,
    temperature: 0.2 // Low temperature for accurate path correction
  },
  text_improvement: {
    model: "claude-3-7-sonnet-20250219",
    maxTokens: 8192,
    temperature: 0.7 // Higher temperature for creative improvements
  },
  voice_correction: {
    model: "claude-3-7-sonnet-20250219",
    maxTokens: 4096,
    temperature: 0.3 // Moderate temperature for voice correction
  },
  task_enhancement: {
    model: GEMINI_PRO_PREVIEW_MODEL,
    maxTokens: 16384,
    temperature: 0.7
  },
  guidance_generation: {
    model: GEMINI_PRO_PREVIEW_MODEL,
    maxTokens: 16384,
    temperature: 0.7
  },
  implementation_plan: {
    model: GEMINI_PRO_PREVIEW_MODEL,
    maxTokens: 65536,
    temperature: 0.7
  },
  generic_llm_stream: {
    model: GEMINI_FLASH_MODEL,
    maxTokens: 16384,
    temperature: 0.7
  },
  streaming: {
    model: GEMINI_FLASH_MODEL,
    maxTokens: 16384,
    temperature: 0.7
  },
  unknown: {
    model: GEMINI_FLASH_MODEL,
    maxTokens: 4096,
    temperature: 0.7
  }
};

// Whisper API constants
export const WHISPER_MAX_FILE_SIZE_MB = 25;
export const WHISPER_MODEL = "whisper-large-v3";
