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
    service_name TEXT NOT NULL,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(12, 6) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    request_id TEXT,
    metadata JSONB,
    input_duration_ms BIGINT NULL,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id_timestamp ON api_usage(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_service_name ON api_usage(service_name);

-- Subscription plans (must come before user_spending_limits due to foreign key)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_price_monthly DECIMAL(10, 2) NOT NULL,
    base_price_yearly DECIMAL(10, 2) NOT NULL,
    included_spending_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    overage_rate DECIMAL(5, 4) NOT NULL DEFAULT 1.0000,
    hard_limit_multiplier DECIMAL(3, 2) NOT NULL DEFAULT 2.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    stripe_price_id_monthly VARCHAR(100),
    stripe_price_id_yearly VARCHAR(100),
    features JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- User spending limits and real-time tracking
CREATE TABLE IF NOT EXISTS user_spending_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,
    included_allowance DECIMAL(10, 4) NOT NULL,
    current_spending DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
    hard_limit DECIMAL(10, 4) NOT NULL,
    services_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    CONSTRAINT unique_user_billing_period UNIQUE (user_id, billing_period_start)
);

CREATE INDEX IF NOT EXISTS idx_user_spending_limits_user_period ON user_spending_limits(user_id, billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_user_spending_limits_blocked ON user_spending_limits(services_blocked);

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
-- Spending alerts and notifications
CREATE TABLE IF NOT EXISTS spending_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- '75_percent', '90_percent', 'limit_reached', 'services_blocked'
    threshold_amount DECIMAL(10, 4) NOT NULL,
    current_spending DECIMAL(10, 4) NOT NULL,
    alert_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    billing_period_start TIMESTAMPTZ NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spending_alerts_user_period ON spending_alerts(user_id, billing_period_start);
CREATE INDEX IF NOT EXISTS idx_spending_alerts_type ON spending_alerts(alert_type, acknowledged);

-- User preferences for currency and notifications
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'en-US',
    cost_alerts_enabled BOOLEAN DEFAULT TRUE,
    spending_alert_75_percent BOOLEAN DEFAULT TRUE,
    spending_alert_90_percent BOOLEAN DEFAULT TRUE,
    spending_alert_limit_reached BOOLEAN DEFAULT TRUE,
    spending_alert_services_blocked BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_currency ON user_preferences(preferred_currency);
CREATE INDEX IF NOT EXISTS idx_user_preferences_alerts ON user_preferences(cost_alerts_enabled);

-- Create providers table for AI providers
CREATE TABLE IF NOT EXISTS providers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,  -- anthropic, openai, google, groq
    name VARCHAR(255) NOT NULL,        -- Anthropic, OpenAI, Google, Groq
    description TEXT,
    website_url VARCHAR(500),
    api_base_url VARCHAR(500),
    capabilities JSONB DEFAULT '{}',   -- Provider-level capabilities
    status VARCHAR(20) DEFAULT 'active', -- active, deprecated, beta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for providers
CREATE INDEX IF NOT EXISTS idx_providers_code ON providers(code);
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status);

-- Insert known providers
INSERT INTO providers (code, name, description, website_url, api_base_url, capabilities, status) VALUES
('anthropic', 'Anthropic', 'AI safety focused company providing Claude models', 'https://anthropic.com', 'https://api.anthropic.com', '{"text": true, "chat": true, "reasoning": true}', 'active'),
('openai', 'OpenAI', 'Leading AI research company providing GPT models', 'https://openai.com', 'https://api.openai.com', '{"text": true, "chat": true, "image": true, "code": true}', 'active'),
('google', 'Google', 'Google AI providing Gemini models', 'https://ai.google.dev', 'https://generativelanguage.googleapis.com', '{"text": true, "chat": true, "multimodal": true, "code": true}', 'active'),
('groq', 'Groq', 'High-performance AI inference platform', 'https://groq.com', 'https://api.groq.com', '{"transcription": true, "fast_inference": true}', 'active'),
('deepseek', 'DeepSeek', 'DeepSeek AI providing reasoning models', 'https://deepseek.com', 'https://api.deepseek.com', '{"reasoning": true, "code": true}', 'active')
ON CONFLICT (code) DO NOTHING;

-- Create models table with proper provider relationships
CREATE TABLE IF NOT EXISTS models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    context_window INTEGER NOT NULL DEFAULT 4096,
    price_input DECIMAL(10,6) NOT NULL DEFAULT 0,
    price_output DECIMAL(10,6) NOT NULL DEFAULT 0,
    pricing_type VARCHAR(20) DEFAULT 'token_based',
    price_per_hour DECIMAL(12,6) DEFAULT 0.000000,
    minimum_billable_seconds INTEGER DEFAULT 0,
    billing_unit VARCHAR(10) DEFAULT 'tokens',
    provider_id INTEGER REFERENCES providers(id),
    model_type VARCHAR(50) DEFAULT 'text',
    capabilities JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for models
CREATE INDEX IF NOT EXISTS idx_models_name ON models(name);
CREATE INDEX IF NOT EXISTS idx_models_pricing_type ON models(pricing_type);
CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id);
CREATE INDEX IF NOT EXISTS idx_models_type ON models(model_type);
CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);

-- Add constraint to ensure data integrity
ALTER TABLE models 
ADD CONSTRAINT models_provider_id_not_null 
CHECK (provider_id IS NOT NULL);


-- AI model pricing data - Updated with provider relationships
INSERT INTO models (id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, provider_id, model_type, capabilities, status, description)
VALUES
-- Anthropic models
('anthropic/claude-opus-4',        'Claude 4 Opus',       200000, 0.015000, 0.075000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Advanced language model with strong reasoning capabilities'),
('anthropic/claude-sonnet-4',      'Claude 4 Sonnet',     200000, 0.003000, 0.015000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Balanced language model with strong reasoning capabilities'),

-- OpenAI models  
('openai/gpt-4.1',                 'GPT-4.1',            1000000, 0.002000, 0.008000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Advanced GPT model with broad capabilities'),
('openai/gpt-4.1-mini',            'GPT-4.1 Mini',       1000000, 0.000400, 0.001600, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Efficient GPT model for cost-sensitive applications'),

-- Google models
('google/gemini-2.5-pro-preview',  'Gemini 2.5 Pro',     1000000, 0.001250, 0.010000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "multimodal": true, "code": true}', 'active', 'Multimodal AI model with advanced reasoning'),

-- Groq transcription models
('groq/whisper-large-v3',          'Whisper Large V3 (Groq)',          0, 0.000000, 0.000000, 'duration_based', 0.111000, 10, 'hours', (SELECT id FROM providers WHERE code = 'groq'), 'transcription', '{"transcription": true, "audio_processing": true}', 'active', 'High-accuracy audio transcription model'),
('groq/whisper-large-v3-turbo',    'Whisper Large V3 Turbo (Groq)',    0, 0.000000, 0.000000, 'duration_based', 0.040000, 10, 'hours', (SELECT id FROM providers WHERE code = 'groq'), 'transcription', '{"transcription": true, "audio_processing": true}', 'active', 'Fast audio transcription model'),
('groq/distil-whisper-large-v3-en', 'Distil-Whisper Large V3 English (Groq)', 0, 0.000000, 0.000000, 'duration_based', 0.020000, 10, 'hours', (SELECT id FROM providers WHERE code = 'groq'), 'transcription', '{"transcription": true, "audio_processing": true}', 'active', 'Efficient English transcription model')

ON CONFLICT (id) DO UPDATE SET
name                       = EXCLUDED.name,
context_window            = EXCLUDED.context_window,
price_input               = EXCLUDED.price_input,
price_output              = EXCLUDED.price_output,
pricing_type              = EXCLUDED.pricing_type,
price_per_hour            = EXCLUDED.price_per_hour,
minimum_billable_seconds  = EXCLUDED.minimum_billable_seconds,
billing_unit              = EXCLUDED.billing_unit,
provider_id               = EXCLUDED.provider_id,
model_type                = EXCLUDED.model_type,
capabilities              = EXCLUDED.capabilities,
status                    = EXCLUDED.status,
description               = EXCLUDED.description;



-- Store application-wide configurations, especially those managed dynamically
CREATE TABLE IF NOT EXISTS application_configurations (
config_key TEXT PRIMARY KEY,    -- e.g., 'ai_settings_default_llm_model_id', 'ai_settings_available_models'
config_value JSONB NOT NULL,    -- Store complex configurations as JSONB
description TEXT,               -- Optional description of the configuration
updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_configurations_config_key ON application_configurations(config_key);

-- Insert subscription plans
INSERT INTO subscription_plans (
    id, name, description, 
    base_price_monthly, base_price_yearly,
    included_spending_monthly, overage_rate, hard_limit_multiplier,
    currency, features
) VALUES 
('free', 'Free', 'Perfect for trying out AI features', 
 0.00, 0.00, 5.00, 1.0000, 2.00, 'USD',
 '{"features": ["Basic AI models", "Community support", "Usage analytics"], "models": ["anthropic/claude-sonnet-4", "openai/gpt-4.1-mini"], "support": "Community", "limits": {"hard_cutoff": true, "overage_allowed": false}}'::jsonb),
 
('pro', 'Pro', 'For power users and small teams', 
 20.00, 200.00, 50.00, 1.0000, 3.00, 'USD',
 '{"features": ["All AI models", "Priority support", "Advanced analytics", "API access"], "models": ["anthropic/claude-opus-4", "anthropic/claude-sonnet-4", "openai/gpt-4.1", "openai/gpt-4.1-mini", "google/gemini-2.5-pro-preview"], "support": "Priority", "limits": {"hard_cutoff": true, "overage_allowed": true}}'::jsonb),
 
('enterprise', 'Enterprise', 'For organizations with high AI usage', 
 100.00, 1000.00, 200.00, 0.9000, 5.00, 'USD',
 '{"features": ["All AI models", "Dedicated support", "Custom integrations", "Advanced analytics", "Team management", "SLA guarantee"], "models": ["anthropic/claude-opus-4", "anthropic/claude-sonnet-4", "openai/gpt-4.1", "openai/gpt-4.1-mini", "google/gemini-2.5-pro-preview", "groq/whisper-large-v3", "groq/whisper-large-v3-turbo", "groq/distil-whisper-large-v3-en"], "support": "Dedicated", "limits": {"hard_cutoff": false, "overage_allowed": true, "custom_limits": true}}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- Store essential AI configurations (models loaded dynamically from providers/models tables)
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_default_llm_model_id', '"google/gemini-2.5-pro-preview"'::jsonb, 'Default LLM model ID - references models.id in models table'),
('ai_settings_default_voice_model_id', '"anthropic/claude-sonnet-4"'::jsonb, 'Default voice model ID - references models.id in models table'),
('ai_settings_default_transcription_model_id', '"groq/whisper-large-v3-turbo"'::jsonb, 'Default transcription model ID - references models.id in models table')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- Enhanced billing tables for 100% implementation

-- Invoice cache table for Stripe invoice data
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(255) PRIMARY KEY, -- Stripe invoice ID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    stripe_subscription_id VARCHAR(255),
    amount_due DECIMAL(12, 4) NOT NULL,
    amount_paid DECIMAL(12, 4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL, -- draft, open, paid, void, uncollectible
    invoice_pdf_url TEXT,
    hosted_invoice_url TEXT,
    billing_reason VARCHAR(100), -- subscription_create, subscription_cycle, manual, etc.
    description TEXT,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    finalized_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_invoice_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_customer ON invoices(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- Payment methods cache table for Stripe payment method data
CREATE TABLE IF NOT EXISTS payment_methods (
    id VARCHAR(255) PRIMARY KEY, -- Stripe payment method ID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- card, bank_account, etc.
    card_brand VARCHAR(50), -- visa, mastercard, amex, etc.
    card_last_four VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    card_country VARCHAR(2),
    card_funding VARCHAR(20), -- credit, debit, prepaid
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_payment_method_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_customer ON payment_methods(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(is_default);

-- Email notification queue for reliable delivery
CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_address VARCHAR(255) NOT NULL,
    notification_type VARCHAR(50) NOT NULL, -- spending_alert, invoice_reminder, payment_failed, etc.
    subject VARCHAR(255) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    template_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, failed, retrying
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    priority INTEGER NOT NULL DEFAULT 1, -- 1=high, 2=medium, 3=low
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_email_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_user_id ON email_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status);
CREATE INDEX IF NOT EXISTS idx_email_notifications_created ON email_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_queue ON email_notifications(status, priority, created_at) WHERE status = 'pending';

-- Enhanced spending history for analytics
CREATE TABLE IF NOT EXISTS spending_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    included_allowance DECIMAL(10, 4) NOT NULL,
    total_spending DECIMAL(10, 4) NOT NULL DEFAULT 0,
    overage_amount DECIMAL(10, 4) NOT NULL DEFAULT 0,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_tokens_input BIGINT NOT NULL DEFAULT 0,
    total_tokens_output BIGINT NOT NULL DEFAULT 0,
    services_used JSONB NOT NULL DEFAULT '[]',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    invoice_id VARCHAR(255), -- Link to Stripe invoice if applicable
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_spending_period_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_spending_period UNIQUE (user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_spending_periods_user_period ON spending_periods(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_spending_periods_archived ON spending_periods(archived);

-- Billing configuration table for dynamic settings
CREATE TABLE IF NOT EXISTS billing_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_type VARCHAR(50) NOT NULL, -- stripe_urls, email_templates, etc.
    environment VARCHAR(20) NOT NULL DEFAULT 'production', -- production, staging, development
    config_data JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_billing_config UNIQUE (config_type, environment)
);

CREATE INDEX IF NOT EXISTS idx_billing_configurations_type ON billing_configurations(config_type);
CREATE INDEX IF NOT EXISTS idx_billing_configurations_active ON billing_configurations(is_active);

-- Insert default billing configurations
INSERT INTO billing_configurations (config_type, environment, config_data) VALUES 
('stripe_urls', 'production', '{
    "success_url": "https://app.vibemanager.com/account?checkout=success",
    "cancel_url": "https://app.vibemanager.com/account?checkout=canceled",
    "portal_return_url": "https://app.vibemanager.com/account"
}'::jsonb),
('stripe_urls', 'development', '{
    "success_url": "http://localhost:1420/account?checkout=success",
    "cancel_url": "http://localhost:1420/account?checkout=canceled", 
    "portal_return_url": "http://localhost:1420/account"
}'::jsonb),
('email_templates', 'production', '{
    "spending_alert_75": {
        "subject": "AI Usage Alert: 75% of Monthly Allowance Used",
        "template": "spending_alert_75"
    },
    "spending_alert_90": {
        "subject": "AI Usage Warning: 90% of Monthly Allowance Used",
        "template": "spending_alert_90"
    },
    "spending_limit_reached": {
        "subject": "AI Usage Limit Reached - Overage Charges Apply",
        "template": "spending_limit_reached"
    },
    "services_blocked": {
        "subject": "AI Services Temporarily Blocked - Action Required",
        "template": "services_blocked"
    },
    "invoice_created": {
        "subject": "Your Vibe Manager Invoice is Ready",
        "template": "invoice_created"
    },
    "payment_failed": {
        "subject": "Payment Failed - Please Update Payment Method",
        "template": "payment_failed"
    }
}'::jsonb)
ON CONFLICT (config_type, environment) DO NOTHING;

-- Insert comprehensive AI task configurations into application_configurations
-- Migration: 003_insert_ai_task_configurations.sql
-- All AI defaults come from the database

-- Insert comprehensive task-specific model configurations
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_task_specific_configs', '{
  "implementation_plan": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 65536, "temperature": 0.7},
  "path_finder": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.3},
  "text_improvement": {"model": "anthropic/claude-sonnet-4", "max_tokens": 4096, "temperature": 0.7},
  "voice_transcription": {"model": "groq/whisper-large-v3-turbo", "max_tokens": 4096, "temperature": 0.0},
  "text_correction": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "path_correction": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.3},
  "regex_pattern_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 1000, "temperature": 0.2},
  "regex_summary_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.3},
  "guidance_generation": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.7},
  "task_enhancement": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7},
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
}'::jsonb, 'Settings for the PathFinder agent functionality')

ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;