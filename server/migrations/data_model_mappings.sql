-- Model provider mappings data for routing models through different providers
-- This table stores mappings between internal model IDs and provider-specific model IDs

-- OpenRouter mappings for various models
INSERT INTO model_provider_mappings (internal_model_id, provider_code, provider_model_id)
VALUES
-- Anthropic models routed through OpenRouter using canonical slugs
('anthropic/claude-sonnet-4-20250514', 'openrouter', 'anthropic/claude-sonnet-4'),
('anthropic/claude-opus-4-20250514', 'openrouter', 'anthropic/claude-opus-4'),
('anthropic/claude-3-7-sonnet-20250219', 'openrouter', 'anthropic/claude-3.7-sonnet'),

-- OpenAI models routed through OpenRouter (for fallback scenarios)
('openai/gpt-4.1', 'openrouter', 'openai/gpt-4.1'),
('openai/gpt-4.1-mini', 'openrouter', 'openai/gpt-4.1-mini'),
('openai/o3', 'openrouter', 'openai/o3'),
('openai/o4-mini', 'openrouter', 'openai/o4-mini'),

-- Google models routed through OpenRouter (for fallback scenarios)
('google/gemini-2.5-pro', 'openrouter', 'google/gemini-2.5-pro'),
('google/gemini-2.5-flash', 'openrouter', 'google/gemini-2.5-flash'),

-- DeepSeek models routed through OpenRouter (primary route)
('deepseek/deepseek-r1-0528', 'openrouter', 'deepseek/deepseek-r1-0528')

ON CONFLICT (internal_model_id, provider_code) DO UPDATE SET
provider_model_id = EXCLUDED.provider_model_id;