pub mod config_helpers;
pub mod config_resolver;
pub mod context_resolver;
pub mod date_utils;
pub mod device_name;
pub mod directory_tree;
pub mod env_utils;
pub mod error_utils;
pub mod ffmpeg_utils;
pub mod file_lock_manager;
pub mod file_lock_types;
pub mod fs_utils;
pub mod git_utils;
pub mod hash_utils;
pub mod job_creation_utils;
pub mod job_metadata_builder;
pub mod job_ui_metadata_builder;
pub mod markdown_utils;
pub mod path_extraction;
pub mod path_utils;
pub mod title_generation;
pub mod token_estimator;
pub mod xml_utils;

pub use config_helpers::{
    get_default_max_tokens_for_task, get_default_temperature_for_task,
    get_default_transcription_model_id, get_max_concurrent_jobs, get_model_context_window,
    get_model_for_task, get_model_info,
};
pub use config_resolver::resolve_model_settings;
pub use context_resolver::{
    JobContext, calculate_total_tokens, get_api_type_from_task_type,
    get_directory_tree_from_session, get_project_directory_from_session, get_response_length,
    resolve_job_context,
};
pub use date_utils::get_timestamp;
pub use device_name::get_device_display_name;
pub use directory_tree::{DirectoryTreeOptions, generate_directory_tree};
pub use env_utils::{read_env, read_env_bool, read_env_f64, read_env_i64};
pub use error_utils::*;
pub use file_lock_manager::FileLockManager;
pub use file_lock_types::{FileLockGuard, FileLockId, LockMode};
pub use job_creation_utils::create_and_queue_background_job;
pub use job_metadata_builder::{
    FileFinderWorkflowMetadata, JobMetadataBuilder, PathFinderMetadata, RegexMetadata,
};
pub use job_ui_metadata_builder::{
    JobUIMetadataBuilder, create_simple_job_ui_metadata, create_streaming_job_ui_metadata,
    create_workflow_job_ui_metadata,
};
pub use markdown_utils::extract_json_from_markdown;
pub use path_extraction::extract_file_paths_from_implementation_plan;
pub use path_utils::{
    create_custom_unique_filepath, create_unique_output_filepath, filter_paths_by_patterns,
    get_app_data_root_dir, get_app_output_files_directory, get_file_extension, get_file_name,
    get_parent_directory, get_project_custom_directory, get_project_implementation_plans_directory,
    get_project_output_files_directory, is_absolute_path, is_ignored_by_git, join_paths,
    make_relative_to, matches_any_pattern, normalize_path, sanitize_filename,
};
pub use token_estimator::estimate_tokens;
pub use xml_utils::{
    extract_query_from_task, extract_research_tasks, extract_task_title, extract_xml_from_markdown,
};
// UNIFIED PROMPT SYSTEM - CONSOLIDATES LEGACY PROMPT SYSTEMS
pub mod unified_prompt_system;
pub use unified_prompt_system::{
    ComposedPrompt, PromptPlaceholders, UnifiedPromptContext, UnifiedPromptContextBuilder,
    UnifiedPromptProcessor, convert_to_template, generate_system_prompt_id,
    get_template_for_display, substitute_placeholders,
};
pub mod stream_debug_logger;
pub mod workspace_roots;
