use crate::db_utils::terminal_sessions_repository::TerminalSessionsRepository;
use crate::error::AppError;
use dashmap::DashMap;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
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
    AgentRequiresAttention { last_output_secs: u64 },
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
            HealthStatus::AgentRequiresAttention { .. } => HealthSeverity::Warning,
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
            HealthStatus::AgentRequiresAttention { .. } => RecoveryAction::Interrupt,
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
                process_alive: self.is_process_alive_instance(job_id).await,
                last_output_at: {
                    let last_output_elapsed = health_state.last_output_time.lock().unwrap()
                        .map(|instant| instant.elapsed().as_secs() as i64);
                    last_output_elapsed
                },
                output_channel_active: self.is_output_channel_active_instance(job_id).await,
                persistence_queue_size: self.get_persistence_queue_size_instance(job_id).await,
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

            let health_status = Self::check_session_health_static(app, job_id, health_state).await;

            // Persist status changes to DB
            if let Some(repo) = app.try_state::<Arc<TerminalSessionsRepository>>() {
                match health_status {
                    HealthStatus::ProcessDead { exit_code } => {
                        if let Err(e) = repo.update_session_status_by_job_id(job_id, "failed", exit_code.map(|v| v.into())).await {
                            warn!("Failed to update session status for {}: {}", job_id, e);
                        }
                    }
                    HealthStatus::AgentRequiresAttention { .. } => {
                        if let Err(e) = repo.update_session_status_by_job_id(job_id, "agent_requires_attention", None).await {
                            warn!("Failed to update session status for {}: {}", job_id, e);
                        }
                    }
                    _ => {}
                }
            }

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
                    if let Err(e) = Self::auto_recover_static(app, session_health, &job_id, health_status).await {
                        warn!("Auto-recovery failed for session {}: {}", job_id, e);
                    }
                }
            }
        }
    }

    // Check health of a specific session
    async fn check_session_health(&self, job_id: &str, health_state: &SessionHealthState) -> HealthStatus {
        Self::check_session_health_static(&self.app, job_id, health_state).await
    }

    // Auto-recovery logic
    async fn auto_recover(&self, job_id: &str, health_status: HealthStatus) {
        if let Err(e) = Self::auto_recover_static(&self.app, &self.session_health, job_id, health_status).await {
            warn!("Auto-recovery failed for session {}: {}", job_id, e);
        }
    }

    // Recovery actions - delegate to static methods
    async fn send_prompt_recovery(&self, job_id: &str) -> Result<(), AppError> {
        Self::send_prompt_recovery_static(&self.app, job_id).await
    }

    async fn interrupt_recovery(&self, job_id: &str) -> Result<(), AppError> {
        Self::interrupt_recovery_static(&self.app, job_id).await
    }

    async fn restart_recovery(&self, job_id: &str) -> Result<(), AppError> {
        Self::restart_recovery_static(&self.app, job_id).await
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

    // Static helper methods to check session state
    pub async fn is_process_alive(app: &AppHandle, job_id: &str) -> bool {
        let terminal_manager = app.state::<Arc<crate::services::TerminalManager>>();
        let status = terminal_manager.get_status(job_id).await;
        status.get("status").and_then(|s| s.as_str()) == Some("running")
    }

    pub async fn get_exit_code(app: &AppHandle, job_id: &str) -> Option<i32> {
        let terminal_manager = app.state::<Arc<crate::services::TerminalManager>>();
        let status = terminal_manager.get_status(job_id).await;
        status.get("exitCode").and_then(|c| c.as_i64()).map(|c| c as i32)
    }

    pub fn is_output_channel_active(app: &AppHandle, job_id: &str) -> bool {
        let tm = app.state::<Arc<crate::services::TerminalManager>>().inner().clone();
        tm.get_client_count(job_id) > 0
    }

    pub fn get_persistence_queue_size(app: &AppHandle, _job_id: &str) -> usize {
        0
    }

    pub async fn check_session_health_static(app: &AppHandle, job_id: &str, health_state: &SessionHealthState) -> HealthStatus {
        if !Self::is_process_alive(app, job_id).await {
            return HealthStatus::ProcessDead { exit_code: Self::get_exit_code(app, job_id).await };
        }

        if !Self::is_output_channel_active(app, job_id) {
            return HealthStatus::Disconnected;
        }

        let persistence_size = Self::get_persistence_queue_size(app, job_id);
        if persistence_size > 1024 * 1024 {
            return HealthStatus::PersistenceLag { pending_bytes: persistence_size };
        }

        if let Ok(last_output) = health_state.last_output_time.lock() {
            if let Some(last_time) = *last_output {
                let duration = last_time.elapsed();
                if duration > Duration::from_secs(30) {
                    if duration > Duration::from_secs(300) {
                        return HealthStatus::AgentRequiresAttention { last_output_secs: duration.as_secs() };
                    } else {
                        return HealthStatus::NoOutput { duration_secs: duration.as_secs() };
                    }
                }
            }
        }

        HealthStatus::Healthy
    }

    pub async fn auto_recover_static(app: &AppHandle, session_health: &DashMap<String, SessionHealthState>, job_id: &str, status: HealthStatus) -> crate::error::AppResult<()> {
        let recovery_action = RecoveryAction::for_health_status(status);

        if recovery_action == RecoveryAction::None {
            return Ok(());
        }

        info!("Starting auto-recovery for session {} with action {:?}", job_id, recovery_action);

        if let Some(health_state) = session_health.get(job_id) {
            health_state.is_recovering.store(true, Ordering::Relaxed);
        }

        let _ = app.emit("terminal-health:recovery-start", serde_json::json!({
            "jobId": job_id,
            "action": recovery_action,
            "status": status,
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        }));

        let recovery_result = match recovery_action {
            RecoveryAction::SendPrompt => Self::send_prompt_recovery_static(app, job_id).await,
            RecoveryAction::Interrupt => Self::interrupt_recovery_static(app, job_id).await,
            RecoveryAction::Restart => Self::restart_recovery_static(app, job_id).await,
            _ => Ok(()),
        };

        if let Some(mut health_state) = session_health.get_mut(job_id) {
            health_state.recovery_attempts += 1;
            health_state.last_recovery_attempt = Some(Instant::now());
            health_state.is_recovering.store(false, Ordering::Relaxed);

            if let Some(last_entry) = health_state.health_history.last_mut() {
                last_entry.recovery_action = Some(recovery_action);
            }
        }

        let _ = app.emit("terminal-health:recovery-result", serde_json::json!({
            "jobId": job_id,
            "action": recovery_action,
            "success": recovery_result.is_ok(),
            "error": recovery_result.as_ref().err().map(|e| e.to_string()),
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        }));

        match recovery_result {
            Ok(_) => info!("Auto-recovery successful for session {} with action {:?}", job_id, recovery_action),
            Err(ref e) => warn!("Auto-recovery failed for session {} with action {:?}: {}", job_id, recovery_action, e),
        }

        recovery_result
    }

    pub async fn send_prompt_recovery_static(app: &AppHandle, job_id: &str) -> Result<(), AppError> {
        debug!("Sending prompt recovery for session {}", job_id);

        // Get terminal manager from app state
        let terminal_manager = app.state::<Arc<crate::services::TerminalManager>>();

        // Send Enter key followed by a probe command
        terminal_manager.write_input(job_id, b"\r".to_vec()).await
            .map_err(|e| AppError::TerminalError(format!("Failed to send prompt: {}", e)))?;

        // Wait a moment then send a probe command
        tokio::time::sleep(Duration::from_millis(100)).await;

        terminal_manager.write_input(job_id, b"echo 'alive'\r".to_vec()).await
            .map_err(|e| AppError::TerminalError(format!("Failed to send probe command: {}", e)))?;

        Ok(())
    }

    pub async fn interrupt_recovery_static(app: &AppHandle, job_id: &str) -> Result<(), AppError> {
        debug!("Sending interrupt recovery for session {}", job_id);

        let terminal_manager = app.state::<Arc<crate::services::TerminalManager>>();

        // Send Ctrl+C
        terminal_manager.send_ctrl_c(job_id).await
            .map_err(|e| AppError::TerminalError(format!("Failed to send Ctrl+C: {}", e)))?;

        // Wait and check if process still requires attention
        tokio::time::sleep(Duration::from_secs(1)).await;

        if !Self::is_process_alive(app, job_id).await {
            // If process died, restart it
            Self::restart_recovery_static(app, job_id).await?;
        }

        Ok(())
    }

    pub async fn restart_recovery_static(app: &AppHandle, job_id: &str) -> Result<(), AppError> {
        warn!("Restarting dead session {}", job_id);

        let terminal_manager = app.state::<Arc<crate::services::TerminalManager>>();

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

    // Instance methods that delegate to static versions
    async fn is_process_alive_instance(&self, job_id: &str) -> bool {
        Self::is_process_alive(&self.app, job_id).await
    }

    async fn get_exit_code_instance(&self, job_id: &str) -> Option<i32> {
        Self::get_exit_code(&self.app, job_id).await
    }

    async fn is_output_channel_active_instance(&self, job_id: &str) -> bool {
        Self::is_output_channel_active(&self.app, job_id)
    }

    async fn get_persistence_queue_size_instance(&self, job_id: &str) -> usize {
        Self::get_persistence_queue_size(&self.app, job_id)
    }
}

impl Drop for TerminalHealthMonitor {
    fn drop(&mut self) {
        self.is_running.store(false, Ordering::Relaxed);
    }
}