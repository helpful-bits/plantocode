use std::collections::HashSet;
use once_cell::sync::Lazy;

// API URLs
pub const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
pub const OPENROUTER_AUDIO_URL: &str = "https://openrouter.ai/api/v1/audio/transcriptions";
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

// Job settings
pub const DEFAULT_JOB_TIMEOUT_MS: u64 = 300000; // 5 minutes
pub const DEFAULT_JOB_TIMEOUT_SECONDS: u64 = 600; // 10 minutes
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

// Common message constants
pub const PATH_FINDER_FILE_CONTENT_TRUNCATION_MESSAGE: &str = "[Content truncated due to size limits]";
pub const PATH_FINDER_MAX_DIR_TREE_LINES: usize = 1000;  // Limit for truncating directory tree if needed

// PathFinder settings
pub const DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS: bool = true;
pub const DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT: usize = 10;
pub const PATH_FINDER_MAX_CONTENT_SIZE_PER_FILE: usize = 10000; // Max chars per file
pub const PATH_FINDER_FILE_CONTENT_TRUNCATION_CHARS: usize = 5000; // Default truncation
pub const PATH_FINDER_TOKEN_LIMIT_BUFFER: u32 = 500;

// Directory and file constants
pub const APP_DATA_DIR_NAME: &str = "com.vibe-manager.app";
pub const APP_TEMP_SUBDIR_NAME: &str = "com.vibe-manager.desktop/temp";
pub const DB_FILENAME: &str = "appdata.db";