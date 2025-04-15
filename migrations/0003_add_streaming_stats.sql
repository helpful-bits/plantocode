-- Add columns for tracking Gemini streaming statistics
ALTER TABLE sessions ADD COLUMN gemini_tokens_received INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN gemini_chars_received INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN gemini_last_update INTEGER; -- Timestamp of last update chunk

-- Add index to optimize status queries
