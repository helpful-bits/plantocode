-- Device registry schema for desktop instance management
-- This migration adds tables for device registration, discovery, and presence tracking

-- Registered desktop devices
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID UNIQUE NOT NULL, -- Client-generated unique identifier
    user_id UUID NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL DEFAULT 'desktop',
    platform VARCHAR(50) NOT NULL, -- 'windows', 'macos', 'linux'
    platform_version VARCHAR(100),
    app_version VARCHAR(50) NOT NULL,

    -- Connectivity information
    local_ips JSONB, -- Array of local IP addresses
    public_ip INET,
    relay_eligible BOOLEAN NOT NULL DEFAULT true,
    available_ports JSONB, -- Array of available port numbers

    -- Device capabilities
    capabilities JSONB NOT NULL DEFAULT '{}', -- e.g., {"supports_voice": true, "supports_merge": true}

    -- Health and presence
    status VARCHAR(20) NOT NULL DEFAULT 'offline', -- 'online', 'offline', 'away'
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    cpu_usage DECIMAL(5,2), -- Percentage 0-100
    memory_usage DECIMAL(5,2), -- Percentage 0-100
    disk_space_gb BIGINT,
    active_jobs INTEGER NOT NULL DEFAULT 0,

    -- Connection descriptor for secure communication
    connection_descriptor JSONB, -- Signed connection information
    connection_signature VARCHAR(512), -- HMAC signature of connection descriptor

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device presence history for analytics and debugging
CREATE TABLE IF NOT EXISTS device_presence_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_space_gb BIGINT,
    active_jobs INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_device_presence_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Device pairing requests (for future mobile-desktop pairing flow)
CREATE TABLE IF NOT EXISTS device_pairing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requesting_device_id VARCHAR(255) NOT NULL, -- Mobile device identifier
    target_device_id UUID NOT NULL, -- Desktop device UUID
    user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
    pairing_code VARCHAR(10), -- 6-digit pairing code shown on desktop
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_device_pairing_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_pairing_target FOREIGN KEY (target_device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON devices(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_device_presence_device_id ON device_presence_history(device_id);
CREATE INDEX IF NOT EXISTS idx_device_presence_timestamp ON device_presence_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_device_pairing_user_id ON device_pairing_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_device_pairing_target ON device_pairing_requests(target_device_id);
CREATE INDEX IF NOT EXISTS idx_device_pairing_status ON device_pairing_requests(status);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on devices table
CREATE TRIGGER devices_updated_at_trigger
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_devices_updated_at();

-- Function to clean up old presence history (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_presence_history()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM device_presence_history
    WHERE timestamp < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to mark devices as offline if they haven't sent a heartbeat in 2 minutes
CREATE OR REPLACE FUNCTION mark_stale_devices_offline()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE devices
    SET status = 'offline'
    WHERE status = 'online'
    AND last_heartbeat < NOW() - INTERVAL '2 minutes';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;