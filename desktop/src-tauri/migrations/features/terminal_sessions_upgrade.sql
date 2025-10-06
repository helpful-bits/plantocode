-- Upgrade terminal_sessions table to support session persistence and enhanced status tracking
-- This migration adds new columns for existing terminal_sessions tables

-- Add session_id column if it doesn't exist
ALTER TABLE terminal_sessions ADD COLUMN session_id TEXT;

-- Add timestamp columns for better lifecycle tracking
ALTER TABLE terminal_sessions ADD COLUMN started_at INTEGER DEFAULT NULL;
ALTER TABLE terminal_sessions ADD COLUMN ended_at INTEGER DEFAULT NULL;

-- Add output_snapshot for capturing terminal state
ALTER TABLE terminal_sessions ADD COLUMN output_snapshot TEXT DEFAULT NULL;

-- Backfill session_id for existing rows that don't have it
-- Generate a unique UUID-like identifier for each existing row
UPDATE terminal_sessions
SET session_id = lower(hex(randomblob(16)))
WHERE session_id IS NULL;

-- Create unique index on session_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_sessions_session_id_unique ON terminal_sessions(session_id);

-- Drop and recreate the trigger to ensure it exists
DROP TRIGGER IF EXISTS trg_terminal_sessions_updated_at;
CREATE TRIGGER trg_terminal_sessions_updated_at
AFTER UPDATE ON terminal_sessions
BEGIN
  UPDATE terminal_sessions
  SET updated_at = strftime('%s','now')
  WHERE id = NEW.id;
END;