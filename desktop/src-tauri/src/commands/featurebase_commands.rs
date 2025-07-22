use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::error::AppResult;
use log::info;
use std::sync::Arc;
use tauri::{State, command};

#[command]
pub async fn get_featurebase_sso_token(
    server_proxy_client: State<'_, Arc<ServerProxyClient>>,
) -> AppResult<String> {
    info!("Getting Featurebase SSO token via server proxy");
    server_proxy_client.get_featurebase_sso_token().await
}
