use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Customer {
    pub id: String,
    pub object: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub created: i64,
    pub currency: Option<String>,
    pub default_source: Option<String>,
    pub invoice_settings: Option<CustomerInvoiceSettings>,
    pub livemode: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct CustomerInvoiceSettings {
    pub default_payment_method: Option<String>,
    pub footer: Option<String>,
}

// Helper for parsing customer ID from string
impl Customer {
    pub fn from_id_str(id: &str) -> Result<CustomerIdWrapper, String> {
        Ok(CustomerIdWrapper { id: id.to_string() })
    }
}

#[derive(Debug, Clone)]
pub struct CustomerIdWrapper {
    pub id: String,
}

impl std::str::FromStr for CustomerIdWrapper {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(CustomerIdWrapper { id: s.to_string() })
    }
}