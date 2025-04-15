-- Enable foreign key support if not already enabled
PRAGMA foreign_keys = ON;

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT, -- Added hashed project directory for safer queries
  task_description TEXT DEFAULT '',
  search_term TEXT DEFAULT '',
  pasted_paths TEXT DEFAULT '',
  pattern_description TEXT DEFAULT '',
  title_regex TEXT DEFAULT '',
  content_regex TEXT DEFAULT '',
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)), -- Boolean represented as integer
  codebase_structure TEXT DEFAULT '',
  output_format TEXT NOT NULL,
  custom_format TEXT DEFAULT '',
  -- Use INTEGER for timestamp (milliseconds since epoch)
  -- Using default strftime for creation time is problematic if row is updated
  -- Instead, rely on application logic to set timestamps
  created_at INTEGER,
  updated_at INTEGER
); -- Keep semicolon

-- Add index on project_hash and output_format for faster session lookups
-- Combined with the index below
-- CREATE INDEX IF NOT EXISTS idx_sessions_project_hash_format ON sessions(project_hash, output_format);

-- Create included_files table
CREATE TABLE IF NOT EXISTS included_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, file_path)
);

-- Create excluded_files table
CREATE TABLE IF NOT EXISTS excluded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, file_path)
);

-- Create project_settings table
CREATE TABLE IF NOT EXISTS project_settings (
  project_hash TEXT NOT NULL,
  output_format TEXT NOT NULL,
  active_session_id TEXT, -- Can be NULL if no session is active
  updated_at INTEGER,
  PRIMARY KEY (project_hash, output_format),
  FOREIGN KEY (active_session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- Create cached_state table
CREATE TABLE IF NOT EXISTS cached_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_hash TEXT NOT NULL,
  output_format TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- Store serialized values as text
  updated_at INTEGER,
  UNIQUE(project_hash, output_format, key)
);

-- Create indexes for better performance on lookups
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash_format ON sessions(project_hash, output_format); -- Use project_hash
CREATE INDEX IF NOT EXISTS idx_included_files_session ON included_files(session_id);
CREATE INDEX IF NOT EXISTS idx_excluded_files_session ON excluded_files(session_id);
CREATE INDEX IF NOT EXISTS idx_cached_state_lookup ON cached_state(project_hash, output_format, key);