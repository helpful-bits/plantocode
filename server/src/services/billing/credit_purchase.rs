use crate::db::repositories::api_usage_repository::DetailedUsageRecord;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::stripe_types::checkout_session::CheckoutSession;
use bigdecimal::{BigDecimal, FromPrimitive, ToPrimitive};
use chrono::{DateTime, Utc};
use log::{info, warn};
use std::str::FromStr;
use uuid::Uuid;

// Constants for checkout session modes
const CHECKOUT_SESSION_MODE_PAYMENT: &str = "payment";
const CHECKOUT_SESSION_MODE_SETUP: &str = "setup";

impl BillingService {
    pub async fn get_credit_purchase_fee_tiers(
        &self,
    ) -> Result<crate::models::billing::FeeTierConfig, AppError> {
        self.settings_repository
            .get_credit_purchase_fee_tiers()
            .await
    }

    pub async fn get_detailed_usage(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<Vec<DetailedUsageRecord>, AppError> {
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        let usage_records = self
            .api_usage_repository
            .get_detailed_usage(user_id, start_date, end_date, &mut tx)
            .await?;

        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(usage_records)
    }

    pub async fn create_credit_purchase_checkout_session(
        &self,
        user_id: &Uuid,
        amount: &str,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // CRITICAL: Validate billing setup before allowing credit purchases
        info!(
            "Validating billing setup for credit purchase - user: {}",
            user_id
        );
        let (is_payment_method_required, is_billing_info_required) =
            self._check_billing_readiness(user_id).await?;

        if is_payment_method_required {
            warn!(
                "Credit purchase blocked - payment method required for user: {}",
                user_id
            );
            return Err(AppError::PaymentMethodRequired(
                "A payment method is required before purchasing credits. Please add a payment method in your billing settings.".to_string()
            ));
        }

        if is_billing_info_required {
            warn!(
                "Credit purchase blocked - billing info required for user: {}",
                user_id
            );
            return Err(AppError::BillingAddressRequired(
                "Complete billing information is required before purchasing credits. Please update your billing information.".to_string()
            ));
        }

        info!(
            "Billing setup validated successfully for credit purchase - user: {}",
            user_id
        );

        // Parse amount string to BigDecimal for validation
        let amount_decimal = BigDecimal::parse_bytes(amount.as_bytes(), 10)
            .ok_or_else(|| AppError::InvalidArgument("Invalid amount format".to_string()))?;

        // Validate amount is positive
        if amount_decimal <= BigDecimal::from(0) {
            return Err(AppError::InvalidArgument(
                "Amount must be greater than 0".to_string(),
            ));
        }

        // Get max credit purchase amount from configuration
        // Key: 'billing_max_credit_purchase' in application_configurations table
        let max_amount = match self
            .settings_repository
            .get_config_value("billing_max_credit_purchase")
            .await?
        {
            Some(config_value) => {
                // Try to parse the config value as a number
                if let Some(num) = config_value.as_f64() {
                    BigDecimal::from_str(&num.to_string())
                        .unwrap_or_else(|_| BigDecimal::from(1000))
                } else if let Some(str_val) = config_value.as_str() {
                    BigDecimal::from_str(str_val).unwrap_or_else(|_| BigDecimal::from(1000))
                } else {
                    BigDecimal::from(1000) // Default if config format is unexpected
                }
            }
            None => BigDecimal::from(1000), // Default if not configured
        };

        if amount_decimal > max_amount {
            return Err(AppError::InvalidArgument(format!(
                "Amount exceeds maximum allowed: {}",
                max_amount
            )));
        }

        // Get fee tiers from database to validate against minimum tier
        let fee_tiers = self
            .settings_repository
            .get_credit_purchase_fee_tiers()
            .await?;

        // Find the minimum amount across all tiers
        let min_tier_amount = fee_tiers
            .tiers
            .iter()
            .map(|tier| &tier.min)
            .min()
            .ok_or_else(|| AppError::Configuration("No fee tiers configured".to_string()))?;

        // Validate against the minimum tier amount from configuration
        if &amount_decimal < min_tier_amount {
            return Err(AppError::InvalidArgument(format!(
                "Amount must be at least {} credits",
                min_tier_amount
            )));
        }

        // Note: We don't check Stripe's minimum here - let Stripe return its own error
        // This allows proper handling of different minimums per currency

        // Get the appropriate tier for this amount
        let tier = fee_tiers.get_tier_for_amount(&amount_decimal)?;

        // Calculate fee and net amounts using the tier's fee rate
        let fee_amount = &amount_decimal * &tier.fee_rate;
        let net_amount = &amount_decimal - &fee_amount;

        // Convert to cents with consistent rounding
        let gross_amount_cents = (amount_decimal.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let fee_amount_cents = (fee_amount.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let net_amount_cents = gross_amount_cents - fee_amount_cents; // Ensure net + fee = gross

        // Create two line items: one for credits, one for processing fee
        let mut line_items = Vec::new();

        // Credits line item with tax configuration
        let credits_line = crate::stripe_types::checkout_session::CreateCheckoutSessionLineItems {
            price: None,
            price_data: Some(serde_json::json!({
                "currency": "usd",
                "unit_amount": net_amount_cents,
                "tax_behavior": "exclusive",
                "product_data": {
                    "name": "Top-up Credits"
                    // Note: tax_code removed from product_data - handled by automatic tax
                }
            })),
            quantity: Some(1),
        };
        line_items.push(credits_line);

        // Processing fee line item with tax configuration
        let fee_line = crate::stripe_types::checkout_session::CreateCheckoutSessionLineItems {
            price: None,
            price_data: Some(serde_json::json!({
                "currency": "usd",
                "unit_amount": fee_amount_cents,
                "tax_behavior": "exclusive",
                "product_data": {
                    "name": "Processing fee"
                    // Note: tax_code removed from product_data - handled by automatic tax
                }
            })),
            quantity: Some(1),
        };
        line_items.push(fee_line);

        // Add metadata for webhook fulfillment
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "credit_purchase".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());
        metadata.insert(
            "gross_amount_cents".to_string(),
            gross_amount_cents.to_string(),
        );
        metadata.insert(
            "platform_fee_cents".to_string(),
            fee_amount_cents.to_string(),
        );
        metadata.insert("net_amount_cents".to_string(), net_amount_cents.to_string());
        metadata.insert("gross_amount".to_string(), amount_decimal.to_string());
        metadata.insert("platform_fee".to_string(), fee_amount.to_string());
        metadata.insert("net_amount".to_string(), net_amount.to_string());
        metadata.insert("currency".to_string(), "USD".to_string());

        let success_url = format!(
            "{}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            &self.app_settings.website_base_url
        );
        let cancel_url = format!("{}/billing/cancel", &self.app_settings.website_base_url);

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service
            .create_checkout_session(
                &idempotency_key,
                &customer_id,
                user_id,
                CHECKOUT_SESSION_MODE_PAYMENT,
                Some(line_items),
                &success_url,
                &cancel_url,
                metadata,
                Some(true), // billing_address_collection required for tax compliance
                Some(true), // automatic_tax enabled for proper tax calculation
                Some(true), // invoice_creation_enabled
                Some(true), // tax_id_collection_enabled for B2B customers
                Some(true), // customer_update_address to persist billing addresses
                            // Rely on Stripe to email receipts/invoices for this Checkout Session; no manual customer email is sent.
            )
            .await
            .map_err(|e| AppError::External(format!("Failed to create checkout session: {}", e)))?;

        Ok(session)
    }

    pub async fn get_checkout_session_status(
        &self,
        session_id: &str,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;

        let mut session = stripe_service
            .get_checkout_session(session_id)
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to retrieve checkout session: {}", e))
            })?;

        // Check if the payment is complete but webhook hasn't been processed yet
        if session.status.as_deref() == Some("complete")
            && session.payment_status.as_deref() == Some("paid")
        {
            if let Some(pi_id) = &session.payment_intent {
                let payment_intent_id = pi_id.to_string();
                let payment_intent = stripe_service
                    .get_payment_intent(&payment_intent_id)
                    .await?;

                // Extract charge ID based on Expandable enum
                let charge_id = match &payment_intent.latest_charge {
                    Some(crate::stripe_types::Expandable::Id(id)) => id.clone(),
                    Some(crate::stripe_types::Expandable::Object(charge)) => charge.id.clone(),
                    None => return Ok(session), // No charge yet
                };

                let credit_repo =
                    CreditTransactionRepository::new(self.db_pools.system_pool.clone());
                let transactions = credit_repo
                    .get_transactions_by_stripe_charge(&charge_id)
                    .await?;
                if transactions.is_empty() {
                    // Webhook hasn't been processed yet. Tell the client to keep polling.
                    session.payment_status = Some("processing".to_string());
                }
            }
        }

        Ok(session)
    }

    pub async fn create_setup_checkout_session(
        &self,
        user_id: &Uuid,
    ) -> Result<CheckoutSession, AppError> {
        let stripe_service = self.get_stripe_service()?;
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Add metadata for setup payment method
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("type".to_string(), "setup_payment_method".to_string());
        metadata.insert("user_id".to_string(), user_id.to_string());

        let success_url = format!(
            "{}/billing/payment-method/success",
            &self.app_settings.website_base_url
        );
        let cancel_url = format!(
            "{}/billing/payment-method/cancel",
            &self.app_settings.website_base_url
        );

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service
            .create_checkout_session(
                &idempotency_key,
                &customer_id,
                user_id,
                CHECKOUT_SESSION_MODE_SETUP,
                None, // No line items for setup mode
                &success_url,
                &cancel_url,
                metadata,
                None, // billing_address_collection not applicable for setup mode
                None, // automatic_tax not applicable for setup mode
                None, // invoice_creation_enabled not applicable for setup mode
                None, // tax_id_collection not applicable for setup mode
                None, // customer_update_address not applicable for setup mode
            )
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to create setup checkout session: {}", e))
            })?;

        Ok(session)
    }

    /// Process a saved payment method from a completed SetupIntent
    /// This method handles setup mode checkout sessions where a payment method was added
    pub async fn process_saved_payment_method(
        &self,
        setup_intent: &crate::stripe_types::SetupIntent,
    ) -> Result<(), AppError> {
        info!(
            "Processing saved payment method from setup intent: {}",
            setup_intent.id
        );

        // Check if setup intent status is "succeeded"
        if !matches!(
            setup_intent.status,
            crate::stripe_types::setup_intent::SetupIntentStatus::Succeeded
        ) {
            warn!(
                "Setup intent {} is not in succeeded status: {:?}",
                setup_intent.id, setup_intent.status
            );
            return Err(AppError::InvalidArgument(format!(
                "Setup intent is not in succeeded status: {:?}",
                setup_intent.status
            )));
        }

        // Extract customer ID from setup_intent
        let customer_id = setup_intent.customer.as_ref().ok_or_else(|| {
            AppError::InvalidArgument("Setup intent has no customer ID".to_string())
        })?;

        // Extract payment method ID from setup_intent
        let payment_method_id = setup_intent.payment_method.as_ref().ok_or_else(|| {
            AppError::InvalidArgument("Setup intent has no payment method ID".to_string())
        })?;

        info!(
            "Setup intent {} - customer: {}, payment method: {}",
            setup_intent.id, customer_id, payment_method_id
        );

        // Get stripe service
        let stripe_service = self.get_stripe_service()?;

        // Set the payment method as default for the customer
        let idempotency_key = format!("set_default_pm_{}_{}", setup_intent.id, payment_method_id);
        stripe_service
            .set_default_payment_method(&idempotency_key, customer_id, payment_method_id)
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to set default payment method: {}", e))
            })?;

        info!(
            "Successfully set payment method {} as default for customer {}",
            payment_method_id, customer_id
        );

        // Find the user via user_repository.get_by_stripe_customer_id
        let user_repository = crate::db::repositories::user_repository::UserRepository::new(
            self.get_system_db_pool(),
        );
        let user = user_repository
            .get_by_stripe_customer_id(customer_id)
            .await
            .map_err(|e| {
                AppError::NotFound(format!(
                    "Could not find user for customer {}: {}",
                    customer_id, e
                ))
            })?;

        info!(
            "Found user {} for customer {} in setup intent {}",
            user.id, customer_id, setup_intent.id
        );

        // Log detailed audit event
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("setup_intent_id".to_string(), setup_intent.id.clone());
        metadata.insert("payment_method_id".to_string(), payment_method_id.clone());
        metadata.insert("customer_id".to_string(), customer_id.clone());
        metadata.insert("event_type".to_string(), "payment_method_added".to_string());

        let audit_context = crate::services::audit_service::AuditContext::new(user.id);
        let audit_event =
            crate::services::audit_service::AuditEvent::new("payment_method_added", "billing")
                .with_entity_id(setup_intent.id.clone())
                .with_metadata(serde_json::to_value(metadata).unwrap_or_default());

        self.audit_service
            .log_event(&audit_context, audit_event)
            .await?;

        info!(
            "Successfully processed saved payment method for setup intent {} - user {} now has default payment method {}",
            setup_intent.id, user.id, payment_method_id
        );

        Ok(())
    }
}
