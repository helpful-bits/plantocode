INSERT INTO application_configurations (config_key, config_value, description)
VALUES (
  'ai_settings',
  '{
    "tasks": {
      "implementation_plan": {
        "model": "google/gemini-2.5-pro",
        "allowed_models": ["openai/o3", "openai/gpt-5", "deepseek/deepseek-r1-0528", "moonshotai/kimi-k2", "google/gemini-2.5-pro", "xai/grok-4", "anthropic/claude-sonnet-4-5-20250929"],
        "max_tokens": 23000,
        "temperature": 0.7,
        "copy_buttons": [
          {
            "label": "Parallel Claude Coding Agents",
            "content": "Original Task: {{TASK_DESCRIPTION}}\n\n{{IMPLEMENTATION_PLAN}}\n\nNOW, think deeply! Read the files mentioned, understand them and launch parallel Claude coding agents that run AT THE SAME TIME TO SAVE TIME and implement EVERY SINGLE aspect of the perfect plan precisely and systematically, and instruct the agents EXACTLY about what they are supposed to do in great detail. Think even more deeply to give REALLY clear instructions for the agents! Instruct each of the agents NOT to run any git, cargo, or TypeScript check commands. I do not need deprecated comments or annotations; the deprecated or fallback features must be COMPLETELY REMOVED!"
          },
          {
            "label": "Investigate Results",
            "content": "Investigate the results of ALL agents that were launched and ensure we have implemented the COMPLETE plan CORRECTLY! Perform a thorough self-check without launching background agents. Think deeply to verify EVERYTHING has been properly executed."
          },
          {
            "label": "Task",
            "content": "{{TASK_DESCRIPTION}}"
          },
          {
            "label": "Task + Plan",
            "content": "Task: {{TASK_DESCRIPTION}}\n\nImplementation Plan:\n{{IMPLEMENTATION_PLAN}}"
          }
        ]
      },
      "implementation_plan_merge": {
        "model": "google/gemini-2.5-pro",
        "allowed_models": ["google/gemini-2.5-flash", "openai/gpt-5", "google/gemini-2.5-pro", "moonshotai/kimi-k2", "openai/o4-mini", "xai/grok-4"],
        "max_tokens": 35000,
        "temperature": 0.35
      },
      "text_improvement": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-flash"],
        "max_tokens": 4096,
        "temperature": 0.45
      },
      "voice_transcription": {
        "model": "openai/gpt-4o-transcribe",
        "allowed_models": ["openai/gpt-4o-transcribe", "openai/gpt-4o-mini-transcribe"],
        "max_tokens": 4096,
        "temperature": 0.0
      },
      "path_correction": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 4096,
        "temperature": 0.3
      },
      "regex_file_filter": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-flash"],
        "max_tokens": 35000,
        "temperature": 0.2
      },
      "task_refinement": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 16384,
        "temperature": 0.3
      },
      "extended_path_finder": {
        "model": "openai/gpt-5-mini",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini", "openai/gpt-5-mini"],
        "max_tokens": 8192,
        "temperature": 0.15
      },
      "file_relevance_assessment": {
        "model": "openai/gpt-5-mini",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini", "openai/gpt-5-mini"],
        "max_tokens": 24000,
        "temperature": 0.2
      },
      "web_search_prompts_generation": {
        "model": "openai/gpt-5",
        "allowed_models": ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/o4-mini", "openai/gpt-5"],
        "max_tokens": 30000,
        "temperature": 0.2
      },
      "web_search_execution": {
        "model": "openai/gpt-5-mini",
        "allowed_models": ["openai/o3", "openai/o4-mini", "openai/gpt-5", "openai/gpt-5-mini"],
        "max_tokens": 10000,
        "temperature": 0.3
      },
      "root_folder_selection": {
        "model": "openai/gpt-5-mini",
        "allowed_models": ["google/gemini-2.5-flash", "openai/gpt-5-mini", "anthropic/claude-sonnet-4-5-20250929"],
        "max_tokens": 4096,
        "temperature": 0.2
      },
      "video_analysis": {
        "model": "google/gemini-2.5-pro",
        "allowed_models": ["google/gemini-2.5-pro", "google/gemini-2.5-flash"],
        "max_tokens": 16384,
        "temperature": 0.4
      },
      "generic_llm_stream": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 8192,
        "temperature": 0.7
      },
      "streaming": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-flash"],
        "max_tokens": 4096,
        "temperature": 0.7
      },
      "unknown": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4-5-20250929"],
        "max_tokens": 2048,
        "temperature": 0.5
      }
    },
    "max_concurrent_jobs": 20
}'::jsonb,
  'Task-driven AI settings with no global default models - complete original data preserved'
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- Insert billing configuration defaults
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
  ('billing_free_credits_expiry_days', '"180"', 'Number of days before free credits expire for new users'),
  ('billing_free_credits_amount', '"10.00"', 'Amount of free credits (USD) granted to new users'),
  ('billing_max_credit_purchase', '1000', 'Maximum amount of credits that can be purchased in a single transaction')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- Insert credit purchase fee tiers configuration
INSERT INTO application_configurations (config_key, config_value, description)
VALUES (
  'credit_purchase_fee_tiers',
  '{
    "tiers": [
      {
        "min": 3,
        "max": 12,
        "fee_rate": 0.20,
        "label": "STARTER"
      },
      {
        "min": 12,
        "max": 99,
        "fee_rate": 0.10,
        "label": "SAVER"
      },
      {
        "min": 99,
        "max": null,
        "fee_rate": 0.05,
        "label": "BULK"
      }
    ]
  }'::jsonb,
  'Fee tiers for credit purchases based on amount ranges'
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;