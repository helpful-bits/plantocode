-- Fix for 0008_rename_patch_path.sql
-- This migration safely handles the renaming of patch_path to xml_path columns
-- without directly modifying sqlite_master

PRAGMA foreign_keys=off;

-- Sessions table changes
-- 1. Check if gemini_patch_path exists
CREATE TEMP TABLE IF NOT EXISTS sessions_columns AS 
SELECT name FROM pragma_table_info('sessions');

-- 2. Add gemini_xml_path if it doesn't exist and either gemini_patch_path exists or we need it
ALTER TABLE sessions ADD COLUMN gemini_xml_path TEXT;

-- 3. Update data (copy from gemini_patch_path to gemini_xml_path if both exist)
UPDATE sessions 
SET gemini_xml_path = REPLACE(gemini_patch_path, '.patch', '.xml')
WHERE gemini_patch_path IS NOT NULL 
  AND gemini_patch_path LIKE '%.patch';

-- Gemini requests table changes
-- 1. Check if the table exists
CREATE TABLE IF NOT EXISTS gemini_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'idle' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing')),
  start_time INTEGER,
  end_time INTEGER,
  patch_path TEXT,
  xml_path TEXT,
  status_message TEXT,
  tokens_received INTEGER DEFAULT 0,
  chars_received INTEGER DEFAULT 0,
  last_update INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 2. Check if xml_path column exists and populate it
UPDATE gemini_requests
SET xml_path = REPLACE(patch_path, '.patch', '.xml')
WHERE patch_path IS NOT NULL 
  AND patch_path LIKE '%.patch'
  AND xml_path IS NULL;

-- Create indexes if needed
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash_format ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_gemini_requests_session_id ON gemini_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_gemini_requests_status ON gemini_requests(status);

-- Clean up temp tables
DROP TABLE IF EXISTS sessions_columns;

PRAGMA foreign_keys=on; 