use crate::db::repositories::user_repository::UserRepository;
use crate::error::AppError;
use crate::models::billing::CustomerBillingInfo;
use crate::services::billing_service::BillingService;
use crate::services::stripe_service::StripeService;
use log::{error, info, warn};
use uuid::Uuid;

impl BillingService {
    /// Get or create Stripe customer for a user (public method for handlers)
    pub async fn get_or_create_stripe_customer(&self, user_id: &Uuid) -> Result<String, AppError> {
        // 1. Check local DB first - use short-lived transaction
        let existing_stripe_id = {
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
                .map_err(|e| {
                    AppError::Database(format!("Failed to set user context in transaction: {}", e))
                })?;

            let customer_billing = self
                .customer_billing_repository
                .get_by_user_id_with_executor(user_id, &mut tx)
                .await?;
            let stripe_id = customer_billing.and_then(|cb| cb.stripe_customer_id);

            tx.commit()
                .await
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            stripe_id
        };

        // 2. If found in DB, verify it still exists in Stripe
        if let Some(ref stripe_id) = existing_stripe_id {
            let stripe_service = self.get_stripe_service()?;
            match stripe_service.get_customer(stripe_id).await {
                Ok(customer) => {
                    // Check if customer is deleted (though this shouldn't happen with current Stripe API behavior)
                    if !customer.deleted.unwrap_or(false) {
                        // Customer exists and is not deleted, we're good
                        return Ok(stripe_id.clone());
                    }
                    warn!(
                        "Stripe customer {} is marked as deleted for user {}. Will create a new one.",
                        stripe_id, user_id
                    );
                }
                Err(e) => {
                    // Check error type
                    let error_str = e.to_string();

                    // When a customer is deleted, Stripe returns a minimal object that fails to parse
                    // because it's missing required fields like 'created'
                    if error_str.contains("missing field") && error_str.contains("created") {
                        warn!(
                            "Stripe customer {} is deleted (parsing failed due to missing fields) for user {}. Will create a new one.",
                            stripe_id, user_id
                        );
                    } else if error_str.contains("No such customer")
                        || error_str.contains("resource_missing")
                    {
                        warn!(
                            "Stripe customer {} does not exist for user {}. Will create a new one.",
                            stripe_id, user_id
                        );
                    } else {
                        // Some other error, propagate it
                        return Err(AppError::External(format!(
                            "Failed to verify Stripe customer: {}",
                            e
                        )));
                    }
                }
            }
            // If we reach here, the customer was deleted/missing - continue to create new one
        }

        // 3. Search Stripe for existing customer by user_id
        let stripe_service = self.get_stripe_service()?;
        if let Some(customer) = stripe_service
            .search_customer_by_user_id(user_id)
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to search for Stripe customer: {}", e))
            })?
        {
            // Start new transaction for upsert
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
                .map_err(|e| {
                    AppError::Database(format!("Failed to set user context in transaction: {}", e))
                })?;

            self.customer_billing_repository
                .upsert_stripe_customer_id_with_executor(user_id, &customer.id, &mut tx)
                .await?;
            tx.commit()
                .await
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            return Ok(customer.id);
        }

        // 3. Create a new Stripe customer
        let user_repo = UserRepository::new(self.db_pools.system_pool.clone());
        let user = user_repo.get_by_id(user_id).await?;
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let new_customer = stripe_service
            .create_customer(
                &idempotency_key,
                user_id,
                &user.email,
                user.full_name.as_deref(),
            )
            .await
            .map_err(|e| AppError::External(format!("Failed to create Stripe customer: {}", e)))?;

        info!(
            "Created new Stripe customer {} for user {} (replacing: {:?})",
            new_customer.id, user_id, existing_stripe_id
        );

        // 4. Start new transaction for upsert after Stripe API call
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

        self.customer_billing_repository
            .upsert_stripe_customer_id_with_executor(user_id, &new_customer.id, &mut tx)
            .await?;

        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(new_customer.id)
    }

    /// Get access to the StripeService for advanced operations
    pub fn get_stripe_service(&self) -> Result<&StripeService, AppError> {
        match &self.stripe_service {
            Some(service) => Ok(service),
            None => Err(AppError::Configuration("Stripe not configured".to_string())),
        }
    }

    /// Get detailed payment methods with default flag
    pub async fn get_detailed_payment_methods(
        &self,
        user_id: &Uuid,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let stripe_service = self.get_stripe_service()?;

        // Get or create Stripe customer
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        // Concurrently fetch customer details and payment methods
        let (customer, payment_methods) = tokio::try_join!(
            stripe_service.get_customer(&customer_id),
            stripe_service.list_payment_methods(&customer_id)
        )
        .map_err(|e| AppError::External(format!("Failed to fetch customer data: {}", e)))?;

        // Get the default payment method ID from customer
        let default_payment_method_id = customer
            .invoice_settings
            .as_ref()
            .and_then(|settings| settings.default_payment_method.as_ref())
            .map(|pm| pm.to_string());

        // Build response with isDefault flag
        let detailed_methods: Vec<serde_json::Value> = payment_methods
            .into_iter()
            .map(|pm| {
                let is_default = default_payment_method_id
                    .as_ref()
                    .map(|default_id| *default_id == pm.id.to_string())
                    .unwrap_or(false);

                serde_json::json!({
                    "id": pm.id,
                    "type": format!("{:?}", pm.type_),
                    "card": pm.card.as_ref().map(|card| serde_json::json!({
                        "brand": card.brand,
                        "last4": card.last4,
                        "expMonth": card.exp_month,
                        "expYear": card.exp_year,
                    })),
                    "created": pm.created,
                    "isDefault": is_default
                })
            })
            .collect();

        Ok(detailed_methods)
    }

    // Create billing portal session with state locking
    pub async fn create_billing_portal_session(&self, user_id: &Uuid) -> Result<String, AppError> {
        let stripe_service = self.get_stripe_service()?;

        // This is now much simpler. The function below handles all logic.
        let customer_id = self.get_or_create_stripe_customer(user_id).await?;

        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let session = stripe_service
            .create_billing_portal_session(
                &idempotency_key,
                &customer_id,
                &self.app_settings.stripe.portal_return_url,
            )
            .await
            .map_err(|e| {
                AppError::External(format!("Failed to create billing portal session: {}", e))
            })?;

        info!("Created billing portal session for user {}", user_id);
        Ok(session.url)
    }

    pub async fn get_customer_billing_info(
        &self,
        user_id: &Uuid,
    ) -> Result<Option<CustomerBillingInfo>, AppError> {
        let stripe_service = match &self.stripe_service {
            Some(service) => service,
            None => return Ok(None),
        };

        // This function is now strictly read-only regarding our database.
        let mut tx =
            crate::db::pool_ext::AcquireRetry::begin_with_retry(&self.db_pools.user_pool, 3, 150)
                .await
                .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let maybe_stripe_id = if let Some(billing) = self
            .customer_billing_repository
            .get_by_user_id_with_executor(user_id, &mut tx)
            .await?
        {
            billing.stripe_customer_id
        } else {
            None
        };
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        let customer_id = if let Some(id) = maybe_stripe_id {
            id
        } else {
            // If not found locally, search Stripe without writing to DB
            if let Some(customer) = stripe_service
                .search_customer_by_user_id(user_id)
                .await
                .map_err(|e| {
                    AppError::External(format!("Failed to search for Stripe customer: {}", e))
                })?
            {
                customer.id
            } else {
                return Ok(None); // No Stripe customer exists for this user.
            }
        };

        // Fetch full customer object from Stripe
        let customer = stripe_service
            .get_customer(&customer_id)
            .await
            .map_err(|e| {
                error!(
                    "Failed to fetch customer {} from Stripe: {:?}",
                    customer_id, e
                );
                AppError::from(e)
            })?;

        Ok(Some(CustomerBillingInfo::from(&customer)))
    }
}
