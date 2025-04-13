-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  task_description TEXT DEFAULT '',
  search_term TEXT DEFAULT '',
  pasted_paths TEXT DEFAULT '',
  pattern_description TEXT DEFAULT '',
  title_regex TEXT DEFAULT '',
  content_regex TEXT DEFAULT '',
  is_regex_active INTEGER DEFAULT 1,
  codebase_structure TEXT DEFAULT '',
  output_format TEXT NOT NULL,
  custom_format TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create included_files table
CREATE TABLE IF NOT EXISTS included_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, file_path)
);

-- Create excluded_files table
CREATE TABLE IF NOT EXISTS excluded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, file_path)
);

-- Create project_settings table
CREATE TABLE IF NOT EXISTS project_settings (
  project_hash TEXT NOT NULL,
  output_format TEXT NOT NULL,
  active_session_id TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (project_hash, output_format),
  FOREIGN KEY (active_session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- Create cached_state_items table
CREATE TABLE IF NOT EXISTS cached_state_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_hash TEXT NOT NULL,
  output_format TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project_hash, output_format, key)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_project_format ON sessions(project_directory, output_format);
CREATE INDEX IF NOT EXISTS idx_included_files_session_id ON included_files(session_id);
CREATE INDEX IF NOT EXISTS idx_excluded_files_session_id ON excluded_files(session_id);
CREATE INDEX IF NOT EXISTS idx_cached_state_items_project_format ON cached_state_items(project_hash, output_format); 