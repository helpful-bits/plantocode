use tauri::{AppHandle, Manager};
use serde_json::json;
use std::collections::HashMap;
use log::{info, error};

use crate::error::{AppError, AppResult};
use crate::models::FetchResponse;

// Settings handlers
pub async fn handle_get_settings(app_handle: AppHandle) -> AppResult<FetchResponse> {
    info!("Handling get_settings command");
    
    let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>()
        .inner().clone();
    
    match settings_repo.get_settings().await {
        Ok(settings) => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 200,
                headers,
                body: json!(settings),
            })
        },
        Err(e) => {
            error!("Failed to get settings: {}", e);
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 500,
                headers,
                body: json!({
                    "error": format!("Failed to get settings: {}", e)
                }),
            })
        }
    }
}

pub async fn handle_set_settings(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling set_settings command");
    
    if let Some(body) = &args.body {
        let settings = serde_json::from_value::<crate::models::Settings>(body.clone())
            .map_err(|e| AppError::ValidationError(format!("Invalid settings data: {}", e)))?;
        
        let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>()
            .inner().clone();
        
        match settings_repo.save_settings(&settings).await {
            Ok(_) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!({
                        "success": true
                    }),
                })
            },
            Err(e) => {
                error!("Failed to save settings: {}", e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!({
                        "error": format!("Failed to save settings: {}", e)
                    }),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!({
                "error": "Request body is required"
            }),
        })
    }
}