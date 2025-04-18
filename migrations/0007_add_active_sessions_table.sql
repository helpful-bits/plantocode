-- Migration to add active_sessions table and update cached_state table

-- First, create the active_sessions table
CREATE TABLE IF NOT EXISTS active_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_directory TEXT NOT NULL, -- Original project directory path
  project_hash TEXT NOT NULL UNIQUE, -- Hashed project directory for faster lookups
  session_id TEXT, -- Can be NULL if no session is active
  updated_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- Create an index for faster lookup
CREATE INDEX idx_active_sessions_project_hash ON active_sessions(project_hash);

-- Now, modify the cached_state table to add project_directory column
-- Step 1: Create a new table with the project_directory column
CREATE TABLE cached_state_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_directory TEXT NOT NULL, -- Add project_directory column
  project_hash TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- Store serialized values as text
  updated_at INTEGER,
  UNIQUE(project_hash, key)
);

-- Step 2: Copy data from old table to new table
-- Set project_directory to 'global' as a default value since we don't have the original
INSERT INTO cached_state_new (project_directory, project_hash, key, value, updated_at)
SELECT 'global', project_hash, key, value, updated_at
FROM cached_state;

-- Step 3: Drop the old table and index
DROP TABLE cached_state;
DROP INDEX IF EXISTS idx_cached_state_lookup;

-- Step 4: Rename the new table
ALTER TABLE cached_state_new RENAME TO cached_state;

-- Step 5: Create new indexes
CREATE INDEX idx_cached_state_lookup ON cached_state(project_hash, key);
CREATE INDEX idx_cached_state_project_dir ON cached_state(project_directory); 