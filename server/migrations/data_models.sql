-- AI model pricing data - Updated with provider relationships and per-million pricing
INSERT INTO models (id, name, context_window, pricing_info, provider_id, model_type, capabilities, status, description, api_model_id)
VALUES
-- Anthropic models (prices per 1M tokens) - Updated with vision capabilities
('anthropic/claude-sonnet-4-20250514', 'Claude 4 Sonnet', 200000, '{"input_per_million": 3.00, "output_per_million": 15.00, "cache_write_per_million": 3.75, "cache_read_per_million": 0.30}'::jsonb, (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}'::jsonb, 'active', 'Balanced language model with strong reasoning and vision capabilities', 'claude-sonnet-4-20250514'),
('anthropic/claude-opus-4-20250514', 'Claude 4 Opus', 200000, '{"input_per_million": 15.00, "output_per_million": 75.00, "cache_write_per_million": 18.75, "cache_read_per_million": 1.50}'::jsonb, (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}'::jsonb, 'active', 'Advanced language model with strong reasoning and vision capabilities', 'claude-opus-4-20250514'),
('anthropic/claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet (2025-02-19)', 200000, '{"input_per_million": 3.00, "output_per_million": 15.00, "cache_write_per_million": 3.75, "cache_read_per_million": 0.30}'::jsonb, (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}'::jsonb, 'active', 'Claude 3.7 Sonnet with 2025-02-19 training cutoff and vision support', 'claude-3-7-sonnet-20250219'),

-- OpenAI models (prices per 1M tokens) - Updated with vision and agentic capabilities
('openai/gpt-4.1', 'GPT-4.1', 1000000, '{"input_per_million": 2.00, "output_per_million": 8.00, "cached_input_per_million": 0.50}'::jsonb, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true, "vision": true, "long_context": true}'::jsonb, 'active', 'Advanced GPT model with broad capabilities and vision', 'gpt-4.1'),
('openai/gpt-4.1-mini', 'GPT-4.1 Mini', 1000000, '{"input_per_million": 0.40, "output_per_million": 1.60, "cached_input_per_million": 0.10}'::jsonb, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true, "vision": true}'::jsonb, 'active', 'Efficient GPT model for cost-sensitive applications with vision', 'gpt-4.1-mini'),
('openai/o3', 'GPT-o3', 200000, '{"input_per_million": 2.00, "output_per_million": 8.00, "cached_input_per_million": 0.50}'::jsonb, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true, "vision": true, "agentic": true, "web_search": true, "code_exec": true}'::jsonb, 'active', 'Advanced OpenAI o3 model with reasoning, vision, and agentic capabilities', 'o3'),
('openai/o4-mini', 'GPT-o4 Mini', 200000, '{"input_per_million": 1.10, "output_per_million": 4.40, "cached_input_per_million": 0.275}'::jsonb, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true, "vision": true, "agentic": true, "web_search": true, "code_exec": true}'::jsonb, 'active', 'Efficient OpenAI o4 model with reasoning, vision, and agentic capabilities', 'o4-mini'),

-- Google models (prices per 1M tokens) - Updated with correct context window and comprehensive pricing
('google/gemini-2.5-pro', 'Gemini 2.5 Pro', 1048576, '{"input_per_million": 1.25, "output_per_million": 10.00, "long_context_threshold": 200000, "long_context_input_per_million": 2.50, "long_context_output_per_million": 15.00, "cached_input_per_million": 0.31, "long_context_cached_input_per_million": 0.625, "storage_price_per_million_per_hour": 4.50}'::jsonb, (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "multimodal": true, "code": true, "reasoning": true, "thinking": true}'::jsonb, 'active', 'Multimodal AI model with advanced reasoning', 'gemini-2.5-pro'),
('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 1048576, '{"input_per_million": 0.30, "output_per_million": 2.50, "cached_input_per_million": 0.075, "audio_input_per_million": 1.00, "cached_audio_input_per_million": 0.25, "storage_price_per_million_per_hour": 1.00}'::jsonb, (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "multimodal": true, "code": true, "reasoning": true, "thinking": true}'::jsonb, 'active', 'Google Gemini 2.5 Flash - Fast and efficient text generation model', 'gemini-2.5-flash'),

-- DeepSeek models (prices per 1M tokens) - Updated with correct context window, pricing, and capabilities
('deepseek/deepseek-r1-0528', 'DeepSeek R1 (0528)', 65536, '{"input_per_million": 0.55, "output_per_million": 2.19}'::jsonb, (SELECT id FROM providers WHERE code = 'deepseek'), 'chat', '{"chat": true, "reasoning_content": true, "json_output": true, "function_calling": true, "chat_prefix_completion": true}'::jsonb, 'active', 'DeepSeek R1 0528 - Premium reasoning model (paid only)', 'deepseek-r1-0528'),

-- Transcription models (token-based pricing with audio rates for financial safety) - No cache pricing for transcription
('openai/gpt-4o-transcribe', 'GPT-4o Transcribe', 0, '{"input_per_million": 6.00, "output_per_million": 10.00}'::jsonb, (SELECT id FROM providers WHERE code = 'openai'), 'transcription', '{"transcription": true, "audio_processing": true, "multi_language": true}', 'active', 'OpenAI GPT-4o based transcription model - Audio input: $6/1M tokens, Text output: $10/1M tokens', 'gpt-4o-transcribe'),
('openai/gpt-4o-mini-transcribe', 'GPT-4o Mini Transcribe', 0, '{"input_per_million": 3.00, "output_per_million": 5.00}'::jsonb, (SELECT id FROM providers WHERE code = 'openai'), 'transcription', '{"transcription": true, "audio_processing": true, "multi_language": true}', 'active', 'OpenAI GPT-4o Mini transcription model - Audio input: $3/1M tokens, Text output: $5/1M tokens', 'gpt-4o-mini-transcribe')

ON CONFLICT (id) DO UPDATE SET
name = EXCLUDED.name,
context_window = EXCLUDED.context_window,
pricing_info = EXCLUDED.pricing_info,
provider_id = EXCLUDED.provider_id,
model_type = EXCLUDED.model_type,
capabilities = EXCLUDED.capabilities,
status = EXCLUDED.status,
description = EXCLUDED.description,
api_model_id = EXCLUDED.api_model_id;