#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use std::sync::Mutex;
use tauri_plugin_sql::{Migration, MigrationKind};
use commands::AppState;
use blake2b_simd::Params;

const APP_SCHEME: &str = "vibe-manager";

fn main() {
    let builder = tauri::Builder::default()
        .manage(AppState {
            token: Mutex::new(None),
        })
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            println!("Another instance tried to launch. Focusing the existing window instead.");
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
        .plugin(tauri_plugin_stronghold::Builder::new(|pass| {
                Params::new()
                    .hash_length(32)
                    .to_state()
                    .update(pass.as_bytes())
                    .finalize()
                    .as_bytes()
                    .to_vec()
            }).build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::store_token,
            commands::get_stored_token,
            commands::clear_stored_token,
        ])
        .setup(|app| {
            // Set activation policy (macOS)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);
            
            println!("Vibe Manager Desktop initialized with deep link scheme: {}", APP_SCHEME);
            
            Ok(())
        });
        
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}