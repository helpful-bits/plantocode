-- Model provider mappings data for routing models through different providers
-- This table stores mappings between internal model IDs and provider-specific model IDs

-- Complete model provider mappings for all models in the system
INSERT INTO model_provider_mappings (internal_model_id, provider_code, provider_model_id)
VALUES
-- =============================================================================
-- ANTHROPIC MODELS
-- =============================================================================
-- Anthropic models routed through OpenRouter using canonical slugs
('anthropic/claude-sonnet-4-5-20250929', 'openrouter', 'anthropic/claude-sonnet-4.5'),
('anthropic/claude-opus-4-20250514', 'openrouter', 'anthropic/claude-opus-4'),
('anthropic/claude-3-7-sonnet-20250219', 'openrouter', 'anthropic/claude-3.7-sonnet'),

-- Anthropic direct API mappings
('anthropic/claude-sonnet-4-5-20250929', 'anthropic', 'claude-sonnet-4-5-20250929'),
('anthropic/claude-opus-4-20250514', 'anthropic', 'claude-opus-4-20250514'),
('anthropic/claude-3-7-sonnet-20250219', 'anthropic', 'claude-3-7-sonnet-20250219'),

-- =============================================================================
-- OPENAI MODELS
-- =============================================================================
-- OpenAI models routed through OpenRouter (for fallback scenarios)
('openai/gpt-4.1', 'openrouter', 'openai/gpt-4.1'),
('openai/gpt-4.1-mini', 'openrouter', 'openai/gpt-4.1-mini'),
('openai/gpt-5.1-2025-11-13', 'openrouter', 'openai/gpt-5.1-2025-11-13'),
('openai/gpt-5-mini', 'openrouter', 'openai/gpt-5-mini'),
('openai/gpt-5-nano', 'openrouter', 'openai/gpt-5-nano'),
('openai/o3', 'openrouter', 'openai/o3'),
('openai/o3-deep-research-2025-06-26', 'openrouter', 'openai/o3-deep-research-2025-06-26'),
('openai/o4-mini', 'openrouter', 'openai/o4-mini'),
('openai/o4-mini-deep-research-2025-06-26', 'openrouter', 'openai/o4-mini-deep-research-2025-06-26'),

-- OpenAI direct API mappings
('openai/gpt-4.1', 'openai', 'gpt-4.1'),
('openai/gpt-4.1-mini', 'openai', 'gpt-4.1-mini'),
('openai/gpt-5.1-2025-11-13', 'openai', 'gpt-5.1-2025-11-13'),
('openai/gpt-5-mini', 'openai', 'gpt-5-mini'),
('openai/gpt-5-nano', 'openai', 'gpt-5-nano'),
('openai/o3', 'openai', 'o3'),
('openai/o3-deep-research-2025-06-26', 'openai', 'o3-deep-research-2025-06-26'),
('openai/o4-mini', 'openai', 'o4-mini'),
('openai/o4-mini-deep-research-2025-06-26', 'openai', 'o4-mini-deep-research-2025-06-26'),

-- OpenAI transcription models (route through OpenAI API)
('openai/gpt-4o-transcribe', 'openai', 'gpt-4o-transcribe'),
('openai/gpt-4o-mini-transcribe', 'openai', 'gpt-4o-mini-transcribe'),

-- =============================================================================
-- GOOGLE MODELS
-- =============================================================================
-- Google models routed through OpenRouter (for fallback scenarios)
('google/gemini-2.5-pro', 'openrouter', 'google/gemini-2.5-pro'),
('google/gemini-2.5-flash', 'openrouter', 'google/gemini-2.5-flash'),
('google/gemini-3-pro-preview', 'openrouter', 'google/gemini-3-pro-preview'),

-- Google direct API mappings (clean model IDs without google/ prefix)
('google/gemini-2.5-pro', 'google', 'gemini-2.5-pro'),
('google/gemini-2.5-flash', 'google', 'gemini-2.5-flash'),
('google/gemini-3-pro-preview', 'google', 'gemini-3-pro-preview'),

-- =============================================================================
-- OPENROUTER MODELS
-- =============================================================================
-- DeepSeek models routed through OpenRouter
('deepseek/deepseek-r1-0528', 'openrouter', 'deepseek/deepseek-r1-0528'),

-- Moonshot AI models routed through OpenRouter
('moonshotai/kimi-k2', 'openrouter', 'moonshotai/kimi-k2'),

-- =============================================================================
-- XAI MODELS
-- =============================================================================
-- xAI Grok 4 model routed through OpenRouter (for fallback scenarios)
('xai/grok-4', 'openrouter', 'x-ai/grok-4'),

-- xAI direct API mapping
('xai/grok-4', 'xai', 'grok-4')

ON CONFLICT (internal_model_id, provider_code) DO UPDATE SET
provider_model_id = EXCLUDED.provider_model_id;