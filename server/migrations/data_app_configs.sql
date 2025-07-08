INSERT INTO application_configurations (config_key, config_value, description)
VALUES (
  'ai_settings',
  '{
    "tasks": {
      "implementation_plan": {
        "model": "google/gemini-2.5-pro",
        "allowed_models": ["openai/o3", "openai/o4-mini", "deepseek/deepseek-r1-0528", "google/gemini-2.5-pro"],
        "max_tokens": 23000,
        "temperature": 0.7,
        "copy_buttons": [
          {
            "label": "Parallel Claude Coding Agents",
            "content": "{{IMPLEMENTATION_PLAN}}\nNOW, think deeply! Read the files mentioned, understand them and launch parallel Claude coding agents that run AT THE SAME TIME TO SAVE TIME and implement EVERY SINGLE aspect of the perfect plan precisely and systematically, and instruct the agents EXACTLY about what they are supposed to do in great detail. Think even more deeply to give REALLY clear instructions for the agents! Instruct each of the agents NOT to run any git, cargo, or TypeScript check commands. I do not need deprecated comments or annotations; the deprecated or fallback features must be COMPLETELY REMOVED!"
          },
          {
            "label": "Investigate Results",
            "content": "Investigate the results of the work of each of the agents, and be sure that we have implemented the plan CORRECTLY!"
          }
        ]
      },
      "implementation_plan_merge": {
        "model": "google/gemini-2.5-pro",
        "allowed_models": ["google/gemini-2.5-flash", "google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 35000,
        "temperature": 0.35
      },
      "text_improvement": {
        "model": "anthropic/claude-sonnet-4-20250514",
        "allowed_models": ["anthropic/claude-sonnet-4-20250514", "google/gemini-2.5-flash"],
        "max_tokens": 4096,
        "temperature": 0.7
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
        "model": "anthropic/claude-sonnet-4-20250514",
        "allowed_models": ["anthropic/claude-sonnet-4-20250514", "google/gemini-2.5-flash"],
        "max_tokens": 1000,
        "temperature": 0.2
      },
      "task_refinement": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 16384,
        "temperature": 0.3
      },
      "extended_path_finder": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 8192,
        "temperature": 0.3
      },
      "file_relevance_assessment": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 24000,
        "temperature": 0.15
      },
      "file_finder_workflow": {
        "model": "google/gemini-2.5-flash",
        "max_tokens": 2048,
        "temperature": 0.3
      },
      "web_search_prompts_generation": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 30000,
        "temperature": 0.35
      },
      "web_search_execution": {
        "model": "openai/o4-mini",
        "allowed_models": ["openai/o3", "openai/o4-mini"],
        "max_tokens": 4000,
        "temperature": 0.3
      },
      "generic_llm_stream": {
        "model": "anthropic/claude-sonnet-4-20250514",
        "allowed_models": ["anthropic/claude-sonnet-4-20250514", "google/gemini-2.5-flash", "openai/o4-mini"],
        "max_tokens": 8192,
        "temperature": 0.7
      },
      "streaming": {
        "model": "anthropic/claude-sonnet-4-20250514",
        "allowed_models": ["anthropic/claude-sonnet-4-20250514", "google/gemini-2.5-flash"],
        "max_tokens": 4096,
        "temperature": 0.7
      },
      "unknown": {
        "model": "google/gemini-2.5-flash",
        "allowed_models": ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4-20250514"],
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