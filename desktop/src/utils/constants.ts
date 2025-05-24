// Debug mode control - can be enabled via localStorage.setItem('DEBUG_BACKGROUND_JOBS', 'true')
export const DEBUG_POLLING =
  typeof window !== "undefined" &&
  (localStorage.getItem("DEBUG_BACKGROUND_JOBS") === "true" || false);

// App store file for persistent application settings
export const APP_SETTINGS_STORE = ".app-settings.dat";

// Key for storing the *last used* global project directory in the database cache
export const GLOBAL_PROJECT_DIR_KEY = "global-project-dir";
// Key for storing project directory history (global scope)
export const PROJECT_DIR_HISTORY_CACHE_KEY = "project-dir-history";
export const MAX_PROJECT_DIR_HISTORY = 15;

// Key for storing model settings per project
export const MODEL_SETTINGS_KEY = "project-model-settings";

// Default cache key for use in session action functions
export const DEFAULT_CACHE_KEY = "default_scope";

// Output file editor command key for project settings
export const OUTPUT_FILE_EDITOR_COMMAND_KEY = "output-file-editor-command";

// Auto-save interval (in milliseconds)
export const AUTO_SAVE_INTERVAL = 5000;
export const AUTO_RETRY_INTERVAL = 5000;

// Whisper API constants
export const WHISPER_MAX_FILE_SIZE_MB = 25;
