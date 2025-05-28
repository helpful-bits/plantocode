use tauri::{AppHandle, Manager};
use serde_json::json;
use std::collections::HashMap;
use log::{info, error};

use crate::error::{AppError, AppResult, SerializableError};
use crate::models::FetchResponse;

// Background job management handlers
pub async fn handle_get_jobs(app_handle: AppHandle) -> AppResult<FetchResponse> {
    info!("Handling get_jobs command");
    
    let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner().clone();
    
    match job_repo.get_all_jobs().await {
        Ok(jobs) => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 200,
                headers,
                body: json!(jobs),
            })
        },
        Err(e) => {
            error!("Failed to get jobs: {}", e);
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

pub async fn handle_get_job(app_handle: AppHandle, job_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = job_id {
        info!("Handling get_job command for job_id: {}", id);
        
        let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
            .inner().clone();
        
        match job_repo.get_job_by_id(id).await {
            Ok(Some(job)) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(job),
                })
            },
            Ok(None) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 404,
                    headers,
                    body: json!(SerializableError::from(AppError::NotFoundError(format!("Job not found: {}", id)))),
                })
            },
            Err(e) => {
                error!("Failed to get job {}: {}", id, e);
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
            body: json!(SerializableError::from(AppError::ValidationError("Job ID is required".to_string()))),
        })
    }
}

pub async fn handle_get_jobs_by_session(app_handle: AppHandle, session_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = session_id {
        info!("Handling get_jobs_by_session command for session_id: {}", id);
        
        let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
            .inner().clone();
        
        match job_repo.get_jobs_by_session_id(id).await {
            Ok(jobs) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!(jobs),
                })
            },
            Err(e) => {
                error!("Failed to get jobs for session {}: {}", id, e);
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

pub async fn handle_get_active_jobs(app_handle: AppHandle) -> AppResult<FetchResponse> {
    info!("Handling get_active_jobs command");
    
    let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner().clone();
    
    match job_repo.get_active_jobs().await {
        Ok(jobs) => {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            Ok(FetchResponse {
                status: 200,
                headers,
                body: json!(jobs),
            })
        },
        Err(e) => {
            error!("Failed to get active jobs: {}", e);
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

pub async fn handle_cancel_job(app_handle: AppHandle, job_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = job_id {
        info!("Handling cancel_job command for job_id: {}", id);
        
        // Use job_helpers to cancel the job
        match crate::jobs::job_helpers::cancel_job(&app_handle, id).await {
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
                error!("Failed to cancel job {}: {}", id, e);
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
            body: json!(SerializableError::from(AppError::ValidationError("Job ID is required".to_string()))),
        })
    }
}

pub async fn handle_cancel_session_jobs(app_handle: AppHandle, session_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = session_id {
        info!("Handling cancel_session_jobs command for session_id: {}", id);
        
        // Use job_helpers to cancel all jobs for the session
        match crate::jobs::job_helpers::cancel_session_jobs(&app_handle, id).await {
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
                error!("Failed to cancel jobs for session {}: {}", id, e);
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


pub async fn handle_clear_job_history(app_handle: AppHandle, args: &crate::models::FetchRequestArgs) -> AppResult<FetchResponse> {
    info!("Handling clear_job_history command");
    
    if let Some(body) = &args.body {
        // Parse session ID from request body (optional)
        let session_id = body.get("sessionId").and_then(|v| v.as_str());
        
        let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
            .inner().clone();
        
        match if let Some(sid) = session_id {
            job_repo.clear_completed_jobs_for_session(sid).await
        } else {
            job_repo.clear_all_completed_jobs().await
        } {
            Ok(count) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!({
                        "success": true,
                        "count": count
                    }),
                })
            },
            Err(e) => {
                error!("Failed to clear job history: {}", e);
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
        // No body provided, clear all completed jobs
        let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
            .inner().clone();
        
        match job_repo.clear_all_completed_jobs().await {
            Ok(count) => {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                Ok(FetchResponse {
                    status: 200,
                    headers,
                    body: json!({
                        "success": true,
                        "count": count
                    }),
                })
            },
            Err(e) => {
                error!("Failed to clear job history: {}", e);
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
}

pub async fn handle_delete_job(app_handle: AppHandle, job_id: Option<&str>) -> AppResult<FetchResponse> {
    if let Some(id) = job_id {
        info!("Handling delete_job command for job_id: {}", id);
        
        let job_repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>()
            .inner().clone();
        
        match job_repo.delete_job(id).await {
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
                error!("Failed to delete job {}: {}", id, e);
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
            body: json!(SerializableError::from(AppError::ValidationError("Job ID is required".to_string()))),
        })
    }
}