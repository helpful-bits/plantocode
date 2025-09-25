use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub method: String,
    pub params: Value,
    pub correlation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub correlation_id: String,
    pub result: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UserContext {
    pub user_id: String,
    pub device_id: String,
    pub permissions: Vec<String>,
}