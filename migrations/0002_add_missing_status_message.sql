-- Add gemini_status_message column if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN directly
-- We assume migrations run in order, so this should only run once.
-- If run multiple times, it will error harmlessly if the column already exists.
ALTER TABLE sessions ADD COLUMN gemini_status_message TEXT; 
-- No default value needed, NULL is acceptable
UPDATE sessions SET gemini_status_message = NULL WHERE gemini_status_message IS NOT NULL; -- Optionally clear existing values if needed