use serde::{Deserialize, Serialize};

// Invoice-related models
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

// Credit-related models
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditTransactionEntry {
    pub id: String,
    pub amount: String,
    pub currency: String,
    pub transaction_type: String,
    pub description: String,
    pub created_at: String,
    pub balance_after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditHistoryResponse {
    pub transactions: Vec<CreditTransactionEntry>,
    pub total_count: i64,
    pub has_more: bool,
}

// Customer billing models
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaxIdInfo {
    pub r#type: String,
    pub value: String,
    pub country: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerBillingInfo {
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub phone: Option<String>,
    pub tax_exempt: Option<String>,
    pub tax_ids: Vec<TaxIdInfo>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub address_city: Option<String>,
    pub address_state: Option<String>,
    pub address_postal_code: Option<String>,
    pub address_country: Option<String>,
    pub has_billing_info: bool,
}

// Dashboard models
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingDashboardData {
    pub credit_balance_usd: f64,
    pub free_credit_balance_usd: f64,
    pub free_credits_expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub services_blocked: bool,
    pub is_payment_method_required: bool,
    pub is_billing_info_required: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UsageSummaryQuery {
    pub start_date: chrono::DateTime<chrono::Utc>,
    pub end_date: chrono::DateTime<chrono::Utc>,
}

// Auto top-off models
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoTopOffSettings {
    pub enabled: bool,
    pub threshold: Option<String>,
    pub amount: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAutoTopOffRequest {
    pub enabled: bool,
    pub threshold: Option<String>,
    pub amount: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalCostResponse {
    pub status: String,
    pub request_id: String,
    pub final_cost: Option<f64>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub cache_write_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub user_id: uuid::Uuid,
    pub service_name: String,
}

// New unified credit history entry that includes API usage token details
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedCreditHistoryEntry {
    pub id: String,
    pub price: f64,  // Negative for usage, positive for purchases
    pub date: String,
    pub model: String,  // Model name or "Credit Purchase" for purchases
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub balance_after: f64,
    pub description: String,
    pub transaction_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedCreditHistoryResponse {
    pub entries: Vec<UnifiedCreditHistoryEntry>,
    pub total_count: i64,
    pub has_more: bool,
}