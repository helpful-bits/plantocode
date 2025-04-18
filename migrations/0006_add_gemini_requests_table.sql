-- Create the gemini_requests table to track individual Gemini processing requests
CREATE TABLE gemini_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL, -- Keep session_id
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'idle' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing')), -- Added 'preparing' state
  start_time INTEGER,
  end_time INTEGER,
  patch_path TEXT,
  status_message TEXT,
  tokens_received INTEGER DEFAULT 0,
  chars_received INTEGER DEFAULT 0,
  last_update INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create an index on session_id for faster lookup of requests by session
CREATE INDEX idx_gemini_requests_session_id ON gemini_requests(session_id);

-- Create an index on status to quickly find running requests
CREATE INDEX idx_gemini_requests_status ON gemini_requests(status); 