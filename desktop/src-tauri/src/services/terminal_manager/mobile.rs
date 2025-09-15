use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, ipc::Channel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionOptions {
    pub working_directory: Option<String>,
    pub environment: Option<HashMap<String, String>>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
}

pub struct TerminalManager {
    app: AppHandle,
}

impl TerminalManager {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub async fn start_session(
        &self,
        _job_id: &str,
        _options: Option<TerminalSessionOptions>,
        _output_channel: Channel<Vec<u8>>,
        _window: tauri::Window,
    ) -> Result<(), String> {
        Err("Terminal sessions are not supported on mobile.".to_string())
    }

    pub async fn write_input(&self, _job_id: &str, _data: Vec<u8>) -> Result<(), String> {
        Err("Terminal sessions are not supported on mobile.".to_string())
    }

    pub async fn send_ctrl_c(&self, _job_id: &str) -> Result<(), String> {
        Err("Terminal sessions are not supported on mobile.".to_string())
    }

    pub async fn resize_session(&self, _job_id: &str, _cols: u16, _rows: u16) -> Result<(), String> {
        Err("Terminal sessions are not supported on mobile.".to_string())
    }

    pub async fn kill_session(&self, _job_id: &str) -> Result<(), String> {
        Err("Terminal sessions are not supported on mobile.".to_string())
    }

    pub async fn get_status(&self, _job_id: &str) -> serde_json::Value {
        serde_json::json!({
            "status": "unavailable",
            "exitCode": null,
            "reason": "Terminal sessions are not supported on mobile platforms"
        })
    }
}