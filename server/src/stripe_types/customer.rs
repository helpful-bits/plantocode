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
    pub address: Option<CustomerAddress>,
    pub phone: Option<String>,
    pub tax_exempt: Option<String>,
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