-- Consolidated SQL Schema for Vibe Manager
-- This file standardizes the database schema between the desktop and core applications

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- =========================================================================
-- Migrations and Meta tables
-- =========================================================================

-- Create migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create diagnostic table to track issues
CREATE TABLE IF NOT EXISTS db_diagnostic_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  additional_info TEXT
);

-- Create meta table for tracking database state
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY, 
  value TEXT NOT NULL
);

-- =========================================================================
-- Core Tables
-- =========================================================================

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT NOT NULL, -- Hash of project_directory for faster lookups
  task_description TEXT DEFAULT '',
  search_term TEXT DEFAULT '',
  title_regex TEXT DEFAULT '',
  content_regex TEXT DEFAULT '',
  negative_title_regex TEXT DEFAULT '',
  negative_content_regex TEXT DEFAULT '',
  is_regex_active INTEGER DEFAULT 0 CHECK(is_regex_active IN (0, 1)),
  codebase_structure TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  model_used TEXT DEFAULT 'gemini-2.5-flash-preview-04-17',
  search_selected_files_only INTEGER DEFAULT 0 CHECK(search_selected_files_only IN (0, 1))
);

-- Create indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_project_directory ON sessions(project_directory);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_model_used ON sessions(model_used);

-- Create included_files table
CREATE TABLE IF NOT EXISTS included_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, path)
);

-- Create index for included_files table
CREATE INDEX IF NOT EXISTS idx_included_files_session ON included_files(session_id);

-- Create excluded_files table
CREATE TABLE IF NOT EXISTS excluded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, path)
);

-- Create index for excluded_files table
CREATE INDEX IF NOT EXISTS idx_excluded_files_session ON excluded_files(session_id);

-- Create cached_state table
CREATE TABLE IF NOT EXISTS cached_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_directory TEXT NOT NULL,
  project_hash TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- Store serialized values as text
  updated_at INTEGER,
  UNIQUE(project_hash, key)
);

-- Create indexes for cached_state table
CREATE INDEX IF NOT EXISTS idx_cached_state_lookup ON cached_state(project_hash, key);
CREATE INDEX IF NOT EXISTS idx_cached_state_project_dir ON cached_state(project_directory);

-- Create key_value_store table
CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);

-- Create index for key_value_store table
CREATE INDEX IF NOT EXISTS idx_key_value_store_key ON key_value_store(key);

-- Create background_jobs table
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'created' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker', 'preparing_input', 'generating_stream', 'processing_stream', 'completed_by_tag')),
  start_time INTEGER,
  end_time INTEGER,
  -- output_file_path column has been removed, all content is now stored in response field
  status_message TEXT,
  tokens_received INTEGER DEFAULT 0,
  tokens_sent INTEGER DEFAULT 0,
  chars_received INTEGER DEFAULT 0,
  last_update INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  cleared INTEGER DEFAULT 0 CHECK(cleared IN (0, 1)),
  api_type TEXT DEFAULT 'gemini' NOT NULL,
  task_type TEXT DEFAULT 'xml_generation' NOT NULL,
  model_used TEXT,
  max_output_tokens INTEGER,
  response TEXT,
  error_message TEXT,
  metadata TEXT,
  project_directory TEXT,
  visible BOOLEAN DEFAULT 1,
  temperature REAL,
  include_syntax INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for background_jobs table
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_cleared ON background_jobs(cleared);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_cleared ON background_jobs(status, cleared);
CREATE INDEX IF NOT EXISTS idx_background_jobs_api_type ON background_jobs(api_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type);
-- index on output_file_path has been removed
CREATE INDEX IF NOT EXISTS idx_background_jobs_project_directory ON background_jobs(project_directory);

-- Create task_settings table
CREATE TABLE IF NOT EXISTS task_settings (
  session_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  model TEXT NOT NULL,
  max_tokens INTEGER NOT NULL,
  temperature REAL,
  PRIMARY KEY (session_id, task_type),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Record this consolidated schema in the meta table
INSERT OR REPLACE INTO meta (key, value)
VALUES ('schema_version', '2025-05-17');