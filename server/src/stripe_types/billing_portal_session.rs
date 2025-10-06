use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct BillingPortalSession {
    pub id: String,
    pub object: String,
    pub configuration: Option<String>,
    pub created: i64,
    pub customer: String,
    pub livemode: bool,
    pub locale: Option<String>,
    pub on_behalf_of: Option<String>,
    pub return_url: String,
    pub url: String,
}

// Helper struct for creating billing portal sessions
#[derive(Debug)]
pub struct CreateBillingPortalSession {
    pub customer: String,
    pub return_url: String,
    pub locale: Option<String>,
    pub configuration: Option<String>,
    pub on_behalf_of: Option<String>,
}
