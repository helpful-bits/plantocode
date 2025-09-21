use crate::db_utils::terminal_sessions_repository::TerminalSessionsRepository;
use crate::error::AppError;
use dashmap::DashMap;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio::time;

// Health status enumeration for terminal sessions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthStatus {
    Healthy,
    NoOutput { duration_secs: u64 },
    ProcessDead { exit_code: Option<i32> },
    Stuck { last_output_secs: u64 },
    Disconnected,
    PersistenceLag { pending_bytes: usize },
}

impl HealthStatus {
    pub fn is_healthy(&self) -> bool {
        matches!(self, HealthStatus::Healthy)
    }

    pub fn requires_recovery(&self) -> bool {
        !self.is_healthy()
    }

    pub fn severity(&self) -> HealthSeverity {
        match self {
            HealthStatus::Healthy => HealthSeverity::Good,
            HealthStatus::NoOutput { duration_secs } => {
                if *duration_secs > 30 {
                    HealthSeverity::Warning
                } else {
                    HealthSeverity::Good
                }
            }
            HealthStatus::ProcessDead { .. } => HealthSeverity::Critical,
            HealthStatus::Stuck { .. } => HealthSeverity::Warning,
            HealthStatus::Disconnected => HealthSeverity::Warning,
            HealthStatus::PersistenceLag { pending_bytes } => {
                if *pending_bytes > 1024 * 1024 {
                    HealthSeverity::Critical
                } else {
                    HealthSeverity::Warning
                }
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthSeverity {
    Good,
    Warning,
    Critical,
}

// Recovery actions that can be performed
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryAction {
    SendPrompt,
    Interrupt,
    Restart,
    Reattach,
    FlushPersistence,
    None,
}

impl RecoveryAction {
    pub fn for_health_status(status: HealthStatus) -> Self {
        match status {
            HealthStatus::Healthy => RecoveryAction::None,
            HealthStatus::NoOutput { .. } => RecoveryAction::SendPrompt,
            HealthStatus::ProcessDead { .. } => RecoveryAction::Restart,
            HealthStatus::Stuck { .. } => RecoveryAction::Interrupt,
            HealthStatus::Disconnected => RecoveryAction::Reattach,
            HealthStatus::PersistenceLag { .. } => RecoveryAction::FlushPersistence,
        }
    }
}

// Health check result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResult {
    pub job_id: String,
    pub status: HealthStatus,
    pub last_check: i64,
    pub recovery_attempts: u32,
    pub last_recovery_attempt: Option<i64>,
    pub process_alive: bool,
    pub last_output_at: Option<i64>,
    pub output_channel_active: bool,
    pub persistence_queue_size: usize,
}

// Health history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthHistoryEntry {
    pub timestamp: i64,
    pub status: HealthStatus,
    pub recovery_action: Option<RecoveryAction>,
}

// Internal health state tracking
#[derive(Debug)]
struct SessionHealthState {
    last_output_time: Arc<Mutex<Option<Instant>>>,
    last_check_time: Instant,
    recovery_attempts: u32,
    last_recovery_attempt: Option<Instant>,
    health_history: Vec<HealthHistoryEntry>,
    is_recovering: AtomicBool,
}

impl Default for SessionHealthState {
    fn default() -> Self {
        Self {
            last_output_time: Arc::new(Mutex::new(Some(Instant::now()))),
            last_check_time: Instant::now(),
            recovery_attempts: 0,
            last_recovery_attempt: None,
            health_history: Vec::new(),
            is_recovering: AtomicBool::new(false),
        }
    }
}

// Main terminal health monitor
pub struct TerminalHealthMonitor {
    app: AppHandle,
    session_health: Arc<DashMap<String, SessionHealthState>>,
    is_running: Arc<AtomicBool>,
    _health_check_task: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl TerminalHealthMonitor {
    pub fn new(app: AppHandle) -> Self {
        let session_health = Arc::new(DashMap::new());
        let is_running = Arc::new(AtomicBool::new(true));

        // Start health monitoring task
        let sessions_for_task = session_health.clone();
        let app_for_task = app.clone();
        let is_running_for_task = is_running.clone();

        let health_check_task = tauri::async_runtime::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(5));

            while is_running_for_task.load(Ordering::Relaxed) {
                interval.tick().await;

                // Perform health checks on all sessions
                Self::run_health_checks(
                    &app_for_task,
                    &sessions_for_task,
                ).await;
            }
        });

        Self {
            app,
            session_health,
            is_running,
            _health_check_task: Some(health_check_task),
        }
    }

    // Register a new terminal session for health monitoring
    pub fn register_session(&self, job_id: &str) {
        info!("Registering terminal session {} for health monitoring", job_id);

        let mut health_state = SessionHealthState::default();
        health_state.last_output_time = Arc::new(Mutex::new(Some(Instant::now())));

        self.session_health.insert(job_id.to_string(), health_state);

        // Emit health registration event
        let _ = self.app.emit("terminal-health:registered", serde_json::json!({
            "jobId": job_id,
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        }));
    }

    // Unregister a terminal session from health monitoring
    pub fn unregister_session(&self, job_id: &str) {
        info!("Unregistering terminal session {} from health monitoring", job_id);

        self.session_health.remove(job_id);

        // Emit health unregistration event
        let _ = self.app.emit("terminal-health:unregistered", serde_json::json!({
            "jobId": job_id,
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        }));
    }

    // Update last output time for a session
    pub fn update_output_time(&self, job_id: &str) {
        if let Some(health_state) = self.session_health.get(job_id) {
            if let Ok(mut last_output) = health_state.last_output_time.lock() {
                *last_output = Some(Instant::now());
            }
        }
    }

    // Get current health status for a session
    pub async fn get_health_status(&self, job_id: &str) -> Result<HealthCheckResult, AppError> {
        if let Some(health_state) = self.session_health.get(job_id) {
            let health_status = self.check_session_health(job_id, &health_state).await;

            Ok(HealthCheckResult {
                job_id: job_id.to_string(),
                status: health_status,
                last_check: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64,
                recovery_attempts: health_state.recovery_attempts,
                last_recovery_attempt: health_state.last_recovery_attempt
                    .map(|instant| instant.elapsed().as_secs() as i64),
                process_alive: self.is_process_alive(job_id).await,
                last_output_at: {
                    let last_output_elapsed = health_state.last_output_time.lock().unwrap()
                        .map(|instant| instant.elapsed().as_secs() as i64);
                    last_output_elapsed
                },
                output_channel_active: self.is_output_channel_active(job_id).await,
                persistence_queue_size: self.get_persistence_queue_size(job_id).await,
            })
        } else {
            Err(AppError::TerminalError(format!("Session {} not registered for health monitoring", job_id)))
        }
    }

    // Get health history for a session
    pub fn get_health_history(&self, job_id: &str) -> Result<Vec<HealthHistoryEntry>, AppError> {
        if let Some(health_state) = self.session_health.get(job_id) {
            Ok(health_state.health_history.clone())
        } else {
            Err(AppError::TerminalError(format!("Session {} not registered for health monitoring", job_id)))
        }
    }

    // Main health check routine that runs every 5 seconds
    async fn run_health_checks(
        app: &AppHandle,
        session_health: &DashMap<String, SessionHealthState>,
    ) {
        let mut unhealthy_sessions = Vec::new();

        // Check health of all registered sessions
        for entry in session_health.iter() {
            let (job_id, health_state) = entry.pair();

            let monitor = Self {
                app: app.clone(),
                session_health: Arc::new(DashMap::new()),
                is_running: Arc::new(AtomicBool::new(true)),
                _health_check_task: None,
            };

            let health_status = monitor.check_session_health(job_id, health_state).await;

            if !health_status.is_healthy() {
                unhealthy_sessions.push((job_id.clone(), health_status));
            }

            // Update health history
            if let Some(mut health_state) = session_health.get_mut(job_id) {
                let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

                health_state.health_history.push(HealthHistoryEntry {
                    timestamp,
                    status: health_status,
                    recovery_action: None,
                });

                // Keep only last 10 entries
                if health_state.health_history.len() > 10 {
                    health_state.health_history.remove(0);
                }

                health_state.last_check_time = Instant::now();
            }
        }

        // Perform auto-recovery on unhealthy sessions
        for (job_id, health_status) in unhealthy_sessions {
            if let Some(health_state) = session_health.get(&job_id) {
                if !health_state.is_recovering.load(Ordering::Relaxed) {
                    let monitor = Self {
                        app: app.clone(),
                        session_health: Arc::new(DashMap::new()),
                        is_running: Arc::new(AtomicBool::new(true)),
                        _health_check_task: None,
                    };

                    monitor.auto_recover(&job_id, health_status).await;
                }
            }
        }
    }

    // Check health of a specific session
    async fn check_session_health(&self, job_id: &str, health_state: &SessionHealthState) -> HealthStatus {
        // Check if process is alive
        if !self.is_process_alive(job_id).await {
            return HealthStatus::ProcessDead { exit_code: self.get_exit_code(job_id).await };
        }

        // Check output channel
        if !self.is_output_channel_active(job_id).await {
            return HealthStatus::Disconnected;
        }

        // Check persistence lag
        let persistence_size = self.get_persistence_queue_size(job_id).await;
        if persistence_size > 1024 * 1024 {
            return HealthStatus::PersistenceLag { pending_bytes: persistence_size };
        }

        // Check for no output
        if let Ok(last_output) = health_state.last_output_time.lock() {
            if let Some(last_time) = *last_output {
                let duration = last_time.elapsed();
                if duration > Duration::from_secs(30) {
                    if duration > Duration::from_secs(300) {
                        return HealthStatus::Stuck { last_output_secs: duration.as_secs() };
                    } else {
                        return HealthStatus::NoOutput { duration_secs: duration.as_secs() };
                    }
                }
            }
        }

        HealthStatus::Healthy
    }

    // Auto-recovery logic
    async fn auto_recover(&self, job_id: &str, health_status: HealthStatus) {
        let recovery_action = RecoveryAction::for_health_status(health_status);

        if recovery_action == RecoveryAction::None {
            return;
        }

        info!("Starting auto-recovery for session {} with action {:?}", job_id, recovery_action);

        // Mark as recovering
        if let Some(health_state) = self.session_health.get(job_id) {
            health_state.is_recovering.store(true, Ordering::Relaxed);
        }

        // Emit recovery start event
        let _ = self.app.emit("terminal-health:recovery-start", serde_json::json!({
            "jobId": job_id,
            "action": recovery_action,
            "status": health_status,
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        }));

        let recovery_result = match recovery_action {
            RecoveryAction::SendPrompt => self.send_prompt_recovery(job_id).await,
            RecoveryAction::Interrupt => self.interrupt_recovery(job_id).await,
            RecoveryAction::Restart => self.restart_recovery(job_id).await,
            RecoveryAction::Reattach => self.reattach_recovery(job_id).await,
            RecoveryAction::FlushPersistence => self.flush_persistence_recovery(job_id).await,
            RecoveryAction::None => Ok(()),
        };

        // Update recovery tracking
        if let Some(mut health_state) = self.session_health.get_mut(job_id) {
            health_state.recovery_attempts += 1;
            health_state.last_recovery_attempt = Some(Instant::now());
            health_state.is_recovering.store(false, Ordering::Relaxed);

            // Update health history with recovery action
            if let Some(last_entry) = health_state.health_history.last_mut() {
                last_entry.recovery_action = Some(recovery_action);
            }
        }

        // Emit recovery result event
        let _ = self.app.emit("terminal-health:recovery-result", serde_json::json!({
            "jobId": job_id,
            "action": recovery_action,
            "success": recovery_result.is_ok(),
            "error": recovery_result.as_ref().err().map(|e| e.to_string()),
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        }));

        match recovery_result {
            Ok(_) => info!("Auto-recovery successful for session {} with action {:?}", job_id, recovery_action),
            Err(e) => warn!("Auto-recovery failed for session {} with action {:?}: {}", job_id, recovery_action, e),
        }
    }

    // Recovery actions
    async fn send_prompt_recovery(&self, job_id: &str) -> Result<(), AppError> {
        debug!("Sending prompt recovery for session {}", job_id);

        // Get terminal manager from app state
        let terminal_manager = self.app.state::<Arc<crate::services::TerminalManager>>();

        // Send Enter key followed by a probe command
        terminal_manager.write_input(job_id, b"\r".to_vec()).await
            .map_err(|e| AppError::TerminalError(format!("Failed to send prompt: {}", e)))?;

        // Wait a moment then send a probe command
        tokio::time::sleep(Duration::from_millis(100)).await;

        terminal_manager.write_input(job_id, b"echo 'alive'\r".to_vec()).await
            .map_err(|e| AppError::TerminalError(format!("Failed to send probe command: {}", e)))?;

        Ok(())
    }

    async fn interrupt_recovery(&self, job_id: &str) -> Result<(), AppError> {
        debug!("Sending interrupt recovery for session {}", job_id);

        let terminal_manager = self.app.state::<Arc<crate::services::TerminalManager>>();

        // Send Ctrl+C
        terminal_manager.send_ctrl_c(job_id).await
            .map_err(|e| AppError::TerminalError(format!("Failed to send Ctrl+C: {}", e)))?;

        // Wait and check if process is still stuck
        tokio::time::sleep(Duration::from_secs(1)).await;

        if !self.is_process_alive(job_id).await {
            // If process died, restart it
            self.restart_recovery(job_id).await?;
        }

        Ok(())
    }

    async fn restart_recovery(&self, job_id: &str) -> Result<(), AppError> {
        warn!("Restarting dead session {}", job_id);

        let terminal_manager = self.app.state::<Arc<crate::services::TerminalManager>>();

        // Kill existing session
        if let Err(e) = terminal_manager.kill_session(job_id).await {
            warn!("Failed to kill session {} during restart: {}", job_id, e);
        }

        // Wait a moment for cleanup
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Start new session (this would require refactoring to get the original options)
        // For now, we'll mark the session as needing manual restart
        warn!("Session {} requires manual restart", job_id);

        Ok(())
    }

    async fn reattach_recovery(&self, job_id: &str) -> Result<(), AppError> {
        debug!("Reattaching disconnected session {}", job_id);

        // This would involve recreating the output channels
        // Implementation depends on the terminal manager's architecture
        warn!("Session {} output channel disconnected - manual reattachment required", job_id);

        Ok(())
    }

    async fn flush_persistence_recovery(&self, job_id: &str) -> Result<(), AppError> {
        debug!("Flushing persistence for session {}", job_id);

        // Force synchronous flush of the persistence queue
        // This would require access to the persistence worker
        warn!("Persistence lag detected for session {} - considering flush", job_id);

        Ok(())
    }

    // Helper methods to check session state
    async fn is_process_alive(&self, job_id: &str) -> bool {
        let terminal_manager = self.app.state::<Arc<crate::services::TerminalManager>>();
        let status = terminal_manager.get_status(job_id).await;
        status.get("status").and_then(|s| s.as_str()) == Some("running")
    }

    async fn get_exit_code(&self, job_id: &str) -> Option<i32> {
        let terminal_manager = self.app.state::<Arc<crate::services::TerminalManager>>();
        let status = terminal_manager.get_status(job_id).await;
        status.get("exitCode").and_then(|c| c.as_i64()).map(|c| c as i32)
    }

    async fn is_output_channel_active(&self, _job_id: &str) -> bool {
        // This would check if the output channel is still active
        // For now, assume it's active if the process is alive
        true
    }

    async fn get_persistence_queue_size(&self, _job_id: &str) -> usize {
        // This would check the size of the persistence queue
        // For now, return 0 (no lag)
        0
    }
}

impl Drop for TerminalHealthMonitor {
    fn drop(&mut self) {
        self.is_running.store(false, Ordering::Relaxed);
    }
}