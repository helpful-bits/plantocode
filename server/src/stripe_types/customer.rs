use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum TaxExemptStatus {
    None,
    Exempt,
    Reverse,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ShippingInfo {
    pub address: Option<CustomerAddress>,
    pub name: Option<String>,
    pub phone: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Customer {
    pub id: String,
    pub object: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub created: i64,
    pub deleted: Option<bool>,
    pub currency: Option<String>,
    pub default_source: Option<String>,
    pub invoice_settings: Option<CustomerInvoiceSettings>,
    pub livemode: bool,
    pub address: Option<CustomerAddress>,
    pub phone: Option<String>,
    pub tax_exempt: Option<TaxExemptStatus>,
    pub shipping: Option<ShippingInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_ids: Option<TaxIdList>,
    // Additional fields from Stripe API
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_balance: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub business_vat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delinquent: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discount: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_invoice_sequence: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_locales: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sources: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscriptions: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_info: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_info_verification: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_clock: Option<serde_json::Value>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct CustomerAddress {
    pub line1: Option<String>,
    pub line2: Option<String>, 
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct TaxId {
    pub id: String,
    pub object: String,
    pub country: Option<String>,
    pub created: i64,
    pub customer: String,
    pub livemode: bool,
    pub r#type: String,
    pub value: String,
    pub verification: Option<TaxIdVerification>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<serde_json::Value>, // Skip unknown owner field
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct TaxIdVerification {
    pub status: String,
    pub verified_address: Option<String>,
    pub verified_name: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct TaxIdList {
    pub object: String,
    pub data: Vec<TaxId>,
    pub has_more: bool,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_count: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct CustomerInvoiceSettings {
    pub default_payment_method: Option<String>,
    pub footer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_fields: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendering_options: Option<serde_json::Value>,
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