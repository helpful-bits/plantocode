#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use std::env;

use tauri::Emitter;

mod commands;
pub mod config;
pub mod constants;
pub mod db_utils;
pub mod error;
pub mod models;
pub mod utils;
pub mod jobs;
pub mod services;
pub mod api_clients;
pub mod app_setup;
pub mod auth;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::Manager;
use log::{info, error, warn};
use tokio::sync::OnceCell;
use dotenv::dotenv;
use crate::db_utils::{
    SessionRepository, BackgroundJobRepository, SettingsRepository
};
use crate::error::AppError;
use crate::utils::FileLockManager;
use crate::auth::TokenManager;
use crate::auth::auth0_state::Auth0StateStore;
use crate::services::server_config_service::ServerConfigCache;

pub struct AppState {
    pub config_load_error: Mutex<Option<String>>,
    pub client: reqwest::Client,
    pub settings: config::RuntimeConfig,
    pub auth0_state_store: Auth0StateStore,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config_load_error: Mutex::new(None),
            client: reqwest::Client::new(),
            settings: config::RuntimeConfig::default(),
            auth0_state_store: Auth0StateStore::default(),
        }
    }
}


pub(crate) static FILE_LOCK_MANAGER: OnceCell<Arc<FileLockManager>> = OnceCell::const_new();

fn main() {
    dotenv().ok();
    
    // Initialize logger with environment variables
    // Set RUST_LOG=info,vibe_manager=debug for enhanced logging during development
    // Set RUST_LOG=warn for production to reduce noise
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp(Some(env_logger::fmt::TimestampPrecision::Millis))
        .format_module_path(true)
        .format_target(false) // Hide target module path to reduce log verbosity
        .init();
    
    info!("Starting Vibe Manager Desktop application");
    
    let tauri_context = tauri::generate_context!();
    let app_identifier = &tauri_context.config().identifier;

    info!("App identifier: {}", app_identifier);

    tauri::Builder::default()
        .manage(AppState {
            config_load_error: Mutex::new(None),
            client: reqwest::Client::new(),
            settings: config::RuntimeConfig::default(), // Now called AFTER dotenv
            auth0_state_store: Auth0StateStore::default(),
        })
        .manage(ServerConfigCache::new(Mutex::new(HashMap::new())))
        // TokenManager will be created in initialize_api_clients with the AppHandle
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            info!("Another instance tried to launch. Focusing existing window.");
        }))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);
            

            // Keyring is used for secure storage (OS native credential vault)
            info!("Using OS keyring for secure credential storage.");

            let app_handle_clone = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_setup::run_async_initialization(&app_handle_clone).await {
                    error!("Async initialization failed: {}", e);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Emit an event to the frontend to handle potential unsaved changes
                let _ = window.emit("app-will-close", ());
                
                // For now, allow the window to close
                // In the future, we could prevent default close behavior if needed
                // api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // App commands
            commands::app_commands::get_app_info,
            commands::app_commands::get_config_load_error,
            commands::app_commands::get_database_info_command,
            commands::app_commands::is_keyring_onboarding_required,
            
            // Auth0 commands (includes JWT token management)
            commands::auth0_commands::start_auth0_login_flow,
            commands::auth0_commands::check_auth_status_and_exchange_token,
            commands::auth0_commands::refresh_app_jwt_auth0,
            commands::auth0_commands::logout_auth0,
            commands::auth0_commands::get_user_info_with_app_jwt,
            commands::auth0_commands::get_app_jwt,
            commands::auth0_commands::set_app_jwt,
            commands::auth0_commands::clear_stored_app_jwt,
            
            // Billing commands
            commands::billing_commands::get_subscription_details_command,
            commands::billing_commands::get_subscription_plans_command,
            commands::billing_commands::create_billing_portal_command,
            commands::billing_commands::get_spending_status_command,
            commands::billing_commands::acknowledge_spending_alert_command,
            commands::billing_commands::update_spending_limits_command,
            commands::billing_commands::get_invoice_history_command,
            commands::billing_commands::get_spending_history_command,
            commands::billing_commands::check_service_access_command,
            commands::billing_commands::get_spending_analytics_command,
            commands::billing_commands::get_spending_forecast_command,
            commands::billing_commands::get_payment_methods_command,
            commands::billing_commands::delete_payment_method_command,
            commands::billing_commands::set_default_payment_method_command,
            
            // Credit system commands
            commands::billing_commands::get_credit_balance_command,
            commands::billing_commands::get_credit_history_command,
            commands::billing_commands::get_credit_packs_command,
            commands::billing_commands::get_credit_stats_command,
            
            // Modern PaymentIntent-based commands (2024)
            commands::billing_commands::create_credit_payment_intent_command,
            commands::billing_commands::create_subscription_intent_command,
            commands::billing_commands::create_setup_intent_command,
            commands::billing_commands::confirm_payment_status_command,
            commands::billing_commands::get_stripe_publishable_key_command,
            
            // Billing health monitoring
            commands::billing_health_commands::check_billing_health_command,
            commands::billing_health_commands::ping_billing_service_command,
            
            // Subscription lifecycle management
            commands::billing_commands::cancel_subscription_command,
            commands::billing_commands::resume_subscription_command,
            commands::billing_commands::create_billing_portal_session_command,
            
            // Config commands
            commands::config_commands::get_available_ai_models,
            commands::config_commands::get_default_task_configurations,
            commands::config_commands::fetch_runtime_ai_config,
            commands::config_commands::get_server_url,
            
            
            // Job commands
            commands::job_commands::clear_job_history_command,
            commands::job_commands::get_active_jobs_command,
            commands::job_commands::cancel_background_job_command,
            commands::job_commands::cancel_session_jobs_command,
            commands::job_commands::delete_background_job_command,
            commands::job_commands::get_background_job_by_id_command,
            
            // File system commands
            commands::file_system_commands::get_home_directory_command,
            commands::file_system_commands::list_files_command,
            commands::file_system_commands::create_directory_command,
            commands::file_system_commands::read_file_content_command,
            commands::file_system_commands::write_file_content_command,
            commands::file_system_commands::create_unique_filepath_command,
            commands::file_system_commands::delete_file_command,
            commands::file_system_commands::move_file_command,
            commands::file_system_commands::path_join_command,
            commands::file_system_commands::path_dirname_command,
            commands::file_system_commands::path_basename_command,
            commands::file_system_commands::path_extname_command,
            commands::file_system_commands::get_app_data_directory_command,
            commands::file_system_commands::sanitize_filename_command,
            commands::file_system_commands::normalize_path_command,
            commands::file_system_commands::get_temp_dir_command,
            commands::file_system_commands::path_is_absolute_command,
            commands::file_finder_workflow_commands::cancel_workflow_stage_command,
            
            // Text commands
            commands::text_commands::correct_text_command,
            commands::text_commands::generate_simple_text_command,
            
            // Implementation plan commands
            commands::implementation_plan_commands::create_implementation_plan_command,
            commands::implementation_plan_commands::read_implementation_plan_command,
            commands::implementation_plan_commands::get_implementation_plan_prompt_command,
            commands::implementation_plan_commands::estimate_implementation_plan_tokens_command,
            
            // Path finding commands
            commands::path_finding_commands::find_relevant_files_command,
            commands::path_finding_commands::generate_directory_tree_command,
            commands::path_finding_commands::create_path_correction_job_command,
            commands::path_finding_commands::estimate_path_finder_tokens_command,
            
            // File finder workflow commands (new stage-based approach)
            commands::file_finder_workflow_commands::start_file_finder_workflow,
            commands::file_finder_workflow_commands::get_file_finder_workflow_status,
            commands::file_finder_workflow_commands::cancel_file_finder_workflow,
            commands::file_finder_workflow_commands::pause_file_finder_workflow,
            commands::file_finder_workflow_commands::resume_file_finder_workflow,
            commands::file_finder_workflow_commands::get_file_finder_workflow_results,
            commands::file_finder_workflow_commands::get_all_workflows_command,
            commands::file_finder_workflow_commands::get_workflow_details_command,
            commands::file_finder_workflow_commands::retry_workflow_stage_command,
            
            // Voice commands
            commands::voice_commands::transcribe_audio_batch_command,
            commands::voice_commands::get_transcription_settings_command,
            commands::voice_commands::set_transcription_settings_command,
            commands::voice_commands::get_project_transcription_settings_command,
            commands::voice_commands::set_project_transcription_settings_command,
            commands::voice_commands::reset_transcription_settings_command,
            commands::voice_commands::get_effective_transcription_settings_command,
            commands::voice_commands::validate_transcription_settings_command,
            
            // Generic task commands
            commands::generic_task_commands::generic_llm_stream_command,
            commands::generic_task_commands::enhance_task_description_command,
            
            // Other task-specific commands
            commands::regex_commands::generate_regex_patterns_command,
            commands::regex_summary_commands::generate_regex_summary_command,
            commands::guidance_commands::generate_guidance_command,
            
            // Database commands
            commands::db_commands::db_execute_query,
            commands::db_commands::db_select_query,
            commands::db_commands::db_execute_transaction,
            commands::db_commands::db_table_exists,
            
            // Settings commands
            commands::settings_commands::get_key_value_command,
            commands::settings_commands::set_key_value_command,
            commands::settings_commands::get_project_task_model_settings_command,
            commands::settings_commands::set_project_task_model_settings_command,
            commands::settings_commands::get_all_task_model_settings_for_project_command,
            commands::settings_commands::validate_configuration_health,
            commands::settings_commands::set_onboarding_completed_command,
            commands::settings_commands::is_onboarding_completed_command,
            commands::settings_commands::get_workflow_setting_command,
            commands::settings_commands::set_workflow_setting_command,
            commands::settings_commands::delete_workflow_setting_command,
            commands::settings_commands::get_all_workflow_settings_command,
            
            // System prompt commands
            commands::system_prompt_commands::get_system_prompt_command,
            commands::system_prompt_commands::set_system_prompt_command,
            commands::system_prompt_commands::reset_system_prompt_command,
            commands::system_prompt_commands::get_default_system_prompts_command,
            commands::system_prompt_commands::get_default_system_prompt_command,
            commands::system_prompt_commands::has_custom_system_prompt_command,
            commands::system_prompt_commands::update_default_system_prompt_command,
            commands::system_prompt_commands::fetch_default_system_prompts_from_server,
            commands::system_prompt_commands::fetch_default_system_prompt_from_server,
            commands::system_prompt_commands::initialize_system_prompts_from_server,
            
            // Session commands
            commands::session_commands::create_session_command,
            commands::session_commands::get_session_command,
            commands::session_commands::get_sessions_for_project_command,
            commands::session_commands::update_session_command,
            commands::session_commands::delete_session_command,
            commands::session_commands::rename_session_command,
            commands::session_commands::update_session_project_directory_command,
            commands::session_commands::clear_all_project_sessions_command,
            commands::session_commands::update_session_fields_command,
            
            // Setup commands
            commands::setup_commands::trigger_initial_keychain_access,
            commands::setup_commands::get_storage_mode,
            
            // Database maintenance commands
            commands::database_maintenance_commands::check_database_health_command,
            commands::database_maintenance_commands::repair_database_command,
            commands::database_maintenance_commands::reset_database_command,
            
            // Server configuration commands
            commands::server_config_commands::fetch_server_configurations_command,
            commands::server_config_commands::get_cached_config_value_command,
            commands::server_config_commands::get_all_cached_config_values_command,
            commands::server_config_commands::refresh_server_config_cache_command,
            
            // Backup commands
            commands::backup_commands::get_backup_stats_command,
            commands::backup_commands::list_backups_command,
            commands::backup_commands::restore_from_backup_command,
            commands::backup_commands::auto_restore_latest_backup_command,
            commands::backup_commands::create_manual_backup_command,
            commands::backup_commands::verify_backup_command,
            commands::backup_commands::delete_backup_command,
        ])
        // Use the context we created earlier
        .run(tauri_context)
        .expect("Error while running tauri application");
}