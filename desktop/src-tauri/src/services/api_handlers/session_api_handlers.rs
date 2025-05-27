use tauri::{AppHandle, Manager};
use serde_json::json;
use std::collections::HashMap;
use log::{info, error};

use crate::error::{AppError, AppResult, SerializableError};
use crate::models::FetchResponse;

// Session management handlers
pub async fn handle_get_sessions(app_handle: AppHandle) -> AppResult<FetchResponse> {
    info!("Handling get_sessions command");
    
    let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
        .inner().clone();
    
    match session_repo.get_all_sessions().await {
        Ok(sessions) => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 200,
                headers,
                body: json!(sessions),
            })
        },
        Err(e) => {
            error!("Failed to get sessions: {}", e);
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 500,
                headers,
                body: json!(SerializableError::from(e)),
            })
        }
    }
}

pub async fn handle_get_session(app_handle: AppHandle, session_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = session_id {
        info!("Handling get_session command for session_id: {}", id);
        
        let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
            .inner().clone();
        
        match session_repo.get_session_by_id(id).await {
            Ok(Some(session)) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(session),
                })
            },
            Ok(None) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 404,
                    headers,
                    body: json!(SerializableError::from(AppError::NotFoundError(format!("Session not found: {}", id)))),
                })
            },
            Err(e) => {
                error!("Failed to get session {}: {}", id, e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!(SerializableError::from(e)),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!(SerializableError::from(AppError::ValidationError("Session ID is required".to_string()))),
        })
    }
}

pub async fn handle_create_session(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling create_session command");
    
    if let Some(body) = &args.body {
        let session_data = serde_json::from_value::<crate::models::Session>(body.clone())
            .map_err(|e| AppError::ValidationError(format!("Invalid session data: {}", e)))?;
        
        let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
            .inner().clone();
        
        match session_repo.create_session(&session_data).await {
            Ok(session_id) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 201,
                    headers,
                    body: json!({
                        "id": session_id
                    }),
                })
            },
            Err(e) => {
                error!("Failed to create session: {}", e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!(SerializableError::from(e)),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!(SerializableError::from(AppError::ValidationError("Request body is required".to_string()))),
        })
    }
}

pub async fn handle_update_session(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling update_session command");
    
    if let Some(body) = &args.body {
        let session_update = serde_json::from_value::<crate::models::Session>(body.clone())
            .map_err(|e| AppError::ValidationError(format!("Invalid session update data: {}", e)))?;
        
        let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
            .inner().clone();
        
        match session_repo.update_session(&session_update).await {
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
                error!("Failed to update session: {}", e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!(SerializableError::from(e)),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!(SerializableError::from(AppError::ValidationError("Request body is required".to_string()))),
        })
    }
}

pub async fn handle_delete_session(app_handle: AppHandle, session_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = session_id {
        info!("Handling delete_session command for session_id: {}", id);
        
        let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
            .inner().clone();
        
        match session_repo.delete_session(id).await {
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
                error!("Failed to delete session {}: {}", id, e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!(SerializableError::from(e)),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!(SerializableError::from(AppError::ValidationError("Session ID is required".to_string()))),
        })
    }
}

pub async fn handle_get_active_session(app_handle: AppHandle) -> AppResult<FetchResponse> {
    info!("Handling get_active_session command");
    
    let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
        .inner().clone();
    
    let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>()
        .inner().clone();
    
    // First get the active session ID from settings
    let active_session_id = settings_repo.get_active_session_id().await?;
    
    match active_session_id {
        Some(id) => match session_repo.get_session_by_id(&id).await {
            Ok(Some(session)) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(session),
                })
            },
            Ok(None) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 404,
                    headers,
                    body: json!(SerializableError::from(AppError::NotFoundError("Active session not found".to_string()))),
                })
            },
            Err(e) => {
                error!("Failed to get session by ID: {}", e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!(SerializableError::from(e)),
                })
            }
        },
        None => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 404,
                headers,
                body: json!(SerializableError::from(AppError::NotFoundError("No active session ID set".to_string()))),
            })
        }
    }
}

pub async fn handle_set_active_session(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling set_active_session command");
    
    if let Some(body) = &args.body {
        // Parse session ID from request body
        let session_id = body.get("sessionId").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::ValidationError("sessionId is required".to_string()))?;
        
        // First check if the session exists
        let session_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SessionRepository>>()
            .inner().clone();
        
        // Check if session exists before setting it as active
        let session_exists = match session_repo.get_session_by_id(session_id).await {
            Ok(Some(_)) => true,
            Ok(None) => false,
            Err(e) => return Err(AppError::DatabaseError(format!("Failed to check if session exists: {}", e))),
        };
        
        if !session_exists {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            return Ok(FetchResponse {
                status: 404,
                headers,
                body: json!(SerializableError::from(AppError::NotFoundError(format!("Session with ID {} not found", session_id)))),
            });
        }
        
        // Set the active session ID in settings
        let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>()
            .inner().clone();
        
        match settings_repo.set_active_session_id(session_id).await {
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
                error!("Failed to set active session: {}", e);
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 500,
                    headers,
                    body: json!(SerializableError::from(e)),
                })
            }
        }
    } else {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        Ok(FetchResponse {
            status: 400,
            headers,
            body: json!(SerializableError::from(AppError::ValidationError("Request body is required".to_string()))),
        })
    }
}