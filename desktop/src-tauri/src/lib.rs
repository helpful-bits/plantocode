#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use std::env;

use tauri::Emitter;

pub mod api_clients;
pub mod app_setup;
pub mod auth;
mod commands;
pub mod constants;
pub mod db_utils;
pub mod error;
pub mod error_recovery;
mod events;
pub mod jobs;
pub mod models;
pub mod services;
pub mod utils;
pub mod validation;

use crate::auth::TokenManager;
use crate::auth::auth0_state::{Auth0StateStore, cleanup_old_attempts};
use crate::db_utils::{BackgroundJobRepository, SessionRepository, SettingsRepository};
use crate::error::AppError;
use crate::services::config_cache_service::ConfigCache;
use crate::services::terminal_manager::TerminalManager;
use crate::utils::FileLockManager;
use dotenvy::dotenv;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{atomic::AtomicBool, Arc, Mutex};
use std::time::Duration;
use tauri::Manager;
use tokio::sync::{OnceCell, RwLock};

#[derive(Debug, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub server_url: Mutex<Option<String>>,
    pub onboarding_completed: Mutex<Option<bool>>,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            server_url: Mutex::new(None),
            onboarding_completed: Mutex::new(None),
        }
    }
}

pub struct AppState {
    pub config_load_error: Mutex<Option<String>>,
    pub client: reqwest::Client,
    pub settings: RuntimeConfig,
    pub auth0_state_store: Auth0StateStore,
}

impl AppState {
    pub fn set_server_url(&self, url: String) {
        if let Ok(mut server_url) = self.settings.server_url.lock() {
            *server_url = Some(url);
        }
    }
    
    pub fn get_server_url(&self) -> Option<String> {
        self.settings.server_url.lock().ok()?.clone()
    }

    pub fn set_onboarding_completed(&self, completed: bool) {
        if let Ok(mut onboarding_completed) = self.settings.onboarding_completed.lock() {
            *onboarding_completed = Some(completed);
        }
    }

    pub fn get_onboarding_completed(&self) -> Option<bool> {
        self.settings.onboarding_completed.lock().ok()?.clone()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config_load_error: Mutex::new(None),
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to build reqwest client"),
            settings: RuntimeConfig::default(),
            auth0_state_store: Auth0StateStore::default(),
        }
    }
}

pub(crate) static FILE_LOCK_MANAGER: OnceCell<Arc<FileLockManager>> = OnceCell::const_new();
pub(crate) static GLOBAL_APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::const_new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv().ok();

    env_logger::init();

    let tauri_context = tauri::generate_context!();

    let mut builder = tauri::Builder::default()
        .manage(AppState::default())
        .manage(ConfigCache::new(Mutex::new(HashMap::new())))
        .manage(Arc::new(RwLock::new(Option::<Arc<crate::api_clients::server_proxy_client::ServerProxyClient>>::None)))
        .manage(Arc::new(RwLock::new(Option::<Arc<crate::api_clients::billing_client::BillingClient>>::None)))
        .manage(Arc::new(RwLock::new(Option::<Arc<crate::api_clients::consent_client::ConsentClient>>::None)))
        .manage(Arc::new(RwLock::new(Option::<Arc<dyn crate::api_clients::client_trait::ApiClient>>::None)))
        .manage(Arc::new(RwLock::new(Option::<Arc<dyn crate::api_clients::client_trait::TranscriptionClient>>::None)))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init());
    
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
                info!("Another instance tried to launch. Focusing existing window.");
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }
    
    builder
        .setup(|app| {
            info!("Starting Vibe Manager Desktop application");
            info!("App identifier: {}", app.config().identifier);
            
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            let _ = GLOBAL_APP_HANDLE.set(app.handle().clone());
            
            info!("Using OS keyring for secure credential storage.");

            let app_handle = app.handle().clone();

            tauri::async_runtime::block_on(async {
                if let Err(e) = app_setup::run_critical_initialization(&app_handle).await {
                    panic!("CRITICAL: Critical initialization failed: {}", e);
                }
            });

            let app_handle_bg = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_setup::run_background_initialization(app_handle_bg).await {
                    error!("Background initialization encountered errors: {}", e);
                }
            });

            let terminal_manager = Arc::new(TerminalManager::new(app.handle().clone()));
            app.manage(terminal_manager);

            let auth0_store = app.state::<AppState>().auth0_state_store.clone();
            tauri::async_runtime::spawn(async move {
                use tokio::time::{Duration, interval};

                let mut cleanup_interval = interval(Duration::from_secs(300));
                loop {
                    cleanup_interval.tick().await;
                    if let Err(e) = cleanup_old_attempts(&auth0_store) {
                        warn!("Failed to cleanup old auth attempts: {}", e);
                    } else {
                        debug!("Successfully cleaned up old auth attempts");
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.emit("app-will-close", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_commands::get_app_info,
            commands::app_commands::get_config_load_error,
            commands::app_commands::get_database_info_command,
            commands::app_commands::get_database_path_command,
            commands::auth0_commands::start_auth0_login_flow,
            commands::auth0_commands::check_auth_status_and_exchange_token,
            commands::auth0_commands::refresh_app_jwt_auth0,
            commands::auth0_commands::logout_auth0,
            commands::auth0_commands::get_user_info_with_app_jwt,
            commands::auth0_commands::get_app_jwt,
            commands::auth0_commands::set_app_jwt,
            commands::auth0_commands::clear_stored_app_jwt,
            commands::featurebase_commands::get_featurebase_sso_token,
            commands::billing_commands::get_billing_dashboard_data_command,
            commands::billing_commands::get_customer_billing_info_command,
            commands::billing_commands::get_spending_history_command,
            commands::billing_commands::check_service_access_command,
            commands::billing_commands::get_spending_analytics_command,
            commands::billing_commands::get_spending_forecast_command,
            commands::billing_commands::get_payment_methods_command,
            commands::consent_commands::get_current_legal_documents_command,
            commands::consent_commands::get_consent_status_command,
            commands::consent_commands::verify_consent_command,
            commands::consent_commands::accept_consent_command,
            commands::geo_commands::detect_user_region_command,
            commands::billing_commands::get_auto_top_off_settings_command,
            commands::billing_commands::update_auto_top_off_settings_command,
            commands::billing_commands::get_credit_history_command,
            commands::billing_commands::get_credit_balance_command,
            commands::billing_commands::get_credit_details_command,
            commands::billing_commands::get_credit_stats_command,
            commands::billing_commands::get_credit_purchase_fee_tiers_command,
            commands::billing_commands::create_credit_purchase_checkout_session_command,
            commands::billing_commands::create_setup_checkout_session_command,
            commands::billing_commands::get_checkout_session_status_command,
            commands::billing_commands::get_detailed_usage_with_summary_command,
            commands::billing_commands::create_billing_portal_session_command,
            commands::billing_commands::list_invoices_command,
            commands::billing_commands::download_invoice_pdf_command,
            commands::billing_commands::reveal_file_in_explorer_command,
            commands::config_commands::get_providers_with_models,
            commands::config_commands::get_default_task_configurations,
            commands::config_commands::fetch_runtime_ai_config,
            commands::config_commands::get_server_url,
            commands::job_commands::clear_job_history_command,
            commands::job_commands::get_all_visible_jobs_command,
            commands::job_commands::cancel_background_job_command,
            commands::job_commands::cancel_session_jobs_command,
            commands::job_commands::delete_background_job_command,
            commands::job_commands::get_background_job_by_id_command,
            commands::video_analysis_commands::start_video_analysis_job,
            commands::screen_recording_commands::stop_screen_recording,
            commands::file_system_commands::get_home_directory_command,
            commands::file_system_commands::list_project_files_command,
            commands::file_system_commands::create_directory_command,
            commands::file_system_commands::read_file_content_command,
            commands::file_system_commands::write_file_content_command,
            commands::file_system_commands::write_binary_file_command,
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
            commands::file_system_commands::get_file_info_command,
            commands::workflow_commands::cancel_workflow_stage_command,
            commands::text_commands::improve_text_command,
            commands::text_commands::generate_simple_text_command,
            commands::implementation_plan_commands::create_implementation_plan_command,
            commands::implementation_plan_commands::read_implementation_plan_command,
            commands::implementation_plan_commands::update_implementation_plan_content_command,
            commands::implementation_plan_commands::get_prompt_command,
            commands::implementation_plan_commands::estimate_prompt_tokens_command,
            commands::implementation_plan_commands::create_merged_implementation_plan_command,
            commands::workflow_commands::start_file_finder_workflow,
            commands::workflow_commands::get_file_finder_roots_for_session,
            commands::web_search_commands::start_web_search_workflow,
            commands::web_search_commands::start_web_search_prompts_generation_job,
            commands::workflow_commands::get_workflow_status,
            commands::workflow_commands::cancel_workflow,
            commands::workflow_commands::pause_workflow,
            commands::workflow_commands::resume_workflow,
            commands::workflow_commands::get_workflow_results_legacy,
            commands::workflow_commands::get_workflow_results,
            commands::workflow_commands::get_all_workflows_command,
            commands::workflow_commands::get_workflow_details_command,
            commands::workflow_commands::retry_workflow_command,
            commands::workflow_commands::retry_workflow_stage_command,
            commands::workflow_commands::get_workflow_state,
            commands::web_search_commands::continue_workflow_from_job_command,
            commands::generic_task_commands::generic_llm_stream_command,
            commands::prompt_commands::get_system_prompt_for_task,
            commands::generic_task_commands::refine_task_description_command,
            commands::regex_commands::generate_regex_patterns_command,
            commands::db_commands::db_execute_query,
            commands::db_commands::db_select_query,
            commands::db_commands::db_execute_transaction,
            commands::db_commands::db_table_exists,
            commands::settings_commands::get_key_value_command,
            commands::settings_commands::set_key_value_command,
            commands::settings_commands::get_server_default_task_model_settings_command,
            commands::settings_commands::validate_configuration_health,
            commands::settings_commands::set_onboarding_completed_command,
            commands::settings_commands::is_onboarding_completed_command,
            commands::settings_commands::get_workflow_setting_command,
            commands::settings_commands::set_workflow_setting_command,
            commands::settings_commands::delete_workflow_setting_command,
            commands::settings_commands::get_all_workflow_settings_command,
            commands::settings_commands::fetch_default_system_prompts_from_server,
            commands::settings_commands::fetch_default_system_prompt_from_server,
            commands::settings_commands::initialize_system_prompts_from_server,
            commands::settings_commands::is_setting_customized_command,
            commands::settings_commands::reset_setting_to_default_command,
            commands::settings_commands::get_project_system_prompt_command,
            commands::settings_commands::set_project_system_prompt_command,
            commands::settings_commands::reset_project_system_prompt_command,
            commands::settings_commands::is_project_system_prompt_customized_command,
            commands::settings_commands::get_server_default_system_prompts_command,
            commands::settings_commands::get_project_task_model_settings_command,
            commands::settings_commands::set_project_task_setting_command,
            commands::settings_commands::reset_project_task_setting_command,
            commands::settings_commands::get_available_regions_command,
            commands::settings_commands::get_selected_server_url_command,
            commands::settings_commands::set_selected_server_url_command,
            commands::settings_commands::change_server_url_and_reset_command,
            commands::settings_commands::get_external_folders_command,
            commands::settings_commands::set_external_folders_command,
            commands::session_commands::create_session_command,
            commands::session_commands::get_session_command,
            commands::session_commands::get_sessions_for_project_command,
            commands::session_commands::update_session_command,
            commands::session_commands::delete_session_command,
            commands::session_commands::rename_session_command,
            commands::session_commands::update_session_project_directory_command,
            commands::session_commands::clear_all_project_sessions_command,
            commands::session_commands::update_session_fields_command,
            commands::session_commands::get_task_description_history_command,
            commands::session_commands::sync_task_description_history_command,
            commands::session_commands::get_file_selection_history_command,
            commands::session_commands::sync_file_selection_history_command,
            commands::setup_commands::trigger_initial_keychain_access,
            commands::setup_commands::get_storage_mode,
            commands::setup_commands::check_existing_keychain_access,
            commands::database_maintenance_commands::check_database_health_command,
            commands::database_maintenance_commands::repair_database_command,
            commands::database_maintenance_commands::reset_database_command,
            commands::config_cache_commands::refresh_config_cache_command,
            commands::config_cache_commands::get_cached_config_value,
            commands::config_cache_commands::get_all_cached_config_values_command,
            commands::backup_commands::get_backup_stats_command,
            commands::backup_commands::list_backups_command,
            commands::backup_commands::restore_from_backup_command,
            commands::backup_commands::auto_restore_latest_backup_command,
            commands::backup_commands::create_manual_backup_command,
            commands::backup_commands::verify_backup_command,
            commands::backup_commands::delete_backup_command,
            commands::logging_commands::log_client_error,
            commands::logging_commands::append_to_log_file,
            commands::terminal_commands::append_terminal_log_command,
            commands::terminal_commands::read_terminal_log_command,
            commands::terminal_commands::clear_terminal_log_command,
            commands::terminal_commands::delete_terminal_log_command,
            commands::terminal_commands::start_terminal_session_command,
            commands::terminal_commands::write_terminal_input_command,
            commands::terminal_commands::send_ctrl_c_to_terminal_command,
            commands::terminal_commands::resize_terminal_session_command,
            commands::terminal_commands::kill_terminal_session_command,
            commands::terminal_commands::get_terminal_session_status_command,
        ])
        .run(tauri_context)
        .expect("Error while running tauri application");
}