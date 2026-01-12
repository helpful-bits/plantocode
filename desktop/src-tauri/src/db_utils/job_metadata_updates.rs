use crate::db_utils::BackgroundJobRepository;
use crate::error::AppResult;
use serde_json::json;

/// Update job metadata with request_id
pub async fn update_job_request_id(
    repo: &BackgroundJobRepository,
    job_id: &str,
    request_id: &str,
) -> AppResult<()> {
    let patch = json!({
        "requestId": request_id
    });

    repo.update_job_metadata(job_id, &patch).await
}
