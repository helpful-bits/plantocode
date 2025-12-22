use crate::error::AppError;
use crate::models::billing::{Invoice, ListInvoicesResponse};
use crate::services::billing_service::BillingService;
use log::{debug, info, warn};
use uuid::Uuid;

use crate::stripe_types::Expandable;
impl BillingService {
    pub async fn list_invoices_for_user(
        &self,
        user_id: Uuid,
        limit: i32,
        starting_after: Option<String>,
    ) -> Result<ListInvoicesResponse, AppError> {
        debug!("Listing invoices for user: {}", user_id);

        // Get customer ID for the user
        let customer_id = match self.get_or_create_stripe_customer(&user_id).await {
            Ok(id) => id,
            Err(_) => {
                // If no Stripe customer, return empty list
                return Ok(ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // Get the Stripe service
        let stripe_service = self.get_stripe_service()?;

        // List invoices from Stripe
        let invoices_json = match stripe_service
            .list_invoices(&customer_id, Some(limit as u64), starting_after.as_deref())
            .await
        {
            Ok(json) => json,
            Err(e) => {
                warn!(
                    "Failed to list invoices from Stripe for user {}: {:?}",
                    user_id, e
                );
                return Ok(ListInvoicesResponse {
                    total_invoices: 0,
                    invoices: vec![],
                    has_more: false,
                });
            }
        };

        // Parse the JSON response
        let empty_vec = Vec::new();
        let data_array = invoices_json
            .get("data")
            .and_then(|d| d.as_array())
            .unwrap_or(&empty_vec);

        let has_more = invoices_json
            .get("has_more")
            .and_then(|h| h.as_bool())
            .unwrap_or(false);

        // Convert Stripe invoices to our Invoice model
        let mut invoices = Vec::new();
        for invoice_json in data_array {
            let currency = invoice_json
                .get("currency")
                .and_then(|v| v.as_str())
                .unwrap_or("usd")
                .to_string();

            let amount_paid = invoice_json
                .get("amount_paid")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            // Determine the amount to display in USD
            let amount_paid_display = if currency != "usd" {
                // For non-USD invoices, fetch the PaymentIntent with expanded balance_transaction
                if let Some(payment_intent_id) = invoice_json
                    .get("payment_intent")
                    .and_then(|pi| pi.as_str())
                {
                    match stripe_service.get_payment_intent(payment_intent_id).await {
                        Ok(payment_intent) => {
                            // Try to extract the USD amount from the balance transaction
                            if let Some(latest_charge) = payment_intent.latest_charge {
                                // Check if the charge is expanded (not just an ID)
                                if let Expandable::Object(charge) = latest_charge {
                                    // Check if balance_transaction is present on the charge
                                    if let Some(balance_transaction) = charge.balance_transaction {
                                        // balance_transaction.amount is in USD cents (gross charge)
                                        format!("{:.2}", balance_transaction.amount as f64 / 100.0)
                                    } else {
                                        // Fallback to original amount
                                        format!("{:.2}", amount_paid as f64 / 100.0)
                                    }
                                } else {
                                    // Charge is not expanded, fallback to original amount
                                    format!("{:.2}", amount_paid as f64 / 100.0)
                                }
                            } else {
                                format!("{:.2}", amount_paid as f64 / 100.0)
                            }
                        }
                        Err(_) => {
                            // Fallback to original amount if PaymentIntent fetch fails
                            format!("{:.2}", amount_paid as f64 / 100.0)
                        }
                    }
                } else {
                    format!("{:.2}", amount_paid as f64 / 100.0)
                }
            } else {
                // For USD invoices, use the original amount_paid
                format!("{:.2}", amount_paid as f64 / 100.0)
            };

            let invoice = Invoice {
                id: invoice_json
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                created: invoice_json
                    .get("created")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                due_date: invoice_json.get("due_date").and_then(|v| v.as_i64()),
                amount_paid_display,
                amount_paid,
                currency,
                status: invoice_json
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                invoice_pdf_url: invoice_json
                    .get("invoice_pdf")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            };
            invoices.push(invoice);
        }

        info!(
            "Successfully retrieved {} invoices for user {}",
            invoices.len(),
            user_id
        );

        Ok(ListInvoicesResponse {
            total_invoices: invoices.len() as i32,
            invoices,
            has_more,
        })
    }

}
