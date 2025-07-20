use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::stripe_types::{Charge, Expandable};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentIntent {
    pub id: String,
    pub object: String,
    pub amount: i64,
    pub amount_capturable: Option<i64>,
    pub amount_received: Option<i64>,
    pub currency: String,
    pub customer: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub status: PaymentIntentStatus,
    pub client_secret: Option<String>,
    pub created: i64,
    pub payment_method: Option<String>,
    pub setup_future_usage: Option<String>,
    pub confirmation_method: Option<String>,
    pub latest_charge: Option<Expandable<Charge>>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PaymentIntentStatus {
    RequiresPaymentMethod,
    RequiresConfirmation,
    RequiresAction,
    Processing,
    RequiresCapture,
    Canceled,
    Succeeded,
}