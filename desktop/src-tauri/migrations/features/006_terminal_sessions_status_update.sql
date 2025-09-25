-- Expand CHECK constraint to support modern terminal statuses
-- This migration reconstructs the table with expanded status values
BEGIN TRANSACTION;

CREATE TABLE terminal_sessions_new (
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'idle','starting','initializing','running','completed','failed',
    'agent_requires_attention','recovering','disconnected','stuck'
  )),
  output_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_output_at TEXT
);

INSERT INTO terminal_sessions_new (id, job_id, status, output_log, created_at, updated_at, last_output_at)
  SELECT id, job_id,
         CASE
           WHEN status IN ('idle','starting','initializing','running','completed','failed',
                         'agent_requires_attention','recovering','disconnected','stuck')
           THEN status
           ELSE 'idle'
         END,
         COALESCE(output_log, ''),
         created_at, updated_at, last_output_at
    FROM terminal_sessions;

DROP TABLE terminal_sessions;
ALTER TABLE terminal_sessions_new RENAME TO terminal_sessions;

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_job_id ON terminal_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_updated_at ON terminal_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_last_output_at ON terminal_sessions(last_output_at);

COMMIT;