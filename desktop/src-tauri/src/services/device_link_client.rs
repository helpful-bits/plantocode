use crate::auth::{device_id_manager, token_manager::TokenManager};
use crate::remote_api::desktop_command_handler;
use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use crate::error::AppError;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener, Manager};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::{Message, handshake::client::Request}};
use futures_util::{SinkExt, StreamExt};
use url::Url;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DeviceLinkMessage {
    #[serde(rename = "register")]
    Register {
        device_id: String,
        device_name: String,
    },
    #[serde(rename = "relay_response")]
    RelayResponse {
        client_id: String,
        response: RpcResponse,
    },
    #[serde(rename = "event")]
    Event {
        event_type: String,
        payload: Value,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "registered")]
    Registered,
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "relay")]
    Relay {
        client_id: String,
        request: RpcRequest,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
}

pub struct DeviceLinkClient {
    app_handle: AppHandle,
    server_url: String,
    sender: Option<mpsc::UnboundedSender<DeviceLinkMessage>>,
}

impl DeviceLinkClient {
    pub fn new(app_handle: AppHandle, server_url: String) -> Self {
        Self {
            app_handle,
            server_url,
            sender: None,
        }
    }

    /// Start the device link client and connect to the server
    pub async fn start(&mut self) -> Result<(), AppError> {
        info!("Starting DeviceLinkClient connection to {}", self.server_url);

        // Get device ID and token
        let device_id = device_id_manager::get_or_create(&self.app_handle)
            .map_err(|e| AppError::AuthError(format!("Failed to get device ID: {}", e)))?;

        let token_manager = self.app_handle.state::<Arc<TokenManager>>();
        let token = token_manager.get().await
            .ok_or_else(|| AppError::AuthError("No authentication token available".to_string()))?;

        // Build WebSocket URL
        let ws_url = format!("{}/ws/device-link", self.server_url.replace("http", "ws"));
        let url = Url::parse(&ws_url)
            .map_err(|e| AppError::ConfigError(format!("Invalid WebSocket URL: {}", e)))?;

        info!("Connecting to WebSocket at: {}", ws_url);

        // Build request with headers
        let request = Request::builder()
            .uri(url.as_str())
            .header("Authorization", format!("Bearer {}", token))
            .header("X-Device-ID", device_id.clone())
            .header("X-Client-Type", "desktop")
            .body(())
            .map_err(|e| AppError::NetworkError(format!("Failed to build WebSocket request: {}", e)))?;

        // Connect to WebSocket with headers
        let (ws_stream, _) = connect_async(request).await
            .map_err(|e| AppError::NetworkError(format!("WebSocket connection failed: {}", e)))?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Create message channel
        let (tx, mut rx) = mpsc::unbounded_channel::<DeviceLinkMessage>();
        self.sender = Some(tx.clone());

        // Set up event listener for device-link-event emissions
        let tx_for_events = tx.clone();
        let app_handle_for_events = self.app_handle.clone();
        app_handle_for_events.listen("device-link-event", move |event| {
            let payload = event.payload();
            if let Ok(event_data) = serde_json::from_str::<Value>(payload) {
                if let (Some(event_type), Some(event_payload)) = (
                    event_data.get("type").and_then(|v| v.as_str()),
                    event_data.get("payload")
                ) {
                    let msg = DeviceLinkMessage::Event {
                        event_type: event_type.to_string(),
                        payload: event_payload.clone(),
                    };

                    if let Err(e) = tx_for_events.send(msg) {
                        warn!("Failed to forward event to device link: {}", e);
                    } else {
                        debug!("Forwarded event to device link: {}", event_type);
                    }
                }
            }
        });

        // Get hostname for device name
        let hostname = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "Desktop".to_string());

        // Send register message
        let register_msg = DeviceLinkMessage::Register {
            device_id: device_id.clone(),
            device_name: hostname,
        };

        let register_json = serde_json::to_string(&register_msg)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize register message: {}", e)))?;

        ws_sender.send(Message::Text(register_json)).await
            .map_err(|e| AppError::NetworkError(format!("Failed to send register message: {}", e)))?;

        info!("Sent registration message for device: {}", device_id);

        // Spawn sender task
        let ws_sender_handle = {
            let mut ws_sender = ws_sender;
            tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    match serde_json::to_string(&msg) {
                        Ok(json) => {
                            if let Err(e) = ws_sender.send(Message::Text(json)).await {
                                error!("Failed to send WebSocket message: {}", e);
                                break;
                            }
                        }
                        Err(e) => {
                            error!("Failed to serialize message: {}", e);
                        }
                    }
                }
                debug!("WebSocket sender task terminated");
            })
        };

        // Spawn receiver task
        let app_handle = self.app_handle.clone();
        let tx_for_receiver = tx.clone();
        let receiver_handle = tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        match serde_json::from_str::<ServerMessage>(&text) {
                            Ok(server_msg) => {
                                if let Err(e) = Self::handle_server_message(
                                    &app_handle,
                                    server_msg,
                                    &tx_for_receiver,
                                ).await {
                                    error!("Failed to handle server message: {}", e);
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse server message: {} - Raw: {}", e, text);
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("WebSocket connection closed by server");
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        debug!("Received ping, sending pong");
                        if let Err(e) = tx_for_receiver.send(DeviceLinkMessage::Pong) {
                            error!("Failed to send pong: {}", e);
                        }
                    }
                    Ok(_) => {
                        // Handle other message types if needed
                        debug!("Received non-text WebSocket message");
                    }
                    Err(e) => {
                        error!("WebSocket error: {}", e);
                        break;
                    }
                }
            }
            debug!("WebSocket receiver task terminated");
        });

        // Spawn heartbeat task
        let tx_for_heartbeat = tx.clone();
        let heartbeat_handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
            loop {
                interval.tick().await;
                if tx_for_heartbeat.send(DeviceLinkMessage::Ping).is_err() {
                    debug!("Heartbeat channel closed, terminating heartbeat task");
                    break;
                }
            }
        });

        // Wait for any task to complete (which indicates a problem)
        tokio::select! {
            _ = ws_sender_handle => {
                warn!("WebSocket sender task completed");
            }
            _ = receiver_handle => {
                warn!("WebSocket receiver task completed");
            }
            _ = heartbeat_handle => {
                warn!("Heartbeat task completed");
            }
        }

        Ok(())
    }

    /// Handle incoming server messages
    async fn handle_server_message(
        app_handle: &AppHandle,
        msg: ServerMessage,
        tx: &mpsc::UnboundedSender<DeviceLinkMessage>,
    ) -> Result<(), AppError> {
        match msg {
            ServerMessage::Registered => {
                info!("Successfully registered with device link server");
                Ok(())
            }
            ServerMessage::Error { message } => {
                error!("Server error: {}", message);
                Err(AppError::NetworkError(format!("Server error: {}", message)))
            }
            ServerMessage::Relay { client_id, request } => {
                debug!("Received relay request from client {}: method={}", client_id, request.method);

                // Create user context (this could be enhanced with actual user info from the server)
                let user_context = UserContext {
                    user_id: "remote_user".to_string(), // This should come from the authenticated session
                    device_id: device_id_manager::get_or_create(app_handle)
                        .unwrap_or_else(|_| "unknown".to_string()),
                    permissions: vec!["rpc".to_string()], // This should come from user's actual permissions
                };

                // Dispatch the command
                let response = desktop_command_handler::dispatch_remote_command(
                    app_handle,
                    request,
                    &user_context,
                ).await;

                // Send response back via WebSocket
                let relay_response = DeviceLinkMessage::RelayResponse {
                    client_id,
                    response,
                };

                if let Err(e) = tx.send(relay_response) {
                    error!("Failed to send relay response: {}", e);
                }

                Ok(())
            }
            ServerMessage::Ping => {
                debug!("Received ping from server");
                // Pongs are handled automatically by the WebSocket layer
                Ok(())
            }
            ServerMessage::Pong => {
                debug!("Received pong from server");
                Ok(())
            }
        }
    }

    /// Send an event to the server
    pub async fn send_event(&self, event_type: String, payload: Value) -> Result<(), AppError> {
        if let Some(sender) = &self.sender {
            let msg = DeviceLinkMessage::Event {
                event_type,
                payload,
            };

            sender.send(msg)
                .map_err(|_| AppError::NetworkError("Device link channel closed".to_string()))?;

            Ok(())
        } else {
            Err(AppError::NetworkError("Device link client not connected".to_string()))
        }
    }

    /// Check if the client is connected
    pub fn is_connected(&self) -> bool {
        self.sender.is_some()
    }
}

/// Start the device link client with the given server URL
pub async fn start_device_link_client(app_handle: AppHandle, server_url: String) -> Result<(), AppError> {
    info!("Starting device link client for server: {}", server_url);

    let mut client = DeviceLinkClient::new(app_handle, server_url);

    // This will run indefinitely, reconnecting as needed
    loop {
        match client.start().await {
            Ok(_) => {
                info!("Device link client completed normally");
                break;
            }
            Err(e) => {
                error!("Device link client error: {}", e);

                // Wait before reconnecting
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                info!("Attempting to reconnect device link client...");
            }
        }
    }

    Ok(())
}