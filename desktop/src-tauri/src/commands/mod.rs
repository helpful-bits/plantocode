// Re-export all command modules
pub mod app_commands;
pub mod auth0_commands;
pub mod billing_commands;
pub mod config_commands;
pub mod db_commands;
pub mod featurebase_commands;
pub mod file_system_commands;
pub mod job_commands;
pub mod regex_commands;
pub mod session_commands;
pub mod settings_commands;

// New modular task command modules
pub mod backup_commands;
pub mod config_cache_commands;
pub mod database_maintenance_commands;
pub mod error_recovery_commands;
pub mod generic_task_commands;
pub mod implementation_plan_commands;
pub mod setup_commands;
pub mod text_commands;
pub mod workflow_commands;

// Re-export all command functions for easier imports
pub use app_commands::{get_app_info, get_config_load_error, get_database_info_command};
pub use file_system_commands::{
    create_directory_command, create_unique_filepath_command, delete_file_command,
    get_app_data_directory_command, get_home_directory_command, get_temp_dir_command,
    list_project_files_command, move_file_command, normalize_path_command, path_basename_command,
    path_dirname_command, path_extname_command, path_is_absolute_command, path_join_command,
    read_file_content_command, sanitize_filename_command, write_file_content_command,
};
pub use regex_commands::{generate_regex_command, generate_regex_patterns_command};

// Re-exports from text commands module
pub use text_commands::{generate_simple_text_command, improve_text_command};

// Re-exports from implementation plan commands module
pub use implementation_plan_commands::{
    create_implementation_plan_command, create_merged_implementation_plan_command,
    estimate_prompt_tokens_command, get_prompt_command, read_implementation_plan_command,
    update_implementation_plan_content_command,
};

// Re-exports from workflow commands module
pub use workflow_commands::{
    cancel_workflow, cancel_workflow_stage_command, get_all_workflows_command,
    get_workflow_details_command, get_workflow_results, get_workflow_results_legacy,
    get_workflow_state, get_workflow_status, pause_workflow, resume_workflow,
    retry_workflow_command, retry_workflow_stage_command, start_file_finder_workflow,
    start_web_search_workflow,
};

// Re-exports from generic task commands module
pub use generic_task_commands::generic_llm_stream_command;

// Re-exports from auth0 commands module
pub use auth0_commands::{
    check_auth_status_and_exchange_token, clear_stored_app_jwt, get_app_jwt,
    get_user_info_with_app_jwt, logout_auth0, refresh_app_jwt_auth0, set_app_jwt,
    start_auth0_login_flow,
};

// Re-exports from featurebase commands module
pub use featurebase_commands::get_featurebase_sso_token;

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
    clear_all_project_sessions_command, create_session_command, delete_session_command,
    get_file_selection_history_command, get_session_command, get_sessions_for_project_command,
    get_task_description_history_command, rename_session_command,
    sync_file_selection_history_command, sync_task_description_history_command,
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

// All command functions will return AppResult<T> directly
