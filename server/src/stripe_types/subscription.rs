use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Subscription {
    pub id: String,
    pub object: String,
    pub customer: String,
    pub status: SubscriptionStatus,
    pub items: Option<SubscriptionItems>,
    pub current_period_start: i64,
    pub current_period_end: i64,
    pub trial_start: Option<i64>,
    pub trial_end: Option<i64>,
    pub cancel_at_period_end: bool,
    pub canceled_at: Option<i64>,
    pub created: i64,
    pub metadata: Option<HashMap<String, String>>,
    pub latest_invoice: Option<serde_json::Value>, // Can be expanded or string ID
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Incomplete,
    IncompleteExpired,
    Trialing,
    Active,
    PastDue,
    Canceled,
    Unpaid,
    Paused,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SubscriptionItems {
    pub object: String,
    pub data: Vec<SubscriptionItem>,
    pub has_more: bool,
    pub total_count: Option<i64>,
    pub url: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SubscriptionItem {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub metadata: Option<HashMap<String, String>>,
    pub price: Option<crate::stripe_types::Price>,
    pub quantity: Option<i64>,
    pub subscription: String,
}

// Helper structs for creating subscriptions
#[derive(Debug, Clone)]
pub struct CreateSubscriptionItem {
    pub price: Option<String>,
    pub quantity: Option<i64>,
}

// Helper for parsing subscription ID from string
impl Subscription {
    pub fn from_id_str(id: &str) -> Result<SubscriptionIdWrapper, String> {
        Ok(SubscriptionIdWrapper { id: id.to_string() })
    }
}

#[derive(Debug, Clone)]
pub struct SubscriptionIdWrapper {
    pub id: String,
}

impl std::str::FromStr for SubscriptionIdWrapper {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(SubscriptionIdWrapper { id: s.to_string() })
    }
}