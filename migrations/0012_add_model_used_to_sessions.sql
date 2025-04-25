-- Add model_used column to sessions table to track which Gemini model is being used
-- Default to GEMINI_FLASH_MODEL

ALTER TABLE sessions ADD COLUMN model_used TEXT DEFAULT 'gemini-2.5-flash-preview-04-17';

-- Create an index on model_used for faster lookups
CREATE INDEX idx_sessions_model_used ON sessions(model_used); 