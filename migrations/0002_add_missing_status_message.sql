-- Fix missing column
ALTER TABLE sessions ADD COLUMN gemini_status_message TEXT;
