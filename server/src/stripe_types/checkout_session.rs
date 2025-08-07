use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct PresentmentDetails {
    pub presentment_amount: i64,
    pub presentment_currency: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct CheckoutSession {
    pub id: String,
    pub object: String,
    pub customer: Option<String>,
    pub customer_email: Option<String>,
    pub mode: CheckoutSessionMode,
    pub payment_intent: Option<String>,
    pub setup_intent: Option<String>,
    pub success_url: String,
    pub cancel_url: String,
    pub url: Option<String>,
    pub status: Option<String>,
    pub currency: Option<String>,
    pub amount_total: Option<i64>,
    pub metadata: Option<HashMap<String, String>>,
    pub created: i64,
    pub expires_at: i64,
    pub payment_status: Option<String>,
    pub presentment_details: Option<PresentmentDetails>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum CheckoutSessionMode {
    Payment,
    Setup,
}

// Helper structs for creating checkout sessions
#[derive(Debug, Clone)]
pub struct CreateCheckoutSessionLineItems {
    pub price: Option<String>,
    pub quantity: Option<i64>,
}

// Helper for parsing checkout session ID from string
impl CheckoutSession {
    pub fn from_id_str(id: &str) -> Result<CheckoutSessionIdWrapper, String> {
        Ok(CheckoutSessionIdWrapper { id: id.to_string() })
    }
}

#[derive(Debug, Clone)]
pub struct CheckoutSessionIdWrapper {
    pub id: String,
}

impl std::str::FromStr for CheckoutSessionIdWrapper {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(CheckoutSessionIdWrapper { id: s.to_string() })
    }
}