-- AI model pricing data - Updated with provider relationships and per-million pricing
INSERT INTO models (id, name, context_window, price_input, price_output, provider_id, model_type, capabilities, status, description, price_input_long_context, price_output_long_context, long_context_threshold, price_cache_write, price_cache_read)
VALUES
-- Anthropic models (prices per 1M tokens) - Updated with Anthropic cache pricing
('anthropic/claude-sonnet-4-20250514', 'Claude 4 Sonnet',     200000, 3.000000, 15.000000, (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Balanced language model with strong reasoning capabilities', NULL, NULL, NULL, 3.750000, 0.300000),
('anthropic/claude-opus-4-20250514',   'Claude 4 Opus',       200000, 15.000000, 75.000000, (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true}', 'active', 'Advanced language model with strong reasoning capabilities', NULL, NULL, NULL, 18.750000, 1.500000),
('anthropic/claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet (2025-02-19)', 200000, 3.000000, 15.000000, (SELECT id FROM providers WHERE code = 'anthropic'), 'text', '{"text": true, "chat": true, "reasoning": true, "vision": true}', 'active', 'Claude 3.7 Sonnet with 2025-02-19 training cutoff', NULL, NULL, NULL, 3.750000, 0.300000),

-- OpenAI models (prices per 1M tokens) - OpenAI cached reads are 25% of input price
('openai/gpt-4.1',                 'GPT-4.1',            1000000, 2.000000, 8.000000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Advanced GPT model with broad capabilities', NULL, NULL, NULL, NULL, 0.500000),
('openai/gpt-4.1-mini',            'GPT-4.1 Mini',       1000000, 0.400000, 1.600000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "code": true}', 'active', 'Efficient GPT model for cost-sensitive applications', NULL, NULL, NULL, NULL, 0.100000),
('openai/o3',                      'GPT-o3',             200000, 2.000000, 8.000000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true}', 'active', 'Advanced OpenAI o3 model with reasoning capabilities', NULL, NULL, NULL, NULL, 0.500000),
('openai/o4-mini',                 'GPT-o4 Mini',        200000, 1.100000, 4.400000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true}', 'active', 'Efficient OpenAI o4 model for cost-sensitive applications', NULL, NULL, NULL, NULL, 0.275000),
('openai/o4-mini-high',            'GPT-o4 Mini High',   200000, 1.100000, 4.400000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true}', 'active', 'High-performance variant of GPT-o4 Mini', NULL, NULL, NULL, NULL, 0.275000),
('openai/o3-deep-research-2025-06-26', 'GPT-o3 Deep Research', 200000, 10.000000, 40.000000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true, "agentic": true, "web_search": true, "code_exec": true}', 'active', 'GPT-o3 optimized for deep research tasks', NULL, NULL, NULL, NULL, 2.500000),
('openai/o4-mini-deep-research-2025-06-26', 'GPT-o4 Mini Deep Research', 200000, 2.000000, 8.000000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"text": true, "chat": true, "reasoning": true, "code": true, "agentic": true, "web_search": true, "code_exec": true}', 'active', 'GPT-o4 Mini optimized for deep research tasks', NULL, NULL, NULL, NULL, 0.500000),
('openai/o3:web',                  'GPT-o3 Web',         200000, 2.000000, 8.000000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"chat": true, "code": true, "text": true, "reasoning": true, "web_search": true}', 'active', 'GPT-o3 with built-in web search tool', NULL, NULL, NULL, NULL, 0.500000),
('openai/o4-mini:web',             'GPT-o4-mini Web',    200000, 1.100000, 4.400000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"chat": true, "code": true, "text": true, "reasoning": true, "web_search": true}', 'active', 'GPT-o4-mini with built-in web search tool', NULL, NULL, NULL, NULL, 0.275000),
('openai/o4-mini-high:web',        'GPT-o4 Mini High Web', 200000, 1.100000, 4.400000, (SELECT id FROM providers WHERE code = 'openai'), 'text', '{"chat": true, "code": true, "text": true, "reasoning": true, "web_search": true}', 'active', 'High-performance variant of GPT-o4 Mini with web search', NULL, NULL, NULL, NULL, 0.275000),

-- Google models (prices per 1M tokens) - No cache pricing available
('google/gemini-2.5-pro',          'Gemini 2.5 Pro',     1000000, 1.250000, 10.000000, (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "multimodal": true, "code": true}', 'active', 'Multimodal AI model with advanced reasoning', 2.500000, 15.000000, 200000, NULL, 0.310000),
('google/gemini-2.5-flash',        'Gemini 2.5 Flash',   1000000, 0.300000, 2.500000, (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true}', 'active', 'Google Gemini 2.5 Flash - Fast and efficient text generation model', NULL, NULL, NULL, NULL, 0.075000),
('google/gemini-2.5-flash:thinking', 'Gemini 2.5 Flash Thinking', 1000000, 0.300000, 2.500000, (SELECT id FROM providers WHERE code = 'google'), 'text', '{"text": true, "chat": true, "code": true, "reasoning": true, "thinking": true}', 'active', 'Google Gemini 2.5 Flash with thinking capabilities', NULL, NULL, NULL, NULL, NULL),

-- DeepSeek models (prices per 1M tokens) - No cache pricing available
('deepseek/deepseek-r1-0528',      'DeepSeek R1 (0528)',  131072, 0.500000, 2.150000, (SELECT id FROM providers WHERE code = 'deepseek'), 'text', '{"text": true, "chat": true, "reasoning": true, "thinking": true}', 'active', 'DeepSeek R1 0528 - Premium reasoning model (paid only)', NULL, NULL, NULL, NULL, NULL),

-- Transcription models (token-based pricing with audio rates for financial safety) - No cache pricing for transcription
('openai/gpt-4o-transcribe',       'GPT-4o Transcribe', 0, 6.000000, 10.000000, (SELECT id FROM providers WHERE code = 'openai'), 'transcription', '{"transcription": true, "audio_processing": true, "multi_language": true}', 'active', 'OpenAI GPT-4o based transcription model - Audio input: $6/1M tokens, Text output: $10/1M tokens', NULL, NULL, NULL, NULL, NULL),
('openai/gpt-4o-mini-transcribe',  'GPT-4o Mini Transcribe', 0, 3.000000, 5.000000, (SELECT id FROM providers WHERE code = 'openai'), 'transcription', '{"transcription": true, "audio_processing": true, "multi_language": true}', 'active', 'OpenAI GPT-4o Mini transcription model - Audio input: $3/1M tokens, Text output: $5/1M tokens', NULL, NULL, NULL, NULL, NULL)

ON CONFLICT (id) DO UPDATE SET
name                       = EXCLUDED.name,
context_window            = EXCLUDED.context_window,
price_input               = EXCLUDED.price_input,
price_output              = EXCLUDED.price_output,
provider_id               = EXCLUDED.provider_id,
model_type                = EXCLUDED.model_type,
capabilities              = EXCLUDED.capabilities,
status                    = EXCLUDED.status,
description               = EXCLUDED.description,
price_input_long_context  = EXCLUDED.price_input_long_context,
price_output_long_context = EXCLUDED.price_output_long_context,
long_context_threshold    = EXCLUDED.long_context_threshold,
price_cache_write         = EXCLUDED.price_cache_write,
price_cache_read          = EXCLUDED.price_cache_read;