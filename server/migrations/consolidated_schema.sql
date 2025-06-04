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
    processing_ms INTEGER NULL,
    input_duration_ms BIGINT NULL,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id_timestamp ON api_usage(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_service_name ON api_usage(service_name);

-- API quotas for users per service
CREATE TABLE IF NOT EXISTS api_quotas (
    id SERIAL PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_api_quotas_user_id ON api_quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_api_quotas_service_name ON api_quotas(service_name);

-- Service pricing configuration
CREATE TABLE IF NOT EXISTS service_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT UNIQUE NOT NULL,
    input_token_price DECIMAL(10,8) NOT NULL,
    output_token_price DECIMAL(10,8) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    unit VARCHAR(50) NOT NULL DEFAULT 'per_1000_tokens',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_pricing_service_name ON service_pricing(service_name);

-- Subscription plans (must come before user_spending_limits due to foreign key)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_price_weekly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    base_price_monthly DECIMAL(10, 2) NOT NULL,
    base_price_yearly DECIMAL(10, 2) NOT NULL,
    included_spending_weekly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    included_spending_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    overage_rate DECIMAL(5, 4) NOT NULL DEFAULT 1.0000,
    hard_limit_multiplier DECIMAL(3, 2) NOT NULL DEFAULT 2.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    stripe_price_id_weekly VARCHAR(100),
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
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'models_provider_id_not_null') THEN
        ALTER TABLE models 
        ADD CONSTRAINT models_provider_id_not_null 
        CHECK (provider_id IS NOT NULL);
    END IF;
END $$;


-- AI model pricing data - Updated with provider relationships
INSERT INTO models (id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, provider_id, model_type, capabilities, status, description)
VALUES
-- Anthropic models
('anthropic/claude-opus-4',        'Claude 4 Opus',       200000, 0.015000, 0.075000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Advanced language model with strong reasoning capabilities'),
('anthropic/claude-sonnet-4',      'Claude 4 Sonnet',     200000, 0.003000, 0.015000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Balanced language model with strong reasoning capabilities'),
('claude-opus-4-20250522',         'Claude Opus 4 (2025-05-22)', 200000, 0.015000, 0.075000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}', 'active', 'Claude Opus 4 with 2025-05-22 training cutoff'),
('claude-3-7-sonnet-20250219',     'Claude 3.7 Sonnet (2025-02-19)', 200000, 0.003000, 0.015000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}', 'active', 'Claude 3.7 Sonnet with 2025-02-19 training cutoff'),

-- OpenAI models  
('openai/gpt-4.1',                 'GPT-4.1',            1000000, 0.002000, 0.008000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Advanced GPT model with broad capabilities'),
('openai/gpt-4.1-mini',            'GPT-4.1 Mini',       1000000, 0.000400, 0.001600, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Efficient GPT model for cost-sensitive applications'),

-- Google models
('google/gemini-2.5-pro-preview',  'Gemini 2.5 Pro',     1000000, 0.001250, 0.010000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "multimodal": true, "code": true}', 'active', 'Multimodal AI model with advanced reasoning'),
('google/gemini-2.5-flash-preview-05-20', 'Gemini 2.5 Flash', 1000000, 0.000075, 0.000300, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text_generation', '{"text_generation": true, "code_generation": true, "reasoning": true}', 'active', 'Google Gemini 2.5 Flash - Fast and efficient text generation model'),
('google/gemini-2.5-flash-preview-05-20:thinking', 'Gemini 2.5 Flash Thinking', 1000000, 0.000075, 0.000300, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text_generation', '{"text_generation": true, "code_generation": true, "reasoning": true, "thinking": true}', 'active', 'Google Gemini 2.5 Flash with thinking capabilities'),

-- DeepSeek models
('deepseek/deepseek-r1',           'DeepSeek R1',         65536, 0.000550, 0.002190, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'deepseek'), 'reasoning', '{"text_generation": true, "code_generation": true, "reasoning": true, "thinking": true}', 'active', 'DeepSeek R1 - Advanced reasoning model'),
('deepseek/deepseek-r1-distill-qwen-32b', 'DeepSeek R1 Distill Qwen 32B', 32768, 0.000140, 0.000280, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'deepseek'), 'reasoning', '{"text_generation": true, "code_generation": true, "reasoning": true}', 'active', 'DeepSeek R1 Distilled Qwen 32B - Efficient reasoning model'),
('deepseek/deepseek-r1-distill-qwen-14b', 'DeepSeek R1 Distill Qwen 14B', 32768, 0.000070, 0.000140, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'deepseek'), 'reasoning', '{"text_generation": true, "code_generation": true, "reasoning": true}', 'active', 'DeepSeek R1 Distilled Qwen 14B - Compact reasoning model'),

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
    base_price_weekly, base_price_monthly, base_price_yearly,
    included_spending_weekly, included_spending_monthly, overage_rate, hard_limit_multiplier,
    currency, stripe_price_id_weekly, stripe_price_id_monthly, stripe_price_id_yearly, features
) VALUES 
('free', 'Free', 'Perfect for trying out AI features', 
 0.00, 0.00, 0.00, 1.25, 5.00, 1.0000, 2.00, 'USD',
 NULL, NULL, NULL,
 '{
   "coreFeatures": ["Basic AI models", "Community support", "Usage analytics"],
   "allowedModels": ["anthropic/claude-sonnet-4", "openai/gpt-4.1-mini"],
   "supportLevel": "Community",
   "apiAccess": false,
   "analyticsLevel": "Basic",
   "spendingDetails": {
     "overagePolicy": "none",
     "hardCutoff": true
   }
 }'::jsonb),
 
('pro', 'Pro', 'For power users and small teams', 
 5.00, 20.00, 200.00, 12.50, 50.00, 1.0000, 3.00, 'USD',
 NULL, NULL, NULL,
 '{
   "coreFeatures": ["All AI models", "Priority support", "Advanced analytics", "API access"],
   "allowedModels": ["all"],
   "supportLevel": "Priority",
   "apiAccess": true,
   "analyticsLevel": "Advanced",
   "spendingDetails": {
     "overagePolicy": "standard_rate",
     "hardCutoff": true
   }
 }'::jsonb),
 
('enterprise', 'Enterprise', 'For organizations with high AI usage', 
 25.00, 100.00, 1000.00, 50.00, 200.00, 0.9000, 5.00, 'USD',
 NULL, NULL, NULL,
 '{
   "coreFeatures": ["All AI models", "Dedicated support", "Custom integrations", "Advanced analytics", "Team management", "SLA guarantee"],
   "allowedModels": ["all"],
   "supportLevel": "Dedicated",
   "apiAccess": true,
   "analyticsLevel": "Enterprise",
   "spendingDetails": {
     "overagePolicy": "negotiated_rate",
     "hardCutoff": false
   }
 }'::jsonb)
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
  "path_finder": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 8192, "temperature": 0.3},
  "text_improvement": {"model": "anthropic/claude-sonnet-4", "max_tokens": 4096, "temperature": 0.7},
  "voice_transcription": {"model": "groq/whisper-large-v3-turbo", "max_tokens": 4096, "temperature": 0.0},
  "text_correction": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "path_correction": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 4096, "temperature": 0.3},
  "regex_pattern_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 1000, "temperature": 0.2},
  "regex_summary_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.3},
  "guidance_generation": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.7},
  "task_enhancement": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7},
  "extended_path_finder": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 8192, "temperature": 0.3},
  "extended_path_correction": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 4096, "temperature": 0.3},
  "file_relevance_assessment": {"model": "google/gemini-2.5-flash-preview-05-20", "max_tokens": 24000, "temperature": 0.3},
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

-- Row Level Security Policies
-- Enable RLS and define security policies for database tables
-- to ensure users can only access data they own or have explicit permissions for
-- 
-- Note: These policies are designed for application-level security.
-- The application should set the current user context using SET LOCAL current_user_id = '...'
-- before making database queries to ensure proper row-level security enforcement.

-- Create authenticated role for RLS policies
CREATE ROLE IF NOT EXISTS authenticated;
CREATE ROLE IF NOT EXISTS vibe_manager_app;

-- Grant vibe_manager_app ability to switch to authenticated role (for user pool connections)
GRANT authenticated TO vibe_manager_app;

-- Create helper function to safely get current user ID for RLS
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
BEGIN
    DECLARE
        user_id_str TEXT;
    BEGIN
        user_id_str := current_setting('app.current_user_id', true);
        IF user_id_str = '' OR user_id_str IS NULL THEN
            RETURN NULL;
        END IF;
        RETURN user_id_str::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own record" ON users;
CREATE POLICY "Users can select their own record"
ON users FOR SELECT
TO authenticated
USING (id = get_current_user_id());

DROP POLICY IF EXISTS "Users can update their own record" ON users;
CREATE POLICY "Users can update their own record"
ON users FOR UPDATE
TO authenticated
USING (id = get_current_user_id())
WITH CHECK (id = get_current_user_id());

DROP POLICY IF EXISTS "Users can insert their own record" ON users;
CREATE POLICY "Users can insert their own record"
ON users FOR INSERT
TO authenticated
WITH CHECK (id = get_current_user_id());

-- Special policy for Auth0 authentication lookup (bypasses user context requirement)
CREATE POLICY "App can lookup users by Auth0 ID for authentication"
ON users FOR SELECT
TO vibe_manager_app
USING (auth0_user_id IS NOT NULL);

-- Note: DELETE is typically handled by backend/service roles, not direct user RLS.
-- Ensure users.id is indexed (Primary Key implicitly creates an index).

-- RLS for refresh_tokens table
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own refresh tokens" ON refresh_tokens;
CREATE POLICY "Users can access their own refresh tokens"
ON refresh_tokens FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- Index idx_refresh_tokens_user_id already exists.

-- RLS for user_settings table
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
ON user_settings FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- user_settings.user_id is PK, indexed.

-- RLS for subscriptions table
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own subscription"
ON subscriptions FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own subscription"
ON subscriptions FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- UPDATE, DELETE typically handled by backend/service roles.
-- Index idx_subscriptions_user_id already exists.

-- RLS for api_usage table
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own API usage"
ON api_usage FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own API usage"
ON api_usage FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- UPDATE, DELETE typically handled by backend/service roles.
-- Index idx_api_usage_user_id_timestamp already exists.

-- RLS for subscription_plans table
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select subscription plans"
ON subscription_plans FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- Could also be TO anon, authenticated if plans are shown to non-logged-in users.
-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- RLS for user_spending_limits table
ALTER TABLE user_spending_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own spending limits"
ON user_spending_limits FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own spending limits"
ON user_spending_limits FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- App can manage user spending limits for billing operations
CREATE POLICY "App can select user spending limits"
ON user_spending_limits FOR SELECT
TO vibe_manager_app
USING (user_id = get_current_user_id());

CREATE POLICY "App can insert user spending limits"
ON user_spending_limits FOR INSERT
TO vibe_manager_app
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "App can update user spending limits"
ON user_spending_limits FOR UPDATE
TO vibe_manager_app
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- Index idx_user_spending_limits_user_period already exists.

-- RLS for projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select projects they own or are members of"
ON projects FOR SELECT
TO authenticated
USING (
  (get_current_user_id() = owner_id) OR
  (EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = projects.id AND pm.user_id = get_current_user_id()
  ))
);

CREATE POLICY "Users can insert new projects"
ON projects FOR INSERT
TO authenticated
WITH CHECK (get_current_user_id() = owner_id);

CREATE POLICY "Users can update projects they own"
ON projects FOR UPDATE
TO authenticated
USING ((get_current_user_id() = owner_id))
WITH CHECK ((get_current_user_id() = owner_id));

CREATE POLICY "Users can delete projects they own"
ON projects FOR DELETE
TO authenticated
USING ((get_current_user_id() = owner_id));

-- Index idx_projects_owner_id already exists.
-- Ensure projects.id is indexed (PK) for join performance.

-- RLS for project_members table
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select memberships of projects they are part of or own"
ON project_members FOR SELECT
TO authenticated
USING (
  (get_current_user_id() = user_id) OR
  (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND p.owner_id = get_current_user_id()
  ))
);

CREATE POLICY "Project owners can insert project members"
ON project_members FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND p.owner_id = get_current_user_id()
  )
  -- Ensure user_id being added is not the owner_id again unless intended
  -- AND project_members.user_id != (SELECT p.owner_id FROM projects p WHERE p.id = project_members.project_id)
);

CREATE POLICY "Project owners can update project members"
ON project_members FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND p.owner_id = get_current_user_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND p.owner_id = get_current_user_id()
  )
  -- Ensure the role being set is valid if project_members.role has constraints
  -- (No changes needed here if the main check is sufficient for the updated row)
);


CREATE POLICY "Users can delete their own membership or owners can delete any member"
ON project_members FOR DELETE
TO authenticated
USING (
  (get_current_user_id() = user_id) OR
  (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND p.owner_id = get_current_user_id()
  ))
);

-- project_members.project_id and project_members.user_id are part of PK, indexed.

-- RLS for spending_alerts table
ALTER TABLE spending_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own spending alerts"
ON spending_alerts FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can acknowledge their own spending alerts"
ON spending_alerts FOR UPDATE
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id() AND acknowledged = true); -- Only allow update to acknowledge

CREATE POLICY "Users can insert their own spending alerts"
ON spending_alerts FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- DELETE typically handled by backend/service roles.
-- Index idx_spending_alerts_user_period already exists.

-- RLS for user_preferences table
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
ON user_preferences FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- user_preferences.user_id is PK, indexed.

-- RLS for providers table
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select providers"
ON providers FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- RLS for models table
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select models"
ON models FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- RLS for application_configurations table
ALTER TABLE application_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select application configurations"
ON application_configurations FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- RLS for invoices table
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own invoices"
ON invoices FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own invoices"
ON invoices FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- UPDATE, DELETE typically handled by backend/service roles.
-- Index idx_invoices_user_id already exists.

-- RLS for payment_methods table
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own payment methods"
ON payment_methods FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- Index idx_payment_methods_user_id already exists.

-- RLS for email_notifications table
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own email notifications"
ON email_notifications FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own email notifications"
ON email_notifications FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- UPDATE, DELETE typically handled by backend/service roles.
-- Index idx_email_notifications_user_id already exists.

-- RLS for spending_periods table
ALTER TABLE spending_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own spending periods"
ON spending_periods FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own spending periods"
ON spending_periods FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- UPDATE, DELETE typically handled by backend/service roles.
-- Index idx_spending_periods_user_period already exists.

-- RLS for api_quotas table
ALTER TABLE api_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own API quotas"
ON api_quotas FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own API quotas"
ON api_quotas FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- UPDATE, DELETE typically handled by backend/service roles.
-- Index idx_api_quotas_user_id already exists.

-- RLS for service_pricing table
ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select service pricing"
ON service_pricing FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- RLS for billing_configurations table
ALTER TABLE billing_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select billing configurations"
ON billing_configurations FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- These configurations contain billing URLs and email templates needed by the application.
-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- Grant necessary table permissions to vibe_manager_app role
-- These are for system tables that need to be readable by the application
GRANT SELECT ON providers TO vibe_manager_app;
GRANT SELECT ON models TO vibe_manager_app; 
GRANT SELECT ON application_configurations TO vibe_manager_app;
GRANT SELECT ON subscription_plans TO vibe_manager_app;
GRANT SELECT ON service_pricing TO vibe_manager_app;
GRANT SELECT ON billing_configurations TO vibe_manager_app;

-- Grant permissions needed for authentication flow
GRANT SELECT ON users TO vibe_manager_app;
GRANT INSERT, UPDATE ON users TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO vibe_manager_app;

-- Grant necessary table permissions to authenticated role for user operations
GRANT SELECT, INSERT, UPDATE ON user_spending_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON spending_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT SELECT ON subscription_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON spending_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON email_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_quotas TO authenticated;