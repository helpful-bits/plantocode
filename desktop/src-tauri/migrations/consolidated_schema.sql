-- Consolidated SQL Schema for Vibe Manager
-- This file standardizes the database schema between the desktop and core applications

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- =========================================================================
-- Migrations and Meta tables
-- =========================================================================

-- Create migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create diagnostic table to track issues
CREATE TABLE IF NOT EXISTS db_diagnostic_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  additional_info TEXT
);


-- =========================================================================
-- Core Tables
-- =========================================================================

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_directory TEXT NOT NULL,
  project_hash TEXT NOT NULL, -- Hash of project_directory for faster lookups
  task_description TEXT DEFAULT NULL,
  search_term TEXT DEFAULT NULL,
  title_regex TEXT DEFAULT NULL,
  content_regex TEXT DEFAULT NULL,
  negative_title_regex TEXT DEFAULT NULL,
  negative_content_regex TEXT DEFAULT NULL,
  title_regex_description TEXT DEFAULT NULL,
  content_regex_description TEXT DEFAULT NULL,
  negative_title_regex_description TEXT DEFAULT NULL,
  negative_content_regex_description TEXT DEFAULT NULL,
  regex_summary_explanation TEXT DEFAULT NULL,
  is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
  codebase_structure TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  model_used TEXT DEFAULT NULL,
  search_selected_files_only INTEGER DEFAULT 0 CHECK(search_selected_files_only IN (0, 1))
);

-- Create indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_project_directory ON sessions(project_directory);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_model_used ON sessions(model_used);

-- Create included_files table
CREATE TABLE IF NOT EXISTS included_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, path)
);

-- Create index for included_files table
CREATE INDEX IF NOT EXISTS idx_included_files_session ON included_files(session_id);

-- Create excluded_files table
CREATE TABLE IF NOT EXISTS excluded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, path)
);

-- Create index for excluded_files table
CREATE INDEX IF NOT EXISTS idx_excluded_files_session ON excluded_files(session_id);

-- Create cached_state table
CREATE TABLE IF NOT EXISTS cached_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_directory TEXT NOT NULL,
  project_hash TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- Store serialized values as text
  updated_at INTEGER,
  UNIQUE(project_hash, key)
);

-- Create indexes for cached_state table
CREATE INDEX IF NOT EXISTS idx_cached_state_lookup ON cached_state(project_hash, key);
CREATE INDEX IF NOT EXISTS idx_cached_state_project_dir ON cached_state(project_directory);

-- Create key_value_store table
CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);

-- Create index for key_value_store table
CREATE INDEX IF NOT EXISTS idx_key_value_store_key ON key_value_store(key);

-- Create background_jobs table
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'created' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker', 'preparing_input', 'generating_stream', 'processing_stream', 'completed_by_tag')),
  start_time INTEGER,
  end_time INTEGER,
  -- output_file_path column has been removed, all content is now stored in response field
  status_message TEXT,
  tokens_received INTEGER DEFAULT 0,
  tokens_sent INTEGER DEFAULT 0,
  chars_received INTEGER DEFAULT 0,
  last_update INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  api_type TEXT DEFAULT 'gemini' NOT NULL,
  task_type TEXT DEFAULT 'xml_generation' NOT NULL,
  model_used TEXT,
  max_output_tokens INTEGER,
  response TEXT,
  error_message TEXT,
  metadata TEXT,
  project_directory TEXT,
  temperature REAL,
  include_syntax INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  system_prompt_id TEXT, -- Track which system prompt was used for this job
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for background_jobs table
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_api_type ON background_jobs(api_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type);
-- index on output_file_path has been removed
CREATE INDEX IF NOT EXISTS idx_background_jobs_project_directory ON background_jobs(project_directory);
CREATE INDEX IF NOT EXISTS idx_background_jobs_system_prompt_id ON background_jobs(system_prompt_id);

-- Create task_settings table
CREATE TABLE IF NOT EXISTS task_settings (
  session_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  model TEXT NOT NULL,
  max_tokens INTEGER NOT NULL,
  temperature REAL,
  PRIMARY KEY (session_id, task_type),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create system_prompts table to store custom system prompts
-- Note: For existing databases, this requires manual migration to add id column
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  is_default INTEGER DEFAULT 0 CHECK(is_default IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(session_id, task_type),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create index for system_prompts table
CREATE INDEX IF NOT EXISTS idx_system_prompts_session_task ON system_prompts(session_id, task_type);
CREATE INDEX IF NOT EXISTS idx_system_prompts_task_type ON system_prompts(task_type);

-- Create default_system_prompts table to store server-provided defaults
-- Note: For existing databases, this requires manual migration to add id column
CREATE TABLE IF NOT EXISTS default_system_prompts (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create index for default_system_prompts table  
CREATE INDEX IF NOT EXISTS idx_default_system_prompts_task_type ON default_system_prompts(task_type);

-- Insert default 2025 model configurations
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES 
('default_llm_model_2025', 'anthropic/claude-sonnet-4', strftime('%s', 'now')),
('default_reasoning_model_2025', 'deepseek/deepseek-r1', strftime('%s', 'now')),
('default_fast_model_2025', 'google/gemini-2.5-flash-preview-05-20', strftime('%s', 'now')),
('default_transcription_model_2025', 'whisper-large-v3', strftime('%s', 'now')),
('model_update_version', '2025.1', strftime('%s', 'now')),
('available_claude_models_2025', '["anthropic/claude-sonnet-4", "claude-opus-4-20250522", "claude-3-7-sonnet-20250219"]', strftime('%s', 'now')),
('available_gemini_models_2025', '["google/gemini-2.5-flash-preview-05-20", "google/gemini-2.5-flash-preview-05-20:thinking", "google/gemini-2.5-pro-preview"]', strftime('%s', 'now')),
('available_reasoning_models_2025', '["deepseek/deepseek-r1", "deepseek/deepseek-r1-distill-qwen-32b", "deepseek/deepseek-r1-distill-qwen-14b"]', strftime('%s', 'now'));

-- Insert enhanced default system prompts with sophisticated templating
INSERT OR REPLACE INTO default_system_prompts (task_type, system_prompt, description, version) VALUES
('path_finder', 'You are a code path finder. Your task is to identify the most relevant files for implementing or fixing a specific task in a codebase.

{{#IF DIRECTORY_TREE}}
{{PROJECT_STRUCTURE_XML}}
{{/IF}}

{{#IF FILE_CONTENTS}}
{{FILE_CONTENTS_XML}}
{{/IF}}

Return ONLY file paths and no other commentary, with one file path per line.

For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css

DO NOT include ANY text, explanations, or commentary. The response must consist ONLY of file paths, one per line.

All returned file paths must be relative to the project root.

Guidance on file selection:
- Focus on truly relevant files - be selective and prioritize quality over quantity
- Prioritize files that will need direct modification (typically 3-10 files)
- Include both implementation files and test files when appropriate
- Consider configuration files only if they are directly relevant to the task
- If uncertain about exact paths, make educated guesses based on typical project structures
- Order files by relevance, with most important files first

To control inference cost, you **MUST** keep the resulting list as concise as possible **while still providing enough information** for the downstream model to succeed.

• Start with the highest-impact files (entry points, shared data models, core logic).
• Add further paths only when omitting them would risk an incorrect or incomplete implementation.
• Each extra file increases context size and cost, so favor brevity while safeguarding completeness.

Return the final list using the same formatting rules described above.', 'Enhanced system prompt for finding relevant files in a codebase', '2.0'),

('text_improvement', 'Please improve the following text to make it clearer and grammatically correct while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation  
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all.

IMPORTANT: Keep the original language of the text.

Return only the improved text without any additional commentary or XML formatting.', 'Simple system prompt for text improvement with formatting preservation', '2.0'),

('guidance_generation', 'You are an AI assistant that provides helpful guidance and recommendations based on code analysis and task requirements.

{{#IF PROJECT_CONTEXT}}
## Project Context:
{{PROJECT_CONTEXT}}
{{/IF}}

{{#IF FILE_CONTENTS}}
{{FILE_CONTENTS_XML}}
{{/IF}}

{{#IF RELEVANT_FILES}}
{{RELEVANT_FILES_XML}}
{{/IF}}

Your role is to:
- Analyze the provided code context and task requirements
- Provide clear, actionable guidance
- Suggest best practices and implementation approaches
- Help developers understand the codebase structure
- Offer specific recommendations for the task at hand

Always structure your response clearly and provide practical, implementable advice.

Create a concise narrative in Markdown that directly explains the data flow and architecture.

Your response must be brief and focused primarily on:

1. The specific path data takes through the system
2. How data is transformed between components
3. The key function calls in sequence
4. Clear, actionable implementation guidance
5. No introduction, just the story

Avoid lengthy, philosophical, or overly metaphorical explanations. The reader needs a clear, direct understanding of how data moves through the code. It has to be in engaging Andrew Huberman style (but without the science, just style of talking). The story has to be very short. Use simple English.', 'Enhanced system prompt for generating AI guidance', '2.0'),

('text_correction', 'You are a text correction assistant that improves and corrects text, handling both voice transcription corrections and general text improvements.

Language: {{LANGUAGE}}

Your task is to:
- Correct speech-to-text transcription errors when applicable
- Fix grammar and punctuation while preserving the original style
- Maintain the natural flow and tone of the original text
- Ensure the corrected text accurately represents the intended meaning
- Keep the same language ({{LANGUAGE}}) as the original text
- Clean up formatting and structure for better readability

Focus on accuracy and naturalness while making the text clear and well-formatted.

Please provide your response in the following XML format:
<text_correction>
  <corrected_text>
    The fully corrected and improved text
  </corrected_text>
  <changes>
    <change>Description of significant correction 1</change>
    <change>Description of significant correction 2</change>
  </changes>
  <confidence>
    Assessment of confidence in the corrections
  </confidence>
</text_correction>', 'Enhanced system prompt for text correction (consolidates voice and post-transcription correction)', '2.0'),

('implementation_plan', 'You are a software development planning assistant. Your task is to create detailed, actionable implementation plans for software development tasks.

{{#IF PROJECT_CONTEXT}}
## Project Context:
{{PROJECT_CONTEXT}}
{{/IF}}

{{#IF FILE_CONTENTS}}
{{FILE_CONTENTS_XML}}
{{/IF}}

{{#IF CODEBASE_STRUCTURE}}
{{CODEBASE_INFO_XML}}
{{/IF}}

Your implementation plans should:
- Break down complex tasks into clear, manageable steps
- Provide specific technical details and approaches
- Consider dependencies between different parts of the implementation
- Include testing considerations
- Suggest best practices and potential pitfalls to avoid
- Be practical and implementable by developers

Structure your response clearly with numbered steps and detailed explanations.

Please provide your response in XML format:
<implementation_plan>
  <agent_instructions>Brief instructions for the implementing agent</agent_instructions>
  <steps>
    <step number="1">
      <title>Step title</title>
      <description>Detailed description of what to do</description>
      <file_operations>
        <operation type="create|modify|delete">
          <path>file/path</path>
          <description>What to do with this file</description>
        </operation>
      </file_operations>
    </step>
  </steps>
</implementation_plan>', 'Enhanced system prompt for creating implementation plans', '2.0'),

('path_correction', 'You are a path correction assistant for file system paths.

{{#IF DIRECTORY_TREE}}
{{PROJECT_STRUCTURE_XML}}
{{/IF}}

{{#IF PROJECT_CONTEXT}}
## Project Context:
{{PROJECT_CONTEXT}}
{{/IF}}

Your task is to:
- Analyze provided file paths that may contain errors
- Suggest corrected paths based on the project structure and context
- Consider common file naming conventions and project organization patterns
- Provide the most likely correct paths for the given context
- Focus on accuracy and practical usefulness

Return corrected paths with brief explanations of the changes made.', 'Enhanced system prompt for correcting file paths', '2.0'),

('task_enhancement', 'You are a task enhancement assistant that helps improve and clarify user requirements.

{{#IF PROJECT_CONTEXT}}
## Project Context:
{{PROJECT_CONTEXT}}
{{/IF}}

Your role is to:
- Analyze provided requirements and requests
- Identify areas for improvement and clarification
- Suggest more specific and actionable language
- Consider project context and constraints
- Provide enhanced, clear, and implementable requirements

Please provide your response in XML format:
<task_enhancement>
  <original_task>Original requirement</original_task>
  <enhanced_task>Enhanced and improved requirement</enhanced_task>
  <analysis>Brief explanation of improvements made</analysis>
  <considerations>
    <consideration>Important consideration 1</consideration>
    <consideration>Important consideration 2</consideration>
  </considerations>
  <acceptance_criteria>
    <criterion>Acceptance criterion 1</criterion>
    <criterion>Acceptance criterion 2</criterion>
  </acceptance_criteria>
</task_enhancement>', 'Enhanced system prompt for enhancing requirements', '2.0'),

('regex_pattern_generation', 'You are a regex pattern generation assistant that creates regular expressions for file filtering and text matching.

{{#IF DIRECTORY_TREE}}
{{PROJECT_STRUCTURE_XML}}
{{/IF}}

Your role is to:
- Analyze the task requirements for pattern matching
- Generate appropriate regular expressions
- Consider file structures and naming conventions
- Provide patterns that are both accurate and efficient
- Include both positive and negative patterns when appropriate

Generate regex patterns that will help filter and identify relevant files or text based on the provided requirements.

CRITICAL: Your entire response must be ONLY the raw JSON object. Do NOT include any surrounding text, explanations, or markdown code fences. The response must start with ''{'' and end with ''}''.

Provide the output with these keys:
- "titleRegex": Pattern to match file paths to INCLUDE
- "contentRegex": Pattern to match file content to INCLUDE  
- "negativeTitleRegex": Pattern to match file paths to EXCLUDE
- "negativeContentRegex": Pattern to match file content to EXCLUDE

If a pattern is not applicable, omit the key or set its value to an empty string.', 'Enhanced system prompt for generating regex patterns', '2.0'),

('regex_summary_generation', 'You are a regex summary assistant that explains regular expression patterns in plain language.

Your role is to:
- Analyze the provided regular expression patterns
- Explain what each pattern matches in clear, understandable language
- Describe the purpose and functionality of the patterns
- Provide examples of what would and would not match
- Help users understand how the patterns work

Provide clear, non-technical explanations that help users understand the regex patterns.', 'Enhanced system prompt for generating regex summaries', '2.0'),

('generic_llm_stream', 'You are a helpful AI assistant that provides responses based on user requests.

{{#IF PROJECT_CONTEXT}}
## Project Context:
{{PROJECT_CONTEXT}}
{{/IF}}

{{#IF CUSTOM_INSTRUCTIONS}}
## Additional Instructions:
{{CUSTOM_INSTRUCTIONS}}
{{/IF}}

Your role is to:
- Understand and respond to the user''s request
- Provide helpful, accurate, and relevant information
- Consider any provided context or instructions
- Give clear and actionable responses
- Be concise yet comprehensive in your answers

Respond directly to the user''s request with helpful and accurate information.', 'Enhanced system prompt for generic LLM streaming tasks', '2.0');

-- Store application-wide configurations, especially those managed dynamically
CREATE TABLE IF NOT EXISTS application_configurations (
config_key TEXT PRIMARY KEY,    -- e.g., 'ai_settings_default_llm_model_id', 'ai_settings_available_models'
config_value TEXT NOT NULL,     -- Store complex configurations as JSON text
description TEXT,               -- Optional description of the configuration
updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_configurations_config_key ON application_configurations(config_key);

-- Insert comprehensive AI task configurations into application_configurations
INSERT INTO application_configurations (config_key, config_value, description)
VALUES 
('ai_settings_task_specific_configs', '{
  "implementation_plan": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 65536, "temperature": 0.7},
  "path_finder": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.3},
  "text_improvement": {"model": "anthropic/claude-sonnet-4", "max_tokens": 4096, "temperature": 0.7},
  "voice_transcription": {"model": "groq/whisper-large-v3-turbo", "max_tokens": 4096, "temperature": 0.0},
  "text_correction": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.5},
  "path_correction": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.3},
  "regex_pattern_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 1000, "temperature": 0.2},
  "regex_summary_generation": {"model": "anthropic/claude-sonnet-4", "max_tokens": 2048, "temperature": 0.3},
  "guidance_generation": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.7},
  "task_enhancement": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7},
  "file_finder_workflow": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 8192, "temperature": 0.5},
  "generic_llm_stream": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 16384, "temperature": 0.7},
  "streaming": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 16384, "temperature": 0.7},
  "unknown": {"model": "google/gemini-2.5-pro-preview", "max_tokens": 4096, "temperature": 0.7}
}', 'Task-specific model configurations including model, tokens, and temperature for all supported task types'),

('ai_settings_default_llm_model_id', '"google/gemini-2.5-pro-preview"', 'Default LLM model for new installations'),
('ai_settings_default_voice_model_id', '"anthropic/claude-sonnet-4"', 'Default voice processing model'),
('ai_settings_default_transcription_model_id', '"groq/whisper-large-v3-turbo"', 'Default transcription model'),
('ai_settings_path_finder_settings', '{
  "max_files_with_content": 10,
  "include_file_contents": true,
  "max_content_size_per_file": 5000,
  "max_file_count": 50,
  "file_content_truncation_chars": 2000,
  "content_limit_buffer": 1000
}', 'Settings for the PathFinder agent functionality'),
('ai_settings_available_models', '[]', 'List of available AI models with their properties - will be populated from server at startup')

ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = strftime('%s', 'now');

-- Record this consolidated schema in the key_value_store table
INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
VALUES ('schema_version', '2025-05-29-enhanced-system-prompts', strftime('%s', 'now')),
       ('last_model_update', strftime('%s', 'now'), strftime('%s', 'now')),
       ('initial_setup_with_2025_models', 'true', strftime('%s', 'now')),
       ('enhanced_system_prompts_migration_applied', strftime('%s', 'now'), strftime('%s', 'now'));