use actix_web::{web, HttpResponse, post, get, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use log::{debug, error, info};
use uuid::Uuid;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct JobUpdateRequest {
    pub job_id: String,
    pub status: String,
    pub progress: f32,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JobUpdateResponse {
    pub success: bool,
    pub job_id: String,
}

/// Update a background job's status
#[post("/background-jobs/update")]
pub async fn update_job(
    req: HttpRequest,
    update_request: web::Json<JobUpdateRequest>,
    db_pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    
    let job_request = update_request.into_inner();
    debug!("Updating job {}: status={}, progress={}", 
           job_request.job_id, job_request.status, job_request.progress);
    
    // Update the job in the database
    let result = sqlx::query!(
        r#"
        UPDATE background_jobs
        SET 
            status = $1,
            progress = $2,
            result = $3,
            error = $4,
            updated_at = NOW()
        WHERE id = $5 AND user_id = $6
        RETURNING id
        "#,
        job_request.status,
        job_request.progress,
        job_request.result.map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Null)),
        job_request.error,
        job_request.job_id,
        user_id
    )
    .fetch_optional(db_pool.get_ref())
    .await
    .map_err(|e| AppError::Database(format!("Failed to update job: {}", e)))?;
    
    // Check if the job was found
    if result.is_none() {
        return Err(AppError::NotFound(format!("Job not found: {}", job_request.job_id)));
    }
    
    // Return success response
    Ok(HttpResponse::Ok().json(JobUpdateResponse {
        success: true,
        job_id: job_request.job_id,
    }))
}

#[derive(Debug, Serialize)]
pub struct JobListResponse {
    pub jobs: Vec<BackgroundJobResponse>,
}

#[derive(Debug, Serialize)]
pub struct BackgroundJobResponse {
    pub id: String,
    pub type_name: String,
    pub status: String,
    pub progress: f32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Get a list of background jobs for the current user
#[get("/background-jobs")]
pub async fn list_jobs(
    req: HttpRequest,
    db_pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    
    // Query jobs for this user
    let db_jobs = sqlx::query!(
        r#"
        SELECT 
            id, type_name, status, progress, 
            created_at, updated_at, result, error
        FROM background_jobs
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 50
        "#,
        user_id
    )
    .fetch_all(db_pool.get_ref())
    .await
    .map_err(|e| AppError::Database(format!("Failed to fetch jobs: {}", e)))?;
    
    // Convert to response format
    let jobs = db_jobs
        .into_iter()
        .map(|job| BackgroundJobResponse {
            id: job.id,
            type_name: job.type_name,
            status: job.status,
            progress: job.progress,
            created_at: job.created_at,
            updated_at: job.updated_at,
            result: job.result,
            error: job.error,
        })
        .collect();
    
    // Return the jobs
    Ok(HttpResponse::Ok().json(JobListResponse { jobs }))
}

#[derive(Debug, Serialize)]
pub struct JobDetailResponse {
    pub job: BackgroundJobResponse,
}

/// Get details for a specific background job
#[get("/background-jobs/{job_id}")]
pub async fn get_job(
    req: HttpRequest,
    job_id: web::Path<String>,
    db_pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse, AppError> {
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    
    // Query this specific job
    let job = sqlx::query!(
        r#"
        SELECT 
            id, type_name, status, progress, 
            created_at, updated_at, result, error
        FROM background_jobs
        WHERE id = $1 AND user_id = $2
        "#,
        job_id.into_inner(),
        user_id
    )
    .fetch_optional(db_pool.get_ref())
    .await
    .map_err(|e| AppError::Database(format!("Failed to fetch job: {}", e)))?;
    
    // Check if the job was found
    let job = match job {
        Some(j) => j,
        None => return Err(AppError::NotFound("Job not found".to_string())),
    };
    
    // Convert to response format
    let job_response = BackgroundJobResponse {
        id: job.id,
        type_name: job.type_name,
        status: job.status,
        progress: job.progress,
        created_at: job.created_at,
        updated_at: job.updated_at,
        result: job.result,
        error: job.error,
    };
    
    // Return the job details
    Ok(HttpResponse::Ok().json(JobDetailResponse { job: job_response }))
}