-- Add max_prompt_length to transcription model capabilities
-- OpenAI transcribe models: 1000 chars max
UPDATE models
SET capabilities = capabilities || '{"max_prompt_length": 1000}'::jsonb
WHERE id IN ('openai/gpt-4o-transcribe', 'openai/gpt-4o-mini-transcribe');

-- Google/Gemini transcribe: 100K chars (uses generateContent)
UPDATE models
SET capabilities = capabilities || '{"max_prompt_length": 100000}'::jsonb
WHERE id = 'google/gemini-3-flash-preview-transcribe';

-- Verify
SELECT id, capabilities FROM models WHERE model_type = 'transcription';
