-- Add output_log column to terminal_sessions table to store terminal output directly in the database
-- This eliminates the need for separate log files and provides better data consistency

ALTER TABLE terminal_sessions ADD COLUMN output_log TEXT DEFAULT '';

-- Create an index for faster lookups when we need to read terminal logs
CREATE INDEX idx_terminal_sessions_output_log_length ON terminal_sessions(LENGTH(output_log));

-- Update the updated_at trigger to handle the new column
DROP TRIGGER IF EXISTS update_terminal_sessions_updated_at;

CREATE TRIGGER update_terminal_sessions_updated_at
  AFTER UPDATE ON terminal_sessions
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE terminal_sessions SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;