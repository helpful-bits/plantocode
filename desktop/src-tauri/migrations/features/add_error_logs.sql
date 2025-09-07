-- Add error logging table and indexes
-- This migration adds support for error logging and diagnostics

-- Create error_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  level TEXT NOT NULL DEFAULT 'ERROR' CHECK (level IN ('ERROR','WARN','INFO','DEBUG')),
  error_type TEXT,
  message TEXT NOT NULL,
  context TEXT,
  stack TEXT,
  metadata TEXT,
  app_version TEXT,
  platform TEXT
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);

-- Migration tracking is handled automatically by the migration system
-- No need to manually insert into key_value_store