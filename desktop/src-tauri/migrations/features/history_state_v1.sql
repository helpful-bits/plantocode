-- Desktop-only migration for HistoryState metadata
-- Desktop is authoritative; server stores nothing

-- Add current index tracking to sessions
ALTER TABLE sessions ADD COLUMN task_history_current_index INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN file_history_current_index INTEGER DEFAULT 0;

-- Add metadata columns to task_description_history
ALTER TABLE task_description_history ADD COLUMN device_id TEXT;
ALTER TABLE task_description_history ADD COLUMN sequence_number INTEGER DEFAULT 0;
ALTER TABLE task_description_history ADD COLUMN version INTEGER DEFAULT 1;

-- Add metadata columns to file_selection_history
ALTER TABLE file_selection_history ADD COLUMN device_id TEXT;
ALTER TABLE file_selection_history ADD COLUMN sequence_number INTEGER DEFAULT 0;
ALTER TABLE file_selection_history ADD COLUMN version INTEGER DEFAULT 1;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_tdh_session_created_at ON task_description_history (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tdh_session_seq ON task_description_history (session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_fsh_session_created_at ON file_selection_history (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fsh_session_seq ON file_selection_history (session_id, sequence_number);
