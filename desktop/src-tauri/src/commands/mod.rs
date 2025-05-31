// Re-export all command modules
pub mod regex_commands;
pub mod regex_summary_commands;
pub mod guidance_commands;
pub mod file_system_commands;
pub mod app_commands;
pub mod auth0_commands;
pub mod billing_commands;
pub mod config_commands;
pub mod job_commands;
pub mod db_commands;
pub mod settings_commands;
pub mod session_commands;

// New modular task command modules
pub mod text_commands;
pub mod implementation_plan_commands;
pub mod path_finding_commands;
pub mod file_finder_workflow_commands;
pub mod voice_commands;
pub mod generic_task_commands;
pub mod setup_commands;
pub mod database_maintenance_commands;
pub mod server_config_commands;
pub mod system_prompt_commands;

// Re-export all command functions for easier imports
pub use regex_commands::{generate_regex_command, generate_regex_patterns_command};
pub use regex_summary_commands::generate_regex_summary_command;
pub use guidance_commands::generate_guidance_command;
pub use file_system_commands::{
    get_home_directory_command,
    list_files_command,
    create_directory_command,
    read_file_content_command,
    write_file_content_command,
    create_unique_filepath_command,
    delete_file_command,
    move_file_command,
    path_join_command,
    path_dirname_command,
    path_basename_command,
    path_extname_command,
    get_app_data_directory_command,
    sanitize_filename_command,
    normalize_path_command,
    get_temp_dir_command,
    path_is_absolute_command,
    cancel_workflow_stage_command,
};
pub use app_commands::{
    get_app_info,
    get_config_load_error,
    get_database_info_command,
};

// Re-exports from text commands module
pub use text_commands::{
    improve_text_command,
    correct_text_command,
    generate_simple_text_command,
};

// Re-exports from implementation plan commands module
pub use implementation_plan_commands::{
    create_implementation_plan_command,
    read_implementation_plan_command,
    get_implementation_plan_prompt_command,
    estimate_implementation_plan_tokens_command,
};

// Re-exports from path finding commands module
pub use path_finding_commands::{
    find_relevant_files_command,
    generate_directory_tree_command,
    create_path_correction_job_command,
};

// Re-exports from file finder workflow commands module  
pub use file_finder_workflow_commands::{
    start_file_finder_workflow,
    get_file_finder_workflow_status,
    get_file_finder_workflow_results,
    cancel_file_finder_workflow,
    pause_file_finder_workflow,
    resume_file_finder_workflow,
    retry_workflow_stage_command,
    get_all_workflows_command,
    get_workflow_details_command,
};

// Re-exports from voice commands module
pub use voice_commands::{
    create_transcription_job_command,
    transcribe_audio_direct_command,
};

// Re-exports from generic task commands module
pub use generic_task_commands::{
    generic_llm_stream_command,
    enhance_task_description_command,
};

// Re-exports from auth0 commands module
pub use auth0_commands::{
    start_auth0_login_flow,
    check_auth_status_and_exchange_token,
    refresh_app_jwt_auth0,
    logout_auth0,
    get_user_info_with_app_jwt,
    get_app_jwt,
    set_app_jwt,
    clear_stored_app_jwt,
};

// Re-exports from config commands module
pub use config_commands::{
    get_available_ai_models,
    get_default_task_configurations,
    fetch_runtime_ai_config,
    get_server_url,
};


// Re-exports from job commands module
pub use job_commands::{
    clear_job_history_command,
    get_active_jobs_command,
    delete_background_job_command,
    cancel_background_job_command,
    cancel_session_jobs_command,
    get_background_job_by_id_command,
};

// Re-exports from db commands module
pub use db_commands::{
    db_execute_query,
    db_select_query,
    db_execute_transaction,
    db_table_exists,
};

// Re-exports from settings commands module
pub use settings_commands::{
    get_key_value_command,
    set_key_value_command,
    get_project_task_model_settings_command,
    set_project_task_model_settings_command,
    get_all_task_model_settings_for_project_command,
    validate_configuration_health,
    set_onboarding_completed_command,
    is_onboarding_completed_command,
};

// Re-exports from session commands module
pub use session_commands::{
    create_session_command,
    get_session_command,
    get_sessions_for_project_command,
    update_session_command,
    delete_session_command,
    rename_session_command,
    update_session_project_directory_command,
    clear_all_project_sessions_command,
    update_session_fields_command,
};

// Re-exports from setup commands module
pub use setup_commands::{trigger_initial_keychain_access, get_storage_mode};

// Re-exports from database maintenance commands module
pub use database_maintenance_commands::{
    check_database_health_command,
    repair_database_command,
    reset_database_command,
};

// Re-exports from server config commands module
pub use server_config_commands::{
    fetch_server_configurations_command,
    get_cached_config_value_command,
    get_all_cached_config_values_command,
    refresh_server_config_cache_command,
};

// Re-exports from system prompt commands module
pub use system_prompt_commands::{
    get_system_prompt_command,
    set_system_prompt_command,
    reset_system_prompt_command,
    get_default_system_prompts_command,
    get_default_system_prompt_command,
    has_custom_system_prompt_command,
};

// Re-exports from billing commands module
pub use billing_commands::{
    get_subscription_details_command,
    create_checkout_session_command,
    create_billing_portal_command,
    get_spending_status_command,
    acknowledge_spending_alert_command,
    update_spending_limits_command,
    get_invoice_history_command,
    get_spending_history_command,
    check_service_access_command,
};

// All command functions will return AppResult<T> directly