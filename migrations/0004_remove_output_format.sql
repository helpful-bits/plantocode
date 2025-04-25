-- Migration to remove output_format and custom_format columns

PRAGMA foreign_keys=off; -- Disable foreign key constraints temporarily

-- Step 1: Create new tables without the removed columns and correct primary keys

-- Create a new sessions table without output_format and custom_format
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

-- Drop old project_settings_new table if it exists (from a previous failed migration)
DROP TABLE IF EXISTS project_settings_new;

-- Create a new project_settings table without output_format and with correct primary key
CREATE TABLE project_settings_new (
  project_hash TEXT PRIMARY KEY,
  active_session_id TEXT,
  updated_at INTEGER,
  FOREIGN KEY (active_session_id) REFERENCES sessions_new(id) ON DELETE SET NULL -- Reference the NEW sessions table
); -- Close table definition

-- Step 2: Copy data from old tables to new tables, but only if source tables exist

-- Check if the sessions table exists first
INSERT INTO sessions_new (id, name, project_directory, project_hash, task_description, search_term, pasted_paths, title_regex, content_regex, is_regex_active, codebase_structure, updated_at, gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, gemini_tokens_received, gemini_chars_received, gemini_last_update)
SELECT id, name, project_directory, project_hash, task_description, search_term, pasted_paths, title_regex, content_regex, is_regex_active, codebase_structure, updated_at, gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, gemini_tokens_received, gemini_chars_received, gemini_last_update 
FROM sessions
WHERE EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions');

-- Check if the project_settings table exists first
INSERT INTO project_settings_new (project_hash, active_session_id, updated_at) 
SELECT project_hash, active_session_id, MAX(updated_at) 
FROM project_settings
WHERE EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_settings')
GROUP BY project_hash;

-- Step 3: Drop the old tables if they exist
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS project_settings;

-- Step 4: Rename the new tables to the original names (only if new tables exist)
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE project_settings_new RENAME TO project_settings;

PRAGMA foreign_keys=on; -- Re-enable foreign key constraints
