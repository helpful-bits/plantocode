//! Terminal session management with dual-output architecture.
//!
//! Output is delivered via two paths:
//! - Local desktop: Channel<Vec<u8>> subscribers for low-latency UI rendering
//! - Remote/mobile: Binary WebSocket frames via DeviceLinkClient for headerless streaming
//!
//! The RPC path runs headless (Option<Channel> = None) and relies entirely on binary streaming.
//! Terminal exit events continue to use device-link-event emissions for control-plane signaling.

use crate::db_utils::terminal_repository::RestorableSession;
use crate::error::{AppError, AppResult};
use base64::Engine;
use dashmap::DashMap;
use portable_pty::{CommandBuilder, PtySize, native_pty_system, MasterPty, Child};
use serde_json::json;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager};

const TERMINAL_IN_MEMORY_BUFFER_BYTES: usize = 32 * 1_048_576;
const FLUSH_INTERVAL_SECS: u64 = 10;
const FLUSH_SCAN_TICK_MILLIS: u64 = 1000;
const MAX_TERMINAL_SNAPSHOT_BYTES: usize = 256 * 1024;
const WINDOWS_WRITE_CHUNK_BYTES: usize = 8 * 1024;

enum TerminalState {
    Initializing,
    Running {
        writer: Box<dyn Write + Send>,
        pty: Box<dyn MasterPty + Send>,
        child: Box<dyn Child + Send + Sync>,
    },
    Suspended {
        child_exit_code: Option<i32>,
    },
    Exited {
        code: i32,
    },
    Killed,
    Error {
        message: String,
    },
    Zombie,
    CleaningUp,
    Restored {
        exited: bool,
        exit_code: Option<i32>,
    },
}

pub struct TerminalManager {
    app: AppHandle,
    repo: Arc<crate::db_utils::TerminalRepository>,
    sessions: DashMap<String, Arc<SessionHandle>>,
    flusher_started: std::sync::atomic::AtomicBool,
}

struct SessionHandle {
    buffer: Mutex<Vec<u8>>,
    subscribers: Mutex<Vec<Channel<Vec<u8>>>>,
    state: Mutex<TerminalState>,
    last_requested_size: Mutex<Option<(u16, u16)>>,
    started_at: i64,
    working_dir: Option<String>,
    last_flushed_len: Mutex<usize>,
    last_flush_at: Mutex<i64>,
    next_flush_allowed_at: Mutex<i64>,
    flush_backoff_secs: Mutex<u64>,
}

impl SessionHandle {
    fn set_state_if<F>(&self, predicate: F, new_state: TerminalState) -> bool
    where
        F: FnOnce(&TerminalState) -> bool,
    {
        let mut state_guard = self.state.lock().unwrap();
        if predicate(&*state_guard) {
            *state_guard = new_state;
            true
        } else {
            false
        }
    }
}

impl TerminalManager {
    pub fn new(app: AppHandle, repo: Arc<crate::db_utils::TerminalRepository>) -> Self {
        Self {
            app,
            repo,
            sessions: DashMap::new(),
            flusher_started: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub async fn start_session(
        &self,
        session_id: String,
        working_dir: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
        output: Option<Channel<Vec<u8>>>,
    ) -> AppResult<()> {
        log::info!("🚀 Starting terminal session: id={} dir={:?}", session_id, working_dir);
        let now = now_secs();

        if let Some(existing_handle) = self.sessions.get(&session_id) {
            let is_running = matches!(&*existing_handle.state.lock().unwrap(), TerminalState::Running { .. });

            if is_running {
                log::info!("✅ Session {} already has active PTY, attaching new subscriber", session_id);
                if let Some(output_channel) = output {
                    let snapshot = existing_handle.buffer.lock().unwrap().clone();
                    let _ = output_channel.send(snapshot);
                    existing_handle.subscribers.lock().unwrap().push(output_channel);
                }
                return Ok(());
            }
        }

        self.repo
            .ensure_session(&session_id, now, working_dir.clone())
            .await?;

        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize {
                rows: rows.unwrap_or(24),
                cols: cols.unwrap_or(80),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::ExternalServiceError(format!("Failed to open pty: {}", e)))?;

        // Get terminal settings
        let settings_repo = self
            .app
            .state::<std::sync::Arc<crate::db_utils::SettingsRepository>>();
        let preferred_cli = settings_repo
            .get_value("terminal.preferred_cli")
            .await
            .ok()
            .flatten();
        log::info!(
            "terminal.auto_cli preference {:?}",
            preferred_cli.as_deref().unwrap_or("unset")
        );
        let additional_args = settings_repo
            .get_value("terminal.additional_args")
            .await
            .ok()
            .flatten();
        let custom_command = settings_repo
            .get_value("terminal.custom_command")
            .await
            .ok()
            .flatten();

        // Determine the command to run with OS-aware shell detection
        let mut cmd = if cfg!(windows) {
            // Windows: prefer PowerShell with -NoLogo, fallback to cmd.exe
            let shell = if which::which("powershell.exe").is_ok() {
                "powershell.exe"
            } else {
                "cmd.exe"
            };
            let mut c = CommandBuilder::new(shell);
            if shell == "powershell.exe" {
                c.arg("-NoLogo");
                // Bypass execution policy for this session (allows npm's .ps1 shims like claude.ps1)
                // Mirrors IntelliJ Terminal behavior - process-scope policy only, Group Policy still wins
                c.arg("-ExecutionPolicy");
                c.arg("Bypass");
            }
            c
        } else if cfg!(target_os = "macos") {
            // macOS: prefer $SHELL env var, fallback to /bin/zsh
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            CommandBuilder::new(shell)
        } else {
            // Linux: prefer $SHELL env var, fallback to /bin/bash
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            CommandBuilder::new(shell)
        };

        if let Some(ref dir) = working_dir {
            cmd.cwd(dir);
        }

        // If a CLI tool is configured, prepare to launch it after shell starts
        let mut init_command = None;
        if let Some(cli) = preferred_cli.as_deref() {
            if cli != "none" && !cli.is_empty() {
                let cli_cmd = match cli {
                    "claude" => Some("claude"),
                    "cursor" => Some("cursor"),
                    "codex" => Some("codex"),
                    "gemini" => Some("gemini"),
                    "custom" => custom_command.as_deref(),
                    _ => None,
                };

                if let Some(cmd_str) = cli_cmd {
                    // Build the full command with additional args
                    let full_cmd = if let Some(args) = additional_args.as_deref() {
                        if !args.is_empty() {
                            format!("{} {}", cmd_str, args)
                        } else {
                            cmd_str.to_string()
                        }
                    } else {
                        cmd_str.to_string()
                    };
                    init_command = Some(full_cmd);
                }
            }
        }

        // Set environment variables for full color support
        if !cfg!(windows) {
            cmd.env("TERM", "xterm-256color"); // Standard 256-color support
            cmd.env("COLORTERM", "truecolor"); // Indicates 24-bit truecolor support
            cmd.env("FORCE_COLOR", "1"); // Forces color output for many tools
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to spawn command: {}", e))
        })?;

        // Store the process ID for potential cleanup
        let process_id = child.process_id();
        if let Some(pid) = process_id {
            self.repo
                .update_process_pid(&session_id, pid as i64, now)
                .await?;
        }
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to clone reader: {}", e))
        })?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::ExternalServiceError(format!("Failed to take writer: {}", e)))?;

        let handle = Arc::new(SessionHandle {
            buffer: Mutex::new(Vec::new()),
            subscribers: Mutex::new(if let Some(ch) = output { vec![ch] } else { Vec::new() }),
            state: Mutex::new(TerminalState::Running {
                writer,
                pty: pair.master,
                child,
            }),
            last_requested_size: Mutex::new(None),
            started_at: now,
            working_dir,
            last_flushed_len: Mutex::new(0),
            last_flush_at: Mutex::new(now),
            next_flush_allowed_at: Mutex::new(now),
            flush_backoff_secs: Mutex::new(0),
        });

        self.sessions.insert(session_id.clone(), handle.clone());

        // Send the init command to the terminal if configured
        if let Some(init_cmd) = init_command {
            // Wait a moment for the shell to start, then send the command
            let handle_for_init = handle.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let mut state_guard = handle_for_init.state.lock().unwrap();
                if let TerminalState::Running { writer, .. } = &mut *state_guard {
                    let command_with_newline = format!("{}\n", init_cmd);
                    let _ = writer.write_all(command_with_newline.as_bytes());
                    let _ = writer.flush();
                }
            });
        }

        let app = self.app.clone();
        let repo = self.repo.clone();
        let sid = session_id.clone();

        // Create channel for forwarding chunks from blocking reader to async processor
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Option<Vec<u8>>>();

        // Spawn blocking reader relay that owns the reader
        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - send done signal
                        let _ = tx.send(None);
                        break;
                    }
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        if tx.send(Some(chunk)).is_err() {
                            // Receiver dropped, exit
                            break;
                        }
                    }
                    Err(_) => {
                        // Error - send done signal
                        let _ = tx.send(None);
                        break;
                    }
                }
            }
        });

        // Spawn async task to process chunks from channel
        tauri::async_runtime::spawn(async move {
            while let Some(chunk_opt) = rx.recv().await {
                match chunk_opt {
                    Some(chunk) => {
                        // Update buffer with capped size
                        {
                            let mut b = handle.buffer.lock().unwrap();
                            b.extend_from_slice(&chunk);

                            if b.len() > TERMINAL_IN_MEMORY_BUFFER_BYTES {
                                let overflow = b.len() - TERMINAL_IN_MEMORY_BUFFER_BYTES;
                                b.drain(0..overflow);

                                let mut last_flushed = handle.last_flushed_len.lock().unwrap();
                                *last_flushed = last_flushed.saturating_sub(overflow);
                            }
                        }

                        // Notify subscribers
                        let subs = handle.subscribers.lock().unwrap().clone();
                        for s in subs {
                            let _ = s.send(chunk.clone());
                        }

                        // Send raw binary to mobile via device link client
                        if let Some(client) = app.try_state::<Arc<crate::services::device_link_client::DeviceLinkClient>>() {
                            if let Err(e) = client.send_terminal_output_binary(&sid, &chunk) {
                                log::warn!("Failed to send terminal binary for session {}: {}", sid, e);
                            }
                        }
                    }
                    None => {
                        // Done signal received, exit loop
                        break;
                    }
                }
            }

            // Take the child from the state and wait for it
            let exit_code = {
                let mut state_guard = handle.state.lock().unwrap();
                match std::mem::replace(&mut *state_guard, TerminalState::CleaningUp) {
                    TerminalState::Running { mut child, .. } => {
                        drop(state_guard); // Release lock before blocking wait
                        match child.wait() {
                            Ok(status) => status.exit_code() as i32,
                            Err(_) => -1,
                        }
                    }
                    TerminalState::Exited { code } => code,
                    TerminalState::Killed => -1,
                    _ => {
                        // If not in expected state, mark as zombie
                        *state_guard = TerminalState::Zombie;
                        -1
                    }
                }
            };

            // Transition to final Exited state
            *handle.state.lock().unwrap() = TerminalState::Exited { code: exit_code };

            // Emit device-link-event for terminal exit
            app.emit(
                "device-link-event",
                json!({
                    "type": "terminal.exit",
                    "payload": {
                        "sessionId": sid,
                        "code": exit_code,
                        "timestamp": now_secs()
                    }
                }),
            )
            .ok();

            // Force flush all pending output on EOF (ignoring backoff timers)
            // This ensures durability before marking session as completed
            if let Some(manager) = app.try_state::<Arc<TerminalManager>>() {
                manager.flush_all_pending_for_session(&sid, &handle).await;
            }

            let final_log = String::from_utf8_lossy(&handle.buffer.lock().unwrap()).to_string();
            let ended = now_secs();
            let _ = repo
                .save_session_result(
                    &sid,
                    ended,
                    Some(exit_code as i64),
                    Some(final_log),
                    handle.working_dir.clone(),
                )
                .await;
        });

        Ok(())
    }

    pub fn attach(&self, session_id: &str, output: Option<Channel<Vec<u8>>>) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            if let Some(output_channel) = output {
                let snapshot = h.buffer.lock().unwrap().clone();
                let _ = output_channel.send(snapshot);
                h.subscribers.lock().unwrap().push(output_channel);
            }
        }
        Ok(())
    }

    pub fn write_input(&self, session_id: &str, data: Vec<u8>) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            let mut state_guard = h.state.lock().unwrap();
            if let TerminalState::Running { writer, .. } = &mut *state_guard {
                log::debug!("📝 Writing input: session={} bytes={}", session_id, data.len());
                if cfg!(windows) && data.len() > WINDOWS_WRITE_CHUNK_BYTES {
                    for chunk in data.chunks(WINDOWS_WRITE_CHUNK_BYTES) {
                        writer.write_all(chunk).map_err(|e| {
                            AppError::ExternalServiceError(format!("Failed to write to terminal: {}", e))
                        })?;
                    }
                } else {
                    writer.write_all(&data).map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write to terminal: {}", e))
                    })?;
                }

                if !cfg!(windows) {
                    writer.flush().map_err(|e| {
                        AppError::ExternalServiceError(format!(
                            "Failed to flush terminal writer: {}",
                            e
                        ))
                    })?;
                }
            } else {
                log::warn!("❌ Write input failed: session {} not in Running state", session_id);
                return Err(AppError::TerminalStateError(format!(
                    "Terminal session {} is not running",
                    session_id
                )));
            }
        } else {
            log::warn!("❌ Write input failed: session {} not found", session_id);
            return Err(AppError::TerminalSessionNotFound(format!(
                "Terminal session {} not found",
                session_id
            )));
        }
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            // Store requested size for coalescing
            *h.last_requested_size.lock().unwrap() = Some((cols, rows));

            let mut state_guard = h.state.lock().unwrap();
            if let TerminalState::Running { pty, .. } = &mut *state_guard {
                pty.resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| {
                    AppError::ExternalServiceError(format!("Failed to resize terminal: {}", e))
                })?;
            }
        }
        Ok(())
    }

    pub fn kill(&self, session_id: &str) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            let mut state_guard = h.state.lock().unwrap();
            match &mut *state_guard {
                TerminalState::Running { child, .. } => {
                    // Kill the child process
                    child.kill().map_err(|e| {
                        AppError::ExternalServiceError(format!(
                            "Failed to kill terminal process: {}",
                            e
                        ))
                    })?;
                    // Transition to Killed state (drop writer, pty, child)
                    *state_guard = TerminalState::Killed;
                }
                TerminalState::Exited { .. } | TerminalState::Killed | TerminalState::Error { .. }
                | TerminalState::CleaningUp | TerminalState::Zombie => {
                    // Already terminated - idempotent
                    log::debug!("Session {} already terminated, kill is no-op", session_id);
                }
                _ => {
                    // Unexpected state - transition to Error
                    *state_guard = TerminalState::Error {
                        message: format!("Kill called in unexpected state"),
                    };
                }
            }
        }
        Ok(())
    }

    pub fn status(&self, session_id: &str) -> serde_json::Value {
        if let Some(h) = self.sessions.get(session_id) {
            // Derive status directly from TerminalState
            let state_guard = h.state.lock().unwrap();
            let (status, exit_code) = match &*state_guard {
                TerminalState::Initializing => ("initializing", None),
                TerminalState::Running { .. } => ("running", None),
                TerminalState::Suspended { child_exit_code } => ("suspended", *child_exit_code),
                TerminalState::Exited { code } => {
                    if *code == 0 {
                        ("completed", Some(*code))
                    } else {
                        ("failed", Some(*code))
                    }
                }
                TerminalState::Killed => ("stopped", None),
                TerminalState::Error { .. } => ("error", None),
                TerminalState::Zombie => ("zombie", None),
                TerminalState::CleaningUp => ("cleaning_up", None),
                TerminalState::Restored { exited, exit_code } => {
                    if *exited {
                        if let Some(code) = exit_code {
                            if *code == 0 {
                                ("completed", Some(*code))
                            } else {
                                ("failed", Some(*code))
                            }
                        } else {
                            ("restored", None)
                        }
                    } else {
                        ("restored", None)
                    }
                }
            };

            serde_json::json!({
                "status": status,
                "exitCode": exit_code
            })
        } else {
            serde_json::json!({"status": "stopped"})
        }
    }

    pub fn get_active_sessions(&self) -> Vec<String> {
        // Returns list of ONLY truly running session IDs (Running state or non-exited Restored)
        // Filters out exited/restored, completed, failed, and stopped sessions
        self.sessions
            .iter()
            .filter(|entry| {
                let handle = entry.value();
                let state_guard = handle.state.lock().unwrap();
                match &*state_guard {
                    TerminalState::Running { .. } => true,
                    TerminalState::Restored { exited, .. } => !exited,
                    _ => false,
                }
            })
            .map(|entry| entry.key().clone())
            .collect()
    }

    pub fn get_session_working_directory(&self, session_id: &str) -> Option<String> {
        self.sessions
            .get(session_id)
            .and_then(|handle| handle.working_dir.clone())
    }

    pub fn reconnect_to_session(
        &self,
        session_id: &str,
        output: Option<Channel<Vec<u8>>>,
    ) -> AppResult<bool> {
        // Try to reconnect to an existing session (used for page reloads)
        if let Some(h) = self.sessions.get(session_id) {
            // Check if session is running based on state
            let is_running = {
                let state_guard = h.state.lock().unwrap();
                matches!(&*state_guard, TerminalState::Running { .. })
            };

            // Refuse non-running sessions
            if !is_running {
                return Ok(false);
            }

            // Only proceed with channel attachment if running
            if let Some(output_channel) = output {
                // Send the current buffer snapshot to catch up
                let snapshot = h.buffer.lock().unwrap().clone();
                let _ = output_channel.send(snapshot);

                // Add the new subscriber
                h.subscribers.lock().unwrap().push(output_channel);
            }

            // Return true to indicate successful reconnection
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn cleanup_all_sessions(&self) -> AppResult<()> {
        let now = now_secs();
        let session_ids: Vec<String> = self
            .sessions
            .iter()
            .map(|entry| entry.key().clone())
            .collect();

        for session_id in session_ids {
            if let Some(handle) = self.sessions.get(&session_id) {
                // Force flush all pending output during cleanup (ignoring backoff timers)
                // This ensures best-effort durability on app shutdown
                self.flush_all_pending_for_session(&session_id, &handle).await;

                // Save final buffer state with max data preservation
                let final_log = String::from_utf8_lossy(&handle.buffer.lock().unwrap()).to_string();

                // Extract old state and release lock before any async operations
                // This avoids holding MutexGuard across await points
                let old_state = {
                    let mut state_guard = handle.state.lock().unwrap();
                    std::mem::replace(&mut *state_guard, TerminalState::CleaningUp)
                };

                match old_state {
                    TerminalState::Running { mut child, .. } => {
                        // Attempt graceful kill
                        if let Err(e) = child.kill() {
                            log::warn!("Failed to signal terminal kill during app shutdown: {}", e);
                        }

                        // Give process 2 seconds to terminate gracefully
                        let wait_result = tokio::time::timeout(
                            std::time::Duration::from_secs(2),
                            tokio::task::spawn_blocking(move || child.wait()),
                        )
                        .await;

                        let final_exit_code = match wait_result {
                            Ok(Ok(Ok(status))) => status.exit_code() as i32,
                            Ok(Ok(Err(_))) | Ok(Err(_)) | Err(_) => -1,
                        };

                        *handle.state.lock().unwrap() = TerminalState::Killed;
                        self.repo
                            .save_session_result(
                                &session_id,
                                now,
                                Some(final_exit_code as i64),
                                Some(final_log),
                                handle.working_dir.clone(),
                            )
                            .await?;
                    }
                    TerminalState::Exited { code } => {
                        self.repo
                            .save_session_result(
                                &session_id,
                                now,
                                Some(code as i64),
                                Some(final_log),
                                handle.working_dir.clone(),
                            )
                            .await?;
                    }
                    TerminalState::Suspended { child_exit_code } => {
                        *handle.state.lock().unwrap() = TerminalState::Killed;
                        self.repo
                            .save_session_result(
                                &session_id,
                                now,
                                child_exit_code.map(|c| c as i64),
                                Some(final_log),
                                handle.working_dir.clone(),
                            )
                            .await?;
                    }
                    TerminalState::Zombie => {
                        *handle.state.lock().unwrap() = TerminalState::Killed;
                        self.repo
                            .save_session_result(
                                &session_id,
                                now,
                                None,
                                Some(final_log),
                                handle.working_dir.clone(),
                            )
                            .await?;
                    }
                    _ => {
                        // Already CleaningUp, Killed, or in Error state - just save
                        self.repo
                            .save_session_result(
                                &session_id,
                                now,
                                None,
                                Some(final_log),
                                handle.working_dir.clone(),
                            )
                            .await?;
                    }
                }
            }

            // Remove from active sessions
            self.sessions.remove(&session_id);
        }

        Ok(())
    }

    pub async fn restore_sessions(&self) -> AppResult<Vec<String>> {
        let restorable_sessions = self.repo.get_restorable_sessions().await?;
        let mut restored_session_ids = Vec::new();

        for session in restorable_sessions {
            // Create a read-only terminal session that displays the preserved output
            let restored_output = session.output_log.unwrap_or_default().into_bytes();
            let restored_len = restored_output.len();
            let exited = session.ended_at.is_some();
            let exit_code = session.exit_code.map(|c| c as i32);

            let handle = Arc::new(SessionHandle {
                buffer: Mutex::new(restored_output),
                subscribers: Mutex::new(Vec::new()),
                state: Mutex::new(TerminalState::Restored {
                    exited,
                    exit_code,
                }),
                last_requested_size: Mutex::new(None),
                started_at: session.created_at,
                working_dir: session.working_directory,
                last_flushed_len: Mutex::new(restored_len),
                last_flush_at: Mutex::new(now_secs()),
                next_flush_allowed_at: Mutex::new(now_secs()),
                flush_backoff_secs: Mutex::new(0),
            });

            self.sessions.insert(session.session_id.clone(), handle);
            self.repo
                .mark_session_as_restored(&session.session_id)
                .await?;
            restored_session_ids.push(session.session_id);
        }

        if !restored_session_ids.is_empty() {
            log::info!(
                "Restored {} terminal sessions: {:?}",
                restored_session_ids.len(),
                restored_session_ids
            );
        }

        Ok(restored_session_ids)
    }

    pub async fn clear_log(&self, session_id: &str, clear_db: bool) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            h.buffer.lock().unwrap().clear();
            *h.last_flushed_len.lock().unwrap() = 0;

            if clear_db {
                self.repo.clear_output_log(session_id).await?;
            }
        }
        Ok(())
    }

    pub fn get_metadata(&self, session_id: &str) -> Option<serde_json::Value> {
        self.sessions.get(session_id).map(|h| {
            let state_guard = h.state.lock().unwrap();
            let (status, exit_code) = match &*state_guard {
                TerminalState::Initializing => ("initializing", None),
                TerminalState::Running { .. } => ("running", None),
                TerminalState::Suspended { child_exit_code } => ("suspended", *child_exit_code),
                TerminalState::Exited { code } => {
                    if *code == 0 {
                        ("completed", Some(*code))
                    } else {
                        ("failed", Some(*code))
                    }
                }
                TerminalState::Killed => ("stopped", None),
                TerminalState::Error { .. } => ("error", None),
                TerminalState::Zombie => ("zombie", None),
                TerminalState::CleaningUp => ("cleaning_up", None),
                TerminalState::Restored { exited, exit_code } => {
                    if *exited {
                        if let Some(code) = exit_code {
                            if *code == 0 {
                                ("completed", Some(*code))
                            } else {
                                ("failed", Some(*code))
                            }
                        } else {
                            ("restored", None)
                        }
                    } else {
                        ("restored", None)
                    }
                }
            };

            serde_json::json!({
                "sessionId": session_id,
                "workingDirectory": h.working_dir,
                "startedAt": h.started_at,
                "status": status,
                "exitCode": exit_code
            })
        })
    }

    pub fn graceful_exit(&self, session_id: &str) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            let mut state_guard = h.state.lock().unwrap();
            if let TerminalState::Running { writer, .. } = &mut *state_guard {
                // Send exit sequence twice with 75ms delay for reliability
                if cfg!(windows) {
                    // Windows: send "exit\r\n" twice
                    writer.write_all(b"exit\r\n").map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write exit: {}", e))
                    })?;
                    writer.flush().map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to flush: {}", e))
                    })?;
                    std::thread::sleep(std::time::Duration::from_millis(75));
                    writer.write_all(b"exit\r\n").map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write exit: {}", e))
                    })?;
                    writer.flush().map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to flush: {}", e))
                    })?;
                } else {
                    // Unix: send Ctrl-D (0x04) twice
                    writer.write_all(&[0x04]).map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write exit: {}", e))
                    })?;
                    writer.flush().map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to flush: {}", e))
                    })?;
                    std::thread::sleep(std::time::Duration::from_millis(75));
                    writer.write_all(&[0x04]).map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write exit: {}", e))
                    })?;
                    writer.flush().map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to flush: {}", e))
                    })?;
                }
            }
        }
        Ok(())
    }

    pub fn get_buffer_snapshot(&self, session_id: &str, max_bytes: Option<usize>) -> Option<Vec<u8>> {
        self.sessions.get(session_id).and_then(|session| {
            let buffer = session.buffer.lock().ok()?;
            let bytes = if let Some(max) = max_bytes {
                if buffer.len() > max {
                    buffer[buffer.len() - max..].to_vec()
                } else {
                    buffer.clone()
                }
            } else {
                buffer.clone()
            };
            Some(bytes)
        })
    }

    pub fn start_periodic_flusher(self: Arc<Self>) {
        if self.flusher_started.swap(true, std::sync::atomic::Ordering::SeqCst) {
            return;
        }

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(FLUSH_SCAN_TICK_MILLIS));
            loop {
                interval.tick().await;

                let session_ids: Vec<String> = self.sessions.iter()
                    .map(|entry| entry.key().clone())
                    .collect();

                for session_id in session_ids {
                    if let Some(handle) = self.sessions.get(&session_id) {
                        self.flush_if_due(&session_id, &handle).await;
                    }
                }
            }
        });
    }

    async fn flush_if_due(&self, session_id: &str, handle: &Arc<SessionHandle>) {
        let now = now_secs();

        let (buffer_len, last_flushed, last_flush_time, next_allowed) = {
            let buffer = handle.buffer.lock().unwrap();
            let last_flushed = *handle.last_flushed_len.lock().unwrap();
            let last_flush_time = *handle.last_flush_at.lock().unwrap();
            let next_allowed = *handle.next_flush_allowed_at.lock().unwrap();
            (buffer.len(), last_flushed, last_flush_time, next_allowed)
        };

        let pending_len = buffer_len.saturating_sub(last_flushed);

        if pending_len == 0 {
            return;
        }

        if (now - last_flush_time) < FLUSH_INTERVAL_SECS as i64 {
            return;
        }

        if now < next_allowed {
            return;
        }

        let window = {
            let buffer = handle.buffer.lock().unwrap();
            buffer[last_flushed..buffer_len].to_vec()
        };

        match self.repo.append_output(session_id, &window, now).await {
            Ok(_) => {
                *handle.last_flushed_len.lock().unwrap() = buffer_len;
                *handle.last_flush_at.lock().unwrap() = now;
                *handle.flush_backoff_secs.lock().unwrap() = 0;
                *handle.next_flush_allowed_at.lock().unwrap() = now;
            }
            Err(_) => {
                let prev_backoff = *handle.flush_backoff_secs.lock().unwrap();
                let new_backoff = if prev_backoff == 0 {
                    10
                } else {
                    std::cmp::min(60, prev_backoff * 2)
                };
                *handle.flush_backoff_secs.lock().unwrap() = new_backoff;
                *handle.next_flush_allowed_at.lock().unwrap() = now + new_backoff as i64;
            }
        }
    }

    async fn flush_all_pending_for_session(&self, session_id: &str, handle: &Arc<SessionHandle>) {
        let now = now_secs();

        let (buffer_len, last_flushed) = {
            let buffer = handle.buffer.lock().unwrap();
            let last_flushed = *handle.last_flushed_len.lock().unwrap();
            (buffer.len(), last_flushed)
        };

        if buffer_len <= last_flushed {
            return;
        }

        let window = {
            let buffer = handle.buffer.lock().unwrap();
            buffer[last_flushed..buffer_len].to_vec()
        };

        if let Ok(_) = self.repo.append_output(session_id, &window, now).await {
            *handle.last_flushed_len.lock().unwrap() = buffer_len;
            *handle.last_flush_at.lock().unwrap() = now;
        }
    }

    /// Returns a "last N bytes" snapshot of terminal output for the given session.
    /// Applies max_bytes after combining in-memory and/or persisted output;
    /// this is intended for hydrations and historical views, not full history.
    pub async fn get_log_snapshot_entries(&self, session_id: &str, max_bytes: Option<usize>) -> serde_json::Value {
        // First check: if session is in memory (active/restored), use fresh buffer data
        if let Some(bytes) = self.get_buffer_snapshot(session_id, max_bytes) {
            let data_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return json!({
                "entries": [{
                    "sessionId": session_id,
                    "data": data_b64,
                    "timestamp": now_secs(),
                    "type": "stdout"
                }]
            });
        }

        if let Ok(Some((text, ts_opt))) = self.repo.get_output_log(session_id).await {
            let full_bytes = text.into_bytes();
            let bytes = if let Some(max) = max_bytes {
                if full_bytes.len() > max {
                    full_bytes[full_bytes.len() - max..].to_vec()
                } else {
                    full_bytes
                }
            } else {
                full_bytes
            };

            let data_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let timestamp = ts_opt.unwrap_or_else(now_secs);

            return json!({
                "entries": [{
                    "sessionId": session_id,
                    "data": data_b64,
                    "timestamp": timestamp,
                    "type": "stdout"
                }]
            });
        }

        // No data available
        json!({ "entries": [] })
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
