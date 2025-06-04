use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String, // Stripe invoice ID
    pub user_id: Uuid,
    pub stripe_customer_id: String,
    pub stripe_subscription_id: Option<String>,
    pub amount_due: BigDecimal,
    pub amount_paid: BigDecimal,
    pub currency: String,
    pub status: String,
    pub invoice_pdf_url: Option<String>,
    pub hosted_invoice_url: Option<String>,
    pub billing_reason: Option<String>,
    pub description: Option<String>,
    pub period_start: Option<DateTime<Utc>>,
    pub period_end: Option<DateTime<Utc>>,
    pub due_date: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub finalized_at: Option<DateTime<Utc>>,
    pub paid_at: Option<DateTime<Utc>>,
    pub voided_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct InvoiceRepository {
    pool: PgPool,
}

impl InvoiceRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Create or update an invoice from Stripe webhook data
    pub async fn create_or_update(&self, invoice: &Invoice) -> Result<Invoice, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.create_or_update_with_executor(invoice, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    /// Create or update an invoice from Stripe webhook data with custom executor
    pub async fn create_or_update_with_executor(&self, invoice: &Invoice, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Invoice, AppError>
    {
        let updated_invoice = sqlx::query_as!(
            Invoice,
            r#"
            INSERT INTO invoices (
                id, user_id, stripe_customer_id, stripe_subscription_id,
                amount_due, amount_paid, currency, status, invoice_pdf_url,
                hosted_invoice_url, billing_reason, description, period_start,
                period_end, due_date, created_at, finalized_at, paid_at,
                voided_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                amount_due = EXCLUDED.amount_due,
                amount_paid = EXCLUDED.amount_paid,
                status = EXCLUDED.status,
                invoice_pdf_url = EXCLUDED.invoice_pdf_url,
                hosted_invoice_url = EXCLUDED.hosted_invoice_url,
                billing_reason = EXCLUDED.billing_reason,
                description = EXCLUDED.description,
                period_start = EXCLUDED.period_start,
                period_end = EXCLUDED.period_end,
                due_date = EXCLUDED.due_date,
                finalized_at = EXCLUDED.finalized_at,
                paid_at = EXCLUDED.paid_at,
                voided_at = EXCLUDED.voided_at,
                updated_at = NOW()
            RETURNING *
            "#,
            invoice.id,
            invoice.user_id,
            invoice.stripe_customer_id,
            invoice.stripe_subscription_id,
            invoice.amount_due,
            invoice.amount_paid,
            invoice.currency,
            invoice.status,
            invoice.invoice_pdf_url,
            invoice.hosted_invoice_url,
            invoice.billing_reason,
            invoice.description,
            invoice.period_start,
            invoice.period_end,
            invoice.due_date,
            invoice.created_at,
            invoice.finalized_at,
            invoice.paid_at,
            invoice.voided_at,
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create/update invoice: {}", e)))?;

        Ok(updated_invoice)
    }

    /// Get invoice by Stripe invoice ID
    pub async fn get_by_id(&self, invoice_id: &str) -> Result<Option<Invoice>, AppError> {
        let invoice = sqlx::query_as!(
            Invoice,
            "SELECT * FROM invoices WHERE id = $1",
            invoice_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get invoice: {}", e)))?;

        Ok(invoice)
    }

    /// Get invoices for a user with pagination
    pub async fn get_by_user_id(
        &self,
        user_id: &Uuid,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<Invoice>, AppError> {
        let invoices = sqlx::query_as!(
            Invoice,
            r#"
            SELECT * FROM invoices 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit as i64,
            offset as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user invoices: {}", e)))?;

        Ok(invoices)
    }

    /// Get total count of invoices for a user
    pub async fn count_by_user_id(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM invoices WHERE user_id = $1",
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count user invoices: {}", e)))?;

        Ok(count.unwrap_or(0))
    }

    /// Get unpaid invoices for a user
    pub async fn get_unpaid_by_user_id(&self, user_id: &Uuid) -> Result<Vec<Invoice>, AppError> {
        let invoices = sqlx::query_as!(
            Invoice,
            r#"
            SELECT * FROM invoices 
            WHERE user_id = $1 AND status IN ('open', 'past_due')
            ORDER BY due_date ASC
            "#,
            user_id
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get unpaid invoices: {}", e)))?;

        Ok(invoices)
    }

    /// Get invoice by Stripe customer ID
    pub async fn get_by_stripe_customer_id(
        &self,
        stripe_customer_id: &str,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<Invoice>, AppError> {
        let invoices = sqlx::query_as!(
            Invoice,
            r#"
            SELECT * FROM invoices 
            WHERE stripe_customer_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
            "#,
            stripe_customer_id,
            limit as i64,
            offset as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get customer invoices: {}", e)))?;

        Ok(invoices)
    }

    /// Update invoice status
    pub async fn update_status(
        &self,
        invoice_id: &str,
        status: &str,
        paid_at: Option<DateTime<Utc>>,
        voided_at: Option<DateTime<Utc>>,
    ) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        self.update_status_with_executor(invoice_id, status, paid_at, voided_at, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(())
    }

    /// Update invoice status with custom executor
    pub async fn update_status_with_executor(
        &self,
        invoice_id: &str,
        status: &str,
        paid_at: Option<DateTime<Utc>>,
        voided_at: Option<DateTime<Utc>>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError>
    {
        sqlx::query!(
            r#"
            UPDATE invoices 
            SET status = $2, paid_at = $3, voided_at = $4, updated_at = NOW()
            WHERE id = $1
            "#,
            invoice_id,
            status,
            paid_at,
            voided_at
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update invoice status: {}", e)))?;

        Ok(())
    }

    /// Get invoices due for reminder notifications
    pub async fn get_due_for_reminders(&self) -> Result<Vec<Invoice>, AppError> {
        let now = Utc::now();
        let reminder_date = now + chrono::Duration::days(3); // 3 days before due

        let invoices = sqlx::query_as!(
            Invoice,
            r#"
            SELECT * FROM invoices 
            WHERE status = 'open' 
            AND due_date <= $1 
            AND due_date > $2
            ORDER BY due_date ASC
            "#,
            reminder_date,
            now
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get invoices due for reminders: {}", e)))?;

        Ok(invoices)
    }
}