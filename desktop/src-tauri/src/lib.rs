#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use std::env;

use tauri::{Emitter, Listener};

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
pub mod remote_api;
pub mod services;
mod tray;
pub mod utils;
pub mod validation;

use crate::auth::TokenManager;
use crate::auth::auth0_state::{Auth0StateStore, cleanup_old_attempts};
use crate::db_utils::{BackgroundJobRepository, SessionRepository, SettingsRepository};
use crate::error::AppError;
use crate::services::config_cache_service::ConfigCache;
use crate::tray::TrayController;
use crate::utils::FileLockManager;
use dotenvy::dotenv;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use crate::events::job_events::{
    JOB_CREATED, JOB_DELETED, JOB_STATUS_CHANGED, JOB_STREAM_PROGRESS,
    JOB_TOKENS_UPDATED, JOB_COST_UPDATED, JOB_RESPONSE_APPENDED,
    JOB_ERROR_DETAILS, JOB_FINALIZED, JOB_METADATA_UPDATED
};
use std::collections::HashMap;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::Manager;
use tokio::sync::{OnceCell, RwLock};
use once_cell::sync::OnceCell as SyncOnceCell;

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
    pub api_clients_ready: Arc<AtomicBool>,
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

    pub fn is_api_clients_ready(&self) -> bool {
        self.api_clients_ready.load(Ordering::Relaxed)
    }

    pub fn set_api_clients_ready(&self, ready: bool) {
        self.api_clients_ready.store(ready, Ordering::Relaxed)
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
            api_clients_ready: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub(crate) static FILE_LOCK_MANAGER: OnceCell<Arc<FileLockManager>> = OnceCell::const_new();
pub(crate) static GLOBAL_APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::const_new();

struct BgPrefs {
    run_in_background: bool,
    minimize_on_close: bool,
    start_with_system: bool,
    launch_minimized: bool,
    show_notifications: bool,
}

pub static BG_PREFS: SyncOnceCell<std::sync::RwLock<BgPrefs>> = SyncOnceCell::new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv().ok();

    env_logger::init();

    let tauri_context = tauri::generate_context!();

    let mut builder = tauri::Builder::default()
        .manage(AppState::default())
        .manage(Arc::new(TokenManager::new()))
        .manage(ConfigCache::new(Mutex::new(HashMap::new())))
        .manage(Arc::new(crate::services::SessionCache::new()))
        .manage(Arc::new(RwLock::new(
            Option::<Arc<crate::api_clients::server_proxy_client::ServerProxyClient>>::None,
        )))
        .manage(Arc::new(RwLock::new(
            Option::<Arc<crate::api_clients::billing_client::BillingClient>>::None,
        )))
        .manage(Arc::new(RwLock::new(
            Option::<Arc<crate::api_clients::consent_client::ConsentClient>>::None,
        )))
        .manage(Arc::new(RwLock::new(
            Option::<Arc<dyn crate::api_clients::client_trait::ApiClient>>::None,
        )))
        .manage(Arc::new(RwLock::new(
            Option::<Arc<dyn crate::api_clients::client_trait::TranscriptionClient>>::None,
        )))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_notification::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
                info!("Another instance tried to launch. Focusing existing window.");
            }))
            .plugin(tauri_plugin_process::init());
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            info!("Starting PlanToCode Desktop application");
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

            // Initialize BG_PREFS after SettingsRepository is available
            if let Some(settings_repo) = app.try_state::<Arc<SettingsRepository>>() {
                let prefs = tauri::async_runtime::block_on(async {
                    BgPrefs {
                        run_in_background: settings_repo.get_bool_setting("background_run_enabled").await.unwrap_or(Some(true)).unwrap_or(true),
                        minimize_on_close: settings_repo.get_bool_setting("minimize_to_tray_on_close").await.unwrap_or(Some(true)).unwrap_or(true),
                        start_with_system: settings_repo.get_bool_setting("start_with_system").await.unwrap_or(Some(false)).unwrap_or(false),
                        launch_minimized: settings_repo.get_bool_setting("launch_minimized").await.unwrap_or(Some(false)).unwrap_or(false),
                        show_notifications: settings_repo.get_bool_setting("show_notifications").await.unwrap_or(Some(true)).unwrap_or(true),
                    }
                });
                BG_PREFS.set(std::sync::RwLock::new(prefs)).ok();

                if let Some(w) = app.get_webview_window("main") {
                    if let Some(prefs_lock) = BG_PREFS.get() {
                        if let Ok(prefs) = prefs_lock.read() {
                            if prefs.run_in_background && prefs.launch_minimized {
                                let _ = w.hide();
                            }
                        }
                    }
                }
            }

            // Initialize TrayController
            let app_handle = app.handle().clone();
            let _tray = TrayController::init(&app_handle)?;

            let app_handle_bg = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_setup::run_background_initialization(app_handle_bg).await {
                    error!("Background initialization encountered errors: {}", e);
                }
            });

            // Start DeviceLinkClient after auth is ready
            let app_handle_for_device_link = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait for auth to be ready
                loop {
                    let token_manager = app_handle_for_device_link.state::<Arc<TokenManager>>();
                    if token_manager.get().await.is_some() {
                        let app_state = app_handle_for_device_link.state::<AppState>();
                        if let Some(server_url) = app_state.get_server_url() {
                            info!("Starting DeviceLinkClient for server: {}", server_url);
                            if let Err(e) =
                                crate::services::device_link_client::start_device_link_client(
                                    app_handle_for_device_link.clone(),
                                    server_url,
                                )
                                .await
                            {
                                error!("DeviceLinkClient error: {}", e);
                            }
                        }
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            });

            let app_handle_for_terminal_events = app.handle().clone();
            app.listen("terminal:output", move |event| {
                // Forward terminal events via DeviceLinkClient
                let payload = event.payload().to_string();
                let app_handle = app_handle_for_terminal_events.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = app_handle.emit(
                        "device-link-event",
                        serde_json::json!({
                            "type": "terminal:output",
                            "payload": payload
                        }),
                    );
                });
            });

            // Setup notification listeners for device link status changes
            {
                let app_handle = app.handle().clone();
                app.listen("device-link-status", move |e| {
                    let p = e.payload();
                    if p.contains("\"connected\"") || p.contains("\"registered\"") || p.contains("\"resumed\"") {
                        if let Some(prefs_lock) = BG_PREFS.get() {
                            if let Ok(prefs) = prefs_lock.read() {
                                if prefs.show_notifications {
                                    use tauri_plugin_notification::NotificationExt;
                                    let _ = app_handle.notification()
                                        .builder()
                                        .title("Desktop Online")
                                        .body("Your desktop is now available for connections.")
                                        .show();
                                }
                            }
                        }
                    }
                });
            }

            {
                let app_handle = app.handle().clone();
                app.listen("relay-request-received", move |e| {
                    if let Some(prefs_lock) = BG_PREFS.get() {
                        if let Ok(prefs) = prefs_lock.read() {
                            if prefs.show_notifications {
                                let payload_str = e.payload();
                                let method = if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload_str) {
                                    json.get("method")
                                        .and_then(|m| m.as_str())
                                        .unwrap_or("unknown")
                                        .to_string()
                                } else {
                                    "unknown".to_string()
                                };

                                use tauri_plugin_notification::NotificationExt;
                                let _ = app_handle.notification()
                                    .builder()
                                    .title("Mobile command received")
                                    .body(format!("Request: {}", method))
                                    .show();
                            }
                        }
                    }
                });
            }

            // Setup terminate-connections event listener for tray security action
            {
                let app_handle = app.handle().clone();
                app.listen("terminate-connections", move |_| {
                    let _ = app_handle.emit("device-link-status", serde_json::json!({
                        "status": "disconnected",
                        "reason": "terminated"
                    }));
                });
            }

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
                // Check BG_PREFS to determine if we should hide instead of close
                if let Some(prefs_lock) = BG_PREFS.get() {
                    if let Ok(prefs) = prefs_lock.read() {
                        if prefs.run_in_background || prefs.minimize_on_close {
                            api.prevent_close();
                            let _ = window.hide();

                            if prefs.show_notifications {
                                use tauri_plugin_notification::NotificationExt;
                                let _ = window.app_handle().notification()
                                    .builder()
                                    .title("PlanToCode is still running")
                                    .body("The app is running in the system tray to keep your mobile connection alive.")
                                    .show();
                            }
                            return;
                        }
                    }
                }

                // If not hiding, prevent close and spawn shutdown orchestrator
                api.prevent_close();

                // Optionally emit "app-will-close" event (ignore errors)
                let _ = window.emit("app-will-close", ());

                let app_handle = window.app_handle().clone();

                // Spawn non-blocking shutdown orchestrator
                tauri::async_runtime::spawn(async move {
                    // Get optional state handles
                    let cache_opt = app_handle.try_state::<Arc<crate::services::SessionCache>>()
                        .map(|c| c.inner().clone());
                    let terminal_manager_opt = app_handle.try_state::<Arc<crate::services::TerminalManager>>()
                        .map(|t| t.inner().clone());
                    let device_link_client_opt = app_handle.try_state::<Arc<crate::services::device_link_client::DeviceLinkClient>>()
                        .map(|d| d.inner().clone());

                    // Run cleanup concurrently with timeout
                    let cleanup_future = async {
                        // Spawn all cleanup tasks concurrently
                        let cache_task = async {
                            if let Some(cache) = cache_opt {
                                if let Err(e) = cache.flush_all_now(&app_handle).await {
                                    error!("Error flushing SessionCache: {}", e);
                                } else {
                                    info!("SessionCache flushed on shutdown");
                                }
                            }
                        };

                        let terminal_task = async {
                            if let Some(terminal_manager) = terminal_manager_opt {
                                if let Err(e) = terminal_manager.cleanup_all_sessions().await {
                                    error!("Error during terminal cleanup: {}", e);
                                } else {
                                    info!("All terminal sessions cleaned up successfully");
                                }
                            }
                        };

                        let device_link_task = async {
                            if let Some(client) = device_link_client_opt {
                                client.shutdown().await;
                                info!("DeviceLinkClient shutdown complete");
                            }
                        };

                        // Run all cleanup tasks concurrently
                        tokio::join!(cache_task, terminal_task, device_link_task);
                    };

                    // Run cleanup with 5-second timeout
                    match tokio::time::timeout(Duration::from_secs(5), cleanup_future).await {
                        Ok(_) => {
                            info!("Shutdown cleanup completed successfully");
                        }
                        Err(_) => {
                            warn!("Shutdown cleanup timed out after 5 seconds");
                        }
                    }

                    // Exit the application
                    info!("Exiting application");
                    app_handle.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_commands::get_app_info,
            commands::app_commands::get_config_load_error,
            commands::app_commands::get_database_info_command,
            commands::app_commands::get_database_path_command,
            commands::app_commands::get_resource_info_command,
            commands::auth0_commands::start_auth0_login_flow,
            commands::auth0_commands::check_auth_status_and_exchange_token,
            commands::auth0_commands::refresh_app_jwt_auth0,
            commands::auth0_commands::logout_auth0,
            commands::auth0_commands::get_user_info_with_app_jwt,
            commands::auth0_commands::get_app_jwt,
            commands::auth0_commands::set_app_jwt,
            commands::auth0_commands::clear_stored_app_jwt,
            commands::device_commands::get_device_id,
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
            commands::video_utils_commands::get_video_metadata_command,
            commands::screen_recording_commands::stop_screen_recording,
            commands::file_system_commands::get_home_directory_command,
            commands::file_system_commands::list_project_files_command,
            commands::file_system_commands::get_files_metadata_command,
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
            commands::audio_commands::transcribe_audio_command,
            commands::implementation_plan_commands::create_implementation_plan_command,
            commands::implementation_plan_commands::read_implementation_plan_command,
            commands::implementation_plan_commands::update_implementation_plan_content_command,
            commands::implementation_plan_commands::get_prompt_command,
            commands::implementation_plan_commands::estimate_prompt_tokens_command,
            commands::implementation_plan_commands::create_merged_implementation_plan_command,
            commands::implementation_plan_commands::mark_implementation_plan_signed_off_command,
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
            commands::settings_commands::get_device_settings,
            commands::settings_commands::update_device_settings,
            commands::settings_commands::get_app_setting,
            commands::settings_commands::set_app_setting,
            commands::settings_commands::get_background_prefs_command,
            commands::settings_commands::set_background_prefs_command,
            commands::settings_commands::toggle_autostart_command,
            commands::session_commands::create_session_command,
            commands::session_commands::get_session_command,
            commands::session_commands::get_sessions_for_project_command,
            commands::session_commands::update_session_command,
            commands::session_commands::delete_session_command,
            commands::session_commands::rename_session_command,
            commands::session_commands::duplicate_session_command,
            commands::session_commands::update_session_project_directory_command,
            commands::session_commands::clear_all_project_sessions_command,
            commands::session_commands::update_session_fields_command,
            commands::session_commands::get_task_description_history_command,
            commands::session_commands::sync_task_description_history_command,
            commands::session_commands::get_file_selection_history_command,
            commands::session_commands::sync_file_selection_history_command,
            commands::session_commands::update_session_files_command,
            commands::session_commands::broadcast_file_browser_state_command,
            commands::session_commands::broadcast_active_session_changed_command,
            commands::session_commands::get_history_state_command,
            commands::session_commands::sync_history_state_command,
            commands::session_commands::merge_history_state_command,
            commands::session_commands::get_device_id_command,
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
            commands::terminal_commands::start_terminal_session_command,
            commands::terminal_commands::attach_terminal_output_command,
            commands::terminal_commands::write_terminal_input_command,
            commands::terminal_commands::resize_terminal_session_command,
            commands::terminal_commands::kill_terminal_session_command,
            commands::terminal_commands::get_terminal_session_status_command,
            commands::terminal_commands::list_terminal_sessions_command,
            commands::terminal_commands::restore_terminal_sessions_command,
            commands::terminal_commands::get_active_terminal_sessions_command,
            commands::terminal_commands::reconnect_terminal_session_command,
            commands::terminal_commands::clear_terminal_log_command,
            commands::terminal_commands::get_terminal_metadata_command,
            commands::terminal_commands::graceful_exit_terminal_command,
            commands::image_commands::save_pasted_image_command,
            commands::sync_commands::queue_task_description_update_command,
            commands::sync_commands::queue_merge_instructions_update_command,
            commands::sync_commands::queue_start_task_edit_command,
            commands::sync_commands::queue_end_task_edit_command,
            commands::sync_commands::queue_external_task_description_update_command,
        ])
        .run(tauri_context)
        .expect("Error while running tauri application");
}
