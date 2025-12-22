use crate::error::AppError;
use crate::services::billing_service::BillingService;
use bigdecimal::BigDecimal;
use log::{debug, info, warn};
use uuid::Uuid;

impl BillingService {
    pub async fn has_blocking_billing_state(&self, user_id: &Uuid) -> Result<bool, AppError> {
        // This method is the single place where we can enforce
        // "billing must be clear before account deletion" rules.
        //
        // Current behavior:
        // - We do NOT block deletion on billing today.
        // - We always return false and allow the delete to proceed.
        //
        // Security / architecture notes:
        // - Account deletion is a privileged, system-level operation.
        // - Any future blocking checks here MUST use the system pool
        //   (self.db_pools.system_pool) under the elevated role,
        //   with explicit WHERE user_id = $1 filters.
        // - Do NOT call RLS-bound, user-pool repositories such as
        //   customer_billing_repository.get_by_user_id(...) here.
        //   Those helpers open their own transactions and manipulate
        //   app.current_user_id for RLS, which is appropriate for
        //   normal user flows but not for system-level deletion.
        //
        // Future implementation sketch (not implemented yet):
        // - Use sqlx::query!/query_as! on self.db_pools.system_pool to load
        //   any data needed to decide blocking conditions, e.g.:
        //     - active Stripe subscriptions
        //     - unpaid invoices or outstanding balances
        //     - active payment disputes
        // - Optionally combine with StripeService checks for live
        //   subscription/dispute state.
        // - Based on those checks, compute a boolean and return
        //   Ok(true) to block or Ok(false) to allow deletion.
        //
        // Until those business rules are implemented, we keep this
        // as a non-blocking stub to avoid brittle DB/RLS behavior.
        info!("Checking blocking billing state for user {}", user_id);

        Ok(false)
    }

    /// Delete all billing-related data for a user.
    /// This should be called within a transaction before deleting the user.
    pub async fn delete_user_billing_data(
        &self,
        user_id: &Uuid,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        info!("Deleting billing data for user_id: {}", user_id);

        // Most billing data will be deleted automatically via CASCADE:
        // - customer_billing (CASCADE)
        // - credit_transactions (CASCADE)
        // - user_credits (CASCADE)
        // - api_usage (CASCADE)

        // Best-effort read of Stripe customer id using the same system_pool
        // transaction as the user delete. We do not rely on RLS here.
        let billing_row = sqlx::query!(
            r#"
            SELECT stripe_customer_id
            FROM customer_billing
            WHERE user_id = $1
            LIMIT 1
            "#,
            user_id
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| {
            AppError::Database(format!(
                "Failed to load customer billing for user deletion: {}",
                e
            ))
        })?;

        if let Some(row) = billing_row {
            if let Some(stripe_customer_id) = row.stripe_customer_id {
                info!(
                    "User {} has Stripe customer {}, allowing DB delete and leaving Stripe customer for audit",
                    user_id, stripe_customer_id
                );
                // In the future we might delete or anonymize the Stripe
                // customer via StripeService here, but for now we keep it
                // for audit / reconciliation purposes.
            }
        }

        // All CASCADE deletions will happen automatically when the user is deleted
        info!("Billing data cleanup completed for user_id: {}", user_id);

        Ok(())
    }
}
