-- Add terminal sessions table and indexes
-- This migration adds support for terminal session tracking

-- Create terminal_sessions table to track Claude CLI terminal sessions
CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE, -- Links to implementation plan or background job
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'completed', 'failed', 'stuck')),
  process_pid INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_output_at INTEGER DEFAULT NULL,
  exit_code INTEGER DEFAULT NULL,
  working_directory TEXT DEFAULT NULL,
  environment_vars TEXT DEFAULT NULL, -- JSON string of environment variables
  title TEXT DEFAULT NULL,
  
  -- Foreign key constraint (optional - depends on whether job_id always references background_jobs)
  FOREIGN KEY (job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
);

-- Create indexes for terminal_sessions table
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_job_id ON terminal_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_updated_at ON terminal_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_last_output_at ON terminal_sessions(last_output_at);

-- Mark migration as applied
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('terminal_sessions_migration_applied', strftime('%s', 'now'), strftime('%s', 'now'));