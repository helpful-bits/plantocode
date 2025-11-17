INSERT INTO application_configurations (config_key, config_value, description)
VALUES (
  'ai_settings',
  '{
    "tasks": {
      "implementation_plan": {
        "model": "openai/gpt-5.1-2025-11-13",
        "allowed_models": ["openai/o3", "openai/gpt-5.1-2025-11-13", "deepseek/deepseek-r1-0528", "moonshotai/kimi-k2", "google/gemini-2.5-pro", "xai/grok-4", "anthropic/claude-sonnet-4-5-20250929"],
        "max_tokens": 23000,
        "temperature": 0.7,
        "copy_buttons": [
          {
            "label": "Parallel Claude Coding Agents",
            "content": "Original Task: {{TASK_DESCRIPTION}}\n\n{{IMPLEMENTATION_PLAN}}\n\nUnderstand the implementation plan above thoroughly. Study the architecture, data flows, sequence of events, and timing relationships in the existing code. Launch parallel Claude coding agents that execute simultaneously to save time. Each agent should implement a specific aspect of the plan precisely and systematically based on their deep understanding of how the system works.\n\nProvide each agent with explicit, detailed instructions about their exact responsibilities. Do NOT instruct agents to run git, cargo, or TypeScript check commands or add logging/debugging code.\n\nCRITICAL: Remove all deprecated features completely - no deprecated comments, annotations, or fallback implementations. The codebase should only contain modern, forward-looking code."
          },
          {
            "label": "Investigate Results",
            "content": "Review the results from all launched agents and verify that the complete implementation plan has been executed correctly. Perform a thorough self-check by reading the modified files and analyzing the changes - do NOT launch additional background agents.\n\nAnalyze the code to understand the data flows, sequence of events, and timing of operations. Confirm that every aspect of the plan has been properly implemented based on code evidence and architectural requirements."
          },
          {
            "label": "Task",
            "content": "{{TASK_DESCRIPTION}}"
          },
          {
            "label": "Task + Plan",
            "content": "Task:\n{{TASK_DESCRIPTION}}\n\nImplementation Plan:\n{{IMPLEMENTATION_PLAN}}"
          },
          {
            "label": "Plan",
            "content": "{{IMPLEMENTATION_PLAN}}"
          }
        ]
      },
      "implementation_plan_title": {
        "model": "openai/gpt-5-mini",
        "allowed_models": ["openai/gpt-5-mini", "google/gemini-2.5-flash", "anthropic/claude-sonnet-4-5-20250929"],
        "max_tokens": 500,
        "temperature": 0.2
      },
      "implementation_plan_merge": {
        "model": "openai/gpt-5.1-2025-11-13",
        "allowed_models": ["google/gemini-2.5-flash", "openai/gpt-5.1-2025-11-13", "google/gemini-2.5-pro", "moonshotai/kimi-k2", "openai/o4-mini", "xai/grok-4"],
        "max_tokens": 35000,
        "temperature": 0.35
      },
      "text_improvement": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-pro", "openai/gpt-5.1-2025-11-13"],
        "max_tokens": 4096,
        "temperature": 0.45
      },
      "voice_transcription": {
        "model": "openai/gpt-4o-transcribe",
        "allowed_models": ["openai/gpt-4o-transcribe", "openai/gpt-4o-mini-transcribe"],
        "max_tokens": 4096,
        "temperature": 0.0
      },
      "regex_file_filter": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-flash"],
        "max_tokens": 35000,
        "temperature": 0.2
      },
      "task_refinement": {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "allowed_models": ["anthropic/claude-sonnet-4-5-20250929", "google/gemini-2.5-pro", "openai/o4-mini"],
        "max_tokens": 16384,
        "temperature": 0.4
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
        "model": "openai/gpt-5.1-2025-11-13",
        "allowed_models": ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/o4-mini", "openai/gpt-5.1-2025-11-13"],
        "max_tokens": 30000,
        "temperature": 0.2
      },
      "web_search_execution": {
        "model": "openai/gpt-5-mini",
        "allowed_models": ["openai/o3", "openai/o4-mini", "openai/gpt-5.1-2025-11-13", "openai/gpt-5-mini"],
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
  ('billing_free_credits_amount', '"2.00"', 'Amount of free credits (USD) granted to new users'),
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