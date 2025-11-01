use log::warn;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

// Job event payloads are UI-facing; serialize with camelCase via serde(rename_all = "camelCase").
// Internal Rust code and DB remain snake_case.

// Event name constants
pub const JOB_CREATED: &str = "job:created";
pub const JOB_DELETED: &str = "job:deleted";
pub const JOB_STATUS_CHANGED: &str = "job:status-changed";
pub const JOB_STREAM_PROGRESS: &str = "job:stream-progress";
pub const JOB_TOKENS_UPDATED: &str = "job:tokens-updated";
pub const JOB_COST_UPDATED: &str = "job:cost-updated";
pub const JOB_RESPONSE_APPENDED: &str = "job:response-appended";
pub const JOB_ERROR_DETAILS: &str = "job:error-details";
pub const JOB_FINALIZED: &str = "job:finalized";
pub const JOB_METADATA_UPDATED: &str = "job:metadata-updated";

// Typed event payload structs
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobCreatedEvent {
    pub job: crate::models::BackgroundJob,
    pub session_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobDeletedEvent {
    pub job_id: String,
    pub session_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobStatusChangedEvent {
    pub job_id: String,
    pub session_id: String,
    pub status: String,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub sub_status_message: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobStreamProgressEvent {
    pub job_id: String,
    pub session_id: String,
    pub progress: Option<f32>,
    pub response_length: Option<usize>,
    pub last_stream_update_time: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobTokensUpdatedEvent {
    pub job_id: String,
    pub session_id: String,
    pub tokens_sent: Option<i32>,
    pub tokens_received: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobCostUpdatedEvent {
    pub job_id: String,
    pub session_id: String,
    pub actual_cost: f64,
    pub is_finalized: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobResponseAppendedEvent {
    pub job_id: String,
    pub session_id: String,
    pub chunk: String,
    pub accumulated_length: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobErrorDetailsEvent {
    pub job_id: String,
    pub session_id: String,
    pub error_details: crate::models::error_details::ErrorDetails,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobFinalizedEvent {
    pub job_id: String,
    pub session_id: String,
    pub status: String,
    pub response: Option<String>,
    pub actual_cost: f64,
    pub tokens_sent: Option<i32>,
    pub tokens_received: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobMetadataUpdatedEvent {
    pub job_id: String,
    pub session_id: String,
    pub metadata_patch: serde_json::Value,
}

// Helper emit functions
pub fn emit_job_created(app_handle: &AppHandle, payload: JobCreatedEvent) {
    if let Err(e) = app_handle.emit(JOB_CREATED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_CREATED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_CREATED,
        "jobId": payload.job.id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_deleted(app_handle: &AppHandle, payload: JobDeletedEvent) {
    if let Err(e) = app_handle.emit(JOB_DELETED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_DELETED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_DELETED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_status_changed(app_handle: &AppHandle, payload: JobStatusChangedEvent) {
    if let Err(e) = app_handle.emit(JOB_STATUS_CHANGED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_STATUS_CHANGED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_STATUS_CHANGED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_stream_progress(app_handle: &AppHandle, payload: JobStreamProgressEvent) {
    if let Err(e) = app_handle.emit(JOB_STREAM_PROGRESS, &payload) {
        warn!("Failed to emit {} event: {}", JOB_STREAM_PROGRESS, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_STREAM_PROGRESS,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_tokens_updated(app_handle: &AppHandle, payload: JobTokensUpdatedEvent) {
    if let Err(e) = app_handle.emit(JOB_TOKENS_UPDATED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_TOKENS_UPDATED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_TOKENS_UPDATED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_cost_updated(app_handle: &AppHandle, payload: JobCostUpdatedEvent) {
    if let Err(e) = app_handle.emit(JOB_COST_UPDATED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_COST_UPDATED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_COST_UPDATED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_response_appended(app_handle: &AppHandle, payload: JobResponseAppendedEvent) {
    if let Err(e) = app_handle.emit(JOB_RESPONSE_APPENDED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_RESPONSE_APPENDED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_RESPONSE_APPENDED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_error_details(app_handle: &AppHandle, payload: JobErrorDetailsEvent) {
    if let Err(e) = app_handle.emit(JOB_ERROR_DETAILS, &payload) {
        warn!("Failed to emit {} event: {}", JOB_ERROR_DETAILS, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_ERROR_DETAILS,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_finalized(app_handle: &AppHandle, payload: JobFinalizedEvent) {
    if let Err(e) = app_handle.emit(JOB_FINALIZED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_FINALIZED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_FINALIZED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}

pub fn emit_job_metadata_updated(app_handle: &AppHandle, payload: JobMetadataUpdatedEvent) {
    if let Err(e) = app_handle.emit(JOB_METADATA_UPDATED, &payload) {
        warn!("Failed to emit {} event: {}", JOB_METADATA_UPDATED, e);
    }
    // Ensure jobId and sessionId are at top level for mobile client
    let _ = app_handle.emit("device-link-event", json!({
        "type": JOB_METADATA_UPDATED,
        "jobId": payload.job_id,
        "sessionId": payload.session_id,
        "payload": payload
    }));
    crate::remote_api::handlers::jobs::invalidate_job_list_cache_for_session(&payload.session_id);
}
