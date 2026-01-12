use async_trait::async_trait;
use futures::Stream;
use log::warn;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::pin::Pin;
use std::process::{Command, Stdio};
use std::thread;
use tauri::AppHandle;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::error::{AppError, AppResult};
use crate::models::stream_event::StreamEvent;
use crate::models::{
    CodexCliSettings, OpenRouterChoice, OpenRouterDelta, OpenRouterRequestMessage,
    OpenRouterResponse,
    OpenRouterResponseMessage, OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterUsage,
};
use crate::utils::config_helpers::get_runtime_ai_config_from_cache;
use crate::utils::get_timestamp;

#[derive(Debug)]
pub struct CodexCliClient {
    app_handle: AppHandle,
}

impl CodexCliClient {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn normalize_model_name(model: &str) -> String {
        let lower = model.to_lowercase();
        if lower.starts_with("openai/") || lower.starts_with("openai:") {
            return model[7..].to_string();
        }

        model.to_string()
    }

    fn normalize_config_value(value: Option<&str>) -> Option<String> {
        value
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string())
    }

    fn map_model_for_codex(model: &str, settings: Option<&CodexCliSettings>) -> String {
        let normalized = Self::normalize_model_name(model);
        let lower = normalized.to_lowercase();
        if lower.contains("codex") {
            return normalized;
        }

        if let Some(config) = settings {
            if let Some(overrides) = config.model_overrides.as_ref() {
                let override_value = overrides
                    .get(model)
                    .or_else(|| overrides.get(&normalized))
                    .and_then(|value| Self::normalize_config_value(Some(value.as_str())));
                if let Some(mapped) = override_value {
                    return mapped;
                }
            }

            let is_mini = lower.contains("mini") || lower.contains("nano");
            if is_mini {
                if let Some(mapped) =
                    Self::normalize_config_value(config.mini_model.as_deref())
                {
                    return mapped;
                }
            } else if let Some(mapped) =
                Self::normalize_config_value(config.preferred_model.as_deref())
            {
                return mapped;
            }

            if let Some(mapped) =
                Self::normalize_config_value(config.fallback_model.as_deref())
            {
                return mapped;
            }
        }

        if lower.contains("mini") || lower.contains("nano") {
            return "gpt-5.1-codex-mini".to_string();
        }

        "gpt-5.2-codex".to_string()
    }

    fn reasoning_effort_for_model(
        model: &str,
        settings: Option<&CodexCliSettings>,
    ) -> Option<String> {
        let lower = model.to_lowercase();
        let is_mini = lower.contains("mini") || lower.contains("nano");
        let configured = settings.and_then(|config| {
            let value = if is_mini {
                config.mini_reasoning_effort.as_deref()
            } else {
                config.reasoning_effort.as_deref()
            };
            Self::normalize_config_value(value)
        });
        if configured.is_some() {
            return configured;
        }

        if is_mini {
            None
        } else {
            Some("xhigh".to_string())
        }
    }

    async fn get_codex_cli_settings(&self) -> Option<CodexCliSettings> {
        match get_runtime_ai_config_from_cache(&self.app_handle).await {
            Ok(config) => config.codex_cli,
            Err(err) => {
                warn!("Failed to load Codex CLI config from runtime settings: {}", err);
                None
            }
        }
    }

    async fn resolve_codex_cli_model(
        &self,
        model: &str,
    ) -> (String, Option<String>) {
        let settings = self.get_codex_cli_settings().await;
        let model_cli = Self::map_model_for_codex(model, settings.as_ref());
        let reasoning_effort = Self::reasoning_effort_for_model(&model_cli, settings.as_ref());
        (model_cli, reasoning_effort)
    }

    fn extract_event_kind(value: &Value) -> Option<&str> {
        value
            .get("type")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("event").and_then(|v| v.as_str()))
    }

    fn extract_text_from_content(value: &Value) -> Option<String> {
        match value {
            Value::String(text) => Some(text.to_string()),
            Value::Array(items) => {
                let mut combined = String::new();
                for item in items {
                    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                        combined.push_str(text);
                        continue;
                    }
                    if let Some(text) = item.get("content").and_then(|v| v.as_str()) {
                        combined.push_str(text);
                        continue;
                    }
                    if let Some(text) = Self::extract_text_from_value(item) {
                        combined.push_str(&text);
                    }
                }
                if combined.is_empty() {
                    None
                } else {
                    Some(combined)
                }
            }
            Value::Object(_) => Self::extract_text_from_value(value),
            _ => None,
        }
    }

    fn extract_text_from_value(value: &Value) -> Option<String> {
        match value {
            Value::String(text) => Some(text.to_string()),
            Value::Array(items) => {
                let mut combined = String::new();
                for item in items {
                    if let Some(text) = Self::extract_text_from_value(item) {
                        combined.push_str(&text);
                    }
                }
                if combined.is_empty() {
                    None
                } else {
                    Some(combined)
                }
            }
            Value::Object(map) => {
                if let Some(delta) = map.get("delta").and_then(|v| v.as_str()) {
                    return Some(delta.to_string());
                }
                if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                    return Some(text.to_string());
                }
                if let Some(content) = map.get("content") {
                    if let Some(text) = Self::extract_text_from_content(content) {
                        return Some(text);
                    }
                }
                if let Some(message) = map.get("message") {
                    if let Some(text) = Self::extract_text_from_value(message) {
                        return Some(text);
                    }
                }
                if let Some(data) = map.get("data") {
                    if let Some(text) = Self::extract_text_from_value(data) {
                        return Some(text);
                    }
                }
                if let Some(response) = map.get("response") {
                    if let Some(text) = Self::extract_text_from_value(response) {
                        return Some(text);
                    }
                }
                if let Some(output) = map.get("output") {
                    if let Some(text) = Self::extract_text_from_value(output) {
                        return Some(text);
                    }
                }
                None
            }
            _ => None,
        }
    }

    fn build_prompt(messages: &[OpenRouterRequestMessage]) -> String {
        let mut prompt = String::new();

        for message in messages {
            let role_label = message.role.to_uppercase();
            prompt.push_str(&role_label);
            prompt.push_str(":\n");

            for content in &message.content {
                match content {
                    crate::models::OpenRouterContent::Text { text, .. } => {
                        prompt.push_str(text);
                    }
                    crate::models::OpenRouterContent::Image { image_url, .. } => {
                        prompt.push_str("[image: ");
                        prompt.push_str(&image_url.url);
                        prompt.push_str("]");
                    }
                }
            }

            prompt.push_str("\n\n");
        }

        prompt.trim_end().to_string()
    }

    async fn run_codex_cli(
        &self,
        prompt: &str,
        model_cli: String,
        reasoning_effort: Option<String>,
        max_tokens: u32,
    ) -> AppResult<String> {
        if which::which("codex").is_err() {
            return Err(AppError::ExternalServiceError(
                "Codex CLI not found in PATH. Install @openai/codex and ensure it is available."
                    .to_string(),
            ));
        }

        let prompt = prompt.to_string();
        tokio::task::spawn_blocking(move || {
            let output_path = std::env::temp_dir()
                .join(format!("codex_cli_{}.txt", Uuid::new_v4()));

            let mut cmd = Command::new("codex");
            cmd.arg("exec")
                .arg("--output-last-message")
                .arg(&output_path)
                .arg("--color")
                .arg("never")
                .arg("--skip-git-repo-check")
                .arg("--model")
                .arg(&model_cli)
                .arg("-")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            if let Some(effort) = reasoning_effort.as_deref() {
                cmd.arg("-c")
                    .arg(format!("model_reasoning_effort=\"{}\"", effort));
            }
            cmd.arg("-c").arg(format!("max_output_tokens={}", max_tokens));

            if !cfg!(windows) {
                cmd.env("NO_COLOR", "1");
            }

            let mut child = cmd
                .spawn()
                .map_err(|e| AppError::ExternalServiceError(format!("Failed to spawn Codex CLI: {}", e)))?;

            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(prompt.as_bytes())
                    .map_err(|e| AppError::ExternalServiceError(format!("Failed to write prompt: {}", e)))?;
                stdin
                    .write_all(b"\n")
                    .map_err(|e| AppError::ExternalServiceError(format!("Failed to finalize prompt: {}", e)))?;
            }

            let output = child.wait_with_output().map_err(|e| {
                AppError::ExternalServiceError(format!("Failed to wait for Codex CLI: {}", e))
            })?;

            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let response = fs::read_to_string(&output_path).unwrap_or_default();
            let _ = fs::remove_file(&output_path);
            let response = response.trim().to_string();

            if !output.status.success() {
                let detail = if !stderr.is_empty() { stderr } else { stdout };
                let code = output.status.code().unwrap_or(-1);
                return Err(AppError::ExternalServiceError(format!(
                    "Codex CLI failed (exit code {}): {}",
                    code, detail
                )));
            }

            if response.is_empty() {
                let detail = if !stderr.is_empty() { stderr } else { stdout };
                return Err(AppError::ExternalServiceError(format!(
                    "Codex CLI returned an empty response. {}",
                    detail
                )));
            }

            Ok(response)
        })
        .await
        .map_err(|e| {
            AppError::ExternalServiceError(format!("Codex CLI task failed: {}", e))
        })?
    }

    fn run_codex_cli_streaming(
        prompt: String,
        model_cli: String,
        model_label: String,
        request_id: String,
        reasoning_effort: Option<String>,
        max_tokens: u32,
        sender: mpsc::Sender<AppResult<StreamEvent>>,
    ) -> AppResult<()> {
        if which::which("codex").is_err() {
            return Err(AppError::ExternalServiceError(
                "Codex CLI not found in PATH. Install @openai/codex and ensure it is available."
                    .to_string(),
            ));
        }

        let output_path = std::env::temp_dir().join(format!("codex_cli_{}.txt", Uuid::new_v4()));

        let mut cmd = Command::new("codex");
        cmd.arg("exec")
            .arg("--json")
            .arg("--output-last-message")
            .arg(&output_path)
            .arg("--color")
            .arg("never")
            .arg("--skip-git-repo-check")
            .arg("--model")
            .arg(&model_cli)
            .arg("-")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(effort) = reasoning_effort.as_deref() {
            cmd.arg("-c")
                .arg(format!("model_reasoning_effort=\"{}\"", effort));
        }
        cmd.arg("-c").arg(format!("max_output_tokens={}", max_tokens));

        if !cfg!(windows) {
            cmd.env("NO_COLOR", "1");
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::ExternalServiceError(format!("Failed to spawn Codex CLI: {}", e)))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(prompt.as_bytes())
                .map_err(|e| AppError::ExternalServiceError(format!("Failed to write prompt: {}", e)))?;
            stdin
                .write_all(b"\n")
                .map_err(|e| AppError::ExternalServiceError(format!("Failed to finalize prompt: {}", e)))?;
        }

        let stdout = child.stdout.take().ok_or_else(|| {
            AppError::ExternalServiceError("Failed to capture Codex CLI stdout.".to_string())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            AppError::ExternalServiceError("Failed to capture Codex CLI stderr.".to_string())
        })?;

        let stderr_handle = thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut buffer = String::new();
            let _ = reader.read_to_string(&mut buffer);
            buffer
        });

        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let mut accumulated = String::new();
        let mut streamed_any = false;
        let mut role_sent = false;
        let mut final_text_from_event: Option<String> = None;
        let mut error_message: Option<String> = None;
        let mut raw_output = String::new();

        loop {
            line.clear();
            let bytes = reader
                .read_line(&mut line)
                .map_err(|e| AppError::ExternalServiceError(format!("Failed reading Codex CLI output: {}", e)))?;
            if bytes == 0 {
                break;
            }

            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                continue;
            }

            let cleaned = trimmed.strip_prefix("data: ").unwrap_or(trimmed);
            if cleaned == "[DONE]" {
                break;
            }

            match serde_json::from_str::<Value>(cleaned) {
                Ok(value) => {
                    let event_kind = Self::extract_event_kind(&value).unwrap_or("").to_lowercase();
                    if event_kind == "agentmessage" || event_kind == "agent_message" {
                        let content = value
                            .get("content")
                            .and_then(|v| {
                                if v.is_string() {
                                    v.as_str().map(|s| s.to_string())
                                } else {
                                    Self::extract_text_from_content(v)
                                }
                            })
                            .or_else(|| Self::extract_text_from_value(&value));
                        let partial = value
                            .get("partial")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        if let Some(delta) = content {
                            if !delta.is_empty() {
                                if partial || !streamed_any {
                                    streamed_any = true;
                                    accumulated.push_str(&delta);
                                    let chunk = OpenRouterStreamChunk {
                                        id: format!("codex_cli_{}", request_id),
                                        choices: vec![OpenRouterStreamChoice {
                                            delta: OpenRouterDelta {
                                                role: if role_sent {
                                                    None
                                                } else {
                                                    Some("assistant".to_string())
                                                },
                                                content: Some(delta.clone()),
                                            },
                                            index: 0,
                                            finish_reason: None,
                                        }],
                                        created: Some(get_timestamp()),
                                        model: model_label.clone(),
                                        object: Some("chat.completion.chunk".to_string()),
                                        usage: None,
                                    };
                                    role_sent = true;
                                    let _ =
                                        sender.blocking_send(Ok(StreamEvent::ContentChunk(chunk)));
                                }
                                if !partial {
                                    final_text_from_event = Some(delta);
                                }
                            }
                        }
                        continue;
                    }
                    if event_kind == "reasoning" {
                        continue;
                    }
                    if event_kind == "error" {
                        error_message = value
                            .get("message")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .or_else(|| {
                                value
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            })
                            .or_else(|| Some("Codex CLI returned an error event.".to_string()));
                        break;
                    }

                    let is_delta = event_kind.contains("delta")
                        || event_kind.contains("chunk")
                        || value.get("delta").is_some();
                    let is_done = event_kind.contains("done") || event_kind.contains("completed");

                    if is_delta {
                        if let Some(delta) = Self::extract_text_from_value(&value) {
                            if !delta.is_empty() {
                                streamed_any = true;
                                accumulated.push_str(&delta);
                                let chunk = OpenRouterStreamChunk {
                                    id: format!("codex_cli_{}", request_id),
                                    choices: vec![OpenRouterStreamChoice {
                                        delta: OpenRouterDelta {
                                            role: if role_sent {
                                                None
                                            } else {
                                                Some("assistant".to_string())
                                            },
                                            content: Some(delta),
                                        },
                                        index: 0,
                                        finish_reason: None,
                                    }],
                                    created: Some(get_timestamp()),
                                    model: model_label.clone(),
                                    object: Some("chat.completion.chunk".to_string()),
                                    usage: None,
                                };
                                role_sent = true;
                                let _ =
                                    sender.blocking_send(Ok(StreamEvent::ContentChunk(chunk)));
                            }
                        }
                    } else if is_done {
                        final_text_from_event = Self::extract_text_from_value(&value);
                    }
                }
                Err(_) => {
                    raw_output.push_str(cleaned);
                    raw_output.push('\n');
                }
            }
        }

        let status = child.wait().map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to wait for Codex CLI: {}", e))
        })?;
        let stderr_output = stderr_handle.join().unwrap_or_default();
        let response_file = fs::read_to_string(&output_path).unwrap_or_default();
        let _ = fs::remove_file(&output_path);
        let response_file = response_file.trim().to_string();
        let raw_output = raw_output.trim().to_string();

        if let Some(message) = error_message {
            return Err(AppError::ExternalServiceError(message));
        }

        if !status.success() {
            let detail = if !stderr_output.trim().is_empty() {
                stderr_output
            } else if !raw_output.is_empty() {
                raw_output
            } else {
                response_file
            };
            let code = status.code().unwrap_or(-1);
            return Err(AppError::ExternalServiceError(format!(
                "Codex CLI failed (exit code {}): {}",
                code, detail
            )));
        }

        let fallback_text = final_text_from_event
            .or_else(|| if !response_file.is_empty() { Some(response_file) } else { None })
            .or_else(|| if !raw_output.is_empty() { Some(raw_output) } else { None })
            .unwrap_or_default();

        if accumulated.is_empty() {
            if !fallback_text.is_empty() {
                let text = fallback_text.clone();
                if !text.is_empty() {
                    let chunk = OpenRouterStreamChunk {
                        id: format!("codex_cli_{}", request_id),
                        choices: vec![OpenRouterStreamChoice {
                            delta: OpenRouterDelta {
                                role: Some("assistant".to_string()),
                                content: Some(text),
                            },
                            index: 0,
                            finish_reason: None,
                        }],
                        created: Some(get_timestamp()),
                        model: model_label,
                        object: Some("chat.completion.chunk".to_string()),
                        usage: None,
                    };
                    let _ = sender.blocking_send(Ok(StreamEvent::ContentChunk(chunk)));
                }
            }
        } else if !fallback_text.is_empty() {
            if let Some(remaining) = fallback_text.strip_prefix(&accumulated) {
                if !remaining.is_empty() {
                    let chunk = OpenRouterStreamChunk {
                        id: format!("codex_cli_{}", request_id),
                        choices: vec![OpenRouterStreamChoice {
                            delta: OpenRouterDelta {
                                role: if role_sent {
                                    None
                                } else {
                                    Some("assistant".to_string())
                                },
                                content: Some(remaining.to_string()),
                            },
                            index: 0,
                            finish_reason: None,
                        }],
                        created: Some(get_timestamp()),
                        model: model_label,
                        object: Some("chat.completion.chunk".to_string()),
                        usage: None,
                    };
                    let _ = sender.blocking_send(Ok(StreamEvent::ContentChunk(chunk)));
                }
            }
        }

        if !streamed_any && accumulated.is_empty() && fallback_text.is_empty() {
            return Err(AppError::ExternalServiceError(
                "Codex CLI returned an empty response.".to_string(),
            ));
        }

        let _ = sender.blocking_send(Ok(StreamEvent::StreamCompleted {
            request_id,
            final_cost: 0.0,
            tokens_input: 0,
            tokens_output: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
        }));

        Ok(())
    }
}

#[async_trait]
impl ApiClient for CodexCliClient {
    async fn chat_completion(
        &self,
        messages: Vec<OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<OpenRouterResponse> {
        let prompt = Self::build_prompt(&messages);
        let (model_cli, reasoning_effort) =
            self.resolve_codex_cli_model(&options.model).await;
        let response_text = self
            .run_codex_cli(&prompt, model_cli, reasoning_effort, options.max_tokens)
            .await?;

        Ok(OpenRouterResponse {
            id: format!("codex_cli_{}", Uuid::new_v4()),
            choices: vec![OpenRouterChoice {
                message: OpenRouterResponseMessage {
                    role: "assistant".to_string(),
                    content: response_text,
                },
                index: 0,
                finish_reason: Some("stop".to_string()),
            }],
            created: Some(get_timestamp()),
            model: options.model,
            object: Some("chat.completion".to_string()),
            usage: Some(OpenRouterUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                cost: Some(0.0),
                cached_input_tokens: 0,
                cache_write_tokens: 0,
                cache_read_tokens: 0,
                prompt_tokens_details: None,
            }),
        })
    }

    async fn chat_completion_stream(
        &self,
        messages: Vec<OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<StreamEvent>> + Send>>> {
        let prompt = Self::build_prompt(&messages);
        let request_id = options
            .request_id
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let (model_cli, reasoning_effort) =
            self.resolve_codex_cli_model(&options.model).await;
        let model_label = options.model.clone();
        let (sender, receiver) = mpsc::channel::<AppResult<StreamEvent>>(32);

        let _ = sender
            .send(Ok(StreamEvent::StreamStarted {
                request_id: request_id.clone(),
            }))
            .await;

        let sender_for_stream = sender.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(err) = Self::run_codex_cli_streaming(
                prompt,
                model_cli,
                model_label,
                request_id,
                reasoning_effort,
                options.max_tokens,
                sender_for_stream,
            ) {
                let _ = sender.blocking_send(Err(err));
            }
        });

        let stream = futures::stream::unfold(receiver, |mut rx| async {
            rx.recv().await.map(|item| (item, rx))
        });

        Ok(Box::pin(stream))
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
