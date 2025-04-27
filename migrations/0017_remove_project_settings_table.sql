-- Migration to remove the redundant project_settings table
-- The active_sessions table already handles the active session ID per project hash functionality

-- Drop project_settings table if it exists
DROP TABLE IF EXISTS project_settings;

-- Log this migration
INSERT INTO migrations (name, applied_at) 
VALUES ('0017_remove_project_settings_table.sql', strftime('%s', 'now')); 