// Key for storing the *last used* global project directory in the database cache
export const GLOBAL_PROJECT_DIR_KEY = "global-project-dir";
// Key for storing project directory history (global scope)
export const PROJECT_DIR_HISTORY_CACHE_KEY = "project-dir-history";
export const MAX_PROJECT_DIR_HISTORY = 15;

// Key for storing model settings per project
export const MODEL_SETTINGS_KEY = "project-model-settings";

// XML editor command key for project settings
export const XML_EDITOR_COMMAND_KEY = "xml-editor-command";

// Gemini model constants
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash-preview-04-17";
export const GEMINI_PRO_PREVIEW_MODEL = "gemini-2.5-pro-preview-03-25";

// Auto-save interval (in milliseconds)
export const AUTO_SAVE_INTERVAL = 5000;
export const AUTO_RETRY_INTERVAL = 5000;
export const GEMINI_MODEL = GEMINI_FLASH_MODEL;

// Default task settings for all task types
import { TaskSettings } from "@/types";

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  xml_generation: { 
    model: GEMINI_PRO_PREVIEW_MODEL, 
    maxTokens: 65536 
  },
  pathfinder: { 
    model: GEMINI_FLASH_MODEL, 
    maxTokens: 8192 
  },
  transcription: { 
    model: "whisper-large-v3", 
    maxTokens: 4096 
  },
  regex_generation: { 
    model: "claude-3-7-sonnet-20250219", 
    maxTokens: 4096 
  },
  path_correction: { 
    model: GEMINI_FLASH_MODEL, 
    maxTokens: 8192 
  },
  text_improvement: { 
    model: "claude-3-7-sonnet-20250219", 
    maxTokens: 8192 
  },
  voice_correction: { 
    model: "claude-3-7-sonnet-20250219", 
    maxTokens: 4096 
  },
  task_enhancement: { 
    model: GEMINI_PRO_PREVIEW_MODEL, 
    maxTokens: 16384 
  },
  guidance_generation: { 
    model: GEMINI_PRO_PREVIEW_MODEL, 
    maxTokens: 16384 
  },
  task_guidance: { 
    model: GEMINI_PRO_PREVIEW_MODEL, 
    maxTokens: 16384 
  },
  unknown: { 
    model: GEMINI_FLASH_MODEL, 
    maxTokens: 4096 
  }
};

// Whisper API constants
export const WHISPER_MAX_FILE_SIZE_MB = 25;
export const WHISPER_MODEL = "whisper-large-v3";
