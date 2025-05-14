#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use std::sync::Mutex;
use tauri_plugin_sql::{Migration, MigrationKind};
use commands::AppState;
use tauri::Manager;
use log::info;

const APP_SCHEME: &str = "vibe-manager";

fn main() {
    // Initialize logger with environment variables
    // RUST_LOG=debug,vibe_manager=trace
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp(Some(env_logger::fmt::TimestampPrecision::Millis))
        .format_module_path(true)
        .init();
    
    info!("Starting Vibe Manager Desktop application");
    tauri::Builder::default()
        .manage(AppState {
            token: Mutex::new(None),
        })
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            info!("Another instance tried to launch. Focusing existing window.");
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sql::Builder::new()
            .add_migrations("sqlite:appdata.db", vec![
                Migration {
                    version: 1,
                    description: "create_initial_tables",
                    sql: include_str!("../migrations/consolidated_schema.sql"),
                    kind: MigrationKind::Up,
                }
            ])
            .build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data path")
                .join("salt.txt");
                
            info!("Initializing Stronghold with salt file at: {:?}", salt_path);
            
            // Initialize Stronghold plugin with configuration
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path)
                    .build())?;
            
            info!("Initializing Vibe Manager Desktop with deep link scheme: {}", APP_SCHEME);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::store_token,
            commands::get_stored_token,
            commands::clear_stored_token,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}