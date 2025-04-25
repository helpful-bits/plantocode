-- Migration to remove session-level Gemini status fields that are now tracked per request
-- These fields were previously used to track Gemini status at the session level
-- Now we use the gemini_requests table for more granular status tracking

PRAGMA foreign_keys=off;

-- Drop columns from sessions table
-- SQLite doesn't support DROP COLUMN directly so we need to recreate the table

-- Create a new temp table with the desired structure (without the gemini_* columns)
CREATE TABLE new_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT,
  task_description TEXT DEFAULT '',
  search_term TEXT DEFAULT '',
  pasted_paths TEXT DEFAULT '',
  title_regex TEXT DEFAULT '',
  content_regex TEXT DEFAULT '',
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
  codebase_structure TEXT DEFAULT '',
  updated_at INTEGER,
  model_used TEXT DEFAULT 'gemini-2.5-flash-preview-04-17',
  diff_temperature REAL DEFAULT 0.9
);

-- Copy data from the old table to the new one (excluding the removed columns)
INSERT INTO new_sessions(id, name, project_directory, project_hash, task_description, 
                        search_term, pasted_paths, title_regex, content_regex, 
                        is_regex_active, codebase_structure, updated_at, model_used, diff_temperature)
SELECT id, name, project_directory, project_hash, task_description, 
       search_term, pasted_paths, title_regex, content_regex, 
       is_regex_active, codebase_structure, updated_at, model_used, diff_temperature
FROM sessions;

-- Drop the old table
DROP TABLE sessions;

-- Rename the new table to the original name
ALTER TABLE new_sessions RENAME TO sessions;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash_format ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_model_used ON sessions(model_used);

PRAGMA foreign_keys=on; 