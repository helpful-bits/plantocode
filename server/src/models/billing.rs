use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: String,
    pub created: i64,
    pub due_date: Option<i64>,
    pub amount_due: i64,
    pub amount_paid: i64,
    pub currency: String,
    pub status: String,
    pub invoice_pdf_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListInvoicesResponse {
    pub invoices: Vec<Invoice>,
    pub total_invoices: i32,
    pub has_more: bool,
}