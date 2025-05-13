-- Consolidated SQL Migrations
-- This file combines all migrations from 0000 to 0021 into a single SQL file
-- Original migration files are preserved in the migrations_backup directory
-- Note: This consolidated migration standardizes on using 'path' column in included_files and excluded_files
-- tables, replacing the older inconsistent use of both 'path' and 'file_path' columns.
-- Note 2: This update removes the active_sessions table which is replaced by key_value_store

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
  project_hash TEXT, -- Hash of project_directory for faster lookups
  task_description TEXT DEFAULT '',
  search_term TEXT DEFAULT '',
  title_regex TEXT DEFAULT '',
  content_regex TEXT DEFAULT '',
  negative_title_regex TEXT DEFAULT '',
  negative_content_regex TEXT DEFAULT '',
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
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
  status TEXT DEFAULT 'created' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker')),
  start_time INTEGER,
  end_time INTEGER,
  output_file_path TEXT,
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
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for background_jobs table
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_cleared ON background_jobs(cleared);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_cleared ON background_jobs(status, cleared);
CREATE INDEX IF NOT EXISTS idx_background_jobs_api_type ON background_jobs(api_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_output_file_path ON background_jobs(output_file_path);

-- Add project_directory column to background_jobs table if it doesn't exist
ALTER TABLE background_jobs ADD COLUMN project_directory TEXT;

-- Create index for project_directory if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_background_jobs_project_directory ON background_jobs(project_directory);

-- Record that this consolidated migration was applied
INSERT INTO migrations (name, applied_at) 
VALUES ('consolidated_migrations.sql', strftime('%s', 'now'));

-- Record this consolidated migration in the meta table
INSERT OR REPLACE INTO meta (key, value)
VALUES ('consolidated_migration', datetime('now'));

-- Add the tokens_sent column migration record
INSERT INTO migrations (name, applied_at) 
VALUES ('add_tokens_sent_column', strftime('%s', 'now'));

-- Add the updated_at column migration record
INSERT INTO migrations (name, applied_at) 
VALUES ('add_updated_at_column', strftime('%s', 'now'));

-- Add the search_selected_files_only column migration record
INSERT INTO migrations (name, applied_at) 
VALUES ('add_search_selected_files_only_column', strftime('%s', 'now'));

-- Update cached_state table key if it exists
UPDATE cached_state
SET key = 'output-file-editor-command'
WHERE key = 'xml-editor-command';

-- Add the rename_xml_path_to_output_file_path migration record
INSERT INTO migrations (name, applied_at) 
VALUES ('rename_xml_path_to_output_file_path', strftime('%s', 'now'));

-- Add the add_project_directory_to_background_jobs migration record
INSERT INTO migrations (name, applied_at) 
VALUES ('add_project_directory_to_background_jobs', strftime('%s', 'now'));

-- Add the create_key_value_store migration record
INSERT INTO migrations (name, applied_at) 
VALUES ('create_key_value_store', strftime('%s', 'now'));