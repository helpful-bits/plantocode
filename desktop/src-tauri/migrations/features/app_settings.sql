-- Create application settings table for global configuration
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Insert default device visibility settings
INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
    ('device.is_discoverable', 'true', 'Whether this device is discoverable by other devices'),
    ('device.allow_remote_access', 'false', 'Whether to allow remote access from mobile devices');