-- Migration to remove output_format and custom_format columns

PRAGMA foreign_keys=off; -- Disable foreign key constraints temporarily

BEGIN TRANSACTION; -- Start transaction
-- Step 1: Create new tables without the removed columns and correct primary keys

-- Create a new sessions table without output_format and custom_format
CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT,
  task_description TEXT DEFAULT '',
  search_term TEXT DEFAULT '',
  pasted_paths TEXT DEFAULT '',
  pattern_description TEXT DEFAULT '',
  title_regex TEXT DEFAULT '',
  content_regex TEXT DEFAULT '',
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
  codebase_structure TEXT DEFAULT '',
  updated_at INTEGER,
  gemini_status TEXT DEFAULT 'idle',
  gemini_start_time INTEGER,
  gemini_end_time INTEGER,
  gemini_patch_path TEXT,
  gemini_status_message TEXT,
  gemini_tokens_received INTEGER DEFAULT 0,
  gemini_chars_received INTEGER DEFAULT 0,
  gemini_last_update INTEGER
);

-- Create a new project_settings table without output_format and with correct primary key
CREATE TABLE project_settings_new (
  project_hash TEXT PRIMARY KEY,
  active_session_id TEXT,
  updated_at INTEGER,
  FOREIGN KEY (active_session_id) REFERENCES sessions_new(id) ON DELETE SET NULL -- Reference the NEW sessions table
); -- Close table definition

-- Step 2: Copy data from old tables to new tables

INSERT INTO sessions_new (id, name, project_directory, project_hash, task_description, search_term, pasted_paths, pattern_description, title_regex, content_regex, is_regex_active, codebase_structure, updated_at, gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, gemini_tokens_received, gemini_chars_received, gemini_last_update) SELECT id, name, project_directory, project_hash, task_description, search_term, pasted_paths, pattern_description, title_regex, content_regex, is_regex_active, codebase_structure, updated_at, gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, gemini_tokens_received, gemini_chars_received, gemini_last_update FROM sessions;
INSERT INTO project_settings_new (project_hash, active_session_id, updated_at) SELECT project_hash, active_session_id, MAX(updated_at) FROM project_settings GROUP BY project_hash; -- Use MAX(updated_at) to pick the latest if duplicates existed

-- Step 3: Drop the old tables
DROP TABLE sessions;

-- Step 4: Rename the new tables to the original names
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE project_settings_new RENAME TO project_settings;

COMMIT; -- Commit transaction
PRAGMA foreign_keys=on; -- Re-enable foreign key constraints
