-- Initial database schema for Vibe Manager Server

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255),
    auth0_user_id VARCHAR(255) UNIQUE,
    auth0_refresh_token TEXT NULL,
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
    input_duration_ms BIGINT NULL,
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
CREATE INDEX IF NOT EXISTS idx_users_auth0_user_id ON users(auth0_user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_api_quotas_user_id ON api_quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_api_quotas_service_name ON api_quotas(service_name);

-- Create models table for storing AI model metadata
CREATE TABLE IF NOT EXISTS models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    context_window INTEGER NOT NULL DEFAULT 4096,
    price_input DECIMAL(10,6) NOT NULL DEFAULT 0,
    price_output DECIMAL(10,6) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster lookup by name
CREATE INDEX IF NOT EXISTS idx_models_name ON models(name);


-- OpenRouter billing rates – generated 2025-05-26
INSERT INTO models (id, name, context_window, price_input, price_output)
VALUES
('anthropic/claude-opus-4',        'Claude 4 Opus',       200000, 0.015000, 0.075000),
('anthropic/claude-sonnet-4',      'Claude 4 Sonnet',     200000, 0.003000, 0.015000),
('openai/gpt-4.1',                 'GPT-4.1',            1000000, 0.002000, 0.008000),
('openai/gpt-4.1-mini',            'GPT-4.1 Mini',       1000000, 0.000400, 0.001600),
('google/gemini-2.5-pro-preview',  'Gemini 2.5 Pro',     1000000, 0.001250, 0.010000),
('groq/whisper-large-v3',          'Whisper Large V3 (Groq)', 0, 0.000000, 0.000000)
ON CONFLICT (id) DO UPDATE SET
name           = EXCLUDED.name,
context_window = EXCLUDED.context_window,
price_input    = EXCLUDED.price_input,
price_output   = EXCLUDED.price_output;



-- Store application-wide configurations, especially those managed dynamically
CREATE TABLE IF NOT EXISTS application_configurations (
config_key TEXT PRIMARY KEY,    -- e.g., 'ai_settings_default_llm_model_id', 'ai_settings_available_models'
config_value JSONB NOT NULL,    -- Store complex configurations as JSONB
description TEXT,               -- Optional description of the configuration
updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_configurations_config_key ON application_configurations(config_key);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, features)
VALUES 
('free', 'Free Tier', 'Basic access with limited usage', 0.00, 0.00, 
 '{"monthly_tokens": 100000, "services": ["openai/gpt-4.1-mini"], "concurrency": 1}'::jsonb),
 
('pro', 'Pro', 'Full access with higher usage limits', 9.99, 99.99, 
 '{"monthly_tokens": 1000000, "services": ["anthropic/claude-sonnet-4", "openai/gpt-4.1", "google/gemini-2.5-pro-preview", "openai/gpt-4.1-mini"], "concurrency": 3}'::jsonb),
 
('enterprise', 'Enterprise', 'Custom solutions for teams', 49.99, 499.99, 
 '{"monthly_tokens": 0, "services": ["anthropic/claude-opus-4", "anthropic/claude-sonnet-4", "openai/gpt-4.1", "google/gemini-2.5-pro-preview", "openai/gpt-4.1-mini"], "concurrency": 10, "team_members": 5}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- Store the updated AI model configurations in application_configurations table
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_default_llm_model_id', '"google/gemini-2.5-pro-preview"'::jsonb, 'Default LLM model for new installations'),
('ai_settings_default_voice_model_id', '"anthropic/claude-sonnet-4"'::jsonb, 'Default voice processing model'),
('ai_settings_default_transcription_model_id', '"groq/whisper-large-v3"'::jsonb, 'Default transcription model'),
('ai_settings_latest_claude_models', '["anthropic/claude-opus-4", "anthropic/claude-sonnet-4"]'::jsonb, 'Latest Claude models available'),
('ai_settings_latest_openai_models', '["openai/gpt-4.1", "openai/gpt-4.1-mini"]'::jsonb, 'Latest OpenAI models available'),
('ai_settings_latest_google_models', '["google/gemini-2.5-pro-preview"]'::jsonb, 'Latest Google models available')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- Insert comprehensive AI task configurations into application_configurations
-- Migration: 003_insert_ai_task_configurations.sql
-- This migration ensures ALL AI defaults come from the database, not hardcoded values

-- Insert comprehensive task-specific model configurations
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_task_specific_configs', '{
  "implementation_plan": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 65536, "temperature": 0.7},
  "path_finder": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.3},
  "text_improvement": {"model": "anthropic/claude-sonnet-4", "max_tokens": 4096, "temperature": 0.7},
  "voice_transcription": {"model": "groq/whisper-large-v3", "max_tokens": 4096, "temperature": 0.0},
  "voice_correction": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "path_correction": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.3},
  "regex_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "guidance_generation": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.7},
  "task_enhancement": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7},
  "generate_directory_tree": {"model": "openai/gpt-4.1-mini", "max_tokens": 4096, "temperature": 0.3},
  "text_correction_post_transcription": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "generic_llm_stream": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 16384, "temperature": 0.7},
  "streaming": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 16384, "temperature": 0.7},
  "unknown": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7}
}'::jsonb, 'Task-specific model configurations including model, tokens, and temperature for all supported task types'),

('ai_settings_path_finder_settings', '{
  "max_files_with_content": 10,
  "include_file_contents": true,
  "max_content_size_per_file": 5000,
  "max_file_count": 50,
  "file_content_truncation_chars": 2000,
  "token_limit_buffer": 1000
}'::jsonb, 'Settings for the PathFinder agent functionality'),

('ai_settings_available_models', '[]'::jsonb, 'List of available AI models with their properties - will be populated from models table at startup')

ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;