BEGIN TRANSACTION;

-- Recreate table with correct shape (TEXT id, full column set, expanded statuses)
CREATE TABLE IF NOT EXISTS terminal_sessions_new (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN (
    'initializing','starting','running','completed','failed',
    'agent_requires_attention','idle','stuck','recovering','disconnected'
  )),
  process_pid INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_output_at INTEGER DEFAULT NULL,
  exit_code INTEGER DEFAULT NULL,
  working_directory TEXT DEFAULT NULL,
  environment_vars TEXT DEFAULT NULL,
  title TEXT DEFAULT NULL,
  output_log TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
);

-- Migrate data from old table when present
INSERT INTO terminal_sessions_new (
  id, job_id, status, process_pid, created_at, updated_at, last_output_at,
  exit_code, working_directory, environment_vars, title, output_log
)
SELECT
  COALESCE(CAST(id AS TEXT), 'session_' || lower(hex(randomblob(8)))),
  job_id,
  CASE
    WHEN status IN ('initializing','starting','running','completed','failed',
                    'agent_requires_attention','idle','stuck','recovering','disconnected')
      THEN status
    ELSE 'initializing'
  END,
  process_pid,
  CASE WHEN typeof(created_at) = 'integer' THEN created_at ELSE strftime('%s','now') END,
  CASE WHEN typeof(updated_at) = 'integer' THEN updated_at ELSE strftime('%s','now') END,
  CASE WHEN typeof(last_output_at) = 'integer' THEN last_output_at ELSE NULL END,
  exit_code,
  working_directory,
  environment_vars,
  title,
  COALESCE(output_log, '')
FROM terminal_sessions;

-- Swap tables
DROP TABLE terminal_sessions;
ALTER TABLE terminal_sessions_new RENAME TO terminal_sessions;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_job_id ON terminal_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_updated_at ON terminal_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_last_output_at ON terminal_sessions(last_output_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_output_log_len ON terminal_sessions((LENGTH(output_log)));

-- Trigger to keep updated_at fresh on update
DROP TRIGGER IF EXISTS trg_terminal_sessions_updated_at;
CREATE TRIGGER trg_terminal_sessions_updated_at
AFTER UPDATE ON terminal_sessions
FOR EACH ROW
BEGIN
  UPDATE terminal_sessions SET updated_at = strftime('%s','now') WHERE id = NEW.id;
END;

COMMIT;