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
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
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

pub struct TerminalManager {
    app: AppHandle,
    repo: Arc<crate::db_utils::TerminalRepository>,
    sessions: DashMap<String, Arc<SessionHandle>>,
    flusher_started: std::sync::atomic::AtomicBool,
}

struct SessionHandle {
    buffer: Mutex<Vec<u8>>,
    subscribers: Mutex<Vec<Channel<Vec<u8>>>>,
    writer: Mutex<Option<Box<dyn std::io::Write + Send>>>,
    resizer: Mutex<Option<Box<dyn portable_pty::MasterPty>>>,
    child_stopper: Mutex<Option<Box<dyn portable_pty::Child + Send>>>,
    started_at: i64,
    working_dir: Option<String>,
    status: Mutex<&'static str>,
    exit_code: Mutex<Option<i32>>,
    last_flushed_len: Mutex<usize>,
    last_flush_at: Mutex<i64>,
    next_flush_allowed_at: Mutex<i64>,
    flush_backoff_secs: Mutex<u64>,
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
            let writer_exists = existing_handle.writer.lock().unwrap().is_some();
            let resizer_exists = existing_handle.resizer.lock().unwrap().is_some();

            if writer_exists || resizer_exists {
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
            writer: Mutex::new(Some(writer)),
            resizer: Mutex::new(Some(pair.master)),
            child_stopper: Mutex::new(Some(child)),
            started_at: now,
            working_dir,
            status: Mutex::new("running"),
            exit_code: Mutex::new(None),
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
                if let Some(writer) = handle_for_init.writer.lock().unwrap().as_mut() {
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
                            if client.is_connected() && client.is_session_bound(&sid) {
                                let _ = client.send_terminal_output_binary(&sid, &chunk);
                            }
                        }
                    }
                    None => {
                        // Done signal received, exit loop
                        break;
                    }
                }
            }

            let exit_code = if let Some(mut child) = handle.child_stopper.lock().unwrap().take() {
                match child.wait() {
                    Ok(status) => status.exit_code() as i32,
                    Err(_) => -1,
                }
            } else {
                handle.exit_code.lock().unwrap().unwrap_or(0)
            };

            // Set final status based on exit code
            let final_status = match exit_code {
                0 => "completed",
                _ => "failed",
            };
            *handle.status.lock().unwrap() = final_status;
            *handle.exit_code.lock().unwrap() = Some(exit_code);

            // Clear writer and resizer
            handle.writer.lock().unwrap().take();
            handle.resizer.lock().unwrap().take();

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
            log::debug!("📝 Writing input: session={} bytes={} has_writer={}",
                session_id, data.len(), h.writer.lock().unwrap().is_some());
            if let Some(writer) = h.writer.lock().unwrap().as_mut() {
                writer.write_all(&data).map_err(|e| {
                    AppError::ExternalServiceError(format!("Failed to write to terminal: {}", e))
                })?;
                writer.flush().map_err(|e| {
                    AppError::ExternalServiceError(format!(
                        "Failed to flush terminal writer: {}",
                        e
                    ))
                })?;
            }
        } else {
            log::warn!("❌ Write input failed: session {} not found", session_id);
        }
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            if let Some(pty) = h.resizer.lock().unwrap().as_mut() {
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
            // Drop writer/resizer so no further input is sent to the PTY after kill
            h.writer.lock().unwrap().take();
            h.resizer.lock().unwrap().take();

            {
                let mut child_guard = h.child_stopper.lock().unwrap();
                if let Some(child) = child_guard.as_mut() {
                    child.kill().map_err(|e| {
                        AppError::ExternalServiceError(format!(
                            "Failed to kill terminal process: {}",
                            e
                        ))
                    })?;
                }
            }

            // Mark the session as stopped immediately; final exit bookkeeping
            // (exit code, DB persistence) is handled by the async reader task.
            *h.status.lock().unwrap() = "stopped";
        }
        Ok(())
    }

    pub fn status(&self, session_id: &str) -> serde_json::Value {
        if let Some(h) = self.sessions.get(session_id) {
            // Determine accurate status based on session state
            let (status, exit_code) = {
                let writer_exists = h.writer.lock().unwrap().is_some();
                let resizer_exists = h.resizer.lock().unwrap().is_some();
                let exit_code = *h.exit_code.lock().unwrap();
                let current_status = *h.status.lock().unwrap();

                // Check if writer/resizer exist → "running"
                let computed_status = if writer_exists || resizer_exists {
                    "running"
                } else if let Some(code) = exit_code {
                    // exit_code exists: 0 → "completed", non-zero → "failed"
                    if code == 0 {
                        "completed"
                    } else {
                        "failed"
                    }
                } else if current_status == "restored" {
                    "restored"
                } else {
                    "stopped"
                };

                (computed_status, exit_code)
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
        // Returns list of ONLY truly running session IDs
        // Filters out restored, completed, failed, and stopped sessions
        self.sessions
            .iter()
            .filter(|entry| {
                let handle = entry.value();
                let writer_exists = handle.writer.lock().unwrap().is_some();
                let resizer_exists = handle.resizer.lock().unwrap().is_some();
                // Only include if running (writer or resizer exists)
                writer_exists || resizer_exists
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
            // Check if session is actually running (writer or resizer exists)
            let writer_exists = h.writer.lock().unwrap().is_some();
            let resizer_exists = h.resizer.lock().unwrap().is_some();

            // Refuse non-running sessions
            if !writer_exists && !resizer_exists {
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

                // Prevent any additional IO on the PTY while we shut it down
                handle.writer.lock().unwrap().take();
                handle.resizer.lock().unwrap().take();

                // Attempt a graceful kill before we wait; if the process already
                // exited this will no-op.
                {
                    let mut child_guard = handle.child_stopper.lock().unwrap();
                    if let Some(child) = child_guard.as_mut() {
                        if let Err(e) = child.kill() {
                            eprintln!("Failed to signal terminal kill during app shutdown: {}", e);
                        }
                    }
                }

                // Save final state with max data preservation
                let final_log = String::from_utf8_lossy(&handle.buffer.lock().unwrap()).to_string();
                let exit_code = *handle.exit_code.lock().unwrap();

                // Finish reaping the PTY child process (if it is still running)
                let child_opt = handle.child_stopper.lock().unwrap().take();
                if let Some(child) = child_opt {
                    // Store child handle for potential force kill
                    let mut child_handle = Some(child);

                    // Give process 2 seconds to terminate gracefully
                    let wait_result = tokio::time::timeout(
                        std::time::Duration::from_secs(2),
                        tokio::task::spawn_blocking(move || {
                            let mut c = child_handle.take().unwrap();
                            let result = c.wait();
                            (result, c)
                        }),
                    )
                    .await;

                    match wait_result {
                        Ok(Ok((Ok(status), _))) => {
                            // Process terminated gracefully
                            let final_exit_code = status.exit_code() as i32;
                            *handle.exit_code.lock().unwrap() = Some(final_exit_code);
                            *handle.status.lock().unwrap() = "stopped";
                            self.repo
                                .save_session_result(
                                    &session_id,
                                    now,
                                    Some(final_exit_code as i64),
                                    Some(final_log.clone()),
                                    handle.working_dir.clone(),
                                )
                                .await?;
                        }
                        Ok(Ok((Err(_), mut child))) => {
                            // Wait failed but we have the child handle - force kill
                            let _ = child.kill();
                            // Save with current exit code or -1 for forced termination
                            let recorded_exit = exit_code.unwrap_or(-1);
                            *handle.exit_code.lock().unwrap() = Some(recorded_exit);
                            *handle.status.lock().unwrap() = "stopped";
                            self.repo
                                .save_session_result(
                                    &session_id,
                                    now,
                                    Some(recorded_exit as i64),
                                    Some(final_log.clone()),
                                    handle.working_dir.clone(),
                                )
                                .await?;
                        }
                        Err(_) => {
                            // Timeout - child is still in blocking task, already being cleaned up
                            let recorded_exit = exit_code.unwrap_or(-1);
                            *handle.exit_code.lock().unwrap() = Some(recorded_exit);
                            *handle.status.lock().unwrap() = "stopped";
                            self.repo
                                .save_session_result(
                                    &session_id,
                                    now,
                                    Some(recorded_exit as i64),
                                    Some(final_log.clone()),
                                    handle.working_dir.clone(),
                                )
                                .await?;
                        }
                        Ok(Err(_)) => {
                            // spawn_blocking failed
                            let recorded_exit = exit_code.unwrap_or(-1);
                            *handle.exit_code.lock().unwrap() = Some(recorded_exit);
                            *handle.status.lock().unwrap() = "stopped";
                            self.repo
                                .save_session_result(
                                    &session_id,
                                    now,
                                    Some(recorded_exit as i64),
                                    Some(final_log.clone()),
                                    handle.working_dir.clone(),
                                )
                                .await?;
                        }
                    }
                } else {
                    // Process already terminated, just save the data
                    let recorded_exit = exit_code.unwrap_or(0);
                    *handle.exit_code.lock().unwrap() = Some(recorded_exit);
                    *handle.status.lock().unwrap() = "stopped";
                    self.repo
                        .save_session_result(
                            &session_id,
                            now,
                            Some(recorded_exit as i64),
                            Some(final_log),
                            handle.working_dir.clone(),
                        )
                        .await?;
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
            let handle = Arc::new(SessionHandle {
                buffer: Mutex::new(restored_output),
                subscribers: Mutex::new(Vec::new()),
                writer: Mutex::new(None),
                resizer: Mutex::new(None),
                child_stopper: Mutex::new(None),
                started_at: session.created_at,
                working_dir: session.working_directory,
                status: Mutex::new(if session.ended_at.is_some() {
                    "completed"
                } else {
                    "restored"
                }),
                exit_code: Mutex::new(session.exit_code.map(|c| c as i32)),
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
            serde_json::json!({
                "sessionId": session_id,
                "workingDirectory": h.working_dir,
                "startedAt": h.started_at,
                "status": *h.status.lock().unwrap(),
                "exitCode": *h.exit_code.lock().unwrap()
            })
        })
    }

    pub fn graceful_exit(&self, session_id: &str) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            if let Some(writer) = h.writer.lock().unwrap().as_mut() {
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
