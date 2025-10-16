use crate::error::AppResult;
use crate::services::task_update_sequencer::TaskUpdateSequencer;

#[tauri::command]
pub async fn queue_task_description_update_command(
    app_handle: tauri::AppHandle,
    session_id: String,
    content: String,
    source: Option<String>,
) -> AppResult<()> {
    use crate::services::task_update_sequencer::UpdateSource;

    let mapped_source = match source.as_deref() {
        Some("mobile") => UpdateSource::Mobile,
        Some("job") => UpdateSource::Job,
        Some("remote") => UpdateSource::Remote,
        Some("desktop_user") => UpdateSource::DesktopUser,
        _ => UpdateSource::DesktopUser,
    };

    TaskUpdateSequencer::enqueue_task_description_with_source(
        &app_handle,
        session_id,
        content,
        mapped_source,
    )
    .await
}

#[tauri::command]
pub async fn queue_merge_instructions_update_command(
    app_handle: tauri::AppHandle,
    session_id: String,
    content: String,
) -> AppResult<()> {
    TaskUpdateSequencer::enqueue_merge_instructions(&app_handle, session_id, content).await
}

#[tauri::command]
pub async fn queue_start_task_edit_command(
    app_handle: tauri::AppHandle,
    session_id: String,
) -> AppResult<()> {
    TaskUpdateSequencer::enqueue_start_task_edit(
        &app_handle,
        session_id,
    )
    .await
}

#[tauri::command]
pub async fn queue_end_task_edit_command(
    app_handle: tauri::AppHandle,
    session_id: String,
) -> AppResult<()> {
    TaskUpdateSequencer::enqueue_end_task_edit(
        &app_handle,
        session_id,
    )
    .await
}

#[tauri::command]
pub async fn queue_external_task_description_update_command(
    app_handle: tauri::AppHandle,
    session_id: String,
    content: String,
    source: Option<String>,
) -> AppResult<()> {
    use crate::services::task_update_sequencer::UpdateSource;

    let mapped_source = match source.as_deref() {
        Some("mobile") => UpdateSource::Mobile,
        Some("job") => UpdateSource::Job,
        Some("remote") => UpdateSource::Remote,
        Some("desktop_user") => UpdateSource::DesktopUser,
        _ => UpdateSource::Remote,
    };

    TaskUpdateSequencer::enqueue_external_task_description_update(
        &app_handle,
        session_id,
        content,
        mapped_source,
    )
    .await
}
