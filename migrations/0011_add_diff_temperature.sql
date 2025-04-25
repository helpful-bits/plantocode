-- Migration to add diff_temperature column to sessions table

PRAGMA foreign_keys=off; -- Disable foreign key constraints temporarily

-- Step 1: Create a new sessions table with the diff_temperature column
CREATE TABLE IF NOT EXISTS sessions_new (
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
  diff_temperature REAL DEFAULT 0.9,
  codebase_structure TEXT DEFAULT '',
  updated_at INTEGER,
  gemini_status TEXT DEFAULT 'idle',
  gemini_start_time INTEGER,
  gemini_end_time INTEGER,
  gemini_xml_path TEXT,
  gemini_patch_path TEXT,
  gemini_status_message TEXT,
  gemini_tokens_received INTEGER DEFAULT 0,
  gemini_chars_received INTEGER DEFAULT 0,
  gemini_last_update INTEGER
);

-- Step 2: Copy data from the old table to the new table
INSERT INTO sessions_new (
  id, name, project_directory, project_hash, task_description, 
  search_term, pasted_paths, title_regex, content_regex, 
  is_regex_active, codebase_structure, updated_at, gemini_status, 
  gemini_start_time, gemini_end_time, gemini_xml_path, gemini_patch_path, 
  gemini_status_message, gemini_tokens_received, gemini_chars_received, 
  gemini_last_update
)
SELECT 
  id, name, project_directory, project_hash, task_description, 
  search_term, pasted_paths, title_regex, content_regex, 
  is_regex_active, codebase_structure, updated_at, gemini_status, 
  gemini_start_time, gemini_end_time, gemini_xml_path, gemini_patch_path, 
  gemini_status_message, gemini_tokens_received, gemini_chars_received, 
  gemini_last_update
FROM sessions;

-- Step 3: Drop the old table
DROP TABLE sessions;

-- Step 4: Rename the new table to the original name
ALTER TABLE sessions_new RENAME TO sessions;

-- Step 5: Recreate the indexes that might have been lost
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash);

PRAGMA foreign_keys=on; -- Re-enable foreign key constraints 