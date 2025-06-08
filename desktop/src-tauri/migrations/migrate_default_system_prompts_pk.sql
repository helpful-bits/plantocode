-- Migration: Remove default_system_prompts table from SQLite
-- Default system prompts are stored ONLY on the server (PostgreSQL)
-- Desktop SQLite database contains ONLY user-defined custom system prompts

-- Begin transaction to ensure atomicity
BEGIN TRANSACTION;

-- Drop the default_system_prompts table if it exists
-- This table should not exist in SQLite - only on the server
DROP TABLE IF EXISTS default_system_prompts;

-- Record migration completion
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('default_system_prompts_removal_migration_applied', strftime('%s', 'now'), strftime('%s', 'now'));

-- Commit transaction
COMMIT;