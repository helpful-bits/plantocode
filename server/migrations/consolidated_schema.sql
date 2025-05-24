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

-- Create table for tracking API usage (tokens, cost, etc.)
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(10,6) NOT NULL DEFAULT 0,
    processing_ms INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES models(id)
);

-- Add indexes for faster reporting
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_model ON api_usage(model_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);

-- Initial seed data for models
INSERT INTO models (id, name, context_window, price_input, price_output)
VALUES 
    ('openai/gpt-3.5-turbo', 'GPT-3.5 Turbo', 16385, 0.000500, 0.001500),
    ('openai/gpt-4-turbo', 'GPT-4 Turbo', 128000, 0.010000, 0.030000),
    ('anthropic/claude-3-opus', 'Claude 3 Opus', 200000, 0.015000, 0.075000),
    ('anthropic/claude-3-sonnet', 'Claude 3 Sonnet', 200000, 0.003000, 0.015000),
    ('anthropic/claude-3-haiku', 'Claude 3 Haiku', 200000, 0.000250, 0.001250),
    ('google/gemini-pro', 'Gemini Pro', 32768, 0.000125, 0.000375),
    ('google/gemini-1.5-pro', 'Gemini 1.5 Pro', 1000000, 0.000700, 0.002100),
    ('groq/llama-3-70b-8192', 'Llama 3 70B (Groq)', 8192, 0.000700, 0.000900),
    ('groq/mixtral-8x7b-32768', 'Mixtral 8x7B (Groq)', 32768, 0.000200, 0.000300)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    context_window = EXCLUDED.context_window,
    price_input = EXCLUDED.price_input,
    price_output = EXCLUDED.price_output;

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
 '{"monthly_tokens": 100000, "services": ["anthropic/claude-3-haiku-20240307", "openai/gpt-3.5-turbo"], "concurrency": 1}'::jsonb),
 
('pro', 'Pro', 'Full access with higher usage limits', 9.99, 99.99, 
 '{"monthly_tokens": 1000000, "services": ["anthropic/claude-3-haiku-20240307", "anthropic/claude-3-sonnet-20240229", "openai/gpt-3.5-turbo", "openai/gpt-4-turbo", "openai/whisper-1"], "concurrency": 3}'::jsonb),
 
('enterprise', 'Enterprise', 'Custom solutions for teams', 49.99, 499.99, 
 '{"monthly_tokens": 10000000, "services": ["anthropic/claude-3-haiku-20240307", "anthropic/claude-3-sonnet-20240229", "anthropic/claude-3-opus-20240229", "openai/gpt-3.5-turbo", "openai/gpt-4-turbo", "openai/whisper-1"], "concurrency": 10, "team_members": 5}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Update all outdated models to 2025 versions
-- Migration: 002_update_models_2025.sql

-- Update existing models to latest 2025 versions
UPDATE models 
SET 
    name = 'Claude 3.7 Sonnet (2025)',
    context_window = 200000,
    price_input = 0.003000,
    price_output = 0.015000
WHERE id = 'anthropic/claude-3-sonnet';

UPDATE models 
SET 
    name = 'Claude 3.7 Opus (2025)',
    context_window = 200000,
    price_input = 0.015000,
    price_output = 0.075000
WHERE id = 'anthropic/claude-3-opus';

UPDATE models 
SET 
    name = 'Claude 3.7 Haiku (2025)',
    context_window = 200000,
    price_input = 0.000250,
    price_output = 0.001250
WHERE id = 'anthropic/claude-3-haiku';

-- Insert new 2025 model versions
INSERT INTO models (id, name, context_window, price_input, price_output)
VALUES 
    ('claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet', 200000, 0.003000, 0.015000),
    ('anthropic/claude-sonnet-4', 'Claude Sonnet 4', 200000, 0.004000, 0.020000),
    ('claude-opus-4-20250522', 'Claude Opus 4', 200000, 0.020000, 0.100000),
    ('google/gemini-2.5-flash-preview-05-20', 'Gemini 2.5 Flash Preview', 1000000, 0.000700, 0.002100),
    ('google/gemini-2.5-flash-preview-05-20:thinking', 'Gemini 2.5 Flash Thinking', 1000000, 0.000700, 0.002100),
    ('google/gemini-2.5-pro-preview', 'Gemini 2.5 Pro Preview', 2000000, 0.001250, 0.005000),
    ('deepseek/deepseek-r1', 'DeepSeek R1', 256000, 0.001000, 0.003000),
    ('deepseek/deepseek-r1-distill-qwen-32b', 'DeepSeek R1 Distill 32B', 256000, 0.000500, 0.001500),
    ('deepseek/deepseek-r1-distill-qwen-14b', 'DeepSeek R1 Distill 14B', 256000, 0.000300, 0.001000),
    ('deepseek/deepseek-r1-distill-llama-70b', 'DeepSeek R1 Distill Llama 70B', 256000, 0.000700, 0.002000),
    ('deepseek/deepseek-r1-distill-llama-8b', 'DeepSeek R1 Distill Llama 8B', 256000, 0.000200, 0.000600)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    context_window = EXCLUDED.context_window,
    price_input = EXCLUDED.price_input,
    price_output = EXCLUDED.price_output;

-- Update service pricing for the new Claude 3.7 models
UPDATE service_pricing 
SET 
    service_name = 'claude-3-7-sonnet-20250219',
    updated_at = CURRENT_TIMESTAMP
WHERE service_name = 'anthropic/claude-3-sonnet-20240229';

UPDATE service_pricing 
SET 
    service_name = 'claude-3-7-opus-20250219',
    updated_at = CURRENT_TIMESTAMP
WHERE service_name = 'anthropic/claude-3-opus-20240229';

UPDATE service_pricing 
SET 
    service_name = 'claude-3-7-haiku-20250219',
    updated_at = CURRENT_TIMESTAMP
WHERE service_name = 'anthropic/claude-3-haiku-20240307';

-- Insert pricing for new 2025 models
INSERT INTO service_pricing (service_name, input_token_price, output_token_price, currency, unit) 
VALUES 
('claude-3-7-sonnet-20250219', 0.003, 0.015, 'USD', 'per_1000_tokens'),
('anthropic/claude-sonnet-4', 0.004, 0.020, 'USD', 'per_1000_tokens'),
('claude-opus-4-20250522', 0.020, 0.100, 'USD', 'per_1000_tokens'),
('google/gemini-2.5-flash-preview-05-20', 0.000700, 0.002100, 'USD', 'per_1000_tokens'),
('google/gemini-2.5-flash-preview-05-20:thinking', 0.000700, 0.002100, 'USD', 'per_1000_tokens'),
('google/gemini-2.5-pro-preview', 0.001250, 0.005000, 'USD', 'per_1000_tokens'),
('deepseek/deepseek-r1', 0.001000, 0.003000, 'USD', 'per_1000_tokens'),
('deepseek/deepseek-r1-distill-qwen-32b', 0.000500, 0.001500, 'USD', 'per_1000_tokens'),
('deepseek/deepseek-r1-distill-qwen-14b', 0.000300, 0.001000, 'USD', 'per_1000_tokens'),
('deepseek/deepseek-r1-distill-llama-70b', 0.000700, 0.002000, 'USD', 'per_1000_tokens'),
('deepseek/deepseek-r1-distill-llama-8b', 0.000200, 0.000600, 'USD', 'per_1000_tokens')
ON CONFLICT (service_name) DO UPDATE SET
  input_token_price = EXCLUDED.input_token_price,
  output_token_price = EXCLUDED.output_token_price,
  updated_at = CURRENT_TIMESTAMP;

-- Update subscription plans to include new 2025 models
UPDATE subscription_plans 
SET 
    features = jsonb_set(
        features, 
        '{services}', 
        '["claude-3-7-haiku-20250219", "openai/gpt-3.5-turbo", "deepseek/deepseek-r1-distill-llama-8b"]'::jsonb
    )
WHERE id = 'free';

UPDATE subscription_plans 
SET 
    features = jsonb_set(
        features, 
        '{services}', 
        '["claude-3-7-haiku-20250219", "claude-3-7-sonnet-20250219", "openai/gpt-3.5-turbo", "openai/gpt-4-turbo", "openai/whisper-1", "deepseek/deepseek-r1-distill-qwen-14b", "deepseek/deepseek-r1-distill-qwen-32b"]'::jsonb
    )
WHERE id = 'pro';

UPDATE subscription_plans 
SET 
    features = jsonb_set(
        features, 
        '{services}', 
        '["claude-3-7-haiku-20250219", "claude-3-7-sonnet-20250219", "anthropic/claude-sonnet-4", "claude-opus-4-20250522", "openai/gpt-3.5-turbo", "openai/gpt-4-turbo", "openai/whisper-1", "google/gemini-2.5-flash-preview-05-20:thinking", "google/gemini-2.5-pro-preview", "deepseek/deepseek-r1", "deepseek/deepseek-r1-distill-qwen-32b", "deepseek/deepseek-r1-distill-llama-70b"]'::jsonb
    )
WHERE id = 'enterprise';

-- Store the updated AI model configurations in application_configurations table
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_default_llm_model_id', '"anthropic/claude-sonnet-4"'::jsonb, 'Default LLM model for new installations'),
('ai_settings_default_voice_model_id', '"anthropic/claude-sonnet-4"'::jsonb, 'Default voice processing model'),
('ai_settings_default_transcription_model_id', '"openai/whisper-1"'::jsonb, 'Default transcription model'),
('ai_settings_reasoning_models', '["deepseek/deepseek-r1", "deepseek/deepseek-r1-distill-qwen-32b", "deepseek/deepseek-r1-distill-qwen-14b"]'::jsonb, 'Available reasoning models for complex tasks'),
('ai_settings_latest_claude_models', '["claude-opus-4-20250522", "anthropic/claude-sonnet-4", "claude-3-7-sonnet-20250219"]'::jsonb, 'Latest Claude models available in 2025')
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
  "implementation_plan": {
    "model": "deepseek/deepseek-r1",
    "max_tokens": 65536,
    "temperature": 0.7
  },
  "path_finder": {
    "model": "google/gemini-2.5-flash-preview-05-20",
    "max_tokens": 8192,
    "temperature": 0.3
  },
  "text_improvement": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 4096,
    "temperature": 0.7
  },
  "voice_transcription": {
    "model": "openai/whisper-1",
    "max_tokens": 1024,
    "temperature": 0.0
  },
  "voice_correction": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 2048,
    "temperature": 0.5
  },
  "path_correction": {
    "model": "google/gemini-2.5-flash-preview-05-20",
    "max_tokens": 4096,
    "temperature": 0.3
  },
  "regex_generation": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 2048,
    "temperature": 0.5
  },
  "guidance_generation": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 8192,
    "temperature": 0.7
  },
  "task_enhancement": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 4096,
    "temperature": 0.7
  },
  "generate_directory_tree": {
    "model": "google/gemini-2.5-flash-preview-05-20",
    "max_tokens": 4096,
    "temperature": 0.3
  },
  "text_correction_post_transcription": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 2048,
    "temperature": 0.5
  },
  "generic_llm_stream": {
    "model": "google/gemini-2.5-flash-preview-05-20",
    "max_tokens": 16384,
    "temperature": 0.7
  },
  "regex_summary_generation": {
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 4096,
    "temperature": 0.6
  },
  "streaming": {
    "model": "google/gemini-2.5-flash-preview-05-20",
    "max_tokens": 16384,
    "temperature": 0.7
  },
  "unknown": {
    "model": "google/gemini-2.5-flash-preview-05-20",
    "max_tokens": 4096,
    "temperature": 0.7
  }
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