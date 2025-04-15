-- Add columns to track Gemini processing status
ALTER TABLE sessions ADD COLUMN gemini_status TEXT DEFAULT 'idle'; -- idle, running, completed, failed, canceled
ALTER TABLE sessions ADD COLUMN gemini_start_time INTEGER; -- Unix timestamp (ms)
ALTER TABLE sessions ADD COLUMN gemini_end_time INTEGER; -- Unix timestamp (ms)
ALTER TABLE sessions ADD COLUMN gemini_patch_path TEXT; -- Path to the saved patch file
ALTER TABLE sessions ADD COLUMN gemini_status_message TEXT; -- Optional message associated with the status (e.g., error details)

-- Add index for faster status lookups if needed
