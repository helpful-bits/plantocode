use dashmap::DashMap;
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::io::Read;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, ipc::Channel};
use tokio::task::JoinHandle;
use log::{debug, error, info, warn};
use crate::db_utils::terminal_sessions_repository::TerminalSessionsRepository;
use crate::db_utils::settings_repository::SettingsRepository;
use crate::auth::token_manager::TokenManager;
use crate::error::AppError;
use crate::{AppState, RuntimeConfig};

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
    reader_task: JoinHandle<()>,
}

pub struct TerminalManager {
    sessions: Arc<DashMap<String, Arc<SessionHandle>>>,
    app: AppHandle,
}

impl TerminalManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            app,
        }
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
                info!("Terminal session {} already running", job_id);
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

        // Build environment variables
        let mut env_vars = HashMap::new();
        
        // Whitelist specific environment variables
        let whitelist = ["PATH", "TERM", "HOME"];
        for key in whitelist.iter() {
            if let Ok(value) = std::env::var(key) {
                env_vars.insert(key.to_string(), value);
            }
        }

        // Set TERM for PTY
        env_vars.insert("TERM".to_string(), "xterm-256color".to_string());
        env_vars.insert("FORCE_COLOR".to_string(), "1".to_string());

        // Apply custom environment from options
        if let Some(opts) = &options {
            if let Some(custom_env) = &opts.environment {
                for (key, value) in custom_env {
                    env_vars.insert(key.clone(), value.clone());
                }
            }
        }

        // Set working directory
        let default_dir = ".".to_string();
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

        // 4. For now, always start a bash shell for reliability
        // Users can run claude/cursor manually or we can auto-run it
        let (command, use_shell_fallback) = {
            let shell_cmd = if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
            } else {
                "/bin/bash".to_string()
            };

            // Check if CLI tools are available
            let cli_command = self.resolve_cli_command(&augmented_path).await;
            if let Some(cli) = cli_command {
                let msg = format!("Terminal ready. CLI '{}' is available.\r\nType '{}' to start the CLI, or use the shell directly.\r\n\r\n", cli, cli);
                if let Err(e) = output_channel.send(msg.as_bytes().to_vec()) {
                    warn!("Failed to send message: {}", e);
                }
            } else {
                let msg = "Terminal ready. No CLI tools found.\r\nYou can install Claude CLI with: npm i -g @anthropic-ai/claude-code\r\n\r\n";
                if let Err(e) = output_channel.send(msg.as_bytes().to_vec()) {
                    warn!("Failed to send message: {}", e);
                }
            }

            (shell_cmd, true)
        };

        debug!("Using command: {} (shell_fallback: {})", command, use_shell_fallback);
        info!("Terminal: Starting command '{}' for job {}", command, job_id);

        // Get additional arguments from settings
        let settings_repo = self.app.state::<Arc<SettingsRepository>>();
        let additional_args = settings_repo.get_value("terminal.additional_args").await
            .unwrap_or(None)
            .unwrap_or_default();

        // Build command - simple shell for now
        let mut cmd = CommandBuilder::new(&command);
        cmd.cwd(working_dir);

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

        // Send immediate startup message
        let startup_msg = format!("=== Terminal Session Started ===\r\nCommand: {}\r\nPID: {:?}\r\n\r\n", command, process_id);
        if let Err(e) = output_channel.send(startup_msg.as_bytes().to_vec()) {
            warn!("Failed to send startup message: {}", e);
        }

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

        // Create shared state for the session
        let status = Arc::new(AtomicU8::new(SessionStatus::Running as u8));
        let exit_code = Arc::new(Mutex::new(None));

        // Clone required data for reader task
        let app_handle = self.app.clone();
        let job_id_clone = job_id.to_string();
        let repo_clone = repo.clone();
        let status_clone = status.clone();
        let exit_code_clone = exit_code.clone();
        let sessions_map = self.sessions.clone();
        let child_arc: Arc<Mutex<Box<dyn Child + Send>>> = Arc::new(Mutex::new(child));
        let child_arc_clone = child_arc.clone();

        // Spawn reader task using spawn_blocking for the blocking PTY read
        let reader_task = tokio::spawn(async move {
            let mut reader = reader;
            
            loop {
                // Use spawn_blocking for the blocking PTY read
                let read_result = tokio::task::spawn_blocking({
                    // Move the reader into the blocking task
                    let mut reader_moved = reader;
                    move || {
                        let mut buffer = [0u8; 8192];
                        let result = reader_moved.read(&mut buffer);
                        (result, buffer, reader_moved)
                    }
                }).await;

                let (read_result, buffer, reader_back) = match read_result {
                    Ok(result) => result,
                    Err(e) => {
                        error!("spawn_blocking failed for job {}: {}", job_id_clone, e);
                        break;
                    }
                };

                // Move reader back for next iteration
                reader = reader_back;

                match read_result {
                    Ok(0) => {
                        debug!("PTY EOF for job {}", job_id_clone);
                        break;
                    }
                    Ok(n) => {
                        let bytes = &buffer[..n];
                        let data = String::from_utf8_lossy(bytes);
                        debug!("Read {} bytes from PTY for job {}: {}", n, job_id_clone, data.trim());
                        
                        // Send raw bytes via Channel
                        if let Err(e) = output_channel.send(bytes.to_vec()) {
                            error!("Failed to send PTY output via channel for job {}: {}", job_id_clone, e);
                        }
                        
                        // Append to database
                        if let Err(e) = repo_clone.append_output_log(&job_id_clone, &data).await {
                            error!("Failed to append PTY output to DB for job {}: {}", job_id_clone, e);
                        }
                    }
                    Err(e) => {
                        error!("Error reading from PTY for job {}: {}", job_id_clone, e);
                        break;
                    }
                }

                // Check if child process has exited
                let wait_result = {
                    let mut child_guard = match child_arc_clone.lock() {
                        Ok(guard) => guard,
                        Err(e) => {
                            error!("Failed to lock child for job {}: {}", job_id_clone, e);
                            break;
                        }
                    };
                    child_guard.try_wait()
                };
                
                match wait_result {
                    Ok(Some(exit_status)) => {
                        let code = if exit_status.success() { Some(0) } else { Some(1) };
                        info!("Process for job {} exited with status: {:?}", job_id_clone, exit_status);
                        
                        // Update status
                        let new_status = if exit_status.success() {
                            SessionStatus::Completed
                        } else {
                            SessionStatus::Failed
                        };
                        status_clone.store(new_status as u8, Ordering::Relaxed);
                        
                        // Store exit code
                        *exit_code_clone.lock().unwrap() = code;
                        
                        // Update DB status
                        let db_status = match new_status {
                            SessionStatus::Completed => "completed",
                            SessionStatus::Failed => "failed",
                            _ => "completed",
                        };
                        
                        if let Ok(Some(session)) = repo_clone.get_session_by_job_id(&job_id_clone).await {
                            let mut updated_session = session;
                            updated_session.status = db_status.to_string();
                            updated_session.exit_code = code.map(|c| c as i64);
                            updated_session.updated_at = chrono::Utc::now().timestamp();
                            
                            if let Err(e) = repo_clone.update_session(&updated_session).await {
                                error!("Failed to update session status in DB for job {}: {}", job_id_clone, e);
                            }
                        }
                        
                        // Emit terminal-exit event
                        let payload = serde_json::json!({
                            "jobId": job_id_clone,
                            "code": code
                        });
                        
                        if let Err(e) = app_handle.emit("terminal-exit", payload) {
                            error!("Failed to emit terminal-exit event for job {}: {}", job_id_clone, e);
                        }
                        
                        // Remove from sessions map after a delay to allow cleanup
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        sessions_map.remove(&job_id_clone);
                        debug!("Cleaned up session for job {}", job_id_clone);
                        break;
                    }
                    Ok(None) => {
                        // Child is still running, continue reading
                        continue;
                    }
                    Err(e) => {
                        error!("Error checking child status for job {}: {}", job_id_clone, e);
                        status_clone.store(SessionStatus::Failed as u8, Ordering::Relaxed);
                        sessions_map.remove(&job_id_clone);
                        break;
                    }
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
            reader_task,
        });

        self.sessions.insert(job_id.to_string(), session_handle);

        info!("Successfully started PTY terminal session for job {}", job_id);
        Ok(())
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
            
            writer_guard.flush()
                .map_err(|e| format!("Failed to flush PTY writer for job {}: {}", job_id, e))?;
            
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
        
        // Emit terminal-exit event with failure code
        let payload = serde_json::json!({
            "jobId": job_id,
            "code": 1
        });
        
        if let Err(e) = window.emit("terminal-exit", payload) {
            error!("Failed to emit terminal-exit event for failed job {}: {}", job_id, e);
        }
    }

    // Helper method to augment PATH with common CLI locations
    fn augment_path(&self, current_path: &str) -> String {
        let additional_paths = if cfg!(target_os = "windows") {
            vec![
                format!("{}\\AppData\\Roaming\\npm", std::env::var("USERPROFILE").unwrap_or_default()),
                "C:\\Program Files\\nodejs".to_string(),
            ]
        } else {
            vec![
                "/usr/local/bin".to_string(),
                "/opt/homebrew/bin".to_string(),
                format!("{}/.npm-global/bin", std::env::var("HOME").unwrap_or_default()),
                format!("{}/.yarn/bin", std::env::var("HOME").unwrap_or_default()),
                format!("{}/.cargo/bin", std::env::var("HOME").unwrap_or_default()),
            ]
        };

        let path_separator = if cfg!(target_os = "windows") { ";" } else { ":" };

        let mut paths: Vec<String> = current_path.split(path_separator).map(|s| s.to_string()).collect();

        for additional_path in additional_paths {
            if !paths.contains(&additional_path) {
                paths.push(additional_path);
            }
        }

        paths.join(path_separator)
    }

    // Helper method to resolve CLI command with fallback probing
    async fn resolve_cli_command(&self, path: &str) -> Option<String> {
        let settings_repo = self.app.state::<Arc<SettingsRepository>>();

        // Try to get preferred CLI from settings
        if let Ok(Some(preferred_cli)) = settings_repo.get_value("terminal.preferred_cli").await {
            if !preferred_cli.trim().is_empty() {
                // Check if it's "custom" - if so, get the custom command
                if preferred_cli == "custom" {
                    if let Ok(Some(custom_cmd)) = settings_repo.get_value("terminal.custom_command").await {
                        if !custom_cmd.trim().is_empty() {
                            if let Ok(_) = which::which_in(&custom_cmd, Some(path), std::env::current_dir().unwrap_or_default()) {
                                return Some(custom_cmd);
                            }
                        }
                    }
                } else {
                    if let Ok(_) = which::which_in(&preferred_cli, Some(path), std::env::current_dir().unwrap_or_default()) {
                        return Some(preferred_cli);
                    }
                }
            }
        }

        // Try environment variable fallback
        if let Ok(env_cli) = std::env::var("CLAUDE_CLI_COMMAND") {
            if !env_cli.trim().is_empty() {
                if let Ok(_) = which::which_in(&env_cli, Some(path), std::env::current_dir().unwrap_or_default()) {
                    return Some(env_cli);
                }
            }
        }

        // Probe common CLIs in order
        let common_clis = ["claude", "cursor", "codex", "gemini"];
        for cli in &common_clis {
            if let Ok(_) = which::which_in(cli, Some(path), std::env::current_dir().unwrap_or_default()) {
                return Some(cli.to_string());
            }
        }

        None
    }
}