use crate::auth::token_manager::TokenManager;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::db_utils::settings_repository::SettingsRepository;
use crate::db_utils::terminal_sessions_repository::TerminalSessionsRepository;
use crate::error::AppError;
use crate::services::terminal_health_monitor::{TerminalHealthMonitor, HealthStatus, RecoveryAction};
use crate::{AppState, RuntimeConfig};
use dashmap::DashMap;
use log::{debug, error, info, warn};
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, Manager, ipc::Channel};
use tokio::sync::{broadcast, mpsc};
use std::sync::mpsc as sync_mpsc;
use tokio::time;
use std::collections::HashSet;
use which;
use base64;

// Global cached augmented PATH
static CACHED_AUGMENTED_PATH: OnceLock<String> = OnceLock::new();

async fn persistence_worker(
    job_id: String,
    log_rx: sync_mpsc::Receiver<Vec<u8>>,
    repo: Arc<TerminalSessionsRepository>,
) {
    let mut queue_size = 0usize;

    loop {
        match log_rx.recv() {
            Ok(data) => {
                queue_size += 1;

                // Warn if persistence queue grows too large
                if queue_size > 10 {
                    warn!(
                        "Persistence queue for job {} has {} items, potential bottleneck",
                        job_id, queue_size
                    );
                }

                let log_string = String::from_utf8_lossy(&data).to_string();

                // Check for prompt markers that need immediate flush
                let has_prompt_marker = log_string.chars().any(|c| matches!(c, '$' | '#' | '>' | '%'));

                if let Err(e) = repo.append_output_log(&job_id, &log_string).await {
                    warn!(
                        "Failed to persist terminal output for job {}: {}",
                        job_id, e
                    );
                } else if has_prompt_marker {
                    // Force immediate database flush for prompt markers
                    debug!("Forced flush for prompt marker in job {}", job_id);
                }

                queue_size = queue_size.saturating_sub(1);
            }
            Err(_) => {
                // Channel closed, do final synchronous flush
                info!("Persistence worker for job {} shutting down, performing final flush", job_id);
                // The database operations are already async, so this is the final opportunity
                break;
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionOptions {
    pub working_directory: Option<String>,
    pub environment: Option<HashMap<String, String>>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
}

#[derive(Debug, Clone, Copy)]
enum SessionStatus {
    Running = 0,
    Completed = 1,
    Failed = 2,
    Stuck = 3,
}

struct SessionHandle {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send>>>,
    process_controller: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
    status: Arc<AtomicU8>,
    exit_code: Arc<Mutex<Option<i32>>>,
    output_channel: Channel<Vec<u8>>,
    pub output_sender: Arc<broadcast::Sender<Vec<u8>>>,
    pub _child_wait_task: tauri::async_runtime::JoinHandle<()>,
    pub remote_clients: Arc<Mutex<HashSet<String>>>, // Track remote client IDs
}

pub struct TerminalManager {
    sessions: Arc<DashMap<String, Arc<SessionHandle>>>,
    app: AppHandle,
    health_monitor: Arc<TerminalHealthMonitor>,
}

impl TerminalManager {
    pub fn new(app: AppHandle) -> Self {
        let health_monitor = Arc::new(TerminalHealthMonitor::new(app.clone()));

        let manager = Self {
            sessions: Arc::new(DashMap::new()),
            app: app.clone(),
            health_monitor,
        };

        // Start periodic cleanup task for stuck/failed sessions
        let sessions = manager.sessions.clone();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60)); // Every minute
            loop {
                interval.tick().await;

                let mut to_remove = Vec::new();

                // Identify sessions to clean up
                for entry in sessions.iter() {
                    let (key, value) = entry.pair();
                    let status = value.status.load(Ordering::Relaxed);

                    // Remove sessions that have been completed/failed/stuck for more than 5 minutes
                    if status != SessionStatus::Running as u8 {
                        to_remove.push(key.clone());
                    }
                }

                // Remove identified sessions
                for key in to_remove {
                    debug!("Cleaning up non-running session: {}", key);
                    sessions.remove(&key);
                }
            }
        });

        manager
    }

    pub async fn start_session(
        &self,
        job_id: &str,
        options: Option<TerminalSessionOptions>,
        output_channel: Channel<Vec<u8>>,
        window: tauri::Window,
    ) -> Result<(), AppError> {
        // Check if session already exists and return Ok(()) if running
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status = session_handle.status.load(Ordering::Relaxed);
            if status == SessionStatus::Running as u8 {
                info!("Terminal session {} already running, reattaching", job_id);
                // Session already running, just emit ready event
                let app_for_ready = self.app.clone();
                let job_for_ready = job_id.to_string();
                let app_clone = app_for_ready.clone();
                let _ = app_for_ready.run_on_main_thread(move || {
                    let _ = app_clone.emit(
                        "terminal-ready",
                        serde_json::json!({ "jobId": job_for_ready }),
                    );
                });

                return Ok(());
            }
        }

        info!("Starting terminal session for job_id: {}", job_id);

        // 1. Check TokenManager for auth token
        let token_manager = self.app.state::<Arc<TokenManager>>();
        let auth_token = token_manager.get().await;
        if auth_token.is_none() {
            return Err(AppError::AuthError(
                "Authentication required to use the terminal. Please log in.".to_string(),
            ));
        }

        // 2. Check for server region selection
        let app_state = self.app.state::<AppState>();
        let server_url = {
            let server_url_guard = app_state.settings.server_url.lock().map_err(|e| {
                AppError::TerminalError(format!("Failed to acquire server URL lock: {}", e))
            })?;
            server_url_guard.clone()
        };
        if server_url.is_none() {
            return Err(AppError::TerminalError(
                "Please select a server region before using the terminal.".to_string(),
            ));
        }

        // Create native PTY system
        let pty_system = native_pty_system();

        // Set PTY size from options or use defaults
        let rows = options.as_ref().and_then(|o| o.rows).unwrap_or(24);
        let cols = options.as_ref().and_then(|o| o.cols).unwrap_or(80);
        let pty_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        // Create PTY pair
        let pty_pair = pty_system
            .openpty(pty_size)
            .map_err(|e| format!("Failed to create PTY: {}", e))?;

        // Build environment variables - preserve all parent env for parity
        let mut env_vars = HashMap::new();

        // Clone all environment variables from parent process
        for (key, value) in std::env::vars() {
            env_vars.insert(key, value);
        }

        // Override/ensure terminal-specific environment for native parity
        env_vars.insert("TERM".to_string(), "xterm-256color".to_string());
        env_vars.insert("COLORTERM".to_string(), "truecolor".to_string());
        env_vars.insert("TERM_PROGRAM".to_string(), "VibeTerminal".to_string());
        env_vars.insert(
            "TERM_PROGRAM_VERSION".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        );

        #[cfg(not(target_os = "windows"))]
        {
            // macOS/Linux: Ensure UTF-8 locale like Terminal.app
            let needs_utf8_locale = env_vars
                .get("LANG")
                .map(|l| !l.contains("UTF-8") && !l.contains("utf8"))
                .unwrap_or(true);

            if needs_utf8_locale {
                env_vars.insert("LANG".to_string(), "en_US.UTF-8".to_string());
                env_vars.insert("LC_CTYPE".to_string(), "UTF-8".to_string());
            }
        }

        // Apply custom environment from options (overrides)
        if let Some(opts) = &options {
            if let Some(custom_env) = &opts.environment {
                for (key, value) in custom_env {
                    env_vars.insert(key.clone(), value.clone());
                }
            }
        }

        // Set working directory - use home directory as default
        let default_dir = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let working_dir = options
            .as_ref()
            .and_then(|opts| opts.working_directory.as_ref())
            .unwrap_or(&default_dir);

        debug!("Terminal working directory: {}", working_dir);

        // 3. Augment PATH explicitly
        let current_path = std::env::var("PATH").unwrap_or_default();
        let augmented_path = self.augment_path(&current_path);
        debug!("Augmented PATH: {}", augmented_path);
        env_vars.insert("PATH".to_string(), augmented_path.clone());

        // Get settings repository for terminal preferences
        let settings_repo = self.app.state::<Arc<SettingsRepository>>().inner().clone();

        // Read terminal settings
        let preferred_cli = settings_repo
            .get_value("terminal.preferred_cli")
            .await
            .unwrap_or(None);
        let custom_command = settings_repo
            .get_value("terminal.custom_command")
            .await
            .unwrap_or(None);
        let additional_args: String = settings_repo
            .get_value("terminal.additional_args")
            .await
            .unwrap_or(None)
            .unwrap_or_default();

        // Determine default shell
        let default_shell = {
            #[cfg(target_os = "windows")]
            {
                which::which("pwsh.exe")
                    .map(|_| "pwsh.exe".to_string())
                    .or_else(|_| {
                        which::which("powershell.exe").map(|_| "powershell.exe".to_string())
                    })
                    .unwrap_or_else(|_| "cmd.exe".to_string())
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
            }
        };

        // Always use default shell and set is_shell = true
        let command = default_shell;
        let is_shell = true;

        debug!("Using command: {} (is_shell: {})", command, is_shell);
        info!(
            "Terminal: Starting command '{}' for job {}",
            command, job_id
        );

        // Build command - implement native terminal behavior
        let mut cmd = CommandBuilder::new(&command);
        cmd.cwd(working_dir);

        if is_shell {
            // Apply shell-specific flags
            #[cfg(target_os = "windows")]
            {
                if command.contains("pwsh") || command.contains("powershell") {
                    cmd.args(&["-NoProfile", "-NoLogo"]);
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if command.ends_with("bash") {
                    cmd.args(&["--login", "-i"]);
                } else if command.ends_with("zsh") {
                    cmd.args(&["-l", "-i"]);
                } else if command.ends_with("fish") {
                    cmd.args(&["--login", "-i"]);
                } else {
                    cmd.arg("-i");
                }
            }
        } else {
            // For non-shell CLI tools, apply additional args
            if !additional_args.is_empty() {
                let args: Vec<&str> = additional_args.split_whitespace().collect();
                for arg in args {
                    cmd.arg(arg);
                }
            }
        }

        // Apply environment variables
        for (key, value) in env_vars {
            cmd.env(key, value);
        }

        // Spawn the child process in the PTY
        let child = match pty_pair.slave.spawn_command(cmd) {
            Ok(child) => child,
            Err(e) => {
                let error_msg = format!("Failed to spawn {} process in PTY: {}", command, e);
                self.mark_session_failed_and_emit(job_id, &window).await;
                return Err(AppError::TerminalError(error_msg));
            }
        };

        let process_id = child.process_id();
        debug!("Spawned {} process with PID: {:?}", command, process_id);

        // Get writer for PTY master
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| AppError::TerminalError(format!("Failed to get PTY writer: {}", e)))?;
        let writer = Arc::new(Mutex::new(writer));

        // Get reader for PTY master
        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::TerminalError(format!("Failed to get PTY reader: {}", e)))?;

        // Get process controller handle
        let process_controller = child.clone_killer();

        // Create/update DB session
        let repo = self
            .app
            .state::<Arc<TerminalSessionsRepository>>()
            .inner()
            .clone();

        // Check if a session already exists for this job and reuse or create
        let session_id = match repo.get_session_by_job_id(job_id).await {
            Ok(Some(mut existing_session)) => {
                // Reuse the existing session but update its status
                info!("Reusing existing terminal session for job {} (was: {})", job_id, existing_session.status);

                // Update the session to running status with new process info
                existing_session.status = "running".to_string();
                existing_session.process_pid = process_id.map(|pid| pid as i64);
                existing_session.updated_at = chrono::Utc::now().timestamp();
                existing_session.last_output_at = Some(chrono::Utc::now().timestamp());
                existing_session.exit_code = None; // Clear any previous exit code

                // Update working directory if provided
                if let Some(ref opts) = options {
                    if let Some(ref wd) = opts.working_directory {
                        existing_session.working_directory = Some(wd.clone());
                    }
                    if let Some(ref env) = opts.environment {
                        existing_session.environment_vars = serde_json::to_string(env).ok();
                    }
                }

                // Append a separator to the output log for the new session
                if let Some(ref mut log) = existing_session.output_log {
                    if !log.is_empty() {
                        log.push_str("\r\n\x1b[36m=== New Terminal Session ===\x1b[0m\r\n");
                    }
                } else {
                    existing_session.output_log = Some(String::new());
                }

                // Update the existing session
                repo.update_session(&existing_session)
                    .await
                    .map_err(|e| format!("Failed to update terminal session in DB: {}", e))?;

                existing_session.id
            }
            Ok(None) => {
                // No existing session, create a new one
                info!("Creating new terminal session for job {}", job_id);

                let new_session = crate::db_utils::terminal_sessions_repository::TerminalSession {
                    id: format!("session_{}", uuid::Uuid::new_v4()),
                    job_id: job_id.to_string(),
                    status: "running".to_string(),
                    process_pid: process_id.map(|pid| pid as i64),
                    created_at: chrono::Utc::now().timestamp(),
                    updated_at: chrono::Utc::now().timestamp(),
                    last_output_at: Some(chrono::Utc::now().timestamp()),
                    exit_code: None,
                    working_directory: options
                        .as_ref()
                        .and_then(|opts| opts.working_directory.clone()),
                    environment_vars: options
                        .as_ref()
                        .and_then(|opts| opts.environment.as_ref())
                        .and_then(|env| serde_json::to_string(env).ok()),
                    title: None,
                    output_log: Some(String::new()),
                };

                let id = new_session.id.clone();

                // Create the new session
                repo.create_session(&new_session)
                    .await
                    .map_err(|e| format!("Failed to create terminal session in DB: {}", e))?;

                id
            }
            Err(e) => {
                return Err(AppError::TerminalError(format!(
                    "Failed to check for existing session for job {}: {}",
                    job_id, e
                )));
            }
        };

        // Create broadcast channel for output distribution
        let (tx, _rx) = broadcast::channel(1024);
        let output_sender = Arc::new(tx);

        // Create sync mpsc channel for critical writes
        let (log_tx, log_rx) = sync_mpsc::channel::<Vec<u8>>();

        // Spawn persistence worker
        let job_id_for_worker = job_id.to_string();
        let repo_for_worker = repo.clone();
        tauri::async_runtime::spawn(async move {
            persistence_worker(job_id_for_worker, log_rx, repo_for_worker).await;
        });

        // Create shared state for the session
        let status = Arc::new(AtomicU8::new(SessionStatus::Running as u8));
        let exit_code = Arc::new(Mutex::new(None));

        // Clone required data for reader task
        let app_handle = self.app.clone();
        let app_handle_for_reader = app_handle.clone();
        let job_id_clone = job_id.to_string();
        let repo_clone = repo.clone();
        let status_clone = status.clone();
        let exit_code_clone = exit_code.clone();
        let sessions_map = self.sessions.clone();
        let child_arc: Arc<Mutex<Box<dyn Child + Send>>> = Arc::new(Mutex::new(child));
        let child_arc_clone = child_arc.clone();

        // Clone required data for reader thread
        let output_sender_clone = output_sender.clone();

        // Spawn PTY reader that writes to broadcast channel
        let mut reader = reader;
        std::thread::spawn(move || {
            // 64KiB read buffer for performance
            let mut buf = vec![0u8; 65536];
            let mut write_through_cache = Vec::new();
            let mut bytes_processed = 0usize;

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - do final flush of any buffered output
                        if !write_through_cache.is_empty() {
                            if let Err(_) = log_tx.send(write_through_cache.clone()) {
                                warn!("Failed to send final cached data for job {}", job_id_clone);
                            }
                            write_through_cache.clear();
                        }
                        break;
                    },
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        bytes_processed += n;

                        // Send to broadcast channel (hot path)
                        let _ = output_sender_clone.send(data.clone());

                        // Update health monitor with output activity
                        if let Some(app_state) = app_handle_for_reader.try_state::<Arc<TerminalManager>>() {
                            app_state.health_monitor.update_output_time(&job_id_clone);
                        }

                        // Add to write-through cache
                        write_through_cache.extend_from_slice(&data);

                        // Check for critical output (prompts, errors) or size threshold
                        let data_str = String::from_utf8_lossy(&data);
                        let has_prompt_marker = data_str.chars().any(|c| matches!(c, '$' | '#' | '>' | '%'));
                        let has_error_marker = data_str.to_lowercase().contains("error") || data_str.contains("failed");
                        let cache_too_large = write_through_cache.len() >= 4096; // 4KB threshold

                        if has_prompt_marker || has_error_marker || cache_too_large {
                            // Force synchronous persist for critical data
                            if let Err(_) = log_tx.send(write_through_cache.clone()) {
                                warn!("Failed to persist critical output for job {}", job_id_clone);
                            }
                            write_through_cache.clear();

                            if has_prompt_marker {
                                debug!("Synchronous persist triggered by prompt marker for job {}", job_id_clone);
                            }
                        } else {
                            // Normal async persistence for non-critical data
                            if let Err(_) = log_tx.send(data.clone()) {
                                warn!("Failed to persist output for job {}", job_id_clone);
                            }
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => {
                        warn!("pty read error: {}", e);
                        // Flush any remaining cached data before exiting
                        if !write_through_cache.is_empty() {
                            if let Err(_) = log_tx.send(write_through_cache) {
                                warn!("Failed to send final error cached data for job {}", job_id_clone);
                            }
                        }
                        break;
                    }
                }
            }

            info!("PTY reader for job {} processed {} bytes total", job_id_clone, bytes_processed);
        });

        let child_for_wait = child_arc.clone();
        let app_for_wait = app_handle.clone();
        let job_for_wait = job_id.to_string();
        let repo_for_wait = repo.clone();
        let status_for_wait = status.clone();
        let exit_code_for_wait = exit_code.clone();
        let sessions_for_wait = self.sessions.clone();
        let child_wait_task = tauri::async_runtime::spawn(async move {
            let exit_status = tauri::async_runtime::spawn_blocking(move || {
                let mut lock = child_for_wait.lock().unwrap();
                lock.wait()
            })
            .await
            .unwrap_or_else(|e| {
                error!("Failed to wait for child: {}", e);
                Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "wait failed",
                ))
            });

            match exit_status {
                Ok(status) => {
                    let code = if status.success() { Some(0) } else { Some(1) };
                    info!(
                        "Process for job {} exited with status: {:?}",
                        job_for_wait, status
                    );

                    let new_status = if status.success() {
                        SessionStatus::Completed
                    } else {
                        SessionStatus::Failed
                    };
                    status_for_wait.store(new_status as u8, Ordering::Relaxed);
                    *exit_code_for_wait.lock().unwrap() = code;

                    let db_status = match new_status {
                        SessionStatus::Completed => "completed",
                        SessionStatus::Failed => "failed",
                        _ => "completed",
                    };

                    if let Ok(Some(mut db_session)) =
                        repo_for_wait.get_session_by_job_id(&job_for_wait).await
                    {
                        db_session.status = db_status.to_string();
                        db_session.exit_code = code.map(|c| c as i64);
                        db_session.updated_at = chrono::Utc::now().timestamp();
                        let _ = repo_for_wait.update_session(&db_session).await;
                    }

                    let payload = serde_json::json!({
                        "jobId": job_for_wait,
                        "code": code
                    });

                    let app_clone = app_for_wait.clone();
                    let _ = app_for_wait.run_on_main_thread(move || {
                        let _ = app_clone.emit("terminal-exit", payload);
                    });

                    // Wait before removing from memory, but session is already marked as completed/failed in DB
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    sessions_for_wait.remove(&job_for_wait);
                    info!("Removed terminal session {} from memory after completion", job_for_wait);
                }
                Err(e) => {
                    error!("Error waiting for child {}: {}", job_for_wait, e);
                    status_for_wait.store(SessionStatus::Failed as u8, Ordering::Relaxed);
                    sessions_for_wait.remove(&job_for_wait);
                }
            }
        });

        // Store session handle in DashMap
        let session_handle = Arc::new(SessionHandle {
            master: Arc::new(Mutex::new(pty_pair.master)),
            writer,
            child: child_arc,
            process_controller: Arc::new(Mutex::new(process_controller)),
            status,
            exit_code,
            output_channel: output_channel.clone(),
            output_sender: output_sender.clone(),
            _child_wait_task: child_wait_task,
            remote_clients: Arc::new(Mutex::new(HashSet::new())),
        });

        self.sessions
            .insert(job_id.to_string(), session_handle.clone());

        // Register session with health monitor
        self.health_monitor.register_session(job_id);

        // Auto-launch CLI tool for implementation plan terminals
        let is_implementation_plan = self.check_if_implementation_plan(job_id).await;

        if is_implementation_plan {
            info!("Terminal session for implementation plan detected: {}", job_id);

            // Check if a CLI tool is configured
            if let Some(cli_name) = preferred_cli.clone() {
                if which::which(&cli_name).is_ok() {
                    info!("Auto-launching CLI tool '{}' for implementation plan", cli_name);

                    // Build the command - just launch the CLI tool without arguments
                    // Most CLI tools (claude-code, cursor, etc.) don't need the plan ID as argument
                    let mut cli_command = cli_name.clone();

                    // Add any additional args if configured
                    if !additional_args.is_empty() {
                        cli_command.push(' ');
                        cli_command.push_str(&additional_args);
                    }

                    // Add carriage return to execute
                    cli_command.push('\r');

                    let session_clone = session_handle.clone();
                    let job_id_for_log = job_id.to_string();
                    let cli_name_for_log = cli_name.clone();
                    tokio::spawn(async move {
                        // Wait longer for shell to fully initialize
                        tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

                        info!("Sending CLI command '{}' to terminal for plan {}", cli_command.trim(), job_id_for_log);

                        // Send CR first to ensure clean prompt
                        if let Ok(mut writer_guard) = session_clone.writer.lock() {
                            let _ = writer_guard.write_all(b"\r");
                            let _ = writer_guard.flush();
                            drop(writer_guard); // Explicitly drop the guard before await
                        }

                        // Small delay to let shell process the CR
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                        // Now send the actual command
                        if let Ok(mut writer_guard) = session_clone.writer.lock() {
                            if let Err(e) = writer_guard.write_all(cli_command.as_bytes()) {
                                warn!("Failed to send CLI command for plan {}: {}", job_id_for_log, e);
                            } else if let Err(e) = writer_guard.flush() {
                                warn!("Failed to flush CLI command for plan {}: {}", job_id_for_log, e);
                            } else {
                                info!("Successfully sent CLI command for plan {}", job_id_for_log);
                            }
                        }
                    });
                } else {
                    warn!("Configured CLI tool '{}' not found in PATH", cli_name);
                }
            } else if let Some(custom_cmd) = custom_command.clone() {
                // Use custom command if no preferred CLI but custom command is set
                info!("Auto-executing custom command for implementation plan");

                let mut command = custom_cmd.replace("{PLAN_ID}", job_id);
                command.push('\r');

                let session_clone = session_handle.clone();
                let job_id_for_log = job_id.to_string();
                tokio::spawn(async move {
                    // Wait for shell to initialize
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                    if let Ok(mut writer_guard) = session_clone.writer.lock() {
                        if let Err(e) = writer_guard.write_all(command.as_bytes()) {
                            warn!("Failed to send custom command for plan {}: {}", job_id_for_log, e);
                        } else if let Err(e) = writer_guard.flush() {
                            warn!("Failed to flush custom command for plan {}: {}", job_id_for_log, e);
                        } else {
                            info!("Successfully sent custom command for plan {}", job_id_for_log);
                        }
                    }
                });
            } else {
                debug!("No CLI tool configured for implementation plan terminal");
            }
        }

        // Attach client to the broadcast channel using the new method
        if let Err(e) = self.attach_client(job_id, output_channel, &self.app).await {
            error!("Failed to attach client for job {}: {:?}", job_id, e);
        }

        info!(
            "Successfully started PTY terminal session for job {}",
            job_id
        );
        Ok(())
    }

    pub async fn attach_client(
        &self,
        job_id: &str,
        output: Channel<Vec<u8>>,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        // Check if session is currently running in memory
        let is_running_in_memory = if let Some(session_handle) = self.sessions.get(job_id) {
            let status = session_handle.status.load(Ordering::Relaxed);
            status == SessionStatus::Running as u8
        } else {
            false
        };

        let repo = app
            .state::<Arc<TerminalSessionsRepository>>()
            .inner()
            .clone();

        // ALWAYS send some output, never send nothing
        if !is_running_in_memory {
            // Session is not running, check for historical output
            info!("Session {} is not running in memory, checking for historical output", job_id);

            let history = repo.get_output_log(job_id).await.map_err(|e| {
                warn!("Failed to get output log for job {}: {}", job_id, e);
                AppError::DatabaseError(format!(
                    "Failed to get output log for job {}: {}",
                    job_id, e
                ))
            })?;

            if !history.is_empty() {
                // Send historical output
                let history_bytes = history.into_bytes();
                if let Err(_) = output.send(history_bytes) {
                    return Err(AppError::TerminalError(format!(
                        "Failed to send history to client for job {}",
                        job_id
                    )));
                }
            } else {
                // Check if session exists in database
                match repo.get_session_by_job_id(job_id).await {
                    Ok(Some(session)) => {
                        // Session exists but no output - send appropriate message
                        let status_msg = if session.status == "completed" || session.status == "failed" {
                            format!("[Session ended - no output captured]\r\n")
                        } else {
                            format!("[Session active - waiting for output...]\r\n")
                        };

                        if let Err(_) = output.send(status_msg.into_bytes()) {
                            return Err(AppError::TerminalError(format!(
                                "Failed to send status message to client for job {}",
                                job_id
                            )));
                        }
                    }
                    Ok(None) => {
                        // No session exists - send initialization message
                        let init_msg = "[Initializing new session...]\r\n";
                        if let Err(_) = output.send(init_msg.as_bytes().to_vec()) {
                            return Err(AppError::TerminalError(format!(
                                "Failed to send initialization message to client for job {}",
                                job_id
                            )));
                        }
                    }
                    Err(e) => {
                        // Database error - send error details
                        let error_msg = format!("[Error accessing session: {}]\r\n", e);
                        if let Err(_) = output.send(error_msg.into_bytes()) {
                            return Err(AppError::TerminalError(format!(
                                "Failed to send error message to client for job {}",
                                job_id
                            )));
                        }
                    }
                }
            }
        } else {
            // Session is running, send a brief status message to confirm attachment
            info!("Session {} is running in memory, sending status confirmation", job_id);
            let status_msg = "[Attached to running session]\r\n";
            if let Err(_) = output.send(status_msg.as_bytes().to_vec()) {
                return Err(AppError::TerminalError(format!(
                    "Failed to send status confirmation to client for job {}",
                    job_id
                )));
            }
        }

        // Subscribe to the session's broadcast channel for live output
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status = session_handle.status.load(Ordering::Relaxed);
            if status == SessionStatus::Running as u8 {
                let mut rx = session_handle.output_sender.subscribe();
                let job_id_clone = job_id.to_string();

                // Forward all subsequent broadcast messages to the output channel
                tauri::async_runtime::spawn(async move {
                    loop {
                        match rx.recv().await {
                            Ok(bytes) => {
                                if output.send(bytes).is_err() {
                                    break;
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => {
                                continue;
                            }
                            Err(_) => break,
                        }
                    }
                });
            }
        }

        // Emit a "terminal-ready" event to signal UI readiness
        let app_clone = app.clone();
        let job_for_ready = job_id.to_string();
        let _ = app.run_on_main_thread(move || {
            let _ = app_clone.emit(
                "terminal-ready",
                serde_json::json!({ "jobId": job_for_ready }),
            );
        });

        Ok(())
    }

    pub async fn attach_output(
        &self,
        job_id: &str,
        output_channel: Channel<Vec<u8>>,
        window: tauri::Window,
    ) -> Result<(), AppError> {
        // Check if session exists in memory
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status = session_handle.status.load(Ordering::Relaxed);
            if status == SessionStatus::Running as u8 {
                info!("Attaching to running terminal session for job {}", job_id);
                return self.attach_client(job_id, output_channel, &self.app).await;
            } else {
                info!("Terminal session {} exists but is not running (status: {})", job_id, status);
            }
        }

        // Session not in memory, check database for historical session
        let repo = self
            .app
            .state::<Arc<TerminalSessionsRepository>>()
            .inner()
            .clone();

        if let Ok(Some(db_session)) = repo.get_session_by_job_id(job_id).await {
            info!("Found historical terminal session for job {} with status: {}", job_id, db_session.status);

            // Send the historical output log
            let history = repo.get_output_log(job_id).await.map_err(|e| {
                AppError::DatabaseError(format!(
                    "Failed to get output log for job {}: {}",
                    job_id, e
                ))
            })?;

            if !history.is_empty() {
                let history_bytes = history.into_bytes();
                let _ = output_channel.send(history_bytes);
            }

            // Send a status message indicating the session has ended
            let status_msg = format!(
                "\r\n\x1b[33m[Session ended - Status: {}]\x1b[0m\r\n",
                db_session.status
            );
            let _ = output_channel.send(status_msg.into_bytes());

            // Still emit terminal-ready to unblock the UI
            let app_clone = self.app.clone();
            let job_for_ready = job_id.to_string();
            let _ = self.app.run_on_main_thread(move || {
                let _ = app_clone.emit(
                    "terminal-ready",
                    serde_json::json!({ "jobId": job_for_ready }),
                );
            });

            return Ok(());
        }

        Err(AppError::TerminalError(format!(
            "Terminal session {} not found",
            job_id
        )))
    }

    pub async fn write_input(&self, job_id: &str, data: Vec<u8>) -> Result<(), String> {
        // Skip health validation here to avoid recursion
        // Health checks are done periodically by the health monitor

        if let Some(session_handle) = self.sessions.get(job_id) {
            // Check if session is still running
            let status = session_handle.status.load(Ordering::Relaxed);
            if status != SessionStatus::Running as u8 {
                debug!("Ignoring write to non-running session {} (status: {})", job_id, status);
                return Ok(()); // Silently ignore writes to ended sessions
            }

            // Get access to writer through the mutex
            let mut writer_guard = session_handle
                .writer
                .lock()
                .map_err(|e| format!("Failed to acquire writer lock for job {}: {}", job_id, e))?;

            writer_guard
                .write_all(&data)
                .map_err(|e| format!("Failed to write to PTY for job {}: {}", job_id, e))?;

            // Explicitly flush for critical control characters like backspace
            if data.len() == 1 && (data[0] == 0x7f || data[0] == 0x08 || data[0] == 0x03) {
                writer_guard
                    .flush()
                    .map_err(|e| format!("Failed to flush PTY writer for job {}: {}", job_id, e))?;
            }

            Ok(())
        } else {
            // Session not found - likely ended, silently ignore
            debug!("Terminal session {} not found for write, likely already ended", job_id);
            Ok(())
        }
    }

    pub async fn send_ctrl_c(&self, job_id: &str) -> Result<(), String> {
        // Send Ctrl+C character (ETX) as bytes
        self.write_input(job_id, vec![0x03]).await
    }

    pub async fn resize_session(&self, job_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // Skip health validation here to avoid potential recursion issues
        // Health checks are done periodically by the health monitor

        if let Some(session_handle) = self.sessions.get(job_id) {
            // Only resize if the session is still running
            let status = session_handle.status.load(Ordering::Relaxed);
            if status != SessionStatus::Running as u8 {
                debug!("Skipping resize for non-running session {} (status: {})", job_id, status);
                return Ok(());
            }

            let pty_size = PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            };

            session_handle
                .master
                .lock()
                .map_err(|e| format!("Failed to acquire master lock for job {}: {}", job_id, e))?
                .resize(pty_size)
                .map_err(|e| format!("Failed to resize PTY for job {}: {}", job_id, e))?;

            info!("Resized PTY for job {} to {}x{}", job_id, cols, rows);
            Ok(())
        } else {
            // Session not found - it may have ended already, just return OK
            debug!("Terminal session {} not found for resize, likely already ended", job_id);
            Ok(())
        }
    }

    pub async fn kill_session(&self, job_id: &str) -> Result<(), String> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            info!("Killing terminal session for job {}", job_id);

            // Use the process controller to terminate the process
            session_handle
                .process_controller
                .lock()
                .map_err(|e| {
                    format!(
                        "Failed to acquire process controller lock for job {}: {}",
                        job_id, e
                    )
                })?
                .kill()
                .map_err(|e| format!("Failed to kill process for job {}: {}", job_id, e))?;

            // Update DB status to completed
            let repo = self
                .app
                .state::<Arc<TerminalSessionsRepository>>()
                .inner()
                .clone();

            if let Ok(Some(mut db_session)) = repo.get_session_by_job_id(job_id).await {
                db_session.status = "completed".to_string();
                db_session.updated_at = chrono::Utc::now().timestamp();

                if let Err(e) = repo.update_session(&db_session).await {
                    error!(
                        "Failed to update session status after kill for job {}: {}",
                        job_id, e
                    );
                }
            }

            // Remove from map
            self.sessions.remove(job_id);

            // Unregister from health monitor
            self.health_monitor.unregister_session(job_id);

            info!("Successfully killed terminal session for job {}", job_id);
            Ok(())
        } else {
            Err(format!("Terminal session {} not found", job_id))
        }
    }

    pub async fn get_status(&self, job_id: &str) -> serde_json::Value {
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status_code = session_handle.status.load(Ordering::Relaxed);
            let exit_code = session_handle
                .exit_code
                .lock()
                .map(|guard| *guard)
                .unwrap_or(None);

            let status_str = match status_code {
                x if x == SessionStatus::Running as u8 => "running",
                x if x == SessionStatus::Completed as u8 => "completed",
                x if x == SessionStatus::Failed as u8 => "failed",
                x if x == SessionStatus::Stuck as u8 => "stuck",
                _ => "unknown",
            };

            serde_json::json!({
                "status": status_str,
                "exitCode": exit_code
            })
        } else {
            // Check database for historical sessions
            let repo = self
                .app
                .state::<Arc<TerminalSessionsRepository>>()
                .inner()
                .clone();

            if let Ok(Some(db_session)) = repo.get_session_by_job_id(job_id).await {
                serde_json::json!({
                    "status": db_session.status,
                    "exitCode": db_session.exit_code
                })
            } else {
                serde_json::json!({
                    "status": "idle",
                    "exitCode": null
                })
            }
        }
    }

    // Helper method to mark session as failed and emit terminal-exit event
    async fn mark_session_failed_and_emit(&self, job_id: &str, window: &tauri::Window) {
        // Update database session to failed status
        let repo = self
            .app
            .state::<Arc<TerminalSessionsRepository>>()
            .inner()
            .clone();

        if let Ok(Some(mut db_session)) = repo.get_session_by_job_id(job_id).await {
            db_session.status = "failed".to_string();
            db_session.exit_code = Some(1); // Exit code 1 for failure
            db_session.updated_at = chrono::Utc::now().timestamp();

            if let Err(e) = repo.update_session(&db_session).await {
                error!(
                    "Failed to update session status to failed for job {}: {}",
                    job_id, e
                );
            }
        }

        let app = self.app.clone();
        let payload = serde_json::json!({
            "jobId": job_id,
            "code": 1
        });
        let app_clone = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = app_clone.emit("terminal-exit", payload);
        });
    }

    // Helper method to check if a job is an implementation plan
    async fn check_if_implementation_plan(&self, job_id: &str) -> bool {
        // Try to get the BackgroundJobRepository from app state
        let repo = match self.app.try_state::<Arc<BackgroundJobRepository>>() {
            Some(repo) => repo.inner().clone(),
            None => {
                debug!("BackgroundJobRepository not available, assuming not an implementation plan");
                return false;
            }
        };

        // Fetch the job from the database
        match repo.get_job_by_id(job_id).await {
            Ok(Some(job)) => {
                // Check if the task_type is implementation_plan or implementation_plan_merge
                let is_plan = job.task_type == "implementation_plan" ||
                             job.task_type == "implementation_plan_merge";

                if is_plan {
                    debug!("Job {} is an implementation plan (type: {})", job_id, job.task_type);
                } else {
                    debug!("Job {} is not an implementation plan (type: {})", job_id, job.task_type);
                }

                is_plan
            }
            Ok(None) => {
                debug!("Job {} not found in database", job_id);
                false
            }
            Err(e) => {
                warn!("Failed to fetch job {} from database: {}", job_id, e);
                false
            }
        }
    }

    // Helper method to augment PATH with common CLI locations (cached)
    fn augment_path(&self, current_path: &str) -> String {
        // Return cached value if available
        if let Some(cached) = CACHED_AUGMENTED_PATH.get() {
            return cached.clone();
        }

        // Calculate augmented path once
        let additional_paths = if cfg!(target_os = "windows") {
            vec![
                format!(
                    "{}\\AppData\\Roaming\\npm",
                    std::env::var("USERPROFILE").unwrap_or_default()
                ),
                "C:\\Program Files\\nodejs".to_string(),
            ]
        } else {
            let mut paths = vec![
                "/usr/local/bin".to_string(),
                "/opt/homebrew/bin".to_string(),
                format!(
                    "{}/.npm-global/bin",
                    std::env::var("HOME").unwrap_or_default()
                ),
                format!("{}/.yarn/bin", std::env::var("HOME").unwrap_or_default()),
                format!("{}/.cargo/bin", std::env::var("HOME").unwrap_or_default()),
            ];

            let home = std::env::var("HOME").unwrap_or_default();

            // Add required NVM and local bin paths if they exist
            let nvm_current_bin = format!("{}/.nvm/versions/node/current/bin", home);
            if std::path::Path::new(&nvm_current_bin).exists() {
                paths.push(nvm_current_bin);
            }

            let local_bin = format!("{}/.local/bin", home);
            if std::path::Path::new(&local_bin).exists() {
                paths.push(local_bin);
            }

            paths
        };

        let path_separator = if cfg!(target_os = "windows") {
            ";"
        } else {
            ":"
        };

        let mut paths: Vec<String> = current_path
            .split(path_separator)
            .map(|s| s.to_string())
            .collect();

        for additional_path in additional_paths {
            if !paths.contains(&additional_path) {
                paths.push(additional_path);
            }
        }

        let augmented = paths.join(path_separator);

        // Cache the result for future calls
        let _ = CACHED_AUGMENTED_PATH.set(augmented.clone());

        augmented
    }

    /// Start a terminal session internally without UI channel
    /// This is used for remote sessions that don't need a UI channel
    pub async fn start_session_internal(
        &self,
        job_id: &str,
        options: Option<TerminalSessionOptions>,
    ) -> Result<(), AppError> {
        // Create a dummy channel for compatibility
        let channel = tauri::ipc::Channel::new(move |_response| {
            // Handle response if needed
            Ok(())
        });

        // Create a dummy window (this should be refactored to not require a window)
        let webview_window = self.app.get_webview_window("main")
            .ok_or_else(|| AppError::TerminalError("No main window available".to_string()))?;
        let window = webview_window.as_ref().window();

        self.start_session(job_id, options, channel, window).await
    }

    /// Attach a remote client to receive terminal output
    pub async fn attach_remote_client(&self, job_id: &str, client_id: String) -> Result<(), AppError> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            // Add client to the remote clients list
            {
                let mut remote_clients = session_handle.remote_clients.lock()
                    .map_err(|e| AppError::TerminalError(format!("Failed to lock remote clients: {}", e)))?;
                remote_clients.insert(client_id.clone());
            }

            // Send historical output first
            let repo = self.app.state::<Arc<TerminalSessionsRepository>>().inner().clone();
            let history = repo.get_output_log(job_id).await
                .map_err(|e| AppError::DatabaseError(format!("Failed to get output log: {}", e)))?;

            if !history.is_empty() {
                // Emit historical output
                let _ = self.app.emit("terminal:output", serde_json::json!({
                    "clientId": client_id,
                    "jobId": job_id,
                    "data": base64::encode(history.as_bytes())
                }));
            }

            // Subscribe to live output
            let mut rx = session_handle.output_sender.subscribe();
            let app_handle = self.app.clone();
            let job_id_clone = job_id.to_string();
            let client_id_clone = client_id.clone();
            let remote_clients = session_handle.remote_clients.clone();

            tokio::spawn(async move {
                loop {
                    match rx.recv().await {
                        Ok(bytes) => {
                            // Check if client is still attached
                            {
                                let clients = remote_clients.lock().unwrap();
                                if !clients.contains(&client_id_clone) {
                                    break; // Client detached
                                }
                            }

                            // Emit output to remote client
                            let _ = app_handle.emit("terminal:output", serde_json::json!({
                                "clientId": client_id_clone,
                                "jobId": job_id_clone,
                                "data": base64::encode(&bytes)
                            }));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            continue;
                        }
                        Err(_) => break,
                    }
                }
            });

            info!("Attached remote client {} to terminal session {}", client_id, job_id);
            Ok(())
        } else {
            Err(AppError::TerminalError(format!("Terminal session {} not found", job_id)))
        }
    }

    /// Detach a remote client from terminal output
    pub async fn detach_remote_client(&self, job_id: &str, client_id: &str) -> Result<(), AppError> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            let mut remote_clients = session_handle.remote_clients.lock()
                .map_err(|e| AppError::TerminalError(format!("Failed to lock remote clients: {}", e)))?;
            remote_clients.remove(client_id);
            info!("Detached remote client {} from terminal session {}", client_id, job_id);
            Ok(())
        } else {
            Err(AppError::TerminalError(format!("Terminal session {} not found", job_id)))
        }
    }

    /// List all active terminal sessions with their last output line
    pub async fn list_active_terminal_sessions(&self) -> Result<Vec<serde_json::Value>, AppError> {
        let mut active_sessions = Vec::new();

        // Get active sessions from memory
        for entry in self.sessions.iter() {
            let (job_id, session_handle) = entry.pair();
            let status = session_handle.status.load(Ordering::Relaxed);

            if status == SessionStatus::Running as u8 {
                // Get last output line from database
                let repo = self.app.state::<Arc<TerminalSessionsRepository>>().inner().clone();
                let output_log = repo.get_output_log(job_id).await
                    .unwrap_or_default();

                let last_output_line = output_log
                    .lines()
                    .last()
                    .unwrap_or("[No output yet]")
                    .trim()
                    .to_string();

                // Limit line length for UI display
                let display_line = if last_output_line.len() > 100 {
                    format!("{}...", &last_output_line[..97])
                } else {
                    last_output_line
                };

                active_sessions.push(serde_json::json!({
                    "jobId": job_id,
                    "status": "running",
                    "lastOutputLine": display_line,
                    "isInMemory": true
                }));
            }
        }

        // Also check database for any "running" sessions not in memory
        let repo = self.app.state::<Arc<TerminalSessionsRepository>>().inner().clone();
        if let Ok(db_sessions) = repo.list_active_sessions().await {
            for db_session in db_sessions {
                // Skip if already in memory
                if self.sessions.contains_key(&db_session.job_id) {
                    continue;
                }

                let output_log = repo.get_output_log(&db_session.job_id).await
                    .unwrap_or_default();

                let last_output_line = output_log
                    .lines()
                    .last()
                    .unwrap_or("[No output captured]")
                    .trim()
                    .to_string();

                let display_line = if last_output_line.len() > 100 {
                    format!("{}...", &last_output_line[..97])
                } else {
                    last_output_line
                };

                active_sessions.push(serde_json::json!({
                    "jobId": db_session.job_id,
                    "status": db_session.status,
                    "lastOutputLine": display_line,
                    "isInMemory": false
                }));
            }
        }

        Ok(active_sessions)
    }

    // Health monitoring methods

    /// Check the health of a terminal session
    pub async fn health_check(&self, job_id: &str) -> Result<HealthStatus, AppError> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            // Check if child process is alive
            let process_alive = {
                let mut child_guard = session_handle.child.lock()
                    .map_err(|e| AppError::TerminalError(format!("Failed to lock child: {}", e)))?;

                // Use try_wait to check if process is still running without blocking
                match child_guard.try_wait() {
                    Ok(Some(_)) => false, // Process has exited
                    Ok(None) => true,     // Process is still running
                    Err(_) => false,      // Error checking process, assume dead
                }
            };

            if !process_alive {
                let exit_code = session_handle.exit_code.lock().unwrap().clone();
                return Ok(HealthStatus::ProcessDead { exit_code });
            }

            // Check session status
            let status = session_handle.status.load(Ordering::Relaxed);
            if status != SessionStatus::Running as u8 {
                let exit_code = session_handle.exit_code.lock().unwrap().clone();
                return Ok(HealthStatus::ProcessDead { exit_code });
            }

            // Check output channel activity
            let output_active = session_handle.output_sender.receiver_count() > 0;
            if !output_active {
                return Ok(HealthStatus::Disconnected);
            }

            // If we get here, session appears healthy
            Ok(HealthStatus::Healthy)
        } else {
            Err(AppError::TerminalError(format!("Terminal session {} not found", job_id)))
        }
    }

    /// Perform automatic recovery on a terminal session
    pub async fn auto_recover(&self, job_id: &str, health_status: HealthStatus) -> Result<(), AppError> {
        let recovery_action = RecoveryAction::for_health_status(health_status);

        match recovery_action {
            RecoveryAction::SendPrompt => {
                info!("Performing send prompt recovery for session {}", job_id);

                // Send Enter key to trigger prompt
                self.write_input(job_id, b"\r".to_vec()).await
                    .map_err(|e| AppError::TerminalError(format!("Failed to send prompt: {}", e)))?;

                // Wait a moment then send probe command
                tokio::time::sleep(Duration::from_millis(500)).await;

                self.write_input(job_id, b"echo 'health-check-alive'\r".to_vec()).await
                    .map_err(|e| AppError::TerminalError(format!("Failed to send probe: {}", e)))?;
            }

            RecoveryAction::Interrupt => {
                info!("Performing interrupt recovery for session {}", job_id);

                // Send Ctrl+C to interrupt any stuck command
                self.send_ctrl_c(job_id).await
                    .map_err(|e| AppError::TerminalError(format!("Failed to send Ctrl+C: {}", e)))?;

                // Wait to see if process becomes responsive
                tokio::time::sleep(Duration::from_secs(2)).await;

                // Check if still stuck and kill if needed
                let still_stuck = matches!(self.health_check(job_id).await?, HealthStatus::ProcessDead { .. });
                if still_stuck {
                    warn!("Session {} still stuck after interrupt, killing", job_id);
                    self.kill_session(job_id).await?;
                }
            }

            RecoveryAction::Restart => {
                warn!("Performing restart recovery for session {}", job_id);

                // Kill the current session
                if let Err(e) = self.kill_session(job_id).await {
                    warn!("Failed to kill session {} during restart: {}", job_id, e);
                }

                // Note: Full restart would require recreating the session with original parameters
                // This would need to be handled at a higher level
            }

            RecoveryAction::Reattach => {
                info!("Performing reattach recovery for session {}", job_id);

                // Recreate output channels - this is complex and would require
                // access to the original channel parameters
                warn!("Reattach recovery for session {} requires manual intervention", job_id);
            }

            RecoveryAction::FlushPersistence => {
                info!("Performing persistence flush for session {}", job_id);

                // Force persistence flush - this would require coordination with
                // the persistence worker
                warn!("Persistence flush for session {} - monitoring queue", job_id);
            }

            RecoveryAction::None => {
                // No recovery action needed
            }
        }

        Ok(())
    }

    /// Get health monitor instance for external access
    pub fn get_health_monitor(&self) -> Arc<TerminalHealthMonitor> {
        self.health_monitor.clone()
    }

    /// Validate session health during operations
    async fn validate_session_health(&self, job_id: &str) -> Result<(), AppError> {
        match self.health_check(job_id).await {
            Ok(HealthStatus::Healthy) => Ok(()),
            Ok(health_status) => {
                warn!("Session {} health issue detected: {:?}", job_id, health_status);

                // Attempt auto-recovery for non-critical issues
                if health_status.requires_recovery() && health_status.severity() != crate::services::terminal_health_monitor::HealthSeverity::Critical {
                    if let Err(e) = self.auto_recover(job_id, health_status).await {
                        warn!("Auto-recovery failed for session {}: {}", job_id, e);
                    }
                }

                Ok(()) // Don't fail the operation, just log the issue
            }
            Err(e) => {
                debug!("Health check failed for session {}: {}", job_id, e);
                Ok(()) // Session might not be registered yet
            }
        }
    }
}
