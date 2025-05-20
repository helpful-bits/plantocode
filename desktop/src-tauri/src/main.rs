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
use log::{info, error, warn};
use tokio::sync::OnceCell;
use dotenv::dotenv;
use crate::db_utils::{
    SessionRepository, BackgroundJobRepository, SettingsRepository
};
use crate::error::AppError;
use crate::utils::FileLockManager;
use crate::auth::TokenManager;

// App state struct for Tauri
pub struct AppState {
    pub config_load_error: Mutex<Option<String>>,
    pub client: reqwest::Client,
    pub settings: config::RuntimeConfig,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config_load_error: Mutex::new(None),
            client: reqwest::Client::new(),
            settings: config::RuntimeConfig::default(),
        }
    }
}

const APP_SCHEME: &str = "vibe-manager";

// Static repositories to be used across the application
static SESSION_REPO: OnceCell<Arc<SessionRepository>> = OnceCell::const_new();
static BACKGROUND_JOB_REPO: OnceCell<Arc<BackgroundJobRepository>> = OnceCell::const_new();
static SETTINGS_REPO: OnceCell<Arc<SettingsRepository>> = OnceCell::const_new();
pub(crate) static FILE_LOCK_MANAGER: OnceCell<Arc<FileLockManager>> = OnceCell::const_new();

fn main() {
    // Load .env file if it exists
    dotenv().ok();
    
    // Initialize logger with environment variables
    // RUST_LOG=debug,vibe_manager=trace
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp(Some(env_logger::fmt::TimestampPrecision::Millis))
        .format_module_path(true)
        .init();
    
    info!("Starting Vibe Manager Desktop application");
    
    let tauri_context = tauri::generate_context!();
    let app_identifier = &tauri_context.config().identifier;

    let app_local_data_base_path = dirs::data_local_dir()
        .expect("Could not resolve app local data path for Stronghold.")
        .join(app_identifier);

    if !app_local_data_base_path.exists() {
        std::fs::create_dir_all(&app_local_data_base_path)
            .expect("Failed to create app local data directory for Stronghold salt path");
    }

    tauri::Builder::default()
        .manage(AppState {
            config_load_error: Mutex::new(None),
            client: reqwest::Client::new(),
            settings: config::RuntimeConfig::default(),
        })
        // TokenManager will be created in initialize_api_clients with the AppHandle
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            info!("Another instance tried to launch. Focusing existing window.");
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            // Resolve the app-specific local data directory for Stronghold's salt file.
            let app_local_data_dir_for_salt = match app.path().app_local_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    error!("Fatal: Could not resolve app local data path for Stronghold salt: {}. App identifier might be missing or invalid in tauri.conf.json.", e);
                    return Err(Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string())));
                }
            };

            // Ensure this directory exists.
            if !app_local_data_dir_for_salt.exists() {
                match std::fs::create_dir_all(&app_local_data_dir_for_salt) {
                    Ok(_) => info!("Created app local data directory for Stronghold salt at: {:?}", app_local_data_dir_for_salt),
                    Err(e) => {
                        error!("Fatal: Failed to create app local data directory {:?} for Stronghold salt: {}", app_local_data_dir_for_salt, e);
                        return Err(Box::new(e));
                    }
                }
            }

            // Define the path for the salt file.
            let salt_path = app_local_data_dir_for_salt.join("user.salt"); // Using a slightly more descriptive name.
            info!("Stronghold salt path configured at: {:?}", salt_path);

            // Build and initialize the Stronghold plugin.
            let plugin = tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build();
            app.handle().plugin(plugin)?;
            info!("Tauri Stronghold plugin initialized successfully.");

            let app_handle_clone = app.handle().clone();

            // Spawn asynchronous initialization so plugins can finish loading
            tauri::async_runtime::spawn(async move {
                // wait for 1 seconds
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if let Err(e) = app_setup::run_async_initialization(&app_handle_clone).await {
                    error!("Async initialization failed: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // App commands
            commands::app_commands::get_app_info,
            commands::app_commands::get_config_load_error,
            commands::app_commands::get_database_info_command,
            
            // Auth commands
            commands::auth_commands::exchange_and_store_firebase_token,
            commands::auth_commands::get_user_info_with_app_jwt,
            commands::auth_commands::set_in_memory_token,
            commands::auth_commands::clear_in_memory_token,
            
            // Config commands
            commands::config_commands::get_available_ai_models,
            commands::config_commands::get_default_task_configurations,
            commands::config_commands::fetch_runtime_ai_config,
            commands::config_commands::get_runtime_firebase_config,
            commands::config_commands::get_server_url,
            
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