// Key for storing the *last used* global project directory in the database cache
export const GLOBAL_PROJECT_DIR_KEY = "global-project-dir";
// Key for storing project directory history (global scope)
export const PROJECT_DIR_HISTORY_CACHE_KEY = "project-dir-history";
export const MAX_PROJECT_DIR_HISTORY = 15;

// Key for storing model settings per project
export const MODEL_SETTINGS_KEY = "project-model-settings";

// Gemini model constants
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash-preview-04-17";
export const GEMINI_PRO_PREVIEW_MODEL = "gemini-2.5-pro-preview-03-25";

// Auto-save interval (in milliseconds)
export const AUTO_SAVE_INTERVAL = 3000;
export const AUTO_RETRY_INTERVAL = 5000;
export const GEMINI_MODEL = GEMINI_FLASH_MODEL;
