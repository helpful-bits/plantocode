#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Enable easier debugging
#[cfg(debug_assertions)]
use std::env;

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
pub mod prompts;
pub mod app_setup;
pub mod auth;

use std::sync::{Arc, Mutex};
use tauri::Manager;
use log::{info, error};
use tokio::sync::OnceCell;
use crate::db_utils::{
    SessionRepository, BackgroundJobRepository, SettingsRepository
};
use crate::error::AppError;
use crate::utils::FileLockManager;
use crate::auth::TokenManager;

// App state struct for Tauri
#[derive(Default)]
pub struct AppState {
    pub token: Mutex<Option<String>>,
    pub config_load_error: Mutex<Option<String>>,
}

const APP_SCHEME: &str = "vibe-manager";

// Static repositories to be used across the application
static SESSION_REPO: OnceCell<Arc<SessionRepository>> = OnceCell::const_new();
static BACKGROUND_JOB_REPO: OnceCell<Arc<BackgroundJobRepository>> = OnceCell::const_new();
static SETTINGS_REPO: OnceCell<Arc<SettingsRepository>> = OnceCell::const_new();
pub(crate) static FILE_LOCK_MANAGER: OnceCell<Arc<FileLockManager>> = OnceCell::const_new();

fn main() {
    // Initialize logger with environment variables
    // RUST_LOG=debug,vibe_manager=trace
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp(Some(env_logger::fmt::TimestampPrecision::Millis))
        .format_module_path(true)
        .init();
    
    info!("Starting Vibe Manager Desktop application");
    
    let tauri_context = tauri::generate_context!();
    let app_identifier = &tauri_context.config().identifier;

    // Determine salt path for Stronghold plugin *before* builder
    let app_local_data_base_path = dirs::data_local_dir()
        .expect("Could not resolve app local data path for Stronghold.")
        .join(app_identifier); // This path is specific to the app, e.g., .../Application Support/com.vibe-manager.app

    if !app_local_data_base_path.exists() {
        std::fs::create_dir_all(&app_local_data_base_path)
            .expect("Failed to create app local data directory for Stronghold salt path");
    }
    let salt_path_for_stronghold_plugin = app_local_data_base_path.join("salt.txt");
    info!("Stronghold salt file path determined: {:?}", salt_path_for_stronghold_plugin);

    // Build the Stronghold plugin instance
    let stronghold_plugin = tauri_plugin_stronghold::Builder::with_argon2(&salt_path_for_stronghold_plugin).build();

    // Create a TokenManager before building the app
    let token_manager = Arc::new(TokenManager::new());

    tauri::Builder::default()
        .manage(AppState {
            token: Mutex::new(None),
            config_load_error: Mutex::new(None),
        })
        .manage(token_manager.clone())
        // IMPORTANT: Load Stronghold plugin first before all other plugins
        .plugin(stronghold_plugin)
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            info!("Another instance tried to launch. Focusing existing window.");
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);
            
            // Stronghold plugin is now initialized via the builder chain.
            // No need to initialize it here.
            
            let app_handle_clone = app.handle().clone();
            
            // Run the async initialization in the sync context and explicitly map the error
            tauri::async_runtime::block_on(async move {
                app_setup::run_async_initialization(&app_handle_clone).await
            })
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + 'static>)
        })
        .invoke_handler(tauri::generate_handler![
            // App commands
            commands::app_commands::get_app_info,
            commands::app_commands::get_config_load_error,
            commands::app_commands::get_database_info_command,
            
            // Auth commands
            commands::auth_commands::store_token,
            commands::auth_commands::get_stored_token,
            commands::auth_commands::clear_stored_token,
            
            // Config commands
            commands::config_commands::get_available_ai_models,
            commands::config_commands::get_default_task_configurations,
            commands::config_commands::fetch_runtime_ai_config,
            
            // Fetch handler
            commands::fetch_handler_command::handle_fetch_request,
            
            // Job commands
            commands::job_commands::update_job_cleared_status_command,
            commands::job_commands::clear_job_history_command,
            commands::job_commands::get_active_jobs_command,
            commands::job_commands::cancel_background_job_command,
            commands::job_commands::cancel_session_jobs_command,
            commands::job_commands::delete_background_job_command,
            commands::job_commands::get_background_job_by_id_command,
            
            // File system commands
            commands::file_system_commands::get_home_directory_command,
            commands::file_system_commands::get_common_paths_command,
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
            
            // Text commands
            commands::text_commands::improve_text_command,
            commands::text_commands::correct_text_post_transcription_command,
            
            // Implementation plan commands
            commands::implementation_plan_commands::create_implementation_plan_command,
            commands::implementation_plan_commands::read_implementation_plan_command,
            
            // Path finding commands
            commands::path_finding_commands::find_relevant_files_command,
            commands::path_finding_commands::create_generate_directory_tree_job_command,
            commands::path_finding_commands::task_create_read_directory_job_command,
            
            // Voice commands
            commands::voice_commands::create_transcription_job_command,
            commands::voice_commands::transcribe_audio_direct_command,
            commands::voice_commands::correct_transcription_command,
            
            // Generic task commands
            commands::generic_task_commands::generic_llm_stream_command,
            commands::generic_task_commands::enhance_task_description_command,
            
            // Other task-specific commands
            commands::regex_commands::generate_regex_command,
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
        ])
        // Use the context we created earlier
        .run(tauri_context)
        .expect("Error while running tauri application");
}