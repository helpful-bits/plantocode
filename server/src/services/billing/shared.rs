use crate::error::AppError;
use crate::models::billing::BillingDashboardData;
use crate::services::billing_service::BillingService;
use bigdecimal::{BigDecimal, FromPrimitive, ToPrimitive};
use log::{debug, info, warn};
use uuid::Uuid;

impl BillingService {
    pub(crate) async fn _check_billing_readiness(&self, user_id: &Uuid) -> Result<(bool, bool), AppError> {
        let stripe_service = self.get_stripe_service()?;

        // Read-only lookup for stripe_customer_id
        let customer_id = {
            let mut tx = crate::db::pool_ext::AcquireRetry::begin_with_retry(
                &self.db_pools.user_pool,
                3,
                150,
            )
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
            sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
                .bind(user_id.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;
            let maybe_id = self
                .customer_billing_repository
                .get_by_user_id_with_executor(user_id, &mut tx)
                .await?
                .and_then(|b| b.stripe_customer_id);
            tx.commit()
                .await
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

            if let Some(id) = maybe_id {
                id
            } else if let Some(customer) = stripe_service
                .search_customer_by_user_id(user_id)
                .await
                .map_err(|e| {
                    AppError::External(format!("Failed to search for Stripe customer: {}", e))
                })?
            {
                customer.id
            } else {
                // No Stripe customer exists - both payment method and billing info are required
                return Ok((true, true));
            }
        };

        let (customer, payment_methods) = tokio::try_join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.list_payment_methods(&customer_id)
        )
        .map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        let has_default_payment_method = customer
            .invoice_settings
            .as_ref()
            .and_then(|s| s.default_payment_method.as_ref())
            .is_some();
        let has_any_payment_methods = !payment_methods.is_empty();
        let is_payment_method_required = !has_default_payment_method || !has_any_payment_methods;
        let is_billing_address_complete = customer.address.as_ref().map_or(false, |addr| {
            addr.line1.is_some()
                && addr.city.is_some()
                && addr.postal_code.is_some()
                && addr.country.is_some()
        });
        let is_shipping_address_complete = customer
            .shipping
            .as_ref()
            .and_then(|s| s.address.as_ref())
            .map_or(false, |addr| {
                addr.line1.is_some()
                    && addr.city.is_some()
                    && addr.postal_code.is_some()
                    && addr.country.is_some()
            });
        let is_billing_info_required = customer.name.is_none()
            || (!is_billing_address_complete && !is_shipping_address_complete);
        Ok((is_payment_method_required, is_billing_info_required))
    }

    pub async fn get_billing_dashboard_data(
        &self,
        user_id: &Uuid,
    ) -> Result<BillingDashboardData, AppError> {
        debug!("Fetching billing dashboard data for user: {}", user_id);

        // Get credit balance, billing readiness, and customer billing info concurrently
        let (credit_balance_res, billing_readiness_res, customer_billing_info_res) = tokio::join!(
            self.credit_service.get_user_balance(user_id),
            self._check_billing_readiness(user_id),
            self.get_customer_billing_info(user_id)
        );

        let credit_balance = credit_balance_res?;

        // Get the free credits amount from database configuration
        let usage_limit_usd = match self.settings_repository.get_free_credits_amount().await {
            Ok(amount) => amount.to_f64().unwrap_or(2.0),
            Err(e) => {
                warn!(
                    "Failed to get free credits amount from database, using fallback: {}",
                    e
                );
                2.0 // Fallback to $2.00 if database read fails
            }
        };
        let free_credit_balance_usd = credit_balance.free_credit_balance.to_f64().unwrap_or(0.0);
        let current_usage = (usage_limit_usd - free_credit_balance_usd).max(0.0);

        let (is_payment_method_required, is_billing_info_required) = match billing_readiness_res {
            Ok(readiness) => readiness,
            Err(e) => {
                warn!(
                    "Could not check billing readiness for user {}: {}. Defaulting to not required to avoid blocking user.",
                    user_id, e
                );
                (false, false)
            }
        };

        let customer_billing_info = customer_billing_info_res?;

        // Calculate total balance
        let total_balance = &credit_balance.balance + &credit_balance.free_credit_balance;

        // Build response with readiness flags and customer billing info
        let dashboard_data = BillingDashboardData {
            credit_balance_usd: credit_balance.balance.to_f64().unwrap_or(0.0),
            free_credit_balance_usd: credit_balance.free_credit_balance.to_f64().unwrap_or(0.0),
            free_credits_expires_at: credit_balance.free_credits_expires_at,
            services_blocked: total_balance <= BigDecimal::from(0),
            is_payment_method_required,
            is_billing_info_required,
            customer_billing_info,
            usage_limit_usd,
            current_usage,
        };

        info!(
            "Successfully assembled billing dashboard data for user: {}",
            user_id
        );
        Ok(dashboard_data)
    }
}
