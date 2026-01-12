use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::api_clients::codex_cli_client::CodexCliClient;
use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::db_utils::SettingsRepository;
use crate::error::AppResult;
use log::warn;
use crate::models::stream_event::StreamEvent;
use crate::models::OpenRouterRequestMessage;

const CODEX_CLI_SETTING_KEY: &str = "codex_cli_enabled";

#[derive(Debug)]
pub struct RoutedApiClient {
    app_handle: AppHandle,
    server_proxy_client: Arc<ServerProxyClient>,
    codex_cli_client: Arc<CodexCliClient>,
}

impl RoutedApiClient {
    pub fn new(app_handle: AppHandle, server_proxy_client: Arc<ServerProxyClient>) -> Self {
        Self {
            app_handle: app_handle.clone(),
            server_proxy_client,
            codex_cli_client: Arc::new(CodexCliClient::new(app_handle)),
        }
    }

    fn is_openai_model(model: &str) -> bool {
        let lower = model.to_lowercase();
        lower.starts_with("openai/") || lower.starts_with("openai:")
    }

    fn contains_image(messages: &[OpenRouterRequestMessage]) -> bool {
        messages.iter().any(|message| {
            message.content.iter().any(|content| matches!(
                content,
                crate::models::OpenRouterContent::Image { .. }
            ))
        })
    }

    async fn should_use_codex(
        &self,
        messages: &[OpenRouterRequestMessage],
        options: &ApiClientOptions,
    ) -> bool {
        if !Self::is_openai_model(&options.model) {
            return false;
        }

        if Self::contains_image(messages) {
            return false;
        }

        let settings_repo = self
            .app_handle
            .state::<Arc<SettingsRepository>>()
            .inner()
            .clone();
        match settings_repo.get_bool_setting(CODEX_CLI_SETTING_KEY).await {
            Ok(Some(enabled)) => enabled,
            Ok(None) => false,
            Err(err) => {
                warn!("Failed to read Codex CLI setting: {}", err);
                false
            }
        }
    }
}

#[async_trait]
impl ApiClient for RoutedApiClient {
    async fn chat_completion(
        &self,
        messages: Vec<OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<crate::models::OpenRouterResponse> {
        if self.should_use_codex(&messages, &options).await {
            return self.codex_cli_client.chat_completion(messages, options).await;
        }

        self.server_proxy_client.chat_completion(messages, options).await
    }

    async fn chat_completion_stream(
        &self,
        messages: Vec<OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<StreamEvent>> + Send>>> {
        if self.should_use_codex(&messages, &options).await {
            return self
                .codex_cli_client
                .chat_completion_stream(messages, options)
                .await;
        }

        self.server_proxy_client
            .chat_completion_stream(messages, options)
            .await
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
