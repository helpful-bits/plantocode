-- Initial schema for Vibe Manager Desktop

-- Sessions table with fields matching the Session interface
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_directory TEXT NOT NULL,
    project_hash TEXT NOT NULL,
    task_description TEXT DEFAULT '',
    search_term TEXT DEFAULT '',
    title_regex TEXT DEFAULT '',
    content_regex TEXT DEFAULT '',
    negative_title_regex TEXT DEFAULT '',
    negative_content_regex TEXT DEFAULT '',
    is_regex_active INTEGER DEFAULT 0,
    codebase_structure TEXT DEFAULT '',
    search_selected_files_only INTEGER DEFAULT 0,
    model_used TEXT DEFAULT 'gemini-pro',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Included files table
CREATE TABLE IF NOT EXISTS included_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Excluded files table
CREATE TABLE IF NOT EXISTS excluded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Background jobs table with fields matching the BackgroundJob interface
CREATE TABLE IF NOT EXISTS background_jobs (
    -- Core identifying fields
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    api_type TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    
    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    start_time INTEGER,
    end_time INTEGER,
    last_update INTEGER,
    
    -- Input and output content
    prompt TEXT NOT NULL,
    response TEXT,
    
    -- Project information
    project_directory TEXT,
    
    -- Token and performance tracking
    tokens_sent INTEGER DEFAULT 0,
    tokens_received INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    chars_received INTEGER DEFAULT 0,
    
    -- Status and error information
    status_message TEXT,
    error_message TEXT,
    
    -- Model configuration
    model_used TEXT,
    max_output_tokens INTEGER,
    temperature REAL,
    include_syntax INTEGER DEFAULT 0,
    
    -- Output file path
    output_file_path TEXT,
    
    -- Visibility/management flags
    cleared INTEGER DEFAULT 0,
    visible INTEGER DEFAULT 1,
    
    -- Metadata (stored as JSON)
    metadata TEXT,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Key-value store for application settings and active session tracking
CREATE TABLE IF NOT EXISTS key_value_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Task settings store
CREATE TABLE IF NOT EXISTS task_settings (
    session_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    model TEXT NOT NULL,
    max_tokens INTEGER NOT NULL,
    temperature REAL,
    PRIMARY KEY (session_id, task_type),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_included_files_session_id ON included_files(session_id);
CREATE INDEX IF NOT EXISTS idx_excluded_files_session_id ON excluded_files(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_api_type ON background_jobs(api_type);