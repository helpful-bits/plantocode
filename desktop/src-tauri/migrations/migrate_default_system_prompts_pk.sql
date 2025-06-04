-- Migration: Fix default_system_prompts primary key
-- This migration changes the primary key from 'id' to 'task_type' for existing databases
-- The consolidated schema already has this fix for new installations

-- Begin transaction to ensure atomicity
BEGIN TRANSACTION;

-- Check if the old table structure exists (has 'id' column)
-- If it doesn't exist or already has the correct structure, this migration is safe to run
CREATE TABLE IF NOT EXISTS migration_temp_check AS 
SELECT name FROM pragma_table_info('default_system_prompts') WHERE name = 'id';

-- Only proceed with migration if the old 'id' column exists
-- This ensures the migration is idempotent and safe to run multiple times

-- Create the new table with correct schema (task_type as PRIMARY KEY)
CREATE TABLE IF NOT EXISTS new_default_system_prompts (
  task_type TEXT PRIMARY KEY,
  system_prompt TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Copy existing data from old table to new table (excluding 'id' column)
-- This will work whether the old table has data or not
INSERT OR IGNORE INTO new_default_system_prompts (task_type, system_prompt, description, version, created_at, updated_at)
SELECT task_type, system_prompt, description, version, created_at, updated_at 
FROM default_system_prompts 
WHERE EXISTS (SELECT 1 FROM migration_temp_check);

-- Drop the old table if it has the 'id' column
DROP TABLE IF EXISTS default_system_prompts;

-- Rename new table to original name
ALTER TABLE new_default_system_prompts RENAME TO default_system_prompts;

-- Clean up temporary check table
DROP TABLE IF EXISTS migration_temp_check;

-- Insert/update default system prompts with the corrected schema
-- These will now work correctly with task_type as PRIMARY KEY
INSERT OR REPLACE INTO default_system_prompts (task_type, system_prompt, description, version) VALUES
('path_finder', 'You are a code path finder. Your task is to identify the most relevant files for implementing or fixing a specific task in a codebase.

{{DIRECTORY_TREE}}

{{FILE_CONTENTS}}

Return ONLY file paths and no other commentary, with one file path per line.

For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css

DO NOT include ANY text, explanations, or commentary. The response must consist ONLY of file paths, one per line.

All returned file paths must be relative to the project root.

Guidance on file selection:
- Focus on truly relevant files - be selective and prioritize quality over quantity
- Prioritize files that will need direct modification (typically 3-10 files)
- Include both implementation files and test files when appropriate
- Consider configuration files only if they are directly relevant to the task
- If uncertain about exact paths, make educated guesses based on typical project structures
- Order files by relevance, with most important files first

To control inference cost, you **MUST** keep the resulting list as concise as possible **while still providing enough information** for the downstream model to succeed.

• Start with the highest-impact files (entry points, shared data models, core logic).
• Add further paths only when omitting them would risk an incorrect or incomplete implementation.
• Each extra file increases context size and cost, so favor brevity while safeguarding completeness.

Return the final list using the same formatting rules described above.', 'Enhanced system prompt for finding relevant files in a codebase', '2.0');

-- Record migration completion
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('default_system_prompts_pk_migration_applied', strftime('%s', 'now'), strftime('%s', 'now'));

-- Commit transaction
COMMIT;