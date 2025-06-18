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
  model_used TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  start_time INTEGER,
  end_time INTEGER,
  cost DECIMAL(10,6) DEFAULT 0.0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for background_jobs table
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type);

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



-- Model configurations are fetched from server - no local storage needed


-- AI configurations come from server only
-- Model configurations are fetched from server - no local storage needed
-- Desktop only stores user-specific local preferences in key_value_store if needed

-- User credits balance tracking (local cache from server)
CREATE TABLE IF NOT EXISTS user_credits (
    user_id TEXT PRIMARY KEY,
    balance TEXT NOT NULL DEFAULT '0.0000', -- Store as TEXT for precise decimal handling
    currency TEXT NOT NULL DEFAULT 'USD',
    services_blocked INTEGER DEFAULT 0 CHECK(services_blocked IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Credit transaction history (local cache from server)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL, -- 'purchase', 'consumption', 'refund', 'adjustment', 'expiry'
    amount TEXT NOT NULL, -- Store as TEXT for precise decimal handling
    currency TEXT NOT NULL DEFAULT 'USD',
    description TEXT,
    stripe_charge_id TEXT, -- For purchases
    related_api_usage_id TEXT, -- For consumptions
    metadata TEXT, -- JSON string
    balance_after TEXT, -- Balance after this transaction for audit trail
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_charge ON credit_transactions(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(created_at DESC);

-- Record this consolidated schema in the key_value_store table
-- =========================================================================
-- Insert Default Transcription Configuration Data
-- =========================================================================

-- Transcription configurations are fetched from server and cached in memory
-- User preferences stored as JSON in key_value_store by voice_commands.rs

INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('schema_version', '2025-06-11-enhanced-transcription-configuration', strftime('%s', 'now')),
       ('last_model_update', strftime('%s', 'now'), strftime('%s', 'now')),
       ('initial_setup_with_2025_models', 'true', strftime('%s', 'now')),
       ('enhanced_system_prompts_migration_applied', strftime('%s', 'now'), strftime('%s', 'now')),
       ('transcription_configuration_migration_applied', strftime('%s', 'now'), strftime('%s', 'now')),
       ('system_prompts_table_removed', strftime('%s', 'now'), strftime('%s', 'now'));