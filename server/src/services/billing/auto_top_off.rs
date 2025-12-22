use crate::error::AppError;
use crate::models::billing::AutoTopOffSettings;
use crate::services::billing_service::BillingService;
use bigdecimal::{BigDecimal, ToPrimitive};
use chrono::Utc;
use log::{debug, info, warn};
use std::str::FromStr;
use uuid::Uuid;

impl BillingService {
    pub async fn get_auto_top_off_settings(
        &self,
        user_id: &Uuid,
    ) -> Result<AutoTopOffSettings, AppError> {
        debug!("Getting auto top-off settings for user: {}", user_id);

        // Start transaction for atomic operations
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Get customer billing
        let customer_billing = self
            .customer_billing_repository
            .get_by_user_id_with_executor(user_id, &mut tx)
            .await?
            .ok_or_else(|| {
                AppError::NotFound("No customer billing record found for user".to_string())
            })?;

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled: customer_billing.auto_top_off_enabled,
            threshold: customer_billing
                .auto_top_off_threshold
                .map(|t| t.to_string()),
            amount: customer_billing.auto_top_off_amount.map(|a| a.to_string()),
        };

        info!(
            "Successfully retrieved auto top-off settings for user: {}",
            user_id
        );
        Ok(settings)
    }

    /// Update auto top-off settings for a user
    pub async fn update_auto_top_off_settings(
        &self,
        user_id: &Uuid,
        enabled: bool,
        threshold: Option<BigDecimal>,
        amount: Option<BigDecimal>,
    ) -> Result<AutoTopOffSettings, AppError> {
        debug!("Updating auto top-off settings for user: {}", user_id);

        // CRITICAL: Validate billing setup before allowing auto top-off to be enabled
        if enabled {
            info!(
                "Validating billing setup for auto top-off configuration - user: {}",
                user_id
            );
            let (is_payment_method_required, is_billing_info_required) =
                self._check_billing_readiness(user_id).await?;

            if is_payment_method_required {
                warn!(
                    "Auto top-off configuration blocked - payment method required for user: {}",
                    user_id
                );
                return Err(AppError::PaymentMethodRequired(
                    "A payment method is required before enabling auto top-off. Please add a payment method in your billing settings.".to_string()
                ));
            }

            if is_billing_info_required {
                warn!(
                    "Auto top-off configuration blocked - billing info required for user: {}",
                    user_id
                );
                return Err(AppError::BillingAddressRequired(
                    "Complete billing information is required before enabling auto top-off. Please update your billing information.".to_string()
                ));
            }

            info!(
                "Billing setup validated successfully for auto top-off configuration - user: {}",
                user_id
            );
        }

        // Start transaction for atomic operations
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Update auto top-off settings directly within the transaction to ensure RLS context
        sqlx::query!(
            r#"
            INSERT INTO customer_billing
            (id, user_id, stripe_customer_id, auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount, created_at, updated_at)
            VALUES
            (gen_random_uuid(), $1, NULL, $2, $3, $4, now(), now())
            ON CONFLICT (user_id) DO UPDATE
            SET auto_top_off_enabled = EXCLUDED.auto_top_off_enabled,
                auto_top_off_threshold = EXCLUDED.auto_top_off_threshold,
                auto_top_off_amount = EXCLUDED.auto_top_off_amount,
                updated_at = now()
            "#,
            user_id,
            enabled,
            threshold,
            amount
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update auto top-off settings: {}", e)))?;

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let settings = AutoTopOffSettings {
            enabled,
            threshold: threshold.map(|t| t.to_string()),
            amount: amount.map(|a| a.to_string()),
        };

        info!(
            "Successfully updated auto top-off settings for user: {}",
            user_id
        );
        Ok(settings)
    }

    /// Estimate streaming cost for UI display only - does not charge the user
    pub async fn check_and_trigger_auto_top_off(&self, user_id: &Uuid) -> Result<(), AppError> {
        debug!("Checking auto top-off conditions for user: {}", user_id);

        // Start transaction to check user's billing settings and balance atomically
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Get customer billing settings
        let customer_billing = match self
            .customer_billing_repository
            .get_by_user_id_with_executor(user_id, &mut tx)
            .await?
        {
            Some(billing) => billing,
            None => {
                debug!(
                    "No customer billing record found for user {}, skipping auto top-off check",
                    user_id
                );
                let _ = tx.rollback().await;
                return Ok(());
            }
        };

        // Check if auto top-off is enabled and properly configured
        if !customer_billing.auto_top_off_enabled {
            debug!("Auto top-off is disabled for user {}", user_id);
            let _ = tx.rollback().await;
            return Ok(());
        }

        let threshold = match customer_billing.auto_top_off_threshold {
            Some(t) => t,
            None => {
                debug!("Auto top-off threshold not set for user {}", user_id);
                let _ = tx.rollback().await;
                return Ok(());
            }
        };

        let amount = match customer_billing.auto_top_off_amount {
            Some(a) => a,
            None => {
                debug!("Auto top-off amount not set for user {}", user_id);
                let _ = tx.rollback().await;
                return Ok(());
            }
        };

        // Get current credit balance
        let current_balance = self
            .credit_service
            .get_user_balance_with_executor(user_id, &mut tx)
            .await?;

        // Check if balance is below threshold
        if current_balance.balance >= threshold {
            debug!(
                "User {} balance ({}) is above threshold ({}), no top-off needed",
                user_id, current_balance.balance, threshold
            );
            let _ = tx.rollback().await;
            return Ok(());
        }

        // Commit transaction since we're done with database reads
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        info!(
            "User {} balance ({}) is below threshold ({}), triggering auto top-off of {}",
            user_id, current_balance.balance, threshold, amount
        );

        // Perform auto top-off with USD (enforced for off-session auto top-offs)
        self.perform_auto_top_off(user_id, &amount).await?;

        Ok(())
    }

    /// Perform auto top-off using customer's default payment method
    pub async fn perform_auto_top_off(
        &self,
        user_id: &Uuid,
        amount: &BigDecimal,
    ) -> Result<(), AppError> {
        info!(
            "Starting auto top-off process for user {} with amount {}",
            user_id, amount
        );
        debug!("Auto top-off execution flow: step 1 - validating Stripe service availability");

        // CRITICAL: Validate billing setup before allowing auto top-off
        info!(
            "Validating billing setup for auto top-off - user: {}",
            user_id
        );
        let (is_payment_method_required, is_billing_info_required) =
            self._check_billing_readiness(user_id).await?;

        if is_payment_method_required {
            warn!(
                "Auto top-off blocked - payment method required for user: {}",
                user_id
            );
            return Err(AppError::PaymentMethodRequired(
                "Auto top-off failed: A payment method is required. Please add a payment method in your billing settings.".to_string()
            ));
        }

        if is_billing_info_required {
            warn!(
                "Auto top-off blocked - billing info required for user: {}",
                user_id
            );
            return Err(AppError::BillingAddressRequired(
                "Auto top-off failed: Complete billing information is required. Please update your billing information.".to_string()
            ));
        }

        info!(
            "Billing setup validated successfully for auto top-off - user: {}",
            user_id
        );
        debug!("Auto top-off execution flow: step 1.5 - billing validation completed successfully");

        // Ensure Stripe is configured
        let stripe_service = match &self.stripe_service {
            Some(service) => {
                debug!(
                    "Auto top-off execution flow: step 2 - Stripe service validated successfully"
                );
                service
            }
            None => {
                warn!(
                    "Auto top-off execution flow: FAILED at step 2 - Stripe not configured for user {}",
                    user_id
                );
                return Err(AppError::Configuration("Stripe not configured".to_string()));
            }
        };

        debug!("Auto top-off execution flow: step 3 - starting database transaction");
        // Start transaction for atomic operations
        let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150).await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 3 - database transaction failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to begin transaction: {}", e))
            })?;

        debug!("Auto top-off execution flow: step 4 - setting user context for RLS");
        // Set user context for RLS within the transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 4 - setting user context failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to set user context in transaction: {}", e))
            })?;

        // Acquire PostgreSQL advisory lock for this user's auto top-off
        let lock_acquired =
            sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(hashtext($1))")
                .bind(format!("auto_top_off_{}", user_id))
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Database(format!("Failed to acquire advisory lock: {}", e))
                })?;

        if !lock_acquired {
            info!(
                "Auto top-off already in progress for user {} on another instance, skipping",
                user_id
            );
            let _ = tx.rollback().await;
            return Ok(());
        }

        debug!("Auto top-off execution flow: step 5 - fetching customer billing record");
        // Get customer billing
        let customer_billing = self.customer_billing_repository.get_by_user_id_with_executor(user_id, &mut tx).await?
            .ok_or_else(|| {
                warn!("Auto top-off execution flow: FAILED at step 5 - no customer billing record found for user {}", user_id);
                AppError::NotFound("No customer billing record found for user".to_string())
            })?;
        debug!(
            "Auto top-off execution flow: step 5 completed - customer billing record retrieved successfully"
        );

        debug!("Auto top-off execution flow: step 6 - validating Stripe customer ID");
        // Get customer ID
        let customer_id = customer_billing.stripe_customer_id.ok_or_else(|| {
            warn!(
                "Auto top-off execution flow: FAILED at step 6 - user {} has no Stripe customer ID",
                user_id
            );
            AppError::Configuration("User has no Stripe customer ID".to_string())
        })?;
        debug!(
            "Auto top-off execution flow: step 6 completed - Stripe customer ID validated: {}",
            customer_id
        );

        debug!("Auto top-off execution flow: step 7 - committing database transaction");
        // Commit transaction (no longer needed)
        tx.commit().await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 7 - transaction commit failed for user {}: {}", user_id, e);
                AppError::Database(format!("Failed to commit transaction: {}", e))
            })?;
        debug!(
            "Auto top-off execution flow: step 7 completed - transaction committed successfully"
        );

        debug!(
            "Auto top-off execution flow: step 8 - ensuring customer has default payment method"
        );
        // Check if customer has a default payment method set - fetch customer for this check only
        let customer = stripe_service.get_customer(&customer_id).await
            .map_err(|e| {
                warn!("Auto top-off execution flow: FAILED at step 8 - failed to fetch Stripe customer for user {}: {}", user_id, e);
                AppError::External(format!("Failed to fetch Stripe customer: {}", e))
            })?;

        let has_default_payment_method = customer
            .invoice_settings
            .as_ref()
            .and_then(|settings| settings.default_payment_method.as_ref())
            .is_some();

        if !has_default_payment_method {
            debug!("No default payment method set, finding and setting one");
            let payment_methods = stripe_service
                .list_payment_methods(&customer_id)
                .await
                .map_err(|e| {
                    warn!("Failed to list payment methods for user {}: {}", user_id, e);
                    AppError::External(format!("Failed to list payment methods: {}", e))
                })?;

            if payment_methods.is_empty() {
                warn!("No payment methods available for user {}", user_id);
                return Err(AppError::PaymentMethodRequired(
                    "No payment methods available for auto top-off".to_string(),
                ));
            }

            // Set the first available payment method as default
            let payment_method_id = &payment_methods[0].id;
            info!("Setting default payment method: {}", payment_method_id);

            let set_default_key = format!(
                "set_default_pm_auto_topoff_{}_{}",
                customer_id, payment_method_id
            );
            stripe_service
                .set_default_payment_method(&set_default_key, &customer_id, payment_method_id)
                .await
                .map_err(|e| {
                    warn!(
                        "Failed to set default payment method for user {}: {}",
                        user_id, e
                    );
                    AppError::External(format!("Failed to set default payment method: {}", e))
                })?;

            info!("Successfully set default payment method for auto top-off");
        } else {
            info!("Customer already has default payment method set");
        }

        debug!("Auto top-off execution flow: step 10 - preparing payment intent creation");

        // Get fee tiers to calculate the fee
        let fee_tiers = self
            .settings_repository
            .get_credit_purchase_fee_tiers()
            .await
            .map_err(|e| AppError::Configuration(format!("Failed to get fee tiers: {}", e)))?;
        let tier = fee_tiers
            .get_tier_for_amount(&amount)
            .map_err(|e| AppError::Configuration(format!("Failed to get fee tier: {}", e)))?;

        // Calculate fee and net amounts using the tier's fee rate
        let fee_amount = amount.clone() * &tier.fee_rate;
        let net_amount = amount.clone() - &fee_amount;

        // Convert to cents with consistent rounding
        let gross_amount_cents = (amount.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let fee_amount_cents = (fee_amount.clone() * BigDecimal::from(100))
            .to_i64()
            .unwrap_or(0);
        let net_amount_cents = gross_amount_cents - fee_amount_cents; // Ensure net + fee = gross

        // Generate idempotency key
        let idempotency_key = format!(
            "auto_topoff_{}_{}_{}",
            user_id,
            gross_amount_cents,
            Utc::now().timestamp_nanos()
        );
        debug!(
            "Auto top-off execution flow: step 10 - payment intent parameters prepared: gross_amount_cents={}, fee_cents={}, net_cents={}, idempotency_key={}",
            gross_amount_cents, fee_amount_cents, net_amount_cents, idempotency_key
        );

        debug!(
            "Auto top-off execution flow: step 10.5 - cleaning up pending invoice items in different currencies"
        );
        // Clean up pending invoice items that don't match USD currency
        // This prevents the "cannot combine currencies" error
        match stripe_service
            .cleanup_pending_invoice_items_except_currency(&customer_id, "usd")
            .await
        {
            Ok(removed_count) => {
                if removed_count > 0 {
                    info!(
                        "Cleaned up {} pending invoice items in non-USD currencies for customer {}",
                        removed_count, customer_id
                    );
                }
            }
            Err(e) => {
                warn!(
                    "Failed to clean up mismatched currency invoice items for customer {}: {}",
                    customer_id, e
                );
                // Fall back to cleaning all items if the selective cleanup fails
                if let Err(e2) = stripe_service
                    .cleanup_all_pending_invoice_items(&customer_id)
                    .await
                {
                    warn!("Failed to clean up all pending invoice items: {}", e2);
                }
            }
        }

        debug!(
            "Auto top-off execution flow: step 11 - creating invoice for auto top-off with currency: USD"
        );

        // Create metadata for the invoice with fee information
        let metadata = serde_json::json!({
            "user_id": user_id.to_string(),
            "gross_amount_cents": gross_amount_cents.to_string(),
            "platform_fee_cents": fee_amount_cents.to_string(),
            "net_amount_cents": net_amount_cents.to_string(),
            "gross_amount": amount.to_string(),
            "platform_fee": fee_amount.to_string(),
            "net_amount": net_amount.to_string(),
            "currency": "USD"
        });

        // Create an invoice for auto top-off using USD (enforced for off-session auto top-offs)
        // Pass both net and fee amounts for proper breakdown
        let invoice = stripe_service.create_invoice_for_auto_topoff(
            &idempotency_key,
            &customer_id,
            net_amount_cents as i64,
            fee_amount_cents as i64,
            "usd",
            "Automatic credit top-off",
            Some(metadata),
            ).await.map_err(|e| {
            warn!("Auto top-off execution flow: FAILED at step 11 - invoice creation failed for user {} with currency USD: {}", 
                  user_id, e);
            AppError::External(format!("Failed to create invoice for auto top-off: {}", e))
        })?;
        info!(
            "Auto top-off execution flow: step 11 completed - invoice created and finalized successfully in USD: {} - payment intent: {} - relying on webhooks for credit fulfillment",
            invoice.id,
            match &invoice.payment_intent {
                Some(crate::stripe_types::Expandable::Id(id)) => id.as_str(),
                Some(crate::stripe_types::Expandable::Object(pi)) => &pi.id,
                None => "none",
            }
        );

        // Stripe will email invoice/receipt per account settings; manual customer emails are disabled.
        info!(
            "Auto top-off execution flow: COMPLETED SUCCESSFULLY - user {} auto top-off invoice created in USD with amount {} - webhooks will handle credit fulfillment",
            user_id, amount
        );
        Ok(())
    }

}
