-- Provider data
INSERT INTO providers (code, name, description, website_url, api_base_url, capabilities, status) VALUES
('anthropic', 'Anthropic', 'AI safety focused company providing Claude models', 'https://anthropic.com', 'https://api.anthropic.com', '{"text": true, "chat": true, "reasoning": true}', 'active'),
('openai', 'OpenAI', 'Leading AI research company providing GPT models', 'https://openai.com', 'https://api.openai.com', '{"text": true, "chat": true, "image": true, "code": true}', 'active'),
('google', 'Google', 'Google AI providing Gemini models', 'https://ai.google.dev', 'https://generativelanguage.googleapis.com', '{"text": true, "chat": true, "multimodal": true, "code": true}', 'active'),
('openai_transcription', 'Transcription', 'Dedicated transcription services', 'https://openai.com', 'https://api.openai.com', '{"transcription": true, "audio_processing": true}', 'active'),
('openrouter', 'OpenRouter', 'Unified API for multiple AI providers with proper billing attribution', 'https://openrouter.ai', 'https://openrouter.ai/api', '{"text": true, "chat": true, "reasoning": true, "code": true, "multimodal": true}', 'active')
ON CONFLICT (code) DO NOTHING;