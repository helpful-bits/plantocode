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

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT NOT NULL, -- Hash of project_directory for faster lookups
  task_description TEXT DEFAULT NULL,
  search_term TEXT DEFAULT NULL,
  title_regex TEXT DEFAULT NULL,
  content_regex TEXT DEFAULT NULL,
  negative_title_regex TEXT DEFAULT NULL,
  negative_content_regex TEXT DEFAULT NULL,
  title_regex_description TEXT DEFAULT NULL,
  content_regex_description TEXT DEFAULT NULL,
  negative_title_regex_description TEXT DEFAULT NULL,
  negative_content_regex_description TEXT DEFAULT NULL,
  regex_summary_explanation TEXT DEFAULT NULL,
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
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

-- Create system_prompts table to store custom system prompts
-- Note: For existing databases, this requires manual migration to add id column
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  is_default INTEGER DEFAULT 0 CHECK(is_default IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(session_id, task_type),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create index for system_prompts table
CREATE INDEX IF NOT EXISTS idx_system_prompts_session_task ON system_prompts(session_id, task_type);
CREATE INDEX IF NOT EXISTS idx_system_prompts_task_type ON system_prompts(task_type);

-- Note: Default system prompts are stored ONLY on the server (PostgreSQL)
-- Desktop SQLite database contains ONLY user-defined custom system prompts
-- Default prompts are fetched from server and cached in memory with 5-minute TTL

-- Insert default 2025 model configurations
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES 
('default_llm_model_2025', 'anthropic/claude-sonnet-4', strftime('%s', 'now')),
('default_reasoning_model_2025', 'deepseek/deepseek-r1', strftime('%s', 'now')),
('default_fast_model_2025', 'google/gemini-2.5-flash-preview-05-20', strftime('%s', 'now')),
('default_transcription_model_2025', 'whisper-large-v3', strftime('%s', 'now')),
('model_update_version', '2025.1', strftime('%s', 'now')),
('available_claude_models_2025', '["anthropic/claude-sonnet-4", "claude-opus-4-20250522", "claude-3-7-sonnet-20250219"]', strftime('%s', 'now')),
('available_gemini_models_2025', '["google/gemini-2.5-flash-preview-05-20", "google/gemini-2.5-flash-preview-05-20:thinking", "google/gemini-2.5-pro-preview"]', strftime('%s', 'now')),
('available_reasoning_models_2025', '["deepseek/deepseek-r1", "deepseek/deepseek-r1-distill-qwen-32b", "deepseek/deepseek-r1-distill-qwen-14b"]', strftime('%s', 'now'));


-- Store application-wide configurations, especially those managed dynamically
CREATE TABLE IF NOT EXISTS application_configurations (
config_key TEXT PRIMARY KEY,    -- e.g., 'ai_settings_default_llm_model_id', 'ai_settings_available_models'
config_value TEXT NOT NULL,     -- Store complex configurations as JSON text
description TEXT,               -- Optional description of the configuration
updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_configurations_config_key ON application_configurations(config_key);

-- Insert comprehensive AI task configurations into application_configurations
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_task_specific_configs', '{
  "implementation_plan": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 65536, "temperature": 0.7},
  "path_finder": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 8192, "temperature": 0.3},
  "text_improvement": {"model": "anthropic/claude-sonnet-4", "max_tokens": 4096, "temperature": 0.7},
  "voice_transcription": {"model": "groq/whisper-large-v3-turbo", "max_tokens": 4096, "temperature": 0.0},
  "text_correction": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "path_correction": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 4096, "temperature": 0.3},
  "regex_pattern_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 1000, "temperature": 0.2},
  "regex_summary_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.3},
  "guidance_generation": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.7},
  "task_enhancement": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7},
  "file_finder_workflow": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 2048, "temperature": 0.3},
  "generic_llm_stream": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 16384, "temperature": 0.7},
  "streaming": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 16384, "temperature": 0.7},
  "local_file_filtering": {},
  "extended_path_finder": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 8192, "temperature": 0.3},
  "extended_path_correction": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 4096, "temperature": 0.3},
  "file_relevance_assessment": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 24000, "temperature": 0.3},
  "unknown": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7}
}', 'Task-specific model configurations including model, tokens, and temperature for all supported task types'),

('ai_settings_default_llm_model_id', '"google/gemini-2.5-pro-preview"', 'Default LLM model for new installations'),
('ai_settings_default_voice_model_id', '"anthropic/claude-sonnet-4"', 'Default voice processing model'),
('ai_settings_default_transcription_model_id', '"groq/whisper-large-v3-turbo"', 'Default transcription model'),
('ai_settings_path_finder_settings', '{
  "max_files_with_content": 10,
  "include_file_contents": true,
  "max_content_size_per_file": 5000,
  "max_file_count": 50,
  "file_content_truncation_chars": 2000,
  "content_limit_buffer": 1000
}', 'Settings for the PathFinder agent functionality'),
('ai_settings_available_models', '[]', 'List of available AI models with their properties - will be populated from server at startup')

ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = strftime('%s', 'now');

-- User credits balance tracking (local cache from server)
CREATE TABLE IF NOT EXISTS user_credits (
    user_id TEXT PRIMARY KEY,
    balance TEXT NOT NULL DEFAULT '0.0000', -- Store as TEXT for precise decimal handling
    currency TEXT NOT NULL DEFAULT 'USD',
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
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_charge ON credit_transactions(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(created_at DESC);

-- Record this consolidated schema in the key_value_store table
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('schema_version', '2025-05-29-enhanced-system-prompts-with-credits', strftime('%s', 'now')),
       ('last_model_update', strftime('%s', 'now'), strftime('%s', 'now')),
       ('initial_setup_with_2025_models', 'true', strftime('%s', 'now')),
       ('enhanced_system_prompts_migration_applied', strftime('%s', 'now'), strftime('%s', 'now'));