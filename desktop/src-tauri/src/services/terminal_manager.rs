use crate::db_utils::terminal_repository::RestorableSession;
use crate::error::{AppError, AppResult};
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

const MAX_BUFFER_SIZE: usize = 1_048_576;

pub struct TerminalManager {
    app: AppHandle,
    repo: Arc<crate::db_utils::TerminalRepository>,
    sessions: DashMap<String, Arc<SessionHandle>>,
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
    // Add flush tracking fields:
    last_flushed_len: Mutex<usize>,
    last_flush_at: Mutex<i64>,
}

impl TerminalManager {
    pub fn new(app: AppHandle, repo: Arc<crate::db_utils::TerminalRepository>) -> Self {
        Self {
            app,
            repo,
            sessions: DashMap::new(),
        }
    }

    pub async fn start_session(
        &self,
        session_id: String,
        working_dir: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
        output: Channel<Vec<u8>>,
    ) -> AppResult<()> {
        let now = now_secs();
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
            subscribers: Mutex::new(vec![output]),
            writer: Mutex::new(Some(writer)),
            resizer: Mutex::new(Some(pair.master)),
            child_stopper: Mutex::new(Some(child)),
            started_at: now,
            working_dir,
            status: Mutex::new("running"),
            exit_code: Mutex::new(None),
            last_flushed_len: Mutex::new(0),
            last_flush_at: Mutex::new(now),
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

                            // Cap buffer size
                            if b.len() > MAX_BUFFER_SIZE {
                                let overflow = b.len() - MAX_BUFFER_SIZE;
                                b.drain(0..overflow);

                                // Update last_flushed_len to account for drained bytes
                                let mut last_flushed = handle.last_flushed_len.lock().unwrap();
                                *last_flushed = last_flushed.saturating_sub(overflow);
                            }
                        }

                        // Notify subscribers
                        let subs = handle.subscribers.lock().unwrap().clone();
                        for s in subs {
                            let _ = s.send(chunk.clone());
                        }

                        // Emit device-link-event for terminal output
                        app.emit(
                            "device-link-event",
                            json!({
                                "type": "terminal.output",
                                "payload": {
                                    "sessionId": sid,
                                    "data": String::from_utf8_lossy(&chunk),
                                    "timestamp": now_secs(),
                                    "type": "stdout"
                                }
                            }),
                        )
                        .ok();

                        // Incremental flush logic
                        let should_flush = {
                            let buffer = handle.buffer.lock().unwrap();
                            let last_flushed = handle.last_flushed_len.lock().unwrap();
                            let last_flush_time = handle.last_flush_at.lock().unwrap();

                            let pending_len = buffer.len() - *last_flushed;
                            let now = now_secs();
                            let time_since_flush = now - *last_flush_time;

                            // Check if we should flush
                            if pending_len >= 4096 || (pending_len > 0 && time_since_flush >= 1) {
                                Some((*last_flushed, buffer.len(), now))
                            } else {
                                None
                            }
                        };

                        if let Some((start, end, now)) = should_flush {
                            // Extract chunk to flush
                            let chunk_to_flush = {
                                let buffer = handle.buffer.lock().unwrap();
                                buffer[start..end].to_vec()
                            };

                            // Perform the async operation
                            if let Err(e) = repo.append_output(&sid, &chunk_to_flush, now).await {
                                eprintln!("Failed to append output: {}", e);
                            }

                            // Update tracking after successful flush
                            {
                                let mut last_flushed = handle.last_flushed_len.lock().unwrap();
                                let mut last_flush_time = handle.last_flush_at.lock().unwrap();
                                *last_flushed = end;
                                *last_flush_time = now;
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

            *handle.status.lock().unwrap() = "stopped";
            *handle.exit_code.lock().unwrap() = Some(exit_code);

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

            // Flush any remaining bytes before saving session result
            let final_chunk = {
                let buffer = handle.buffer.lock().unwrap();
                let last_flushed = handle.last_flushed_len.lock().unwrap();

                if buffer.len() > *last_flushed {
                    Some(buffer[*last_flushed..].to_vec())
                } else {
                    None
                }
            };

            if let Some(chunk) = final_chunk {
                let now = now_secs();
                if let Err(e) = repo.append_output(&sid, &chunk, now).await {
                    eprintln!("Failed to append final output: {}", e);
                }
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
            let _ = app.emit(
                "terminal-exit",
                serde_json::json!({ "sessionId": sid, "exitCode": exit_code }),
            );
        });

        Ok(())
    }

    pub fn attach(&self, session_id: &str, output: Channel<Vec<u8>>) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
            let snapshot = h.buffer.lock().unwrap().clone();
            let _ = output.send(snapshot);
            h.subscribers.lock().unwrap().push(output);
        }
        Ok(())
    }

    pub fn write_input(&self, session_id: &str, data: Vec<u8>) -> AppResult<()> {
        if let Some(h) = self.sessions.get(session_id) {
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
            let status = {
                let writer_exists = h.writer.lock().unwrap().is_some();
                let resizer_exists = h.resizer.lock().unwrap().is_some();
                let current_status = *h.status.lock().unwrap();

                // If session exists but has no writer/resizer, it's a restored read-only session
                if !writer_exists && !resizer_exists && current_status != "stopped" {
                    "restored"
                } else if writer_exists || resizer_exists {
                    "running"
                } else {
                    current_status
                }
            };

            serde_json::json!({
                "status": status,
                "exitCode": *h.exit_code.lock().unwrap()
            })
        } else {
            serde_json::json!({"status": "stopped"})
        }
    }

    pub fn get_active_sessions(&self) -> Vec<String> {
        // Returns list of ALL session IDs currently in memory
        // This includes running, restored, completed, and starting sessions
        self.sessions
            .iter()
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
        output: Channel<Vec<u8>>,
    ) -> AppResult<bool> {
        // Try to reconnect to an existing session (used for page reloads)
        if let Some(h) = self.sessions.get(session_id) {
            // Send the current buffer snapshot to catch up
            let snapshot = h.buffer.lock().unwrap().clone();
            let _ = output.send(snapshot);

            // Add the new subscriber
            h.subscribers.lock().unwrap().push(output);

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
                // Flush any remaining bytes before cleanup
                let cleanup_chunk = {
                    let buffer = handle.buffer.lock().unwrap();
                    let last_flushed = handle.last_flushed_len.lock().unwrap();

                    if buffer.len() > *last_flushed {
                        Some(buffer[*last_flushed..].to_vec())
                    } else {
                        None
                    }
                };

                if let Some(chunk) = cleanup_chunk {
                    if let Err(e) = self.repo.append_output(&session_id, &chunk, now).await {
                        eprintln!("Failed to append cleanup output: {}", e);
                    }
                }

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
                if let Some(child) = handle.child_stopper.lock().unwrap().take() {
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
            let handle = Arc::new(SessionHandle {
                buffer: Mutex::new(session.output_log.unwrap_or_default().into_bytes()),
                subscribers: Mutex::new(Vec::new()),
                writer: Mutex::new(None),        // Read-only - no writer
                resizer: Mutex::new(None),       // No PTY for restored sessions
                child_stopper: Mutex::new(None), // No process for restored sessions
                started_at: session.created_at,
                working_dir: session.working_directory,
                status: Mutex::new(if session.ended_at.is_some() {
                    "completed"
                } else {
                    "restored"
                }),
                exit_code: Mutex::new(session.exit_code.map(|c| c as i32)),
                last_flushed_len: Mutex::new(0),
                last_flush_at: Mutex::new(session.created_at),
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
                // Send Ctrl+D (EOF) on Unix or "exit\n" on Windows
                if cfg!(windows) {
                    writer.write_all(b"exit\r\n").map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write exit: {}", e))
                    })?;
                } else {
                    writer.write_all(&[0x04]).map_err(|e| {
                        AppError::ExternalServiceError(format!("Failed to write exit: {}", e))
                    })?;
                }
                writer.flush().map_err(|e| {
                    AppError::ExternalServiceError(format!("Failed to flush: {}", e))
                })?;
            }
        }
        Ok(())
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
