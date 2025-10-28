-- Add version tracking columns for history state synchronization
-- These columns track the optimistic locking version for task and file history

ALTER TABLE sessions ADD COLUMN task_history_version INTEGER DEFAULT 1;
ALTER TABLE sessions ADD COLUMN file_history_version INTEGER DEFAULT 1;

-- Create indexes for efficient version lookups
CREATE INDEX IF NOT EXISTS idx_sessions_task_history_version ON sessions(task_history_version);
CREATE INDEX IF NOT EXISTS idx_sessions_file_history_version ON sessions(file_history_version);
