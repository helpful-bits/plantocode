BEGIN TRANSACTION;

CREATE TABLE terminal_sessions_new (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'initializing' CHECK(status IN ('initializing','starting','running','completed','failed','agent_requires_attention','idle','stuck')),
  process_pid INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_output_at INTEGER DEFAULT NULL,
  exit_code INTEGER DEFAULT NULL,
  working_directory TEXT DEFAULT NULL,
  environment_vars TEXT DEFAULT NULL,
  title TEXT DEFAULT NULL,
  output_log TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
);

INSERT INTO terminal_sessions_new (
  id, job_id, status, process_pid, created_at, updated_at,
  last_output_at, exit_code, working_directory, environment_vars, title, output_log
)
SELECT
  id,
  job_id,
  CASE
    WHEN status = 'idle' THEN 'initializing'
    WHEN status = 'stuck' THEN 'failed'
    ELSE status
  END as status,
  process_pid,
  created_at,
  updated_at,
  last_output_at,
  exit_code,
  working_directory,
  environment_vars,
  title,
  COALESCE(output_log, '') as output_log
FROM terminal_sessions;

DROP TABLE terminal_sessions;

ALTER TABLE terminal_sessions_new RENAME TO terminal_sessions;

CREATE INDEX idx_terminal_sessions_job_id ON terminal_sessions(job_id);
CREATE INDEX idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX idx_terminal_sessions_updated_at ON terminal_sessions(updated_at);
CREATE INDEX idx_terminal_sessions_last_output_at ON terminal_sessions(last_output_at);
CREATE INDEX idx_terminal_sessions_output_log_length ON terminal_sessions(LENGTH(output_log));

CREATE TRIGGER update_terminal_sessions_updated_at
  AFTER UPDATE ON terminal_sessions
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE terminal_sessions SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

COMMIT;