//! Stripe Invoice type definition

use super::expandable::Expandable;
use serde::{Deserialize, Serialize};

/// Represents a Stripe Invoice object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    /// Unique identifier for the object
    pub id: String,

    /// String representing the object's type. Objects of the same type share the same value
    pub object: String,

    /// The customer's ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer: Option<String>,

    /// Total amount, in cents
    pub amount_due: i64,

    /// Total amount paid, in cents
    pub amount_paid: i64,

    /// Total amount remaining, in cents
    pub amount_remaining: i64,

    /// Currency for the invoice
    pub currency: String,

    /// Description of the invoice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// The status of the invoice
    pub status: Option<String>,

    /// Collection method (charge_automatically or send_invoice)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_method: Option<String>,

    /// Whether Stripe automatically finalized this invoice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_advance: Option<bool>,

    /// The PaymentIntent associated with the invoice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_intent: Option<Expandable<super::PaymentIntent>>,

    /// Set of key-value pairs that you can attach to an object
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<std::collections::HashMap<String, String>>,

    /// Time at which the object was created
    pub created: i64,

    /// Whether the invoice is paid
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paid: Option<bool>,

    /// Number associated with the invoice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number: Option<String>,

    /// The URL for the hosted invoice page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hosted_invoice_url: Option<String>,

    /// The link to download the PDF for the invoice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_pdf: Option<String>,
}
