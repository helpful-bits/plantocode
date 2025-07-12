use tauri::{command, State};
use std::sync::Arc;
use log::info;
use crate::error::AppResult;
use crate::api_clients::server_proxy_client::ServerProxyClient;

#[command]
pub async fn get_featurebase_sso_token(
    server_proxy_client: State<'_, Arc<ServerProxyClient>>,
) -> AppResult<String> {
    info!("Getting Featurebase SSO token via server proxy");
    server_proxy_client.get_featurebase_sso_token().await
}