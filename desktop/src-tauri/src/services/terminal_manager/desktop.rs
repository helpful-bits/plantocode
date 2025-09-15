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
    ) -> Result<(), String> {
        // Check if session already exists and return Ok(()) if running
        if let Some(session_handle) = self.sessions.get(job_id) {
            let status = session_handle.status.load(Ordering::Relaxed);
            if status == SessionStatus::Running as u8 {
                info!("Terminal session {} already running", job_id);
                return Ok(());
            }
        }

        info!("Starting terminal session for job_id: {}", job_id);

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

        // Build command for "claude"
        let mut cmd = CommandBuilder::new("claude");
        cmd.cwd(working_dir);

        // Apply environment variables
        for (key, value) in env_vars {
            cmd.env(key, value);
        }

        // Spawn the child process in the PTY
        let child = match pty_pair.slave.spawn_command(cmd) {
            Ok(child) => child,
            Err(e) => {
                let error_msg = format!("Failed to spawn claude process in PTY: {}", e);
                self.mark_session_failed_and_emit(job_id, &window).await;
                return Err(error_msg);
            }
        };

        let process_id = child.process_id();
        debug!("Spawned claude process with PID: {:?}", process_id);

        // Get writer for PTY master
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;
        let writer = Arc::new(Mutex::new(writer));

        // Get reader for PTY master
        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

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
                return Err(format!("Failed to check terminal session in DB: {}", e));
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
}