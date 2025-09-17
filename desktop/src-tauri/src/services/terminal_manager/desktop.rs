use dashmap::DashMap;
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::io::Read;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tokio::time;
use tauri::{AppHandle, Emitter, Manager, ipc::Channel};
use tauri::async_runtime::JoinHandle;
use log::{debug, error, info, warn};
use crate::db_utils::terminal_sessions_repository::TerminalSessionsRepository;
use crate::db_utils::settings_repository::SettingsRepository;
use crate::auth::token_manager::TokenManager;
use crate::error::AppError;
use crate::{AppState, RuntimeConfig};

// Global cached augmented PATH
static CACHED_AUGMENTED_PATH: OnceLock<String> = OnceLock::new();

const BATCH_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(200);
const MAX_BATCH_SIZE: usize = 64 * 1024; // 64KB

async fn persistence_worker(
    job_id: String,
    mut log_rx: mpsc::Receiver<Vec<u8>>,
    repo: Arc<TerminalSessionsRepository>,
) {
    let mut buffer = Vec::new();
    let mut timer = time::interval(BATCH_TIMEOUT);
    timer.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = timer.tick() => {
                if !buffer.is_empty() {
                    flush_buffer(&job_id, &mut buffer, &repo).await;
                }
            }
            data = log_rx.recv() => {
                match data {
                    Some(data) => {
                        buffer.extend_from_slice(&data);
                        if buffer.len() >= MAX_BATCH_SIZE {
                            flush_buffer(&job_id, &mut buffer, &repo).await;
                        }
                    }
                    None => {
                        // Channel closed, flush remaining data
                        if !buffer.is_empty() {
                            flush_buffer(&job_id, &mut buffer, &repo).await;
                        }
                        break;
                    }
                }
            }
        }
    }
}

async fn flush_buffer(
    job_id: &str,
    buffer: &mut Vec<u8>,
    repo: &Arc<TerminalSessionsRepository>,
) {
    if buffer.is_empty() {
        return;
    }

    let log_string = String::from_utf8_lossy(buffer).to_string();
    if let Err(e) = repo.append_output_log(job_id, &log_string).await {
        warn!("Failed to persist terminal output for job {}: {}", job_id, e);
    }
    buffer.clear();
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
    pub paused: Arc<AtomicBool>,
    pub output_sender: Arc<broadcast::Sender<Vec<u8>>>,
    pub _child_wait_task: tauri::async_runtime::JoinHandle<()>,
}

pub struct TerminalManager {
    sessions: Arc<DashMap<String, Arc<SessionHandle>>>,
    app: AppHandle,
}

impl TerminalManager {
    pub fn new(app: AppHandle) -> Self {
        let manager = Self {
            sessions: Arc::new(DashMap::new()),
            app: app.clone(),
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
                    let _ = app_clone.emit("terminal-ready", serde_json::json!({ "jobId": job_for_ready }));
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
            let server_url_guard = app_state.settings.server_url.lock()
                .map_err(|e| AppError::TerminalError(format!("Failed to acquire server URL lock: {}", e)))?;
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
        env_vars.insert("TERM_PROGRAM_VERSION".to_string(), env!(
            "CARGO_PKG_VERSION"
        ).to_string());

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

        let (command, use_shell_fallback) = {
            #[cfg(target_os = "windows")]
            {
                let shell = which::which("pwsh.exe").map(|_| "pwsh.exe").unwrap_or("powershell.exe");
                (shell.to_string(), true)
            }
            #[cfg(not(target_os = "windows"))]
            {
                let shell_env = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                (shell_env, true)
            }
        };

        debug!("Using command: {} (shell_fallback: {})", command, use_shell_fallback);
        info!("Terminal: Starting command '{}' for job {}", command, job_id);

        // Get additional arguments from settings
        let settings_repo = self.app.state::<Arc<SettingsRepository>>().inner().clone();
        let additional_args = settings_repo.get_value("terminal.additional_args").await
            .unwrap_or(None)
            .unwrap_or_default();

        // Build command - implement native terminal behavior
        let mut cmd = CommandBuilder::new(&command);
        cmd.cwd(working_dir);

        #[cfg(target_os = "windows")]
        {
            if command.contains("pwsh") || command.contains("powershell") {
                cmd.args(&["-NoProfile", "-NoLogo"]);
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            // macOS/Linux: Run as login interactive shell
            // This ensures proper rc/profile evaluation matching Terminal.app/iTerm2
            if command.ends_with("bash") {
                cmd.args(&["--login", "-i"]);
            } else if command.ends_with("zsh") {
                cmd.args(&["-l", "-i"]);
            } else if command.ends_with("fish") {
                cmd.args(&["--login", "-i"]);
            } else {
                // Generic shell: try to make it interactive
                cmd.arg("-i");
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
        let repo = self.app
            .state::<Arc<TerminalSessionsRepository>>()
            .inner()
            .clone();

        let session = crate::db_utils::terminal_sessions_repository::TerminalSession {
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

        // Check if session exists, update existing or create new
        match repo.get_session_by_job_id(job_id).await {
            Ok(Some(existing_session)) => {
                // Update existing session with new data but keep existing ID
                let mut updated_session = session;
                updated_session.id = existing_session.id; // Reuse existing session ID
                repo.update_session(&updated_session).await
                    .map_err(|e| format!("Failed to update terminal session in DB: {}", e))?;
            }
            Ok(None) => {
                repo.create_session(&session).await
                    .map_err(|e| format!("Failed to create terminal session in DB: {}", e))?;
            }
            Err(e) => {
                return Err(AppError::TerminalError(format!("Failed to check terminal session in DB: {}", e)));
            }
        }

        // Create broadcast channel for output distribution
        let (tx, _rx) = broadcast::channel(1024);
        let output_sender = Arc::new(tx);

        // Create mpsc channel for tee logger
        let (log_tx, log_rx) = mpsc::channel::<Vec<u8>>(1024);

        // Spawn persistence worker
        let job_id_for_worker = job_id.to_string();
        let repo_for_worker = repo.clone();
        tauri::async_runtime::spawn(async move {
            persistence_worker(job_id_for_worker, log_rx, repo_for_worker).await;
        });

        // Create shared state for the session
        let status = Arc::new(AtomicU8::new(SessionStatus::Running as u8));
        let exit_code = Arc::new(Mutex::new(None));
        let paused = Arc::new(AtomicBool::new(false));

        // Clone required data for reader task
        let app_handle = self.app.clone();
        let job_id_clone = job_id.to_string();
        let repo_clone = repo.clone();
        let status_clone = status.clone();
        let exit_code_clone = exit_code.clone();
        let sessions_map = self.sessions.clone();
        let child_arc: Arc<Mutex<Box<dyn Child + Send>>> = Arc::new(Mutex::new(child));
        let child_arc_clone = child_arc.clone();


        // Clone required data for reader thread
        let output_sender_clone = output_sender.clone();
        let paused_clone = paused.clone();

        // Spawn PTY reader that writes to broadcast channel
        let mut reader = reader;
        std::thread::spawn(move || {
            // 64KiB read buffer for performance
            let mut buf = vec![0u8; 65536];
            loop {
                // Check if output is paused
                if paused_clone.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(10));
                    continue;
                }

                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = buf[..n].to_vec();

                        // Send to broadcast channel (hot path)
                        let _ = output_sender_clone.send(data.clone());

                        // Send to persistence worker (warm path)
                        match log_tx.try_send(data) {
                            Ok(()) => {},
                            Err(mpsc::error::TrySendError::Full(_)) => {
                                warn!("Persistence channel full for job {}, dropping data", job_id_clone);
                            },
                            Err(mpsc::error::TrySendError::Closed(_)) => {
                                warn!("Persistence channel closed for job {}", job_id_clone);
                            },
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => {
                        warn!("pty read error: {}", e);
                        break;
                    }
                }
            }
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
            }).await.unwrap_or_else(|e| {
                error!("Failed to wait for child: {}", e);
                Err(std::io::Error::new(std::io::ErrorKind::Other, "wait failed"))
            });

            match exit_status {
                Ok(status) => {
                    let code = if status.success() { Some(0) } else { Some(1) };
                    info!("Process for job {} exited with status: {:?}", job_for_wait, status);

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

                    if let Ok(Some(mut db_session)) = repo_for_wait.get_session_by_job_id(&job_for_wait).await {
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

                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    sessions_for_wait.remove(&job_for_wait);
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
            paused,
            output_sender: output_sender.clone(),
            _child_wait_task: child_wait_task,
        });

        self.sessions.insert(job_id.to_string(), session_handle.clone());

        // Attach client to the broadcast channel
        if let Err(e) = self.attach_client(job_id, output_channel, output_sender, window) {
            error!("Failed to attach client for job {}: {:?}", job_id, e);
        }

        // Emit terminal-ready after session is stored
        let app_for_ready = self.app.clone();
        let job_for_ready = job_id.to_string();
        let app_clone = app_for_ready.clone();
        let _ = app_for_ready.run_on_main_thread(move || {
            let _ = app_clone.emit("terminal-ready", serde_json::json!({ "jobId": job_for_ready }));
        });

        info!("Successfully started PTY terminal session for job {}", job_id);
        Ok(())
    }

    pub async fn attach_output(
        &self,
        job_id: &str,
        output_channel: Channel<Vec<u8>>,
        window: tauri::Window,
    ) -> Result<(), AppError> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status = session_handle.status.load(Ordering::Relaxed);
            if status == SessionStatus::Running as u8 {
                info!("Attaching to terminal session output for job {}", job_id);

                // Attach client to the broadcast channel
                self.attach_client(job_id, output_channel, session_handle.output_sender.clone(), window)?;

                let app_for_ready = self.app.clone();
                let job_for_ready = job_id.to_string();
                let app_clone = app_for_ready.clone();
                let _ = app_for_ready.run_on_main_thread(move || {
                    let _ = app_clone.emit("terminal-ready", serde_json::json!({ "jobId": job_for_ready }));
                });

                return Ok(());
            }
        }

        Err(AppError::TerminalError(format!("Terminal session {} not found or not running", job_id)))
    }

    pub async fn write_input(&self, job_id: &str, data: Vec<u8>) -> Result<(), String> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            // Check if session is still running
            let status = session_handle.status.load(Ordering::Relaxed);
            if status != SessionStatus::Running as u8 {
                return Err(format!("Terminal session {} is not running", job_id));
            }

            // Get access to writer through the mutex
            let mut writer_guard = session_handle.writer.lock()
                .map_err(|e| format!("Failed to acquire writer lock for job {}: {}", job_id, e))?;
            
            writer_guard.write_all(&data)
                .map_err(|e| format!("Failed to write to PTY for job {}: {}", job_id, e))?;

            // Remove flush() for better performance - PTY handles this automatically
            // Flushing on every keystroke causes unnecessary blocking
            
            Ok(())
        } else {
            Err(format!("Terminal session {} not found", job_id))
        }
    }

    pub async fn send_ctrl_c(&self, job_id: &str) -> Result<(), String> {
        // Send Ctrl+C character (ETX) as bytes
        self.write_input(job_id, vec![0x03]).await
    }

    pub async fn resize_session(&self, job_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            let pty_size = PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            };
            
            session_handle.master.lock()
                .map_err(|e| format!("Failed to acquire master lock for job {}: {}", job_id, e))?
                .resize(pty_size)
                .map_err(|e| format!("Failed to resize PTY for job {}: {}", job_id, e))?;
            
            info!("Resized PTY for job {} to {}x{}", job_id, cols, rows);
            Ok(())
        } else {
            Err(format!("Terminal session {} not found", job_id))
        }
    }

    pub async fn kill_session(&self, job_id: &str) -> Result<(), String> {
        if let Some(session_handle) = self.sessions.get(job_id) {
            info!("Killing terminal session for job {}", job_id);
            
            // Use the process controller to terminate the process
            session_handle.process_controller.lock()
                .map_err(|e| format!("Failed to acquire process controller lock for job {}: {}", job_id, e))?
                .kill()
                .map_err(|e| format!("Failed to kill process for job {}: {}", job_id, e))?;
            
            // Update DB status to completed
            let repo = self.app
                .state::<Arc<TerminalSessionsRepository>>()
                .inner()
                .clone();
            
            if let Ok(Some(mut db_session)) = repo.get_session_by_job_id(job_id).await {
                db_session.status = "completed".to_string();
                db_session.updated_at = chrono::Utc::now().timestamp();
                
                if let Err(e) = repo.update_session(&db_session).await {
                    error!("Failed to update session status after kill for job {}: {}", job_id, e);
                }
            }
            
            // Remove from map
            self.sessions.remove(job_id);
            
            info!("Successfully killed terminal session for job {}", job_id);
            Ok(())
        } else {
            Err(format!("Terminal session {} not found", job_id))
        }
    }

    pub async fn get_status(&self, job_id: &str) -> serde_json::Value {
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status_code = session_handle.status.load(Ordering::Relaxed);
            let exit_code = session_handle.exit_code.lock()
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
            let repo = self.app
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
        let repo = self.app
            .state::<Arc<TerminalSessionsRepository>>()
            .inner()
            .clone();
        
        if let Ok(Some(mut db_session)) = repo.get_session_by_job_id(job_id).await {
            db_session.status = "failed".to_string();
            db_session.exit_code = Some(1); // Exit code 1 for failure
            db_session.updated_at = chrono::Utc::now().timestamp();
            
            if let Err(e) = repo.update_session(&db_session).await {
                error!("Failed to update session status to failed for job {}: {}", job_id, e);
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

    // Helper method to augment PATH with common CLI locations (cached)
    fn augment_path(&self, current_path: &str) -> String {
        // Return cached value if available
        if let Some(cached) = CACHED_AUGMENTED_PATH.get() {
            return cached.clone();
        }

        // Calculate augmented path once
        let additional_paths = if cfg!(target_os = "windows") {
            vec![
                format!("{}\\AppData\\Roaming\\npm", std::env::var("USERPROFILE").unwrap_or_default()),
                "C:\\Program Files\\nodejs".to_string(),
            ]
        } else {
            let mut paths = vec![
                "/usr/local/bin".to_string(),
                "/opt/homebrew/bin".to_string(),
                format!("{}/.npm-global/bin", std::env::var("HOME").unwrap_or_default()),
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

        let path_separator = if cfg!(target_os = "windows") { ";" } else { ":" };

        let mut paths: Vec<String> = current_path.split(path_separator).map(|s| s.to_string()).collect();

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

    pub async fn pause_output(&self, job_id: &str) -> Result<(), AppError> {
        if let Some(h) = self.sessions.get(job_id) {
            h.paused.store(true, Ordering::Relaxed);
            Ok(())
        } else {
            Err(AppError::TerminalError(format!("Terminal session {} not found", job_id)))
        }
    }

    pub async fn resume_output(&self, job_id: &str) -> Result<(), AppError> {
        if let Some(h) = self.sessions.get(job_id) {
            h.paused.store(false, Ordering::Relaxed);
            Ok(())
        } else {
            Err(AppError::TerminalError(format!("Terminal session {} not found", job_id)))
        }
    }

    fn attach_client(
        &self,
        job_id: &str,
        output_channel: Channel<Vec<u8>>,
        sender: Arc<broadcast::Sender<Vec<u8>>>,
        _window: tauri::Window
    ) -> Result<(), AppError> {
        let mut rx = sender.subscribe();
        let job_id = job_id.to_string();
        tauri::async_runtime::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(bytes) => {
                        if output_channel.send(bytes).is_err() {
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
        Ok(())
    }

}