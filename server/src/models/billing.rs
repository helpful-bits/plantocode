use serde::{Deserialize, Serialize};
use crate::stripe_types;

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
    #[serde(rename = "type_")]
    pub type_: String,
    pub value: String,
    pub country: Option<String>,
    pub verification_status: Option<String>,
}

impl From<&stripe_types::customer::TaxId> for TaxIdInfo {
    fn from(tax_id: &stripe_types::customer::TaxId) -> Self {
        Self {
            type_: tax_id.r#type.clone(),
            value: tax_id.value.clone(),
            country: tax_id.country.clone(),
            verification_status: tax_id.verification.as_ref().map(|v| v.status.clone()),
        }
    }
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

impl From<&stripe_types::customer::Customer> for CustomerBillingInfo {
    fn from(customer: &stripe_types::customer::Customer) -> Self {
        // Use billing address, fall back to shipping address if billing is missing
        let address = customer.address.as_ref().or_else(|| {
            customer.shipping.as_ref().and_then(|s| s.address.as_ref())
        });
        
        // Calculate has_billing_info based on name and complete address
        let has_billing_info = customer.name.is_some() && 
            address.as_ref().map_or(false, |addr| {
                addr.line1.is_some() && 
                addr.city.is_some() && 
                addr.country.is_some()
            });
        
        // Convert tax_exempt enum to string
        let tax_exempt = customer.tax_exempt.as_ref().map(|te| {
            serde_json::to_string(te).unwrap_or_else(|_| "\"none\"".to_string())
                .trim_matches('"').to_string()
        });
        
        // Convert tax_ids from TaxIdList
        let tax_ids = customer.tax_ids.as_ref()
            .map(|list| list.data.iter().map(TaxIdInfo::from).collect())
            .unwrap_or_default();
        
        Self {
            customer_name: customer.name.clone(),
            customer_email: customer.email.clone(),
            phone: customer.phone.clone(),
            tax_exempt,
            tax_ids,
            address_line1: address.and_then(|a| a.line1.clone()),
            address_line2: address.and_then(|a| a.line2.clone()),
            address_city: address.and_then(|a| a.city.clone()),
            address_state: address.and_then(|a| a.state.clone()),
            address_postal_code: address.and_then(|a| a.postal_code.clone()),
            address_country: address.and_then(|a| a.country.clone()),
            has_billing_info,
        }
    }
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
    pub customer_billing_info: Option<CustomerBillingInfo>,
    pub usage_limit_usd: f64,
    pub current_usage: f64,
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
    pub cache_write_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
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