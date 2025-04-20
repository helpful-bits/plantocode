-- Migration to fix the file_path column issue
-- Error: SQLITE_ERROR: no such column: file_path

PRAGMA foreign_keys=off;

-- Rename the included_files table to a temporary table
CREATE TABLE included_files_temp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, file_path)
);

-- Copy data from the original table to the temporary table, renaming 'path' to 'file_path'
INSERT INTO included_files_temp (id, session_id, file_path)
SELECT id, session_id, path FROM included_files;

-- Drop the original table
DROP TABLE included_files;

-- Rename the temporary table to the original table name
ALTER TABLE included_files_temp RENAME TO included_files;

-- Create index for better performance on lookups
CREATE INDEX IF NOT EXISTS idx_included_files_session ON included_files(session_id);

-- Rename the excluded_files table to a temporary table
CREATE TABLE excluded_files_temp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, file_path)
);

-- Copy data from the original table to the temporary table, renaming 'path' to 'file_path'
INSERT INTO excluded_files_temp (id, session_id, file_path)
SELECT id, session_id, path FROM excluded_files;

-- Drop the original table
DROP TABLE excluded_files;

-- Rename the temporary table to the original table name
ALTER TABLE excluded_files_temp RENAME TO excluded_files;

-- Create index for better performance on lookups
CREATE INDEX IF NOT EXISTS idx_excluded_files_session ON excluded_files(session_id);

PRAGMA foreign_keys=on; 