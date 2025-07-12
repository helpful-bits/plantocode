use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Invoice {
    pub id: String,
    pub object: String,
    pub account_country: Option<String>,
    pub account_name: Option<String>,
    pub account_tax_ids: Option<Vec<String>>,
    pub amount_due: i64,
    pub amount_paid: i64,
    pub amount_remaining: i64,
    pub application_fee_amount: Option<i64>,
    pub attempt_count: i64,
    pub attempted: bool,
    pub auto_advance: Option<bool>,
    pub collection_method: Option<String>,
    pub created: i64,
    pub currency: String,
    pub customer: String,
    pub customer_email: Option<String>,
    pub customer_name: Option<String>,
    pub description: Option<String>,
    pub hosted_invoice_url: Option<String>,
    pub invoice_pdf: Option<String>,
    pub livemode: bool,
    pub metadata: Option<HashMap<String, String>>,
    pub number: Option<String>,
    pub payment_intent: Option<String>,
    pub charge: Option<String>,
    pub status: InvoiceStatus,
    pub subtotal: i64,
    pub tax: Option<i64>,
    pub total: i64,
    pub due_date: Option<i64>,
    pub period_start: Option<i64>,
    pub period_end: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum InvoiceStatus {
    Draft,
    Open,
    Paid,
    Uncollectible,
    Void,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct InvoiceItem {
    pub id: String,
    pub object: String,
    pub amount: i64,
    pub currency: String,
    pub customer: String,
    pub description: Option<String>,
    pub discountable: bool,
    pub invoice: Option<String>,
    pub livemode: bool,
    pub metadata: Option<HashMap<String, String>>,
    pub price: Option<crate::stripe_types::Price>,
    pub proration: bool,
    pub quantity: i64,
    pub unit_amount: Option<i64>,
    pub unit_amount_decimal: Option<String>,
}

// Helper structs for listing invoices
#[derive(Debug)]
pub struct ListInvoices {
    pub customer: Option<crate::stripe_types::customer::CustomerIdWrapper>,
    pub status: Option<InvoiceStatus>,
    pub limit: Option<u64>,
    pub starting_after: Option<String>,
}

impl ListInvoices {
    pub fn new() -> Self {
        Self {
            customer: None,
            status: None,
            limit: None,
            starting_after: None,
        }
    }
}

impl Default for ListInvoices {
    fn default() -> Self {
        Self::new()
    }
}

// Helper for creating invoices
#[derive(Debug)]
pub struct CreateInvoice {
    pub customer: String,
    pub auto_advance: Option<bool>,
    pub collection_method: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

// Helper for creating invoice items
#[derive(Debug)]
pub struct CreateInvoiceItem {
    pub customer: String,
    pub amount: i64,
    pub currency: String,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

// List response structure
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct InvoiceList {
    pub object: String,
    pub data: Vec<Invoice>,
    pub has_more: bool,
    pub url: String,
}