-- Estimation coefficients based on production data analysis
-- Updated: January 2025

-- Input multipliers: Anthropic 1.3, others 1.15
-- Output multipliers: Based on P90/average ratio from actual usage
-- Average outputs: From recent production data
INSERT INTO model_estimation_coefficients (model_id, input_multiplier, output_multiplier, avg_output_tokens)
SELECT id, input_mult, output_mult, avg_tokens
FROM (VALUES 
    -- OpenAI models - input 1.15
    ('openai/gpt-4.1', 1.15::DECIMAL(5,3), 1.5::DECIMAL(5,3), 2800),
    ('openai/gpt-4.1-mini', 1.15::DECIMAL(5,3), 1.4::DECIMAL(5,3), 1600),
    ('openai/o3', 1.15::DECIMAL(5,3), 1.4::DECIMAL(5,3), 2786),
    ('openai/o3-deep-research-2025-06-26', 1.15::DECIMAL(5,3), 1.5::DECIMAL(5,3), 3500),
    ('openai/o4-mini', 1.15::DECIMAL(5,3), 1.4::DECIMAL(5,3), 2730),
    ('openai/o4-mini-deep-research-2025-06-26', 1.15::DECIMAL(5,3), 1.5::DECIMAL(5,3), 4000),
    
    -- Anthropic models - input 1.3
    ('anthropic/claude-opus-4-20250514', 1.3::DECIMAL(5,3), 2.6::DECIMAL(5,3), 500),
    ('anthropic/claude-sonnet-4-20250514', 1.3::DECIMAL(5,3), 2.6::DECIMAL(5,3), 355),
    ('anthropic/claude-3-7-sonnet-20250219', 1.3::DECIMAL(5,3), 2.6::DECIMAL(5,3), 360),
    
    -- Google models - input 1.15
    ('google/gemini-2.5-pro', 1.15::DECIMAL(5,3), 2.1::DECIMAL(5,3), 6718),
    ('google/gemini-2.5-flash', 1.15::DECIMAL(5,3), 2.9::DECIMAL(5,3), 271),
    
    -- Other models - input 1.15
    ('xai/grok-4', 1.15::DECIMAL(5,3), 1.5::DECIMAL(5,3), 1257),
    ('moonshotai/kimi-k2', 1.15::DECIMAL(5,3), 2.3::DECIMAL(5,3), 1036),
    ('deepseek/deepseek-r1-0528', 1.15::DECIMAL(5,3), 1.6::DECIMAL(5,3), 4087),
    
    -- Additional models - input 1.15
    ('openai/gpt-4o-transcribe', 1.15::DECIMAL(5,3), 1.8::DECIMAL(5,3), 67),
    ('openai/o3:web', 1.15::DECIMAL(5,3), 1.3::DECIMAL(5,3), 2264),
    ('openai/o4-mini:web', 1.15::DECIMAL(5,3), 1.5::DECIMAL(5,3), 8535)
) AS v(id, input_mult, output_mult, avg_tokens)
WHERE EXISTS (SELECT 1 FROM models WHERE models.id = v.id)
ON CONFLICT (model_id) DO UPDATE SET
    input_multiplier = EXCLUDED.input_multiplier,
    output_multiplier = EXCLUDED.output_multiplier,
    avg_output_tokens = EXCLUDED.avg_output_tokens,
    last_updated = NOW();