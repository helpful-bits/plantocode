use crate::db_utils::session_repository::{
    SessionRepository, TaskHistoryState, FileHistoryState
};
use crate::error::AppError;
use crate::events::session_events;
use crate::utils::hash_utils::sha256_hash;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, oneshot};
use tauri::AppHandle;

#[derive(Debug)]
enum HistoryOp {
    SyncTask {
        session_id: String,
        state: TaskHistoryState,
        expected_version: i64,
        respond_to: oneshot::Sender<Result<TaskHistoryState, String>>,
    },
    SyncFiles {
        session_id: String,
        state: FileHistoryState,
        expected_version: i64,
        respond_to: oneshot::Sender<Result<FileHistoryState, String>>,
    },
    MergeTask {
        session_id: String,
        remote_state: TaskHistoryState,
        respond_to: oneshot::Sender<Result<TaskHistoryState, String>>,
    },
    MergeFiles {
        session_id: String,
        remote_state: FileHistoryState,
        respond_to: oneshot::Sender<Result<FileHistoryState, String>>,
    },
}

pub struct HistoryStateSequencer {
    queues: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<HistoryOp>>>>,
    app_handle: AppHandle,
    repository: Arc<SessionRepository>,
}

impl HistoryStateSequencer {
    pub fn new(app_handle: AppHandle, repository: Arc<SessionRepository>) -> Self {
        Self {
            queues: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
            repository,
        }
    }

    pub async fn enqueue_sync_task(
        &self,
        session_id: String,
        state: TaskHistoryState,
        expected_version: i64,
    ) -> Result<TaskHistoryState, String> {
        let (tx, rx) = oneshot::channel();
        self.enqueue_op(
            session_id.clone(),
            HistoryOp::SyncTask {
                session_id,
                state,
                expected_version,
                respond_to: tx,
            },
        ).await;

        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            rx
        ).await
            .map_err(|_| "History sync timeout".to_string())?
            .map_err(|_| "Channel closed".to_string())?
    }

    pub async fn enqueue_sync_files(
        &self,
        session_id: String,
        state: FileHistoryState,
        expected_version: i64,
    ) -> Result<FileHistoryState, String> {
        let (tx, rx) = oneshot::channel();
        self.enqueue_op(
            session_id.clone(),
            HistoryOp::SyncFiles {
                session_id,
                state,
                expected_version,
                respond_to: tx,
            },
        ).await;

        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            rx
        ).await
            .map_err(|_| "History sync timeout".to_string())?
            .map_err(|_| "Channel closed".to_string())?
    }

    pub async fn enqueue_merge_task(
        &self,
        session_id: String,
        remote_state: TaskHistoryState,
    ) -> Result<TaskHistoryState, String> {
        let (tx, rx) = oneshot::channel();
        self.enqueue_op(
            session_id.clone(),
            HistoryOp::MergeTask {
                session_id,
                remote_state,
                respond_to: tx,
            },
        ).await;

        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            rx
        ).await
            .map_err(|_| "History merge timeout".to_string())?
            .map_err(|_| "Channel closed".to_string())?
    }

    pub async fn enqueue_merge_files(
        &self,
        session_id: String,
        remote_state: FileHistoryState,
    ) -> Result<FileHistoryState, String> {
        let (tx, rx) = oneshot::channel();
        self.enqueue_op(
            session_id.clone(),
            HistoryOp::MergeFiles {
                session_id,
                remote_state,
                respond_to: tx,
            },
        ).await;

        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            rx
        ).await
            .map_err(|_| "History merge timeout".to_string())?
            .map_err(|_| "Channel closed".to_string())?
    }

    async fn enqueue_op(&self, session_id: String, op: HistoryOp) {
        let mut queues = self.queues.lock().await;
        let tx = queues.entry(session_id.clone()).or_insert_with(|| {
            let (tx, rx) = mpsc::unbounded_channel();
            self.spawn_worker(session_id, rx);
            tx
        });
        let _ = tx.send(op);
    }

    fn spawn_worker(&self, session_id: String, mut rx: mpsc::UnboundedReceiver<HistoryOp>) {
        let app_handle = self.app_handle.clone();
        let repository = self.repository.clone();
        let queues = self.queues.clone();

        tokio::spawn(async move {
            while let Some(op) = rx.recv().await {
                match op {
                    HistoryOp::SyncTask { session_id, state, expected_version, respond_to } => {
                        // Checksum validation before sync
                        let recomputed_checksum = compute_task_history_checksum(&state.entries, state.current_index, state.version);
                        if recomputed_checksum != state.checksum && !state.checksum.is_empty() {
                            eprintln!(
                                "[CHECKSUM] Mismatch detected for session {} (task): expected {}, got {}",
                                session_id,
                                state.checksum,
                                recomputed_checksum
                            );
                        }

                        let response = match repository.sync_task_history_state(&session_id, &state, expected_version).await {
                            Ok(new_state) => {
                                session_events::emit_history_state_changed(&app_handle, &session_id, "task", &new_state);
                                Ok(new_state)
                            }
                            Err(AppError::Conflict(_)) => {
                                match repository.get_task_history_state(&session_id).await {
                                    Ok(local_state) => {
                                        let merged = repository.merge_task_history_states(&local_state, &state);
                                        match repository.sync_task_history_state(&session_id, &merged, local_state.version).await {
                                            Ok(persisted) => {
                                                session_events::emit_history_state_changed(&app_handle, &session_id, "task", &persisted);
                                                Ok(persisted)
                                            }
                                            Err(e) => {
                                                eprintln!("[HistorySync] Task merge sync failed for session {}: {}", session_id, e);
                                                Err(e.to_string())
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[HistorySync] Failed to get local task state for session {}: {}", session_id, e);
                                        Err(e.to_string())
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[HistorySync] Task sync failed for session {}: {}", session_id, e);
                                Err(e.to_string())
                            }
                        };

                        let _ = respond_to.send(response);
                    }
                    HistoryOp::SyncFiles { session_id, state, expected_version, respond_to } => {
                        // Checksum validation before sync
                        let recomputed_checksum = compute_file_history_checksum(&state.entries, state.current_index, state.version);
                        if recomputed_checksum != state.checksum {
                            eprintln!(
                                "[CHECKSUM] Mismatch detected for session {} (files): expected {}, got {}",
                                session_id,
                                state.checksum,
                                recomputed_checksum
                            );
                        }

                        let response = match repository.sync_file_history_state(&session_id, &state, expected_version).await {
                            Ok(new_state) => {
                                session_events::emit_history_state_changed(&app_handle, &session_id, "files", &new_state);
                                Ok(new_state)
                            }
                            Err(AppError::Conflict(_)) => {
                                match repository.get_file_history_state(&session_id).await {
                                    Ok(local_state) => {
                                        let merged = repository.merge_file_history_states(&local_state, &state);
                                        match repository.sync_file_history_state(&session_id, &merged, local_state.version).await {
                                            Ok(persisted) => {
                                                session_events::emit_history_state_changed(&app_handle, &session_id, "files", &persisted);
                                                Ok(persisted)
                                            }
                                            Err(e) => {
                                                eprintln!("[HistorySync] File merge sync failed for session {}: {}", session_id, e);
                                                Err(e.to_string())
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[HistorySync] Failed to get local file state for session {}: {}", session_id, e);
                                        Err(e.to_string())
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[HistorySync] File sync failed for session {}: {}", session_id, e);
                                Err(e.to_string())
                            }
                        };

                        let _ = respond_to.send(response);
                    }
                    HistoryOp::MergeTask { session_id, remote_state, respond_to } => {
                        let local = repository.get_task_history_state(&session_id).await;
                        let response = match local {
                            Ok(local_state) => {
                                let merged = repository.merge_task_history_states(&local_state, &remote_state);
                                repository.sync_task_history_state(&session_id, &merged, local_state.version).await
                                    .map_err(|e| e.to_string())
                            }
                            Err(e) => Err(e.to_string()),
                        };

                        if let Ok(ref new_state) = response {
                            session_events::emit_history_state_changed(
                                &app_handle,
                                &session_id,
                                "task",
                                new_state,
                            );
                        }

                        let _ = respond_to.send(response);
                    }
                    HistoryOp::MergeFiles { session_id, remote_state, respond_to } => {
                        let local = repository.get_file_history_state(&session_id).await;
                        let response = match local {
                            Ok(local_state) => {
                                let merged = repository.merge_file_history_states(&local_state, &remote_state);
                                repository.sync_file_history_state(&session_id, &merged, local_state.version).await
                                    .map_err(|e| e.to_string())
                            }
                            Err(e) => Err(e.to_string()),
                        };

                        if let Ok(ref new_state) = response {
                            session_events::emit_history_state_changed(
                                &app_handle,
                                &session_id,
                                "files",
                                new_state,
                            );
                        }

                        let _ = respond_to.send(response);
                    }
                }
            }

            queues.lock().await.remove(&session_id);
        });
    }
}

fn compute_task_history_checksum(entries: &[crate::db_utils::session_repository::TaskHistoryEntry], current_index: i64, version: i64) -> String {
    use crate::db_utils::session_repository::TaskHistoryEntry;

    #[derive(Serialize)]
    struct ChecksumData<'a> {
        current_index: i64,
        entries: &'a [TaskHistoryEntry],
        version: i64,
    }

    let data = ChecksumData {
        current_index,
        entries,
        version,
    };

    let json = serde_json::to_string(&data).unwrap_or_default();
    sha256_hash(&json)
}

fn compute_file_history_checksum(entries: &[crate::db_utils::session_repository::FileSelectionHistoryEntry], current_index: i64, version: i64) -> String {
    use crate::db_utils::session_repository::FileSelectionHistoryEntry;

    #[derive(Serialize)]
    struct ChecksumData<'a> {
        current_index: i64,
        entries: &'a [FileSelectionHistoryEntry],
        version: i64,
    }

    let data = ChecksumData {
        current_index,
        entries,
        version,
    };

    let json = serde_json::to_string(&data).unwrap_or_default();
    sha256_hash(&json)
}
