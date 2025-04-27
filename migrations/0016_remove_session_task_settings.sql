-- Migration to remove task_settings column from sessions table
-- Now that settings will be stored globally per project using the cached_state table

PRAGMA foreign_keys=off;

-- Create a new sessions table without the task_settings column
CREATE TABLE new_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT,
  project_hash TEXT, -- Hash of project_directory for faster lookups
  task_description TEXT,
  search_term TEXT,
  pasted_paths TEXT,
  title_regex TEXT,
  content_regex TEXT,
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
  diff_temperature REAL DEFAULT 0.9,
  codebase_structure TEXT,
  updated_at INTEGER NOT NULL
);

-- Copy data from the old table to the new one, excluding task_settings
INSERT INTO new_sessions (
  id, name, project_directory, project_hash, 
  task_description, search_term, pasted_paths,
  title_regex, content_regex, is_regex_active,
  diff_temperature, codebase_structure, updated_at
)
SELECT 
  id, name, project_directory, project_hash,
  task_description, search_term, pasted_paths,
  title_regex, content_regex, is_regex_active,
  diff_temperature, codebase_structure, updated_at
FROM sessions;

-- Drop the old table
DROP TABLE sessions;

-- Rename the new table to the original name
ALTER TABLE new_sessions RENAME TO sessions;

-- Recreate indexes
CREATE INDEX idx_sessions_project_hash ON sessions(project_hash);
CREATE INDEX idx_sessions_project_directory ON sessions(project_directory);
CREATE INDEX idx_sessions_updated_at ON sessions(updated_at);

PRAGMA foreign_keys=on; 