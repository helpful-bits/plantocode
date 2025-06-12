use std::collections::HashSet;
use once_cell::sync::Lazy;

// API URLs
pub const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
// Default fallback URL for the server API. Prefer environment variables.
pub const SERVER_API_URL: &str = "http://localhost:8080";

// HTTP Headers for API requests
pub const APP_HTTP_REFERER: &str = "https://github.com/vibe-manager/vibe-manager";
pub const APP_X_TITLE: &str = "Vibe Manager Desktop";
pub const HEADER_CLIENT_ID: &str = "X-Client-ID";

// Binary file extensions that shouldn't be processed
pub static BINARY_EXTENSIONS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    let mut set = HashSet::new();
    set.insert("jpg");
    set.insert("jpeg");
    set.insert("png");
    set.insert("gif");
    set.insert("bmp");
    set.insert("tiff");
    set.insert("ico");
    set.insert("webp");
    set.insert("svg");
    set.insert("mp3");
    set.insert("mp4");
    set.insert("avi");
    set.insert("mov");
    set.insert("wmv");
    set.insert("mkv");
    set.insert("flv");
    set.insert("webm");
    set.insert("wav");
    set.insert("ogg");
    set.insert("pdf");
    set.insert("zip");
    set.insert("tar");
    set.insert("gz");
    set.insert("rar");
    set.insert("7z");
    set.insert("exe");
    set.insert("dll");
    set.insert("so");
    set.insert("dylib");
    set.insert("bin");
    set.insert("dat");
    set.insert("db");
    set.insert("sqlite");
    set.insert("db3");
    set.insert("map");        // Source maps
    set.insert("wasm");       // WebAssembly
    set.insert("jar");        // Java Archives
    set.insert("war");        // Java Web Archives
    set.insert("ear");        // Java Enterprise Archives
    set.insert("ttf");        // TrueType Fonts
    set.insert("woff");       // Web Open Font Format
    set.insert("woff2");      // Web Open Font Format 2
    set.insert("otf");        // OpenType Fonts
    set.insert("eot");        // Embedded OpenType
    set.insert("pyc");        // Python compiled
    set.insert("lockb");      // pnpm lockfile binary variant
    set.insert("doc");        // Microsoft Word Document
    set.insert("docx");       // Microsoft Word Document (XML)
    set.insert("xls");        // Microsoft Excel Spreadsheet
    set.insert("xlsx");       // Microsoft Excel Spreadsheet (XML)
    set.insert("ppt");        // Microsoft PowerPoint Presentation
    set.insert("pptx");       // Microsoft PowerPoint Presentation (XML)
    set
});

// Job settings - these serve as fallbacks when not configured via RuntimeAIConfig
pub const DEFAULT_JOB_TIMEOUT_SECONDS: u64 = 300; // 5 minutes (used by dispatcher)
pub const DEFAULT_JOB_RETRY_COUNT: u32 = 3;
pub const DEFAULT_JOB_RETRY_DELAY_MS: u64 = 1000; // 1 second

// Key value store keys
pub const KV_ACTIVE_SESSION_ID: &str = "active_session_id";
pub const KV_PROJECT_DIRECTORY: &str = "project_directory";

// Authentication keys
// Note: TOKEN_KEY is primarily used when USE_SESSION_STORAGE is false (for keyring operations)
pub const TOKEN_KEY: &str = "com.vibe-manager.auth.token.v1";

// Storage mode configuration
// Development: Use in-memory session storage. Production: Use OS keyring.
// Note: When true, onboarding keychain flow will be skipped
pub const USE_SESSION_STORAGE: bool = cfg!(debug_assertions);

// Directory names
pub const IMPLEMENTATION_PLANS_DIR_NAME: &str = "implementation_plans";

// Common directories to exclude from file listing (used as fallback if git method fails)
// This list should be comprehensive and could potentially be made configurable by user/project
pub static EXCLUDED_DIRS_FOR_SCAN: [&str; 20] = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "out",
    "coverage",
    ".cache",
    ".vscode",
    ".idea",
    "target",
    "vendor",
    ".cargo",          // Cargo cache and registry
    ".rustup",         // Rust toolchain
    ".npm",            // NPM cache
    ".yarn",           // Yarn cache
    ".pnpm-store",     // PNPM cache
    "Library",         // macOS system library (when not in user directory)
    "Applications",    // macOS applications (when at root)
    "System"           // macOS system directory
];

// PathFinder truncation constants removed - full content is now sent to LLM

// PathFinder settings removed - all settings now come from RuntimeAIConfig.pathFinderSettings
// No fallback constants - server configuration is required

// Directory and file constants
pub const APP_DATA_DIR_NAME: &str = "com.vibe-manager.app";
pub const APP_TEMP_SUBDIR_NAME: &str = "com.vibe-manager.desktop/temp";
pub const DB_FILENAME: &str = "appdata.db";

// ====================================
// TYPE-SAFE ENUMS TO REPLACE MAGIC STRINGS
// ====================================

use serde::{Deserialize, Serialize};

/// Service provider types for API proxying
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceProvider {
    ReplicateServerProxy,
    OpenRouterProxy,
    DirectApi,
}

impl ServiceProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            ServiceProvider::ReplicateServerProxy => "replicate_server_proxy",
            ServiceProvider::OpenRouterProxy => "openrouter_proxy", 
            ServiceProvider::DirectApi => "direct_api",
        }
    }
}

impl std::fmt::Display for ServiceProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// API provider types for validation and configuration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApiProvider {
    Gemini,
    Claude,
    Whisper,
    Replicate,
    OpenAI,
    Anthropic,
    Google,
}

impl ApiProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiProvider::Gemini => "gemini",
            ApiProvider::Claude => "claude",
            ApiProvider::Whisper => "whisper",
            ApiProvider::Replicate => "replicate",
            ApiProvider::OpenAI => "openai",
            ApiProvider::Anthropic => "anthropic",
            ApiProvider::Google => "google",
        }
    }

    pub fn all_valid() -> Vec<&'static str> {
        vec![
            Self::Gemini.as_str(),
            Self::Claude.as_str(), 
            Self::Whisper.as_str(),
            Self::Replicate.as_str(),
            Self::OpenAI.as_str(),
            Self::Anthropic.as_str(),
            Self::Google.as_str(),
        ]
    }
}

impl std::fmt::Display for ApiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Error types for consistent error handling
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorType {
    ReplicateError,
    OpenRouterError,
    AnthropicError,
    OpenAIError,
    NetworkError,
    SerializationError,
    InvalidArgument,
}

impl ErrorType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ErrorType::ReplicateError => "replicate_error",
            ErrorType::OpenRouterError => "openrouter_error",
            ErrorType::AnthropicError => "anthropic_error",
            ErrorType::OpenAIError => "openai_error",
            ErrorType::NetworkError => "network_error",
            ErrorType::SerializationError => "serialization_error",
            ErrorType::InvalidArgument => "invalid_argument",
        }
    }
}

impl std::fmt::Display for ErrorType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Job categories for better organization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobCategory {
    VoiceTranscription,
    TextProcessing,
    PathFinding,
    ImplementationPlanning,
    FileAnalysis,
    WorkflowExecution,
}

impl JobCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobCategory::VoiceTranscription => "VOICE_TRANSCRIPTION",
            JobCategory::TextProcessing => "TEXT_PROCESSING",
            JobCategory::PathFinding => "PATH_FINDING",
            JobCategory::ImplementationPlanning => "IMPLEMENTATION_PLANNING",
            JobCategory::FileAnalysis => "FILE_ANALYSIS",
            JobCategory::WorkflowExecution => "WORKFLOW_EXECUTION",
        }
    }
}

impl std::fmt::Display for JobCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}