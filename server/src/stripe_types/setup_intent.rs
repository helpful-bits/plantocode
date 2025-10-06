use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SetupIntent {
    pub id: String,
    pub object: String,
    pub application: Option<String>,
    pub customer: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub payment_method: Option<String>,
    pub payment_method_types: Vec<String>,
    pub status: SetupIntentStatus,
    pub usage: Option<String>,
    pub client_secret: Option<String>,
    pub created: i64,
    pub last_setup_error: Option<serde_json::Value>,
    pub livemode: bool,
    pub next_action: Option<serde_json::Value>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum SetupIntentStatus {
    RequiresPaymentMethod,
    RequiresConfirmation,
    RequiresAction,
    Processing,
    Canceled,
    Succeeded,
}

// Helper struct for creating setup intents
#[derive(Debug)]
pub struct CreateSetupIntent {
    pub customer: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub payment_method_types: Option<Vec<String>>,
    pub usage: Option<String>,
}
