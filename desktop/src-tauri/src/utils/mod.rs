pub mod directory_tree;
pub mod fs_utils;
pub mod git_utils;
pub mod hash_utils;
pub mod path_utils;
pub mod token_estimator;
pub mod error_utils;
pub mod file_lock_types;
pub mod file_lock_manager;
pub mod job_creation_utils;
pub mod job_metadata_builder;
pub mod job_ui_metadata_builder;
pub mod date_utils;
pub mod env_utils;
pub mod xml_utils;
pub mod markdown_utils;
pub mod config_resolver;
pub mod context_resolver;


pub use directory_tree::{generate_directory_tree, DirectoryTreeOptions};
pub use path_utils::{
    normalize_path, is_absolute_path, get_parent_directory, get_file_name, get_file_extension,
    join_paths, make_relative_to, matches_any_pattern, is_ignored_by_git, 
    filter_paths_by_patterns, get_app_data_root_dir, get_app_output_files_directory,
    get_project_output_files_directory, get_project_implementation_plans_directory, sanitize_filename,
    create_unique_output_filepath, create_custom_unique_filepath, get_project_custom_directory
};
pub use token_estimator::{
    estimate_tokens, estimate_code_tokens, estimate_structured_data_tokens,
    estimate_tokens_for_texts, estimate_conversation_tokens, estimate_path_finder_tokens,
    get_model_context_window
};
pub use file_lock_types::{FileLockId, LockMode, FileLockGuard};
pub use file_lock_manager::FileLockManager;
pub use job_creation_utils::create_and_queue_background_job;
pub use job_metadata_builder::{JobMetadataBuilder, PathFinderMetadata, RegexMetadata, FileFinderWorkflowMetadata};
pub use job_ui_metadata_builder::{JobUIMetadataBuilder, create_simple_job_ui_metadata, create_workflow_job_ui_metadata, create_streaming_job_ui_metadata};
pub use date_utils::get_timestamp;
pub use error_utils::*;
pub use env_utils::{read_env, read_env_bool, read_env_i64, read_env_f64};
pub use xml_utils::extract_xml_from_markdown;
pub use markdown_utils::extract_json_from_markdown;
pub use config_resolver::resolve_model_settings;
pub use context_resolver::{get_project_directory_from_session, get_directory_tree_from_session, get_api_type_from_task_type, calculate_total_tokens, get_response_length, resolve_job_context, JobContext};
// UNIFIED PROMPT SYSTEM - CONSOLIDATES LEGACY PROMPT SYSTEMS
pub mod unified_prompt_system;
pub use unified_prompt_system::{UnifiedPromptProcessor, UnifiedPromptContext, UnifiedPromptContextBuilder, ComposedPrompt, PromptPlaceholders, substitute_placeholders, generate_system_prompt_id, get_template_for_display, convert_to_template};