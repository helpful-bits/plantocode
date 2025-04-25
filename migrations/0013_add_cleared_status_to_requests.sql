-- Add cleared column to gemini_requests table to support clearing request history
-- Default to FALSE so existing requests are not hidden

ALTER TABLE gemini_requests ADD COLUMN cleared INTEGER DEFAULT 0 CHECK(cleared IN (0, 1));

-- Create an index on cleared for faster filtering of non-cleared requests
CREATE INDEX idx_gemini_requests_cleared ON gemini_requests(cleared);

-- Create a compound index on status and cleared for optimized queries that filter on both
CREATE INDEX idx_gemini_requests_status_cleared ON gemini_requests(status, cleared); 