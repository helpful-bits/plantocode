-- Initial database schema for Vibe Manager Server

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255),
    firebase_uid VARCHAR(255) UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Refresh tokens for persistent sessions
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings for users
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(50) DEFAULT 'light',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Subscriptions for users
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'trialing', 'active', 'canceled', 'past_due'
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    current_period_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL, -- e.g., model_id or a general service identifier
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(12, 6) NOT NULL, -- Sufficient precision for cost
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    request_id TEXT, -- Optional: for tracing back to provider
    metadata JSONB, -- Optional: for additional details
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id_timestamp ON api_usage(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_service_name ON api_usage(service_name);

-- API rate limiting and quotas
CREATE TABLE IF NOT EXISTS api_quotas (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL,
    service_name VARCHAR(50) NOT NULL,
    monthly_tokens_limit INTEGER,
    daily_requests_limit INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_service_quota UNIQUE (user_id, service_name)
);

-- Service pricing configuration
CREATE TABLE IF NOT EXISTS service_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL UNIQUE, -- e.g., 'anthropic/claude-3-opus-20240229'
    input_token_price DECIMAL(10, 8) NOT NULL, -- Price per 1000 tokens
    output_token_price DECIMAL(10, 8) NOT NULL, -- Price per 1000 tokens
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    unit VARCHAR(50) NOT NULL DEFAULT 'per_1000_tokens',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_service_pricing_service_name ON service_pricing(service_name);

-- Optional: Add a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $update_updated_at_column$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$update_updated_at_column$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_timestamp_service_pricing ON service_pricing;
CREATE TRIGGER set_timestamp_service_pricing
BEFORE UPDATE ON service_pricing
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Subscription plan configuration
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY, -- 'free', 'pro', 'enterprise'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10, 2) NOT NULL,
    price_yearly DECIMAL(10, 2) NOT NULL,
    stripe_price_id_monthly VARCHAR(100),
    stripe_price_id_yearly VARCHAR(100),
    features JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Projects that users can manage
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Access control for projects
CREATE TABLE IF NOT EXISTS project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id),
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_api_quotas_user_id ON api_quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_api_quotas_service_name ON api_quotas(service_name);

-- Insert default service pricing for OpenRouter models
INSERT INTO service_pricing (service_name, input_token_price, output_token_price, currency, unit) 
VALUES 
('anthropic/claude-3-opus-20240229', 0.015, 0.075, 'USD', 'per_1000_tokens'),     -- $0.015 per 1K input tokens, $0.075 per 1K output tokens
('anthropic/claude-3-sonnet-20240229', 0.003, 0.015, 'USD', 'per_1000_tokens'),   -- $0.003 per 1K input tokens, $0.015 per 1K output tokens
('anthropic/claude-3-haiku-20240307', 0.00025, 0.00125, 'USD', 'per_1000_tokens'), -- $0.00025 per 1K input tokens, $0.00125 per 1K output tokens
('openai/gpt-4-turbo', 0.01, 0.03, 'USD', 'per_1000_tokens'),                     -- $0.01 per 1K input tokens, $0.03 per 1K output tokens
('openai/gpt-3.5-turbo', 0.0005, 0.0015, 'USD', 'per_1000_tokens'),               -- $0.0005 per 1K input tokens, $0.0015 per 1K output tokens
('openai/whisper-1', 0.0, 0.006, 'USD', 'per_1000_tokens')                        -- $0.006 per 1K tokens for transcription (OpenRouter charges only for output)
ON CONFLICT (service_name) DO UPDATE SET
  input_token_price = EXCLUDED.input_token_price,
  output_token_price = EXCLUDED.output_token_price,
  updated_at = CURRENT_TIMESTAMP;

-- Update pricing if any models have changed pricing
UPDATE service_pricing SET input_token_price = 0.0, output_token_price = 0.006, updated_at = CURRENT_TIMESTAMP
WHERE service_name = 'openai/whisper-1' 
AND (input_token_price != 0.0 OR output_token_price != 0.006);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, features)
VALUES 
('free', 'Free Tier', 'Basic access with limited usage', 0.00, 0.00, 
 '{"monthly_tokens": 100000, "services": ["anthropic/claude-3-haiku-20240307", "openai/gpt-3.5-turbo"], "concurrency": 1}'::jsonb),
 
('pro', 'Pro', 'Full access with higher usage limits', 9.99, 99.99, 
 '{"monthly_tokens": 1000000, "services": ["anthropic/claude-3-haiku-20240307", "anthropic/claude-3-sonnet-20240229", "openai/gpt-3.5-turbo", "openai/gpt-4-turbo", "openai/whisper-1"], "concurrency": 3}'::jsonb),
 
('enterprise', 'Enterprise', 'Custom solutions for teams', 49.99, 499.99, 
 '{"monthly_tokens": 10000000, "services": ["anthropic/claude-3-haiku-20240307", "anthropic/claude-3-sonnet-20240229", "anthropic/claude-3-opus-20240229", "openai/gpt-3.5-turbo", "openai/gpt-4-turbo", "openai/whisper-1"], "concurrency": 10, "team_members": 5}'::jsonb)
ON CONFLICT (id) DO NOTHING;