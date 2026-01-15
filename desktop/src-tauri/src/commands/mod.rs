// Re-export all command modules
pub mod account_commands;
pub mod app_commands;
pub mod audio_commands;
pub mod auth0_commands;
pub mod billing_commands;
pub mod config_commands;
pub mod db_commands;
pub mod disk_commands;
pub mod ffmpeg_commands;
pub mod file_system_commands;
pub mod geo_commands;
pub mod job_commands;
pub mod regex_commands;
pub mod session_commands;
pub mod settings_commands;

// New modular task command modules
pub mod backup_commands;
pub mod config_cache_commands;
pub mod consent_commands;
pub mod database_maintenance_commands;
pub mod device_commands;
pub mod error_recovery_commands;
pub mod generic_task_commands;
pub mod implementation_plan_commands;
pub mod prompt_commands;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod screen_recording_commands;
pub mod setup_commands;
pub mod text_commands;
#[cfg(any(target_os = "android", target_os = "ios"))]
pub mod screen_recording_commands {
    use tauri::command;

    #[command]
    pub fn stop_screen_recording(_app_handle: tauri::AppHandle) -> Result<(), String> {
        Err("Screen recording is not supported on mobile".to_string())
    }
}
pub mod image_commands;
pub mod logging_commands;
pub mod project_directory_commands;
pub mod terminal_commands;
pub mod video_analysis_commands;
pub mod video_utils_commands;
pub mod web_search_commands;
pub mod workflow_commands;

// Re-export all command functions for easier imports
pub use app_commands::{get_app_info, get_config_load_error, get_database_info_command};
pub use file_system_commands::{
    append_binary_file_command, create_directory_command, create_unique_filepath_command,
    delete_file_command, get_app_data_directory_command, get_home_directory_command,
    get_temp_dir_command, list_project_files_command, move_file_command, normalize_path_command,
    path_basename_command, path_dirname_command, path_extname_command, path_is_absolute_command,
    path_join_command, read_file_content_command, sanitize_filename_command,
    search_files_command, write_file_content_command,
};
pub use geo_commands::detect_user_region_command;
pub use regex_commands::{generate_regex_command, generate_regex_patterns_command};

// Re-exports from app commands module
pub use app_commands::get_resource_info_command;

// Re-exports from text commands module
pub use text_commands::{generate_simple_text_command, improve_text_command};

// Re-exports from audio commands module
pub use audio_commands::transcribe_audio_command;

// Re-exports from implementation plan commands module
pub use implementation_plan_commands::{
    create_implementation_plan_command, create_merged_implementation_plan_command,
    estimate_prompt_tokens_command, get_prompt_command, read_implementation_plan_command,
    update_implementation_plan_content_command, mark_implementation_plan_signed_off_command,
};

// Re-exports from workflow commands module
pub use workflow_commands::{
    cancel_workflow, cancel_workflow_stage_command, get_all_workflows_command,
    get_file_finder_roots_for_session, get_workflow_details_command, get_workflow_results,
    get_workflow_results_legacy, get_workflow_state, get_workflow_status, pause_workflow,
    resume_workflow, retry_workflow_command, retry_workflow_stage_command,
    start_file_finder_workflow,
};

// Re-exports from web search commands module
pub use web_search_commands::{
    continue_workflow_from_job_command, start_web_search_prompts_generation_job,
    start_web_search_workflow,
};

// Re-exports from prompt commands module
pub use prompt_commands::get_system_prompt_for_task;

// Re-exports from generic task commands module
pub use generic_task_commands::generic_llm_stream_command;

// Re-exports from account commands module
pub use account_commands::delete_account_command;

// Re-exports from auth0 commands module
pub use auth0_commands::{
    check_auth_status_and_exchange_token, clear_stored_app_jwt, get_app_jwt,
    get_user_info_with_app_jwt, logout_auth0, refresh_app_jwt_auth0, set_app_jwt,
    start_auth0_login_flow,
};

// Re-exports from config commands module
pub use config_commands::{
    fetch_runtime_ai_config, get_default_task_configurations, get_providers_with_models,
    get_server_url,
};

// Re-exports from job commands module
pub use job_commands::{
    cancel_background_job_command, cancel_session_jobs_command, clear_job_history_command,
    delete_background_job_command, get_all_visible_jobs_command, get_background_job_by_id_command,
};

// Re-exports from db commands module
pub use db_commands::{db_execute_query, db_execute_transaction, db_select_query, db_table_exists};

// Re-exports from settings commands module
pub use settings_commands::{
    fetch_default_system_prompt_from_server, fetch_default_system_prompts_from_server,
    get_key_value_command, get_project_task_model_settings_command,
    initialize_system_prompts_from_server, is_onboarding_completed_command,
    reset_project_task_setting_command, set_key_value_command, set_onboarding_completed_command,
    set_project_task_setting_command, validate_configuration_health,
};

// Re-exports from session commands module
pub use session_commands::{
    broadcast_active_session_changed_command, clear_all_project_sessions_command,
    create_session_command, delete_session_command,
    get_device_id_command, get_file_selection_history_command, get_history_state_command,
    get_session_command, get_sessions_for_project_command,
    get_task_description_history_command, merge_history_state_command,
    rename_session_command, sync_file_selection_history_command,
    sync_history_state_command, sync_task_description_history_command,
    update_session_command, update_session_fields_command,
    update_session_project_directory_command,
};

// Re-exports from setup commands module
pub use setup_commands::{get_storage_mode, trigger_initial_keychain_access};

// Re-exports from database maintenance commands module
pub use database_maintenance_commands::{
    check_database_health_command, repair_database_command, reset_database_command,
};

// Re-exports from config cache commands module
pub use config_cache_commands::{
    get_all_cached_config_values_command, get_cached_config_value, refresh_config_cache_command,
};

// Re-exports from billing commands module
pub use billing_commands::{
    check_service_access_command,
    create_billing_portal_session_command,
    // Stripe Checkout commands
    create_credit_purchase_checkout_session_command,
    create_setup_checkout_session_command,
    download_invoice_pdf_command,
    get_auto_top_off_settings_command,
    get_billing_dashboard_data_command,
    get_checkout_session_status_command,
    get_credit_balance_command,
    get_credit_details_command,
    get_credit_history_command,
    get_credit_stats_command,
    get_customer_billing_info_command,
    // Customer billing lifecycle management now handled via Stripe Portal
    get_detailed_usage_with_summary_command,
    get_payment_methods_command,
    get_spending_analytics_command,
    get_spending_forecast_command,
    get_spending_history_command,
    list_invoices_command,
    reveal_file_in_explorer_command,
    update_auto_top_off_settings_command,
};

// Re-exports from backup commands module
pub use backup_commands::{
    auto_restore_latest_backup_command, create_manual_backup_command, delete_backup_command,
    get_backup_stats_command, list_backups_command, restore_from_backup_command,
    verify_backup_command,
};

// Re-exports from error recovery commands module
pub use error_recovery_commands::{
    attempt_config_recovery, detect_config_issues, emergency_config_reset,
    get_config_health_status, rebuild_config_cache, validate_current_config,
};

// Re-exports from video analysis commands module
pub use video_analysis_commands::start_video_analysis_job;

// Re-exports from video utils commands module
pub use video_utils_commands::get_video_metadata_command;

// Re-exports from logging commands module
pub use logging_commands::{append_to_log_file, log_client_error};

// Re-exports from consent commands module
pub use consent_commands::{
    accept_consent_command, get_consent_status_command, get_current_legal_documents_command,
    verify_consent_command,
};

// Re-exports from terminal commands module
pub use terminal_commands::{
    attach_terminal_output_command, clear_terminal_log_command,
    get_active_terminal_sessions_command, get_terminal_metadata_command,
    get_terminal_session_status_command, graceful_exit_terminal_command,
    kill_terminal_session_command, list_terminal_sessions_command,
    reconnect_terminal_session_command, resize_terminal_session_command,
    restore_terminal_sessions_command, start_terminal_session_command,
    write_terminal_input_command,
};

// Re-exports from image commands module
pub use image_commands::save_pasted_image_command;

// Re-exports from project directory commands module
pub use project_directory_commands::broadcast_project_directory_changed_command;

// Re-exports from disk commands module
pub use disk_commands::get_disk_space_command;

// Re-exports from ffmpeg commands module
pub use ffmpeg_commands::{check_ffmpeg_available_command, remux_video_command};

// All command functions will return AppResult<T> directly
