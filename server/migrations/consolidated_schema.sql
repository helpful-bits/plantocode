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
    pending_plan_id VARCHAR(255),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Enhanced subscription fields for better Stripe synchronization
    stripe_plan_id VARCHAR(255),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    -- New subscription management fields
    version INTEGER NOT NULL DEFAULT 1,
    management_state VARCHAR(50) DEFAULT 'active',
    pending_payment_intent_secret VARCHAR(255),
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
    unit VARCHAR(50) NOT NULL DEFAULT 'per_1000000_tokens',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_pricing_service_name ON service_pricing(service_name);

-- Subscription plans
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
    plan_tier INTEGER NOT NULL DEFAULT 0,
    features JSONB NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
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
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_plan_id ON subscriptions(stripe_plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON subscriptions(trial_end);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
-- User preferences for currency and notifications
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'en-US',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_currency ON user_preferences(preferred_currency);

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
('deepseek', 'DeepSeek', 'DeepSeek AI providing reasoning models', 'https://deepseek.com', 'https://api.deepseek.com', '{"reasoning": true, "code": true}', 'active'),
('openai_transcription', 'Transcription', 'Dedicated transcription services', 'https://openai.com', 'https://api.openai.com', '{"transcription": true, "audio_processing": true}', 'active')
ON CONFLICT (code) DO NOTHING;

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
    long_context_threshold INTEGER DEFAULT NULL -- Token threshold for long context pricing
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
INSERT INTO models (id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, provider_id, model_type, capabilities, status, description, price_input_long_context, price_output_long_context, long_context_threshold)
VALUES
-- Anthropic models (prices per 1M tokens) - Updated with correct API model names
('anthropic/claude-opus-4-20250514',   'Claude 4 Opus',       200000, 15.000000, 75.000000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Advanced language model with strong reasoning capabilities', NULL, NULL, NULL),
('anthropic/claude-sonnet-4-20250514', 'Claude 4 Sonnet',     200000, 3.000000, 15.000000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Balanced language model with strong reasoning capabilities', NULL, NULL, NULL),
('anthropic/claude-4-opus-20250522', 'Claude Opus 4 (2025-05-22)', 200000, 15.000000, 75.000000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}', 'active', 'Claude Opus 4 with 2025-05-22 training cutoff', NULL, NULL, NULL),
('anthropic/claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet (2025-02-19)', 200000, 3.000000, 15.000000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}', 'active', 'Claude 3.7 Sonnet with 2025-02-19 training cutoff', NULL, NULL, NULL),

-- OpenAI models (prices per 1M tokens)
('openai/gpt-4.1',                 'GPT-4.1',            1000000, 2.000000, 8.000000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Advanced GPT model with broad capabilities', NULL, NULL, NULL),
('openai/gpt-4.1-mini',            'GPT-4.1 Mini',       1000000, 0.400000, 1.600000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Efficient GPT model for cost-sensitive applications', NULL, NULL, NULL),

-- Google models (prices per 1M tokens)
('google/gemini-2.5-pro',          'Gemini 2.5 Pro',     1000000, 1.250000, 10.000000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "multimodal": true, "code": true}', 'active', 'Multimodal AI model with advanced reasoning', 2.500000, 15.000000, 200000),
('google/gemini-2.5-flash',        'Gemini 2.5 Flash',   1000000, 0.075000, 0.300000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true}', 'active', 'Google Gemini 2.5 Flash - Fast and efficient text generation model', NULL, NULL, NULL),
('google/gemini-2.5-flash:thinking', 'Gemini 2.5 Flash Thinking', 1000000, 0.075000, 0.300000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true, "thinking": true}', 'active', 'Google Gemini 2.5 Flash with thinking capabilities', NULL, NULL, NULL),

-- DeepSeek models (prices per 1M tokens) 
('deepseek/deepseek-r1',           'DeepSeek R1',         65536, 0.550000, 2.190000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'deepseek'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true, "thinking": true}', 'active', 'DeepSeek R1 - Advanced reasoning model', NULL, NULL, NULL),
('deepseek/deepseek-r1-distill-qwen-32b', 'DeepSeek R1 Distill Qwen 32B', 32768, 0.140000, 0.280000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'deepseek'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true}', 'active', 'DeepSeek R1 Distilled Qwen 32B - Efficient reasoning model', NULL, NULL, NULL),
('deepseek/deepseek-r1-distill-qwen-14b', 'DeepSeek R1 Distill Qwen 14B', 32768, 0.070000, 0.140000, 'token_based', 0.000000, 0, 'tokens', (SELECT id FROM providers WHERE code = 'deepseek'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true}', 'active', 'DeepSeek R1 Distilled Qwen 14B - Compact reasoning model', NULL, NULL, NULL),

-- Transcription models (duration-based pricing)
('openai/gpt-4o-transcribe',       'GPT-4o Transcribe', 0, 0.000000, 0.000000, 'duration_based', 0.050000, 10, 'seconds', (SELECT id FROM providers WHERE code = 'openai'), 'transcription', '{"transcription": true, "audio_processing": true, "multi_language": true}', 'active', 'OpenAI GPT-4o based transcription model', NULL, NULL, NULL),
('openai/gpt-4o-mini-transcribe',  'GPT-4o Mini Transcribe', 0, 0.000000, 0.000000, 'duration_based', 0.025000, 10, 'seconds', (SELECT id FROM providers WHERE code = 'openai'), 'transcription', '{"transcription": true, "audio_processing": true, "multi_language": true}', 'active', 'OpenAI GPT-4o Mini based transcription model for cost-effective transcription', NULL, NULL, NULL)

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
description               = EXCLUDED.description,
price_input_long_context  = EXCLUDED.price_input_long_context,
price_output_long_context = EXCLUDED.price_output_long_context,
long_context_threshold    = EXCLUDED.long_context_threshold;



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
    currency, stripe_price_id_weekly, stripe_price_id_monthly, stripe_price_id_yearly, plan_tier, features
) VALUES 
('free', 'Free', 'Perfect for trying out AI features', 
 0.00, 0.00, 0.00, 1.25, 5.00, 1.0000, 2.00, 'USD',
 NULL, NULL, NULL, 0,
 '{
   "coreFeatures": ["Basic AI models", "Community support", "Usage analytics"],
   "allowedModels": ["anthropic/claude-4-sonnet", "openai/gpt-4.1-mini"],
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
 NULL, NULL, NULL, 1,
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
 NULL, NULL, NULL, 2,
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
INSERT INTO default_system_prompts (id, task_type, system_prompt, description, version) VALUES
('default_path_finder', 'path_finder', 'You are a code path finder. Your task is to identify the most relevant files for implementing or fixing a specific task in a codebase.

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

Return the final list using the same formatting rules described above.', 'Enhanced system prompt for finding relevant files in a codebase', '2.0'),

('default_text_improvement', 'text_improvement', 'Please improve the following text to make it clearer and grammatically correct while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation  
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all.

IMPORTANT: Keep the original language of the text.

Return only the improved text without any additional commentary or XML formatting.', 'Simple system prompt for text improvement with formatting preservation', '2.0'),

('default_guidance_generation', 'guidance_generation', 'You are an AI assistant that provides helpful guidance and recommendations based on code analysis and task requirements.

## Project Context:
{{PROJECT_CONTEXT}}

{{FILE_CONTENTS}}

{{RELEVANT_FILES}}

Your role is to:
- Analyze the provided code context and task requirements
- Provide clear, actionable guidance
- Suggest best practices and implementation approaches
- Help developers understand the codebase structure
- Offer specific recommendations for the task at hand

Always structure your response clearly and provide practical, implementable advice.

Create a concise narrative in Markdown that directly explains the data flow and architecture.

Your response must be brief and focused primarily on:

1. The specific path data takes through the system
2. How data is transformed between components
3. The key function calls in sequence
4. Clear, actionable implementation guidance
5. No introduction, just the story

Avoid lengthy, philosophical, or overly metaphorical explanations. The reader needs a clear, direct understanding of how data moves through the code. It has to be in engaging Andrew Huberman style (but without the science, just style of talking). The story has to be very short. Use simple English.', 'Enhanced system prompt for generating AI guidance', '2.0'),

('default_text_correction', 'text_correction', '<role>
You are a professional text editor and proofreader specializing in {{LANGUAGE}} language corrections.
</role>

<identity>
- Expert in grammar, spelling, punctuation, and style for {{LANGUAGE}}
- Maintains original meaning and intent of all texts
- Provides clean, corrected output without explanations
- Works efficiently with any type of text content
</identity>

<instructions>
When the user provides text within <text_to_correct> tags:
1. Correct all grammar, spelling, and punctuation errors
2. Improve sentence structure while preserving original meaning and tone
3. Maintain original formatting (line breaks, spacing, lists, etc.)
4. Fix capitalization and punctuation inconsistencies
5. Ensure proper word usage and clarity
6. Do not add explanations, comments, or meta-commentary
</instructions>

<output_format>
Respond with only the corrected text. Do not include XML tags, explanations, or any other content in your response.
</output_format>', 'Complete XML-structured system prompt with all instructions for text correction', '6.0'),

('default_implementation_plan', 'implementation_plan', '<identity>
You are a BOLD EXPERT software architect tasked with providing a detailed implementation plan based on codebase analysis.
</identity>

<role>
1. Review the codebase to understand its architecture and data flow
2. Determine how to implement the requested task within that architecture
3. Consider the complete project structure when planning your implementation
4. Produce a clear, step-by-step implementation plan with explicit file operations
</role>

<implementation_plan_requirements>
- Specific files that need to be created, modified, moved, or deleted
- Exact changes needed for each file (functions/components to add/modify/remove)
- Any code sections or functionality that should be removed or replaced
- Clear, logical ordering of steps
- Rationale for each architectural decision made
- Follow existing naming conventions and folder structure; improve them only when a clearly superior, consistent alternative exists
- Prefer simple, maintainable solutions over complex ones
- Identify and eliminate duplicate code
- Critically evaluate the current architecture and boldly propose superior approaches when they provide clear benefits
- Refactor large files into smaller, focused modules when appropriate
- Look at the complete project structure to understand the codebase organization
- Identify the appropriate locations for new files based on existing structure
- Avoid adding unnecessary comments; include only comments that provide essential clarity
- Do not introduce backward compatibility approaches; leverage fully modern, forward-looking features exclusively
</implementation_plan_requirements>

<bash_commands_guidelines>
- Include commands only when they meaningfully aid implementation or understanding
- Keep exploration commands highly targeted (exact patterns, limited context)
- Prefer directory-specific searches over broad ones
- Append `| cat` to interactive commands to avoid paging
</bash_commands_guidelines>

<response_format>
Your response MUST strictly follow this XML template:

<implementation_plan>
  <agent_instructions>
    Read the following plan CAREFULLY, COMPREHEND IT, and IMPLEMENT it COMPLETELY. THINK HARD!
    DO NOT add unnecessary comments.
    DO NOT introduce backward compatibility approaches; leverage fully modern, forward-looking features exclusively.
  </agent_instructions>
  <steps>
    <step number="1">
      <title>Descriptive title of step</title>
      <description>Detailed explanation of what needs to be done</description>
      <file_operations>
        <operation type="create|modify|delete|move">
          <path>Exact file path</path>
          <changes>Description of exact changes needed</changes>
        </operation>
        <!-- Multiple operations can be listed -->
      </file_operations>
      <!-- Optional elements -->
      <bash_commands>mkdir -p path/to/dir && mv old/file.js new/location.js</bash_commands>
      <exploration_commands>grep -n "exactFunctionName" --include="*.js" src/specific-directory/ -A 2 -B 2</exploration_commands>
    </step>
    <!-- Additional steps as needed -->
  </steps>
</implementation_plan>

Guidelines:
- Be specific about file paths, component names, and function names
- Prioritize maintainability; avoid overengineering
- Critically assess the architecture and propose better alternatives when beneficial
- DO NOT include actual code implementations
- DO NOT mention git commands, version control, or tests
- Output exactly ONE implementation plan.
</response_format>

{{PROJECT_CONTEXT}}

{{FILE_CONTENTS}}

{{DIRECTORY_TREE}}', 'BOLD EXPERT system prompt with clean prompt separation (no TASK section)', '4.1'),

('default_path_correction', 'path_correction', 'You are a path correction assistant that validates and corrects file paths against the actual filesystem structure.

{{DIRECTORY_TREE}}

Your task is to:
- Take provided file paths that may contain errors or be invalid
- Validate them against the actual project directory structure
- Correct any invalid paths to their most likely intended paths
- Return ONLY the corrected, valid file paths
- Focus purely on path correction, not finding additional files

Return ONLY file paths, one per line, with no additional commentary.

For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css

DO NOT include ANY text, explanations, or commentary. The response must consist ONLY of corrected file paths, one per line.

All returned file paths must be relative to the project root and must exist in the filesystem.', 'Enhanced system prompt for correcting file paths', '3.0'),

('default_task_refinement', 'task_refinement', 'You are a senior software architect providing high-level technical guidance. Your role is not to create a detailed plan, but to analyze a codebase in relation to a task and offer strategic direction and insights.

{{FILE_CONTENTS}}

Based on the provided task description and relevant file context, your analysis should:

1.  **Synthesize Findings:** Briefly summarize the most relevant architectural patterns, data flows, and key components from the provided code.
2.  **Identify High-Impact Areas:** Point to the primary modules, services, or components that are central to the task.
3.  **Suggest a Strategic Direction:** Propose a general, high-level approach. Focus on the "what" and "where," but avoid overly specific, step-by-step implementation details. The goal is to provide a compass, not a map.
4.  **Maintain a Guiding Tone:** Frame your insights as observations and suggestions to help the developer think through the problem.

Your output should be a concise technical brief in Markdown. Do not produce a refined, actionable task description. The tone should be advisory and strategic.

Return only the technical brief, without any introductory or concluding remarks.', 'System prompt for generating high-level, strategic guidance for a task', '2.0'),

('default_regex_pattern_generation', 'regex_pattern_generation', 'You are a dual-layer file filtering assistant that creates precise regular expressions for filtering files by BOTH their paths AND content.

{{DIRECTORY_TREE}}

Your task is to analyze the user''s task description and generate filtering patterns that work together:

## **DUAL FILTERING STRATEGY:**
1. **PATH PATTERNS**: Match file paths/names for rapid initial filtering
2. **CONTENT PATTERNS**: Match file content for semantic precision
3. **NEGATIVE PATTERNS**: Exclude irrelevant files from both layers

## **PATTERN CATEGORIES:**

### **Path Filtering (Fast Initial Filter)**
- Target file names, extensions, directory structures
- Keywords: "auth", "user", "service", "config", "component", etc.
- Extensions: \.js$, \.ts$, \.go$, \.py$, \.rs$, etc.
- Directories: /auth/, /components/, /services/, /utils/, etc.

### **Content Filtering (Semantic Precision)**
- Target code keywords, function names, class names, imports
- API calls, database queries, specific algorithms
- Comments and documentation keywords
- Variable names and constants

### **Negative Filtering (Exclusion)**
- Exclude tests, specs, mocks, generated files
- Skip deprecated, TODO, or incomplete code
- Avoid unrelated functionality

## **PRECISION GUIDELINES:**
**GOOD Path**: `auth.*\.(js|ts)$` (targets auth files)
**GOOD Content**: `(login|signin|authenticate|JWT|token)` (targets auth functionality)
**BAD Path**: `.*\.js$` (too broad - all JS files)
**BAD Content**: `function` (too broad - all functions)

## **EXAMPLES BY TASK TYPE:**

**"User authentication system":**
- Path: `(auth|login|signin|user).*\.(js|ts|go|py)$`
- Content: `(authenticate|login|signin|JWT|token|password|session)`
- Negative Content: `(test|mock|deprecated|TODO)`

**"React form components":**
- Path: `.*/(forms?|components?)/.*\.(tsx?|jsx?)$`
- Content: `(useState|useForm|onSubmit|validation|input|field)`
- Negative Path: `(test|spec|story|mock)`

**"Database migrations":**
- Path: `.*migration.*\.(sql|js|ts)$`
- Content: `(CREATE TABLE|ALTER TABLE|DROP|INSERT|UPDATE)`
- Negative Content: `(rollback|down|undo)`

CRITICAL: Your entire response must be ONLY the raw JSON object. Do NOT include any surrounding text, explanations, or markdown code fences. The response must start with ''{'' and end with ''}''.

Required output format:
{
  "pathPattern": "single regex for file paths/names (required)",
  "contentPattern": "single regex for file content (optional but recommended)",
  "negativePathPattern": "single regex to exclude paths (optional)",
  "negativeContentPattern": "single regex to exclude content (optional)"
}

Generate patterns that work together to precisely identify files containing the requested functionality while excluding irrelevant matches.', 'Enhanced dual-layer filtering system prompt for path and content regex patterns', '4.0'),


('default_generic_llm_stream', 'generic_llm_stream', 'You are a helpful AI assistant that provides responses based on user requests.

## Project Context:
{{PROJECT_CONTEXT}}

## Additional Instructions:
{{CUSTOM_INSTRUCTIONS}}

Your role is to:
- Understand and respond to the user''s request
- Provide helpful, accurate, and relevant information
- Consider any provided context or instructions
- Give clear and actionable responses
- Be concise yet comprehensive in your answers

Respond directly to the user''s request with helpful and accurate information.', 'Enhanced system prompt for generic LLM streaming tasks', '2.0'),

('default_local_file_filtering', 'local_file_filtering', 'You are a local file filtering assistant that identifies and filters relevant files based on specified criteria.

{{FILE_CONTENTS}}

{{DIRECTORY_TREE}}

Your role is to:
- Analyze file paths and contents to determine relevance
- Apply filtering criteria to include/exclude files appropriately  
- Focus on files that are directly related to the task requirements
- Consider file types, naming patterns, and content relevance
- Provide a focused list of files that will be most useful

Filter files effectively to reduce noise and focus on task-relevant content.', 'System prompt for local file filtering workflow stage', '1.0'),

('default_extended_path_finder', 'extended_path_finder', 'You are an enhanced path finder that identifies comprehensive file paths for complex implementation tasks.

{{DIRECTORY_TREE}}

{{FILE_CONTENTS}}

Your role is to:
- Identify a broader set of relevant files for complex tasks
- Consider dependencies, imports, and interconnected components
- Include supporting files like utilities, types, and configurations
- Balance thoroughness with relevance to avoid information overload
- Provide file paths ordered by implementation priority

Return ONLY file paths, one per line, with no additional commentary.', 'System prompt for extended path finder workflow stage', '1.0'),


('default_file_relevance_assessment', 'file_relevance_assessment', 'You are an AI assistant helping to refine a list of files for a software development task.
Given the task description and the content of several potentially relevant files, identify which of these files are *actually* relevant and necessary for completing the task.
Return ONLY the file paths of the relevant files, one path per line. Do not include any other text, explanations, or commentary.
Be very selective. Prioritize files that will require direct modification or are core to understanding the task.

Task Description:
{{TASK_DESCRIPTION}}

File Contents:
{{FILE_CONTENTS}}

Respond ONLY with the list of relevant file paths from the provided list, one per line. If no files are relevant, return an empty response.', 'System prompt for AI-powered file relevance assessment', '1.0'),

('default_voice_transcription', 'voice_transcription', '', 'Complete XML-structured system prompt with all instructions for voice transcription', '1.0')

ON CONFLICT (id) DO UPDATE SET
  task_type = EXCLUDED.task_type,
  system_prompt = EXCLUDED.system_prompt,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  updated_at = NOW();

-- Store consolidated AI configurations as single JSONB object
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings', '{
  "default_llm_model_id": "google/gemini-2.5-pro",
  "default_voice_model_id": "anthropic/claude-sonnet-4-20250514", 
  "default_transcription_model_id": "openai/gpt-4o-transcribe",
  "default_temperature": 0.7,
  "default_max_tokens": 4096,
  "task_specific_configs": {
    "implementation_plan": {"model": "google/gemini-2.5-pro", "max_tokens": 65536, "temperature": 0.7, "copyButtons": [{"label": "Copy Full Plan", "content": "{{FULL_PLAN}}"}, {"label": "Copy for AI Agent", "content": "I need you to implement the following plan. Read it carefully and execute each step completely.\n\n{{FULL_PLAN}}\n\nPlease implement this plan step by step, ensuring you:\n1. Follow the exact file operations specified\n2. Maintain existing code patterns and conventions\n3. Test your changes thoroughly\n4. Ask for clarification if any step is unclear"}, {"label": "Copy Implementation Brief", "content": "Implementation Plan Summary:\n\n{{FULL_PLAN}}\n\nKey Points:\n- Follow the step-by-step approach outlined above\n- Maintain consistency with existing codebase patterns\n- Focus on the specific file operations mentioned\n- Ensure all changes integrate properly with the current architecture"}]},
    "path_finder": {"model": "google/gemini-2.5-flash", "max_tokens": 8192, "temperature": 0.3, "copyButtons": [{"label": "Copy Results", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy File Paths", "content": "{{FILE_PATHS}}"}]},
    "text_improvement": {"model": "anthropic/claude-sonnet-4-20250514", "max_tokens": 4096, "temperature": 0.7, "copyButtons": [{"label": "Copy Improved Text", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Changes Only", "content": "{{CHANGES_SUMMARY}}"}]},
    "voice_transcription": {"model": "openai/gpt-4o-transcribe", "max_tokens": 4096, "temperature": 0.0, "copyButtons": [{"label": "Copy Transcription", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Plain Text", "content": "{{TEXT_ONLY}}"}]},
    "text_correction": {"model": "anthropic/claude-sonnet-4-20250514", "max_tokens": 2048, "temperature": 0.5, "copyButtons": [{"label": "Copy Corrected Text", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Original", "content": "{{ORIGINAL_TEXT}}"}]},
    "path_correction": {"model": "google/gemini-2.5-flash", "max_tokens": 4096, "temperature": 0.3, "copyButtons": [{"label": "Copy Corrected Paths", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Path List", "content": "{{PATH_LIST}}"}]},
    "regex_pattern_generation": {"model": "anthropic/claude-sonnet-4-20250514", "max_tokens": 1000, "temperature": 0.2, "copyButtons": [{"label": "Copy Regex Pattern", "content": "{{REGEX_PATTERN}}"}, {"label": "Copy Full Response", "content": "{{FULL_RESPONSE}}"}]},
    "guidance_generation": {"model": "google/gemini-2.5-pro", "max_tokens": 8192, "temperature": 0.7, "copyButtons": [{"label": "Copy Guidance", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Summary", "content": "{{GUIDANCE_SUMMARY}}"}]},
    "task_refinement": {"model": "google/gemini-2.5-flash", "max_tokens": 2048, "temperature": 0.3, "copyButtons": [{"label": "Copy Refined Task", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Task Description", "content": "{{TASK_DESCRIPTION}}"}]},
    "extended_path_finder": {"model": "google/gemini-2.5-flash", "max_tokens": 8192, "temperature": 0.3, "copyButtons": [{"label": "Copy Results", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Paths", "content": "{{PATH_RESULTS}}"}]},
    "file_relevance_assessment": {"model": "google/gemini-2.5-flash", "max_tokens": 24000, "temperature": 0.15, "copyButtons": [{"label": "Copy Assessment", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Relevant Files", "content": "{{RELEVANT_FILES}}"}]},
    "file_finder_workflow": {"model": "google/gemini-2.5-flash", "max_tokens": 2048, "temperature": 0.3, "copyButtons": [{"label": "Copy Results", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy File List", "content": "{{FILE_LIST}}"}]},
    "generic_llm_stream": {"model": "google/gemini-2.5-pro", "max_tokens": 16384, "temperature": 0.7, "copyButtons": [{"label": "Copy Response", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Summary", "content": "{{RESPONSE_SUMMARY}}"}]},
    "streaming": {"model": "google/gemini-2.5-pro", "max_tokens": 16384, "temperature": 0.7, "copyButtons": [{"label": "Copy Stream Output", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Final Result", "content": "{{FINAL_RESULT}}"}]},
    "unknown": {"model": "google/gemini-2.5-pro", "max_tokens": 4096, "temperature": 0.7, "copyButtons": [{"label": "Copy Response", "content": "{{FULL_RESPONSE}}"}, {"label": "Copy Text Only", "content": "{{TEXT_CONTENT}}"}]}
  },
  "path_finder_settings": {
    "max_files_with_content": 10,
    "include_file_contents": true,
    "max_content_size_per_file": 5000,
    "max_file_count": 50,
    "file_content_truncation_chars": 2000,
    "token_limit_buffer": 1000
  }
}'::jsonb, 'Consolidated AI settings including default models, temperature, tokens, task-specific configs, and path finder settings')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- User spending limits table for granular billing period tracking
CREATE TABLE IF NOT EXISTS user_spending_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,
    included_allowance DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    current_spending DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    hard_limit DECIMAL(12, 4),
    services_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_spending_limits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_spending_limits_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_billing_period UNIQUE (user_id, billing_period_start)
);

-- Indexes for user_spending_limits table
CREATE INDEX IF NOT EXISTS idx_user_spending_limits_user_id ON user_spending_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_spending_limits_billing_period_start ON user_spending_limits(billing_period_start);
CREATE INDEX IF NOT EXISTS idx_user_spending_limits_services_blocked ON user_spending_limits(services_blocked) WHERE services_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_spending_limits_plan_id ON user_spending_limits(plan_id);

-- Enhanced billing tables for 100% implementation

-- Audit logs table for tracking subscription management operations
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL, -- 'subscription_created', 'plan_changed', 'subscription_canceled', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'subscription', 'payment_method', 'invoice', etc.
    entity_id VARCHAR(255), -- ID of the entity being acted upon (subscription ID, payment method ID, etc.)
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
    stripe_subscription_id VARCHAR(255),
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

-- =========================================================================
-- Transcription Configuration Tables
-- =========================================================================

-- Comprehensive transcription settings table for user preferences
CREATE TABLE IF NOT EXISTS transcription_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT, -- For desktop session-specific settings
    setting_type VARCHAR(20) NOT NULL CHECK(setting_type IN ('global', 'session', 'project')),
    model_id VARCHAR(255) NOT NULL DEFAULT 'openai/gpt-4o-transcribe',
    prompt TEXT,
    language_code VARCHAR(10) DEFAULT 'auto',
    temperature DECIMAL(3,2) DEFAULT 0.0 CHECK(temperature >= 0.0 AND temperature <= 1.0),
    max_tokens INTEGER DEFAULT 4096,
    voice_activity_detection BOOLEAN DEFAULT TRUE,
    timestamp_format VARCHAR(20) DEFAULT 'none' CHECK(timestamp_format IN ('none', 'word', 'segment')),
    response_format VARCHAR(20) DEFAULT 'text' CHECK(response_format IN ('text', 'json', 'verbose_json')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_transcription_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for transcription_settings table
CREATE INDEX IF NOT EXISTS idx_transcription_settings_user ON transcription_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_transcription_settings_session ON transcription_settings(session_id);
CREATE INDEX IF NOT EXISTS idx_transcription_settings_type ON transcription_settings(setting_type);
CREATE INDEX IF NOT EXISTS idx_transcription_settings_active ON transcription_settings(is_active);

-- Language preferences and configurations
CREATE TABLE IF NOT EXISTS transcription_language_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code VARCHAR(10) NOT NULL UNIQUE,
    language_name VARCHAR(100) NOT NULL,
    is_supported BOOLEAN DEFAULT TRUE,
    default_prompt TEXT,
    recommended_temperature DECIMAL(3,2) DEFAULT 0.0,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for language preferences
CREATE INDEX IF NOT EXISTS idx_transcription_language_preferences_supported ON transcription_language_preferences(is_supported);
CREATE INDEX IF NOT EXISTS idx_transcription_language_preferences_order ON transcription_language_preferences(display_order);

-- Transcription model preferences and configurations
CREATE TABLE IF NOT EXISTS transcription_model_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id VARCHAR(255) NOT NULL UNIQUE,
    model_name VARCHAR(255) NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    supports_prompt BOOLEAN DEFAULT TRUE,
    supports_temperature BOOLEAN DEFAULT TRUE,
    supports_language_detection BOOLEAN DEFAULT TRUE,
    max_audio_duration_seconds INTEGER DEFAULT 600,
    supported_formats TEXT DEFAULT 'mp3,wav,m4a,webm,ogg',
    pricing_type VARCHAR(20) DEFAULT 'duration_based' CHECK(pricing_type IN ('token_based', 'duration_based', 'fixed')),
    cost_per_minute DECIMAL(8,4) DEFAULT 0.0,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for model preferences
CREATE INDEX IF NOT EXISTS idx_transcription_model_preferences_available ON transcription_model_preferences(is_available);
CREATE INDEX IF NOT EXISTS idx_transcription_model_preferences_provider ON transcription_model_preferences(provider_name);
CREATE INDEX IF NOT EXISTS idx_transcription_model_preferences_order ON transcription_model_preferences(display_order);

-- Temperature range configurations for different use cases
CREATE TABLE IF NOT EXISTS transcription_temperature_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preset_name VARCHAR(100) NOT NULL UNIQUE,
    temperature DECIMAL(3,2) NOT NULL CHECK(temperature >= 0.0 AND temperature <= 1.0),
    description TEXT,
    use_case TEXT,
    is_recommended BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0
);

-- Create index for temperature presets
CREATE INDEX IF NOT EXISTS idx_transcription_temperature_presets_recommended ON transcription_temperature_presets(is_recommended);
CREATE INDEX IF NOT EXISTS idx_transcription_temperature_presets_order ON transcription_temperature_presets(display_order);


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

CREATE POLICY "Users can update their own subscription"
ON subscriptions FOR UPDATE
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- App service policies for system operations
CREATE POLICY "App can select all subscriptions"
ON subscriptions FOR SELECT
TO vibe_manager_app
USING (true);

CREATE POLICY "App can update subscriptions"
ON subscriptions FOR UPDATE
TO vibe_manager_app
USING (true)
WITH CHECK (true);

-- DELETE typically handled by backend/service roles.
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


-- RLS for user_preferences table
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
ON user_preferences FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- user_preferences.user_id is PK, indexed.

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

CREATE POLICY "Users can update their own spending limits"
ON user_spending_limits FOR UPDATE
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "App can manage user spending limits"
ON user_spending_limits FOR ALL
TO vibe_manager_app
USING (true);

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

-- RLS for service_pricing table
ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select service pricing"
ON service_pricing FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- INSERT, UPDATE, DELETE typically handled by backend/service roles.


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
GRANT SELECT ON subscription_plans TO vibe_manager_app;
GRANT SELECT ON service_pricing TO vibe_manager_app;
GRANT SELECT ON default_system_prompts TO vibe_manager_app;

-- Grant permissions needed for authentication flow
GRANT SELECT ON users TO vibe_manager_app;
GRANT INSERT, UPDATE ON users TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO vibe_manager_app;

-- Grant permissions needed for billing and credit operations
GRANT SELECT, INSERT, UPDATE ON user_credits TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE ON credit_packs TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE ON credit_pack_stripe_config TO vibe_manager_app;
GRANT SELECT, INSERT ON credit_transactions TO vibe_manager_app;

-- Credit packs table - proper normalized structure instead of JSON
CREATE TABLE IF NOT EXISTS credit_packs (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    value_credits DECIMAL(12, 4) NOT NULL,  -- Amount of credits user gets
    price_amount DECIMAL(12, 4) NOT NULL,   -- Price user pays
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,  -- For UI ordering
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Environment-specific Stripe configuration for credit packs
CREATE TABLE IF NOT EXISTS credit_pack_stripe_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_pack_id VARCHAR(50) NOT NULL REFERENCES credit_packs(id) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL, -- production, development, staging
    stripe_price_id VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_pack_environment UNIQUE (credit_pack_id, environment),
    CONSTRAINT fk_credit_pack_stripe_config_pack FOREIGN KEY (credit_pack_id) REFERENCES credit_packs(id) ON DELETE CASCADE
);

-- Insert default credit packs
INSERT INTO credit_packs (id, name, value_credits, price_amount, currency, description) VALUES
('credits_5', '5 Credits', 5.00, 5.00, 'USD', 'Perfect for occasional usage'),
('credits_10', '10 Credits', 10.00, 10.00, 'USD', 'Great for regular users'),
('credits_25', '25 Credits', 25.00, 25.00, 'USD', 'Best value for power users'),
('credits_50', '50 Credits', 50.00, 50.00, 'USD', 'Maximum credits for heavy usage')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    value_credits = EXCLUDED.value_credits,
    price_amount = EXCLUDED.price_amount,
    description = EXCLUDED.description;

-- Insert Stripe configurations for different environments
INSERT INTO credit_pack_stripe_config (credit_pack_id, environment, stripe_price_id) VALUES
('credits_5', 'production', 'price_credits_5_usd'),
('credits_10', 'production', 'price_credits_10_usd'),
('credits_25', 'production', 'price_credits_25_usd'),
('credits_50', 'production', 'price_credits_50_usd'),
('credits_5', 'development', 'price_test_credits_5_usd'),
('credits_10', 'development', 'price_test_credits_10_usd'),
('credits_25', 'development', 'price_test_credits_25_usd'),
('credits_50', 'development', 'price_test_credits_50_usd')
ON CONFLICT (credit_pack_id, environment) DO UPDATE SET
    stripe_price_id = EXCLUDED.stripe_price_id;

-- Create indexes for credit packs
CREATE INDEX IF NOT EXISTS idx_credit_packs_active ON credit_packs(is_active);
CREATE INDEX IF NOT EXISTS idx_credit_packs_display_order ON credit_packs(display_order);
CREATE INDEX IF NOT EXISTS idx_credit_pack_stripe_config_environment ON credit_pack_stripe_config(environment);
CREATE INDEX IF NOT EXISTS idx_credit_pack_stripe_config_active ON credit_pack_stripe_config(is_active);

-- RLS for credit_packs table
ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;

-- Public read access to active credit packs for all authenticated users
CREATE POLICY "Public can select active credit packs"
ON credit_packs FOR SELECT
TO authenticated, vibe_manager_app
USING (is_active = true);

-- App can manage all credit packs
CREATE POLICY "App can manage credit packs"
ON credit_packs FOR ALL
TO vibe_manager_app
USING (true);

-- RLS for credit_pack_stripe_config table  
ALTER TABLE credit_pack_stripe_config ENABLE ROW LEVEL SECURITY;

-- Public read access to active credit pack configurations
CREATE POLICY "Public can select active credit pack stripe config"
ON credit_pack_stripe_config FOR SELECT
TO authenticated, vibe_manager_app
USING (is_active = true);

-- App can manage all credit pack stripe configurations
CREATE POLICY "App can manage credit pack stripe config"
ON credit_pack_stripe_config FOR ALL
TO vibe_manager_app
USING (true);

-- Grant SELECT permissions to authenticated role for credit tables
GRANT SELECT ON credit_packs TO authenticated;
GRANT SELECT ON credit_pack_stripe_config TO authenticated;

-- User credits balance tracking
CREATE TABLE IF NOT EXISTS user_credits (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_credits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT check_balance_non_negative CHECK (balance >= 0)
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

-- Outbox events table for reliable event publishing (transactional outbox pattern)
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(100) NOT NULL, -- subscription, payment, user, etc.
    aggregate_id VARCHAR(255) NOT NULL, -- ID of the entity that changed
    event_type VARCHAR(100) NOT NULL, -- subscription.plan_changed, payment.failed, etc.
    event_data JSONB NOT NULL, -- Event payload
    metadata JSONB, -- Additional context like user_id, request_id, etc.
    published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE INDEX IF NOT EXISTS idx_outbox_events_published ON outbox_events(published);
CREATE INDEX IF NOT EXISTS idx_outbox_events_next_retry ON outbox_events(next_retry_at) WHERE published = FALSE;
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_created_at ON outbox_events(created_at);

-- RLS for webhook_idempotency table
ALTER TABLE webhook_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App can manage webhook idempotency"
ON webhook_idempotency FOR ALL
TO vibe_manager_app
USING (true); -- App service can read/write all webhook records

-- RLS for outbox_events table
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App can manage outbox events"
ON outbox_events FOR ALL
TO vibe_manager_app
USING (true); -- System-level table managed by application

-- Grant necessary table permissions to authenticated role for user operations
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT SELECT, UPDATE ON subscription_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_quotas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_credits TO authenticated;
GRANT SELECT, INSERT ON credit_transactions TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_spending_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON webhook_idempotency TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE ON audit_logs TO vibe_manager_app;
GRANT SELECT, INSERT, UPDATE ON user_spending_limits TO vibe_manager_app;

-- User billing details table for invoice customization

-- =========================================================================
-- Insert Default Transcription Configuration Data
-- =========================================================================

-- Insert supported language preferences
INSERT INTO transcription_language_preferences (language_code, language_name, is_supported, default_prompt, recommended_temperature, display_order)
VALUES 
('auto', 'Auto-detect', TRUE, 'Please transcribe this audio accurately in the detected language, preserving the original meaning and context.', 0.0, 0),
('en', 'English', TRUE, 'Please transcribe this English audio accurately, preserving the original meaning and context. Focus on clarity and proper punctuation.', 0.0, 1),
('es', 'Spanish', TRUE, 'Por favor, transcribe este audio en español con precisión, conservando el significado y contexto originales.', 0.0, 2),
('fr', 'French', TRUE, 'Veuillez transcrire cet audio français avec précision, en préservant le sens et le contexte originaux.', 0.0, 3),
('de', 'German', TRUE, 'Bitte transkribieren Sie dieses deutsche Audio genau und bewahren Sie die ursprüngliche Bedeutung und den Kontext.', 0.0, 4),
('it', 'Italian', TRUE, 'Si prega di trascrivere questo audio italiano con precisione, preservando il significato e il contesto originali.', 0.0, 5),
('pt', 'Portuguese', TRUE, 'Por favor, transcreva este áudio em português com precisão, preservando o significado e contexto originais.', 0.0, 6),
('ru', 'Russian', TRUE, 'Пожалуйста, точно транскрибируйте это русское аудио, сохраняя первоначальный смысл и контекст.', 0.0, 7),
('ja', 'Japanese', TRUE, 'この日本語音声を正確に書き起こし、元の意味と文脈を保持してください。', 0.0, 8),
('ko', 'Korean', TRUE, '이 한국어 오디오를 정확하게 전사하여 원래의 의미와 맥락을 보존해 주세요.', 0.0, 9),
('zh', 'Chinese', TRUE, '请准确转录此中文音频，保留原始含义和上下文。', 0.0, 10)
ON CONFLICT (language_code) DO UPDATE SET
    language_name = EXCLUDED.language_name,
    default_prompt = EXCLUDED.default_prompt,
    recommended_temperature = EXCLUDED.recommended_temperature,
    display_order = EXCLUDED.display_order;

-- Insert available transcription models
INSERT INTO transcription_model_preferences (model_id, model_name, provider_name, is_available, supports_prompt, supports_temperature, supports_language_detection, max_audio_duration_seconds, supported_formats, pricing_type, cost_per_minute, display_order)
VALUES 
('openai/gpt-4o-transcribe', 'GPT-4o Transcribe (OpenAI via Replicate)', 'Transcription', TRUE, TRUE, TRUE, TRUE, 600, 'mp3,wav,m4a,webm,ogg,flac', 'duration_based', 0.050, 1),
('openai/gpt-4o-mini-transcribe', 'GPT-4o Mini Transcribe', 'Transcription', TRUE, TRUE, TRUE, TRUE, 600, 'mp3,wav,m4a,webm,ogg,flac', 'duration_based', 0.025, 2)
ON CONFLICT (model_id) DO UPDATE SET
    model_name = EXCLUDED.model_name,
    provider_name = EXCLUDED.provider_name,
    is_available = EXCLUDED.is_available,
    supports_prompt = EXCLUDED.supports_prompt,
    supports_temperature = EXCLUDED.supports_temperature,
    supports_language_detection = EXCLUDED.supports_language_detection,
    max_audio_duration_seconds = EXCLUDED.max_audio_duration_seconds,
    supported_formats = EXCLUDED.supported_formats,
    pricing_type = EXCLUDED.pricing_type,
    cost_per_minute = EXCLUDED.cost_per_minute,
    display_order = EXCLUDED.display_order;

-- Insert temperature presets for different use cases
INSERT INTO transcription_temperature_presets (preset_name, temperature, description, use_case, is_recommended, display_order)
VALUES 
('Precise (0.0)', 0.0, 'Most accurate transcription with minimal creativity', 'Technical content, lectures, meetings', TRUE, 1),
('Balanced (0.2)', 0.2, 'Good balance between accuracy and natural language flow', 'General conversations, interviews', FALSE, 2),
('Creative (0.4)', 0.4, 'More creative interpretation, better for unclear audio', 'Noisy environments, artistic content', FALSE, 3),
('Flexible (0.6)', 0.6, 'Higher creativity for difficult audio conditions', 'Low-quality recordings, multiple speakers', FALSE, 4)
ON CONFLICT (preset_name) DO UPDATE SET
    temperature = EXCLUDED.temperature,
    description = EXCLUDED.description,
    use_case = EXCLUDED.use_case,
    is_recommended = EXCLUDED.is_recommended,
    display_order = EXCLUDED.display_order;

-- =========================================================================
-- Row Level Security for Transcription Tables
-- =========================================================================

-- RLS for transcription_settings table
ALTER TABLE transcription_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own transcription settings"
ON transcription_settings FOR ALL
TO authenticated
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- App can manage transcription settings for server operations
CREATE POLICY "App can manage transcription settings"
ON transcription_settings FOR ALL
TO vibe_manager_app
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- RLS for transcription_language_preferences table (read-only for users)
ALTER TABLE transcription_language_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select language preferences"
ON transcription_language_preferences FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- RLS for transcription_model_preferences table (read-only for users)
ALTER TABLE transcription_model_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select model preferences"
ON transcription_model_preferences FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- RLS for transcription_temperature_presets table (read-only for users)
ALTER TABLE transcription_temperature_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App users can select temperature presets"
ON transcription_temperature_presets FOR SELECT
TO vibe_manager_app, authenticated
USING (true);

-- Grant permissions for transcription configuration tables
GRANT SELECT, INSERT, UPDATE ON transcription_settings TO authenticated;
GRANT SELECT ON transcription_language_preferences TO authenticated;
GRANT SELECT ON transcription_model_preferences TO authenticated;
GRANT SELECT ON transcription_temperature_presets TO authenticated;

GRANT SELECT, INSERT, UPDATE ON transcription_settings TO vibe_manager_app;
GRANT SELECT ON transcription_language_preferences TO vibe_manager_app;
GRANT SELECT ON transcription_model_preferences TO vibe_manager_app;
GRANT SELECT ON transcription_temperature_presets TO vibe_manager_app;