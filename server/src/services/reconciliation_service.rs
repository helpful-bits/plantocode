use crate::error::AppError;
use crate::db::repositories::{UserCreditRepository, CreditTransactionRepository, UserCredit};
use crate::db::connection::DatabasePools;
use bigdecimal::BigDecimal;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use log::{info, warn, error, debug};

#[derive(Debug, Clone)]
pub struct ReconciliationService {
    user_credit_repository: Arc<UserCreditRepository>,
    credit_transaction_repository: Arc<CreditTransactionRepository>,
    db_pools: DatabasePools,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserBalanceDiscrepancy {
    pub user_id: Uuid,
    pub expected_balance: BigDecimal,    // Sum of all transactions
    pub actual_balance: BigDecimal,      // Current balance in user_credits
    pub discrepancy_amount: BigDecimal,  // actual - expected
    pub last_transaction_date: Option<DateTime<Utc>>,
    pub transaction_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationReport {
    pub report_id: Uuid,
    pub generated_at: DateTime<Utc>,
    pub total_users_checked: i64,
    pub users_with_discrepancies: i64,
    pub discrepancies: Vec<UserBalanceDiscrepancy>,
    pub total_discrepancy_amount: BigDecimal,
    pub largest_discrepancy: Option<BigDecimal>,
    pub reconciliation_summary: ReconciliationSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationSummary {
    pub total_expected_balance: BigDecimal,
    pub total_actual_balance: BigDecimal,
    pub system_level_discrepancy: BigDecimal,
}


impl ReconciliationService {
    pub fn new(db_pools: DatabasePools) -> Self {
        Self {
            user_credit_repository: Arc::new(UserCreditRepository::new(db_pools.user_pool.clone())),
            credit_transaction_repository: Arc::new(CreditTransactionRepository::new(db_pools.user_pool.clone())),
            db_pools,
        }
    }

    /// Verify balance against transactions for all users
    pub async fn verify_balance_against_transactions(&self) -> Result<Vec<UserBalanceDiscrepancy>, AppError> {
        info!("Starting balance verification against transaction history for all users");

        // Get all users who have either credits or transactions
        let user_balances = self.get_all_user_balances().await?;
        let transaction_totals = self.get_all_user_transaction_totals().await?;

        let mut discrepancies = Vec::new();

        // Create a set of all unique user IDs from both sources
        let mut all_user_ids = std::collections::HashSet::new();
        for balance in &user_balances {
            all_user_ids.insert(balance.user_id);
        }
        for (user_id, _) in &transaction_totals {
            all_user_ids.insert(*user_id);
        }

        info!("Checking balance consistency for {} users", all_user_ids.len());

        for user_id in all_user_ids {
            let actual_balance = user_balances
                .iter()
                .find(|b| b.user_id == user_id)
                .map(|b| b.balance.clone())
                .unwrap_or_else(|| BigDecimal::from(0));

            let (expected_balance, last_transaction_date, transaction_count) = transaction_totals
                .get(&user_id)
                .cloned()
                .unwrap_or((BigDecimal::from(0), None, 0));

            let discrepancy_amount = &actual_balance - &expected_balance;

            // Only report discrepancies that are non-zero (accounting for precision issues)
            let tolerance = BigDecimal::from(1) / BigDecimal::from(10000); // 0.0001
            if discrepancy_amount.abs() > tolerance {
                error!(
                    "Balance discrepancy detected for user {}: expected {}, actual {}, discrepancy {}",
                    user_id, expected_balance, actual_balance, discrepancy_amount
                );

                discrepancies.push(UserBalanceDiscrepancy {
                    user_id,
                    expected_balance,
                    actual_balance,
                    discrepancy_amount,
                    last_transaction_date,
                    transaction_count,
                });
            } else {
                debug!(
                    "Balance verified for user {}: expected {}, actual {} (within tolerance)",
                    user_id, expected_balance, actual_balance
                );
            }
        }

        if discrepancies.is_empty() {
            info!("Balance verification completed successfully - no discrepancies found");
        } else {
            warn!("Balance verification completed with {} discrepancies found", discrepancies.len());
        }

        Ok(discrepancies)
    }

    /// Generate comprehensive reconciliation report
    pub async fn generate_reconciliation_report(&self) -> Result<ReconciliationReport, AppError> {
        info!("Generating comprehensive reconciliation report");

        let discrepancies = self.verify_balance_against_transactions().await?;
        let user_balances = self.get_all_user_balances().await?;
        let transaction_totals = self.get_all_user_transaction_totals().await?;

        // Calculate summary statistics
        let total_users_checked = std::cmp::max(user_balances.len(), transaction_totals.len()) as i64;
        let users_with_discrepancies = discrepancies.len() as i64;

        let total_discrepancy_amount = discrepancies
            .iter()
            .fold(BigDecimal::from(0), |acc, d| acc + &d.discrepancy_amount);

        let largest_discrepancy = discrepancies
            .iter()
            .map(|d| d.discrepancy_amount.abs())
            .max()
            .filter(|d| d != &BigDecimal::from(0));

        // Calculate system-level summary
        let total_actual_balance = user_balances
            .iter()
            .fold(BigDecimal::from(0), |acc, b| acc + &b.balance);

        let total_expected_balance = transaction_totals
            .values()
            .fold(BigDecimal::from(0), |acc, (balance, _, _)| acc + balance);

        let system_level_discrepancy = &total_actual_balance - &total_expected_balance;

        let reconciliation_summary = ReconciliationSummary {
            total_expected_balance,
            total_actual_balance,
            system_level_discrepancy,
        };

        let report = ReconciliationReport {
            report_id: Uuid::new_v4(),
            generated_at: Utc::now(),
            total_users_checked,
            users_with_discrepancies,
            discrepancies,
            total_discrepancy_amount,
            largest_discrepancy,
            reconciliation_summary,
        };

        info!(
            "Reconciliation report generated: {} users checked, {} discrepancies found, total discrepancy: {}",
            report.total_users_checked,
            report.users_with_discrepancies,
            report.total_discrepancy_amount
        );

        if report.users_with_discrepancies > 0 {
            error!(
                "FINANCIAL RECONCILIATION ALERT: {} users have balance discrepancies totaling {}",
                report.users_with_discrepancies,
                report.total_discrepancy_amount
            );
        }

        Ok(report)
    }

    /// Get all user balances from user_credits table
    async fn get_all_user_balances(&self) -> Result<Vec<UserCredit>, AppError> {
        let pool = self.user_credit_repository.get_pool();
        let result = sqlx::query_as!(
            UserCredit,
            r#"
            SELECT user_id, balance, currency, free_credit_balance, 
                   free_credits_granted_at, free_credits_expires_at, free_credits_expired,
                   created_at, updated_at
            FROM user_credits
            ORDER BY user_id
            "#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch all user balances: {}", e)))?;

        Ok(result)
    }

    /// Get transaction totals per user
    async fn get_all_user_transaction_totals(&self) -> Result<std::collections::HashMap<Uuid, (BigDecimal, Option<DateTime<Utc>>, i64)>, AppError> {
        let pool = self.credit_transaction_repository.get_pool();

        let results = sqlx::query!(
            r#"
            SELECT 
                user_id,
                SUM(net_amount) as transaction_total,
                MAX(created_at) as last_transaction_date,
                COUNT(*) as transaction_count
            FROM credit_transactions 
            GROUP BY user_id
            "#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch transaction totals: {}", e)))?;

        let mut transaction_totals = std::collections::HashMap::new();
        for row in results {
            let total = row.transaction_total.unwrap_or_else(|| BigDecimal::from(0));
            let last_date = row.last_transaction_date;
            let count = row.transaction_count.unwrap_or(0);
            
            transaction_totals.insert(row.user_id, (total, last_date, count));
        }

        Ok(transaction_totals)
    }

    /// Perform automated consistency checks for a specific user
    pub async fn check_user_consistency(&self, user_id: &Uuid) -> Result<Option<UserBalanceDiscrepancy>, AppError> {
        debug!("Checking consistency for user: {}", user_id);

        // Get user's current balance
        let user_balance = self.user_credit_repository.get_balance(user_id).await?;
        let actual_balance = user_balance
            .map(|b| b.balance)
            .unwrap_or_else(|| BigDecimal::from(0));

        // Get user's transaction total
        let transaction_stats = self.get_user_transaction_total(user_id).await?;
        let expected_balance = transaction_stats.0;
        let last_transaction_date = transaction_stats.1;
        let transaction_count = transaction_stats.2;

        let discrepancy_amount = &actual_balance - &expected_balance;

        // Return discrepancy if significant (accounting for precision issues)
        let tolerance = BigDecimal::from(1) / BigDecimal::from(10000); // 0.0001
        if discrepancy_amount.abs() > tolerance {
            error!(
                "Balance discrepancy for user {}: expected {}, actual {}, discrepancy {}",
                user_id, expected_balance, actual_balance, discrepancy_amount
            );

            Ok(Some(UserBalanceDiscrepancy {
                user_id: *user_id,
                expected_balance,
                actual_balance,
                discrepancy_amount,
                last_transaction_date,
                transaction_count,
            }))
        } else {
            debug!("Balance consistent for user {}", user_id);
            Ok(None)
        }
    }

    /// Get transaction total for a specific user
    async fn get_user_transaction_total(&self, user_id: &Uuid) -> Result<(BigDecimal, Option<DateTime<Utc>>, i64), AppError> {
        let pool = self.credit_transaction_repository.get_pool();

        let result = sqlx::query!(
            r#"
            SELECT 
                COALESCE(SUM(net_amount), 0) as transaction_total,
                MAX(created_at) as last_transaction_date,
                COUNT(*) as transaction_count
            FROM credit_transactions 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch user transaction total: {}", e)))?;

        let total = result.transaction_total.unwrap_or_else(|| BigDecimal::from(0));
        let last_date = result.last_transaction_date;
        let count = result.transaction_count.unwrap_or(0);

        Ok((total, last_date, count))
    }









    /// Get a reference to the underlying database pools for external access
    pub fn get_db_pools(&self) -> &DatabasePools {
        &self.db_pools
    }
}