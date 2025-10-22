-- Consolidated SQL Schema for PlanToCode
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


-- =========================================================================
-- Core Tables
-- =========================================================================

-- Create sessions table (stores user context and preferences, NOT workflow artifacts)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT NOT NULL, -- Hash of project_directory for faster lookups
  task_description TEXT DEFAULT NULL,
  search_term TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  model_used TEXT DEFAULT NULL,
  search_selected_files_only INTEGER DEFAULT 0 CHECK(search_selected_files_only IN (0, 1)),
  included_files TEXT,
  force_excluded_files TEXT,
  video_analysis_prompt TEXT DEFAULT NULL,
  merge_instructions TEXT DEFAULT NULL
);

-- Create indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_project_directory ON sessions(project_directory);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_model_used ON sessions(model_used);


-- Create task_description_history table
CREATE TABLE IF NOT EXISTS task_description_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create index for task_description_history table
CREATE INDEX IF NOT EXISTS idx_task_description_history_session_id_created_at ON task_description_history(session_id, created_at DESC);

-- Create file_selection_history table
CREATE TABLE IF NOT EXISTS file_selection_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    included_files TEXT NOT NULL,
    force_excluded_files TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create index for file_selection_history table
CREATE INDEX IF NOT EXISTS idx_file_selection_history_session_id_created_at ON file_selection_history(session_id, created_at DESC);


-- Create key_value_store table
CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);

-- Create index for key_value_store table
CREATE INDEX IF NOT EXISTS idx_key_value_store_key ON key_value_store(key);

-- Create app_settings table for application configuration
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create index for app_settings table
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- =========================================================================
-- Transcription Configuration
-- =========================================================================
-- Note: Transcription configurations are fetched from server and cached in memory
-- User preferences are stored in key_value_store as simple JSON

-- Create background_jobs table
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_type TEXT DEFAULT 'unknown' NOT NULL,
  status TEXT DEFAULT 'created' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker', 'preparing_input', 'generating_stream', 'processing_stream', 'completed_by_tag')),
  prompt TEXT NOT NULL,
  response TEXT,
  error_message TEXT,
  tokens_sent INTEGER DEFAULT 0,
  tokens_received INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  model_used TEXT,
  actual_cost REAL,
  metadata TEXT,
  system_prompt_template TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  start_time INTEGER,
  end_time INTEGER,
  is_finalized INTEGER DEFAULT 0,
  server_request_id TEXT DEFAULT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for background_jobs table
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_request_id ON background_jobs(server_request_id) WHERE server_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_background_jobs_finalized ON background_jobs(is_finalized) WHERE is_finalized = 0;

-- Task settings table removed in favor of server-side configuration
-- All AI task configuration will be fetched exclusively from the server

-- Create project_system_prompts table for project-specific system prompt overrides
CREATE TABLE IF NOT EXISTS project_system_prompts (
  project_hash TEXT NOT NULL,
  task_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  is_custom INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (project_hash, task_type)
);

-- Create indexes for project_system_prompts table
CREATE INDEX IF NOT EXISTS idx_project_system_prompts_project_hash ON project_system_prompts(project_hash);
CREATE INDEX IF NOT EXISTS idx_project_system_prompts_task_type ON project_system_prompts(task_type);
CREATE INDEX IF NOT EXISTS idx_project_system_prompts_is_custom ON project_system_prompts(is_custom);

-- Model configurations are fetched from server - no local storage needed

-- AI configurations come from server only
-- Model configurations are fetched from server - no local storage needed
-- Desktop only stores user-specific local preferences in key_value_store if needed

-- =====================================================================
-- Error Logging
-- =====================================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  level TEXT NOT NULL DEFAULT 'ERROR' CHECK (level IN ('ERROR','WARN','INFO','DEBUG')),
  error_type TEXT,
  message TEXT NOT NULL,
  context TEXT,
  stack TEXT,
  metadata TEXT,           -- JSON string
  app_version TEXT,
  platform TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);

-- Add additional indexes for error logs
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type) 
WHERE error_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_version_level 
ON error_logs(app_version, level) 
WHERE app_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_platform 
ON error_logs(platform, error_type) 
WHERE platform IS NOT NULL;

-- =====================================================================
-- Additional Performance Indexes
-- =====================================================================
-- Sessions table performance indexes
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name);

-- Background jobs performance indexes
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_updated_at ON background_jobs(updated_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_composite 
ON background_jobs(session_id, status, task_type)
WHERE is_finalized = 0;

-- Key-value store performance index
CREATE INDEX IF NOT EXISTS idx_key_value_store_updated_at ON key_value_store(updated_at);

-- Task description history composite index (duplicate removed, already exists on line 66)
-- File selection history composite index (duplicate removed, already exists on line 79)

-- Project system prompts composite index
CREATE INDEX IF NOT EXISTS idx_project_system_prompts_composite 
ON project_system_prompts(project_hash, task_type, updated_at);

-- =====================================================================
-- Workflow-specific Indexes
-- =====================================================================
-- Background jobs workflow-specific indexes
CREATE INDEX IF NOT EXISTS idx_background_jobs_workflow_id 
ON background_jobs(metadata) 
WHERE json_extract(metadata, '$.workflowId') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_background_jobs_stage_name 
ON background_jobs(metadata) 
WHERE json_extract(metadata, '$.stageName') IS NOT NULL;

-- Composite index for workflow stage queries
CREATE INDEX IF NOT EXISTS idx_background_jobs_workflow_stage 
ON background_jobs(task_type, status, json_extract(metadata, '$.workflowId'))
WHERE task_type IN ('file_finder_workflow', 'web_search_workflow', 'video_analysis');

-- Index for server request tracking
CREATE INDEX IF NOT EXISTS idx_background_jobs_server_request 
ON background_jobs(server_request_id, status)
WHERE server_request_id IS NOT NULL;

-- =========================================================================
-- Terminal Sessions Tables
-- =========================================================================

-- Create terminal_sessions table to track Claude CLI terminal sessions
CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  job_id TEXT UNIQUE,  -- Nullable: NULL for standalone terminals, references background_jobs for plan-associated terminals
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'initializing' CHECK (status IN (
    'idle','starting','initializing','running','completed','failed','agent_requires_attention','recovering','disconnected','stuck','restored'
  )),
  process_pid INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  started_at INTEGER DEFAULT NULL,
  ended_at INTEGER DEFAULT NULL,
  last_output_at INTEGER DEFAULT NULL,
  exit_code INTEGER DEFAULT NULL,
  working_directory TEXT DEFAULT NULL,
  environment_vars TEXT DEFAULT NULL,
  title TEXT DEFAULT NULL,
  output_log TEXT NOT NULL DEFAULT '',
  output_snapshot TEXT DEFAULT NULL,
  FOREIGN KEY (job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_job_id ON terminal_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_updated_at ON terminal_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_last_output_at ON terminal_sessions(last_output_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_output_log_length ON terminal_sessions(LENGTH(output_log));
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_session_id ON terminal_sessions(session_id);

DROP TRIGGER IF EXISTS trg_terminal_sessions_updated_at;
CREATE TRIGGER trg_terminal_sessions_updated_at
AFTER UPDATE ON terminal_sessions
BEGIN
  UPDATE terminal_sessions
  SET updated_at = strftime('%s','now')
  WHERE id = NEW.id;
END;

-- Record this consolidated schema in the key_value_store table
-- =========================================================================
-- Insert Default Configuration Data
-- =========================================================================

-- Transcription configurations are fetched from server and cached in memory
-- User preferences stored as JSON in key_value_store by voice_commands.rs

INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('schema_version', '2025-02-05-terminal-sessions-persistence-v2', strftime('%s', 'now')),
       ('last_model_update', strftime('%s', 'now'), strftime('%s', 'now')),
       ('initial_setup_with_2025_models', 'true', strftime('%s', 'now')),
       ('enhanced_system_prompts_migration_applied', strftime('%s', 'now'), strftime('%s', 'now')),
       ('transcription_configuration_migration_applied', strftime('%s', 'now'), strftime('%s', 'now')),
       ('system_prompts_table_removed', strftime('%s', 'now'), strftime('%s', 'now')),
       ('two_phase_billing_migration_applied', strftime('%s', 'now'), strftime('%s', 'now')),
       ('terminal_sessions_migration_applied', strftime('%s', 'now'), strftime('%s', 'now'));

-- Insert default device visibility settings
INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
    ('device.is_discoverable', 'true', 'Whether this device is discoverable by other devices'),
    ('device.allow_remote_access', 'false', 'Whether to allow remote access from mobile devices'),
    ('device.require_approval', 'true', 'Whether to require approval for new connections'),
    ('device.session_timeout_minutes', '60', 'Session timeout in minutes for remote connections');