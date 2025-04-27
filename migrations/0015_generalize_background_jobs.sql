-- Migration to rename gemini_requests to background_jobs and add support for various API calls
-- This migration generalizes the background job tracking system to support different APIs (Gemini, Claude, Whisper)
-- and different task types (xml_generation, pathfinder, transcription, etc.)

PRAGMA foreign_keys=off;

-- 1. Rename gemini_requests table to background_jobs
CREATE TABLE background_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'idle' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing')),
  start_time INTEGER,
  end_time INTEGER,
  xml_path TEXT,
  status_message TEXT,
  tokens_received INTEGER DEFAULT 0,
  chars_received INTEGER DEFAULT 0,
  last_update INTEGER,
  created_at INTEGER NOT NULL,
  cleared INTEGER DEFAULT 0 CHECK(cleared IN (0, 1)),
  -- New columns for generic background jobs
  api_type TEXT DEFAULT 'gemini' NOT NULL, -- 'gemini', 'claude', 'whisper', etc.
  task_type TEXT DEFAULT 'xml_generation' NOT NULL, -- 'xml_generation', 'pathfinder', 'transcription', etc.
  model_used TEXT, -- The specific model used for this job
  max_output_tokens INTEGER, -- Maximum output tokens requested
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 2. Copy all data from gemini_requests to background_jobs
INSERT INTO background_jobs
(id, session_id, prompt, status, start_time, end_time, xml_path, status_message, 
 tokens_received, chars_received, last_update, created_at, cleared, 
 api_type, task_type, model_used, max_output_tokens)
SELECT 
  id, session_id, prompt, status, start_time, end_time, xml_path, status_message,
  tokens_received, chars_received, last_update, created_at, cleared,
  'gemini', -- Default api_type for existing records
  'xml_generation', -- Default task_type for existing records
  NULL, -- model_used will be NULL for existing records
  NULL -- max_output_tokens will be NULL for existing records
FROM gemini_requests;

-- 3. Drop the old gemini_requests table
DROP TABLE gemini_requests;

-- 4. Create indexes for the new background_jobs table
CREATE INDEX idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX idx_background_jobs_status ON background_jobs(status);
CREATE INDEX idx_background_jobs_cleared ON background_jobs(cleared);
CREATE INDEX idx_background_jobs_status_cleared ON background_jobs(status, cleared);
CREATE INDEX idx_background_jobs_api_type ON background_jobs(api_type);
CREATE INDEX idx_background_jobs_task_type ON background_jobs(task_type);

-- 5. Remove the task_settings column from the sessions table
-- This has been moved to the 0016_remove_session_task_settings.sql migration

PRAGMA foreign_keys=on; 