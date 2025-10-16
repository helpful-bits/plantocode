use crate::error::AppResult;
use diffy::{create_patch, apply};
use once_cell::sync::Lazy;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Manager};
use tokio::sync::{mpsc, Mutex};

const EDIT_TTL_MS: u64 = 5000;
const USER_ACTIVITY_WINDOW_MS: u64 = 1200;

static TASK_UPDATE_MANAGER: Lazy<Mutex<HashMap<String, SessionWorker>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateSource {
    DesktopUser,
    Mobile,
    Job,
    Remote,
    Unknown,
}

enum UpdateMessage {
    TaskDescription { session_id: String, content: String, source: UpdateSource },
    MergeInstructions { session_id: String, content: String },
    StartTaskEdit { session_id: String },
    EndTaskEdit { session_id: String },
    ExternalTaskDescription { session_id: String, content: String, source: UpdateSource },
}

struct WorkerState {
    task_description_pending: Option<(String, UpdateSource)>,
    merge_instructions_pending: Option<String>,
    edit_active: bool,
    last_edit_heartbeat_at: Instant,
    pending_remote_task_description: Option<(String, UpdateSource)>,
    last_committed_task: String,
    last_user_activity_ts: i64,
    last_user_content: Option<String>,
}

impl WorkerState {
    fn new() -> Self {
        Self {
            task_description_pending: None,
            merge_instructions_pending: None,
            edit_active: false,
            last_edit_heartbeat_at: Instant::now(),
            pending_remote_task_description: None,
            last_committed_task: String::new(),
            last_user_activity_ts: 0,
            last_user_content: None,
        }
    }
}

struct SessionWorker {
    sender: mpsc::UnboundedSender<UpdateMessage>,
    _task_handle: tokio::task::JoinHandle<()>,
}

pub struct TaskUpdateSequencer;

impl TaskUpdateSequencer {
    pub async fn enqueue_start_task_edit(
        app_handle: &AppHandle,
        session_id: String,
    ) -> AppResult<()> {
        let sender = Self::get_or_create_worker(app_handle.clone(), &session_id).await?;
        sender
            .send(UpdateMessage::StartTaskEdit { session_id })
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to enqueue start edit: {}", e)))?;
        Ok(())
    }

    pub async fn enqueue_end_task_edit(
        app_handle: &AppHandle,
        session_id: String,
    ) -> AppResult<()> {
        let sender = Self::get_or_create_worker(app_handle.clone(), &session_id).await?;
        sender
            .send(UpdateMessage::EndTaskEdit { session_id })
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to enqueue end edit: {}", e)))?;
        Ok(())
    }

    pub async fn enqueue_external_task_description_update(
        app_handle: &AppHandle,
        session_id: String,
        content: String,
        source: UpdateSource,
    ) -> AppResult<()> {
        let sender = Self::get_or_create_worker(app_handle.clone(), &session_id).await?;
        sender
            .send(UpdateMessage::ExternalTaskDescription { session_id, content, source })
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to enqueue external update: {}", e)))?;
        Ok(())
    }

    pub async fn enqueue_task_description_with_source(
        app_handle: &AppHandle,
        session_id: String,
        content: String,
        source: UpdateSource,
    ) -> AppResult<()> {
        let sender = Self::get_or_create_worker(app_handle.clone(), &session_id).await?;
        sender
            .send(UpdateMessage::TaskDescription { session_id, content, source })
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to enqueue task description: {}", e)))?;
        Ok(())
    }

    pub async fn enqueue_task_description(
        app_handle: &AppHandle,
        session_id: String,
        content: String,
    ) -> AppResult<()> {
        Self::enqueue_task_description_with_source(app_handle, session_id, content, UpdateSource::Unknown).await
    }

    pub async fn enqueue_merge_instructions(
        app_handle: &AppHandle,
        session_id: String,
        content: String,
    ) -> AppResult<()> {
        let sender = Self::get_or_create_worker(app_handle.clone(), &session_id).await?;

        sender
            .send(UpdateMessage::MergeInstructions {
                session_id: session_id.clone(),
                content,
            })
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to enqueue merge instructions: {}", e)))?;

        Ok(())
    }

    async fn get_or_create_worker(
        app_handle: AppHandle,
        session_id: &str,
    ) -> AppResult<mpsc::UnboundedSender<UpdateMessage>> {
        let mut manager = TASK_UPDATE_MANAGER.lock().await;

        let needs_new_worker = if let Some(worker) = manager.get(session_id) {
            worker.sender.is_closed()
        } else {
            true
        };

        if needs_new_worker {
            if manager.contains_key(session_id) {
                manager.remove(session_id);
            }

            let (sender, receiver) = mpsc::unbounded_channel();
            let session_id_clone = session_id.to_string();
            let app_clone = app_handle.clone();

            let task_handle = tokio::spawn(async move {
                Self::worker_task(app_clone, session_id_clone, receiver).await;
            });

            manager.insert(
                session_id.to_string(),
                SessionWorker {
                    sender: sender.clone(),
                    _task_handle: task_handle,
                },
            );

            Ok(sender)
        } else {
            Ok(manager.get(session_id).unwrap().sender.clone())
        }
    }

    async fn worker_task(
        app_handle: AppHandle,
        session_id: String,
        mut receiver: mpsc::UnboundedReceiver<UpdateMessage>,
    ) {
        let mut state = WorkerState::new();

        let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
        if let Ok(session) = cache.get_session(&app_handle, &session_id).await {
            state.last_committed_task = session.task_description.unwrap_or_default();
        }

        loop {
            tokio::select! {
                Some(msg) = receiver.recv() => {
                    match msg {
                        UpdateMessage::StartTaskEdit { .. } => {
                            state.edit_active = true;
                            state.last_edit_heartbeat_at = Instant::now();
                        }
                        UpdateMessage::EndTaskEdit { .. } => {
                            state.edit_active = false;
                            if let Some((content, source)) = state.pending_remote_task_description.take() {
                                if let Err(e) = Self::merge_and_commit(
                                    &app_handle,
                                    &session_id,
                                    &mut state,
                                    &content,
                                    source,
                                ).await {
                                    log::error!("Failed to merge pending remote update: {}", e);
                                }
                            }
                        }
                        UpdateMessage::ExternalTaskDescription { content, source, .. } => {
                            if state.edit_active {
                                state.pending_remote_task_description = Some((content, source));
                            } else {
                                if let Err(e) = Self::merge_and_commit(
                                    &app_handle,
                                    &session_id,
                                    &mut state,
                                    &content,
                                    source,
                                ).await {
                                    log::error!("Failed to commit external update: {}", e);
                                }
                            }
                        }
                        UpdateMessage::TaskDescription { content, source, .. } => {
                            if source == UpdateSource::DesktopUser {
                                state.last_user_activity_ts = chrono::Utc::now().timestamp_millis();
                                state.last_user_content = Some(content.clone());
                            }
                            state.task_description_pending = Some((content, source));
                        }
                        UpdateMessage::MergeInstructions { content, .. } => {
                            state.merge_instructions_pending = Some(content);
                        }
                    }

                    if state.edit_active {
                        let elapsed_ms = state.last_edit_heartbeat_at.elapsed().as_millis() as u64;
                        if elapsed_ms >= EDIT_TTL_MS {
                            state.edit_active = false;
                            if let Some((content, source)) = state.pending_remote_task_description.take() {
                                if let Err(e) = Self::merge_and_commit(
                                    &app_handle,
                                    &session_id,
                                    &mut state,
                                    &content,
                                    source,
                                ).await {
                                    log::error!("Failed to merge after TTL expiry: {}", e);
                                }
                            }
                        }
                    }

                    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

                    while let Ok(msg) = receiver.try_recv() {
                        match msg {
                            UpdateMessage::StartTaskEdit { .. } => {
                                state.edit_active = true;
                                state.last_edit_heartbeat_at = Instant::now();
                            }
                            UpdateMessage::EndTaskEdit { .. } => {
                                state.edit_active = false;
                                if let Some((content, source)) = state.pending_remote_task_description.take() {
                                    if let Err(e) = Self::merge_and_commit(
                                        &app_handle,
                                        &session_id,
                                        &mut state,
                                        &content,
                                        source,
                                    ).await {
                                        log::error!("Failed to merge pending remote update: {}", e);
                                    }
                                }
                            }
                            UpdateMessage::ExternalTaskDescription { content, source, .. } => {
                                if state.edit_active {
                                    state.pending_remote_task_description = Some((content, source));
                                } else {
                                    if let Err(e) = Self::merge_and_commit(
                                        &app_handle,
                                        &session_id,
                                        &mut state,
                                        &content,
                                        source,
                                    ).await {
                                        log::error!("Failed to commit external update: {}", e);
                                    }
                                }
                            }
                            UpdateMessage::TaskDescription { content, source, .. } => {
                                if source == UpdateSource::DesktopUser {
                                    state.last_user_activity_ts = chrono::Utc::now().timestamp_millis();
                                    state.last_user_content = Some(content.clone());
                                }
                                state.task_description_pending = Some((content, source));
                            }
                            UpdateMessage::MergeInstructions { content, .. } => {
                                state.merge_instructions_pending = Some(content);
                            }
                        }
                    }

                    if let Err(e) = Self::commit_updates(
                        &app_handle,
                        &session_id,
                        &mut state,
                    ).await {
                        log::error!("Failed to commit updates for session {}: {}", session_id, e);
                    }
                }
                else => {
                    break;
                }
            }
        }
    }

    async fn merge_and_commit(
        app_handle: &AppHandle,
        session_id: &str,
        state: &mut WorkerState,
        incoming_content: &str,
        source: UpdateSource,
    ) -> AppResult<()> {
        let base = &state.last_committed_task;
        let ours = state.last_user_content.as_deref().unwrap_or(base);
        let theirs = incoming_content;

        let merged = Self::three_way_merge(base, ours, theirs);

        let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

        cache.update_task_description_canonical(app_handle, session_id, &merged).await?;

        state.last_committed_task = merged.clone();

        // Cache emits session-updated automatically; only emit field validation for checksum
        let checksum = format!("{:x}", Sha256::digest(merged.as_bytes()));
        if let Err(e) = crate::events::session_events::emit_session_field_validated(
            app_handle,
            session_id,
            "taskDescription",
            &checksum,
            merged.len(),
        ) {
            log::error!("Failed to emit session-field-validated event: {}", e);
        }

        Ok(())
    }

    fn three_way_merge(base: &str, ours: &str, theirs: &str) -> String {
        if ours == theirs {
            return ours.to_string();
        }

        if ours == base {
            return theirs.to_string();
        }

        if theirs == base {
            return ours.to_string();
        }

        let patch_ours = create_patch(base, ours);

        match apply(base, &patch_ours) {
            Ok(result) => result,
            Err(_) => {
                ours.to_string()
            }
        }
    }

    async fn commit_updates(
        app_handle: &AppHandle,
        session_id: &str,
        state: &mut WorkerState,
    ) -> AppResult<()> {
        let task_desc_update = state.task_description_pending.take();
        let merge_instr_update = state.merge_instructions_pending.take();

        if task_desc_update.is_none() && merge_instr_update.is_none() {
            return Ok(());
        }

        let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

        let mut task_desc_owned: Option<String> = None;
        let task_desc_for_db = if let Some((content, source)) = task_desc_update.as_ref() {
            if *source == UpdateSource::DesktopUser {
                state.last_committed_task = content.clone();
                Some(content.as_str())
            } else {
                let base = &state.last_committed_task;
                let ours = state.last_user_content.as_deref().unwrap_or(base);
                let theirs = content.as_str();
                let merged = Self::three_way_merge(base, ours, theirs);
                state.last_committed_task = merged.clone();
                task_desc_owned = Some(merged);
                task_desc_owned.as_deref()
            }
        } else {
            None
        };

        let merge_instr_for_db = merge_instr_update.as_deref();

        // Update task description if present
        if let Some(desc) = task_desc_for_db {
            cache.update_task_description_canonical(app_handle, session_id, desc).await?;

            // Emit validation checksum
            let checksum = format!("{:x}", Sha256::digest(desc.as_bytes()));
            if let Err(e) = crate::events::session_events::emit_session_field_validated(
                app_handle,
                session_id,
                "taskDescription",
                &checksum,
                desc.len(),
            ) {
                log::error!("Failed to emit session-field-validated event: {}", e);
            }
        }

        // Update merge instructions if present
        if let Some(instr) = merge_instr_for_db {
            cache.update_fields_partial(
                app_handle,
                session_id,
                &serde_json::json!({"mergeInstructions": instr})
            ).await?;

            // Emit validation checksum
            let checksum = format!("{:x}", Sha256::digest(instr.as_bytes()));
            if let Err(e) = crate::events::session_events::emit_session_field_validated(
                app_handle,
                session_id,
                "mergeInstructions",
                &checksum,
                instr.len(),
            ) {
                log::error!("Failed to emit session-field-validated event: {}", e);
            }
        }

        Ok(())
    }
}
