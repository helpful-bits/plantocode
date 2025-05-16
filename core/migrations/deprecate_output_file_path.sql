-- Migration to mark output_file_path as deprecated
-- All file-related functionality for implementation plans has been removed

-- Add a comment to the output_file_path column to indicate it's deprecated
PRAGMA foreign_keys = OFF;

-- Create a temporary table with the new schema
CREATE TABLE background_jobs_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'created' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker', 'preparing_input', 'generating_stream', 'processing_stream', 'completed_by_tag')),
  start_time INTEGER,
  end_time INTEGER,
  output_file_path TEXT, -- DEPRECATED: All content is now stored in response field
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
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Copy data from the old table to the new table
INSERT INTO background_jobs_new 
SELECT id, session_id, prompt, status, start_time, end_time, output_file_path, 
       status_message, tokens_received, tokens_sent, chars_received, last_update, 
       created_at, updated_at, cleared, api_type, task_type, model_used, 
       max_output_tokens, response, error_message, metadata, project_directory, visible
FROM background_jobs;

-- Drop the old table and rename the new one
DROP TABLE background_jobs;
ALTER TABLE background_jobs_new RENAME TO background_jobs;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);

-- Add an entry to the migrations table
INSERT INTO migrations (name, applied_at) 
VALUES ('deprecate_output_file_path', strftime('%s', 'now'));

PRAGMA foreign_keys = ON;