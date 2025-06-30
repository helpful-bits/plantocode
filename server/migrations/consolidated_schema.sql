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


-- Customer billing for users
CREATE TABLE IF NOT EXISTS customer_billing (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    auto_top_off_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_top_off_threshold DECIMAL(12, 4),
    auto_top_off_amount DECIMAL(12, 4),
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
    -- Cached token columns for tracking cache usage
    cached_input_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id_timestamp ON api_usage(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_service_name ON api_usage(service_name);

-- API quotas for users per service
CREATE TABLE IF NOT EXISTS api_quotas (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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




-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth0_user_id ON users(auth0_user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_billing_user_id ON customer_billing(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_billing_stripe_customer_id ON customer_billing(stripe_customer_id);

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
-- Load provider data from separate file
\i data_providers.sql

-- Create models table with proper provider relationships
-- Note: price_input and price_output are per 1,000,000 tokens for token-based models
CREATE TABLE IF NOT EXISTS models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    context_window INTEGER NOT NULL DEFAULT 4096,
    price_input DECIMAL(10,6) NOT NULL DEFAULT 0, -- Price per 1,000,000 input tokens
    price_output DECIMAL(10,6) NOT NULL DEFAULT 0, -- Price per 1,000,000 output tokens
    pricing_type VARCHAR(20) DEFAULT 'token_based',
    price_per_hour DECIMAL(12,6) DEFAULT 0.000000,
    minimum_billable_seconds INTEGER DEFAULT 0,
    billing_unit VARCHAR(10) DEFAULT 'tokens',
    provider_id INTEGER REFERENCES providers(id),
    model_type VARCHAR(50) DEFAULT 'text',
    capabilities JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Tiered pricing support for models like Gemini 2.5 Pro
    price_input_long_context DECIMAL(10,6) DEFAULT NULL, -- Long context price per 1,000,000 input tokens
    price_output_long_context DECIMAL(10,6) DEFAULT NULL, -- Long context price per 1,000,000 output tokens
    long_context_threshold INTEGER DEFAULT NULL, -- Token threshold for long context pricing
    -- Cached token pricing columns
    price_cache_write DECIMAL(10,6) DEFAULT NULL, -- Price per 1,000,000 cached write tokens
    price_cache_read DECIMAL(10,6) DEFAULT NULL -- Price per 1,000,000 cached read tokens
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


-- AI model pricing data - Updated with provider relationships and per-million pricing
-- Load model data from separate file
\i data_models.sql


-- Store application-wide configurations, especially those managed dynamically
CREATE TABLE IF NOT EXISTS application_configurations (
config_key TEXT PRIMARY KEY,    -- e.g., 'ai_settings_default_llm_model_id', 'ai_settings_available_models'
config_value JSONB NOT NULL,    -- Store complex configurations as JSONB
description TEXT,               -- Optional description of the configuration
updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_configurations_config_key ON application_configurations(config_key);



-- Default system prompts table for centralized prompt management
CREATE TABLE IF NOT EXISTS default_system_prompts (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL UNIQUE,
    system_prompt TEXT NOT NULL,
    description TEXT,
    version TEXT DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_default_system_prompts_task_type ON default_system_prompts(task_type);

-- Insert all default system prompts - server as source of truth
-- Load system prompts data from separate file
\i data_system_prompts.sql

-- Load application configurations from separate file
\i data_app_configs.sql


-- Enhanced billing tables for 100% implementation

-- Audit logs table for tracking billing and credit management operations
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL, -- 'credit_purchase', 'auto_topoff_enabled', 'payment_method_added', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'customer_billing', 'payment_method', 'invoice', 'credit_transaction', etc.
    entity_id VARCHAR(255), -- ID of the entity being acted upon (customer billing ID, payment method ID, etc.)
    old_values JSONB, -- Previous state before the action
    new_values JSONB, -- New state after the action
    metadata JSONB, -- Additional context like Stripe IDs, reason for change, etc.
    performed_by VARCHAR(100) NOT NULL, -- 'user', 'stripe_webhook', 'admin', 'system'
    ip_address INET, -- IP address if action performed by user
    user_agent TEXT, -- User agent if action performed by user
    session_id VARCHAR(255), -- Session ID if applicable
    request_id VARCHAR(255), -- Request ID for tracing
    status VARCHAR(20) NOT NULL DEFAULT 'completed', -- 'completed', 'failed', 'pending'
    error_message TEXT, -- Error message if status is 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for audit logs performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);

-- Invoice cache table for Stripe invoice data
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(255) PRIMARY KEY, -- Stripe invoice ID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    amount_due DECIMAL(12, 4) NOT NULL,
    status VARCHAR(50) NOT NULL, -- draft, open, paid, void, uncollectible
    invoice_pdf_url TEXT,
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
    card_brand VARCHAR(50), -- visa, mastercard, amex, etc.
    card_last_four VARCHAR(4),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_payment_method_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_customer ON payment_methods(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(is_default);

-- Email notification queue for reliable delivery



-- Insert comprehensive AI task configurations into application_configurations
-- Migration: 003_insert_ai_task_configurations.sql
-- All AI defaults come from the database



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


-- RLS for customer_billing table
ALTER TABLE customer_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own customer billing"
ON customer_billing FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own customer billing"
ON customer_billing FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update their own customer billing"
ON customer_billing FOR UPDATE
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- App service policies for system operations
CREATE POLICY "App can select all customer billing"
ON customer_billing FOR SELECT
TO vibe_manager_app
USING (true);

CREATE POLICY "App can update customer billing"
ON customer_billing FOR UPDATE
TO vibe_manager_app
USING (true)
WITH CHECK (true);

-- DELETE typically handled by backend/service roles.
-- Index idx_customer_billing_user_id already exists.

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



-- RLS for default_system_prompts table
ALTER TABLE default_system_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select default system prompts"
ON default_system_prompts FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- Default system prompts are read-only for the application.
-- INSERT, UPDATE, DELETE typically handled by backend/service roles.

-- RLS for audit_logs table
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "App can manage audit logs"
ON audit_logs FOR ALL
TO vibe_manager_app
USING (true); -- System-level table managed by application for auditing purposes


-- Grant necessary table permissions to vibe_manager_app role
-- These are for system tables that need to be readable by the application
GRANT SELECT ON providers TO vibe_manager_app;
GRANT SELECT ON models TO vibe_manager_app; 
GRANT SELECT ON application_configurations TO vibe_manager_app;
GRANT SELECT ON default_system_prompts TO vibe_manager_app;

-- Grant permissions needed for authentication flow
GRANT SELECT ON users TO vibe_manager_app;
GRANT INSERT, UPDATE ON users TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO vibe_manager_app;

-- Grant permissions needed for billing and credit operations
GRANT SELECT, INSERT, UPDATE ON user_credits TO vibe_manager_app;
GRANT SELECT, INSERT ON credit_transactions TO vibe_manager_app;

-- Grant permissions needed for system operations
GRANT SELECT, INSERT, UPDATE ON webhook_idempotency TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE ON audit_logs TO vibe_manager_app;


-- User credits balance tracking
CREATE TABLE IF NOT EXISTS user_credits (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_credits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Credit transaction history for audit trail
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'purchase', 'consumption', 'refund', 'adjustment', 'expiry'
    amount DECIMAL(12, 4) NOT NULL, -- Positive for additions, negative for deductions
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    description TEXT,
    stripe_charge_id VARCHAR(255), -- For purchases
    related_api_usage_id UUID REFERENCES api_usage(id), -- For consumptions
    metadata JSONB,
    balance_after DECIMAL(12, 4) NOT NULL, -- Balance after this transaction
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_credit_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_transactions_api_usage FOREIGN KEY (related_api_usage_id) REFERENCES api_usage(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_charge ON credit_transactions(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_api_usage ON credit_transactions(related_api_usage_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(created_at DESC);

-- Trigger to update user_credits.updated_at
CREATE OR REPLACE FUNCTION update_user_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_credits_updated_at
    BEFORE UPDATE ON user_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_user_credits_updated_at();

-- RLS for user_credits table
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own credit balance"
ON user_credits FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- App can manage user credit balance for billing operations
CREATE POLICY "App can manage user credit balance"
ON user_credits FOR ALL
TO vibe_manager_app
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- RLS for credit_transactions table
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own credit transactions"
ON credit_transactions FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own credit transactions"
ON credit_transactions FOR INSERT
TO authenticated
WITH CHECK (user_id = get_current_user_id());

-- App can manage credit transactions for billing operations
CREATE POLICY "App can manage credit transactions"
ON credit_transactions FOR ALL
TO vibe_manager_app
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- Enhanced webhook idempotency table with locking, retries, and detailed status tracking
CREATE TABLE IF NOT EXISTS webhook_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_event_id VARCHAR(255) UNIQUE NOT NULL, -- Stripe event ID or external webhook ID
    webhook_type VARCHAR(100) NOT NULL, -- stripe, paypal, custom, etc.
    event_type VARCHAR(100) NOT NULL, -- checkout.session.completed, payment.failed, etc.
    
    -- Processing status and lifecycle
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, skipped
    processing_result VARCHAR(50), -- success, failure, skipped, partial
    processed_at TIMESTAMPTZ,
    
    -- Locking mechanism for concurrent webhook handling
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(255), -- Instance ID or worker ID that acquired the lock
    lock_expires_at TIMESTAMPTZ,
    
    -- Retry mechanism for failed webhooks
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    
    -- Error tracking and debugging
    error_message TEXT,
    error_details JSONB, -- Stack trace, error codes, etc.
    last_error_at TIMESTAMPTZ,
    
    -- Webhook payload and metadata
    webhook_payload JSONB, -- Original webhook payload for debugging/replay
    metadata JSONB, -- Additional processing metadata
    
    -- Audit and timing
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Performance and monitoring
    processing_duration_ms INTEGER, -- How long processing took
    payload_size_bytes INTEGER, -- Size of webhook payload
    
    -- Constraint to ensure lock consistency
    CONSTRAINT webhook_lock_consistency CHECK (
        (locked_at IS NULL) = (locked_by IS NULL AND lock_expires_at IS NULL)
    ),
    
    -- Constraint to ensure retry logic consistency
    CONSTRAINT webhook_retry_consistency CHECK (
        retry_count >= 0 AND retry_count <= max_retries
    )
);


-- Enhanced indexes for the new webhook_idempotency table structure
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_event_id ON webhook_idempotency(webhook_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_type_event ON webhook_idempotency(webhook_type, event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_status ON webhook_idempotency(status);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_processed_at ON webhook_idempotency(processed_at);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_locked_at ON webhook_idempotency(locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_lock_expires ON webhook_idempotency(lock_expires_at) WHERE lock_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_retry_schedule ON webhook_idempotency(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_error_tracking ON webhook_idempotency(last_error_at) WHERE error_message IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_first_seen ON webhook_idempotency(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_updated_at ON webhook_idempotency(updated_at);


-- RLS for webhook_idempotency table
ALTER TABLE webhook_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App can manage webhook idempotency"
ON webhook_idempotency FOR ALL
TO vibe_manager_app
USING (true); -- App service can read/write all webhook records


-- Grant necessary table permissions to authenticated role for user operations
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON customer_billing TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_quotas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_credits TO authenticated;
GRANT SELECT, INSERT ON credit_transactions TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;

-- User billing details table for invoice customization
CREATE TABLE IF NOT EXISTS user_billing_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    tax_id VARCHAR(100),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'US',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_billing_details_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

