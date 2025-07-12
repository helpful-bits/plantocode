//! Financial validation utilities for secure credit transaction handling
//! 
//! This module provides validation functions for BigDecimal amounts used in
//! financial transactions to ensure data integrity and prevent security issues.

use bigdecimal::{BigDecimal, RoundingMode};
use crate::error::AppError;

/// Maximum allowed decimal places for financial amounts (6 for high precision calculations)
pub const MAX_DECIMAL_PLACES: u64 = 6;

/// Normalizes a BigDecimal amount to 6 decimal places using HALF_EVEN rounding
/// 
/// Uses banker's rounding (round to even) which provides better distribution
/// of rounding errors in financial calculations
pub fn normalize_cost(amount: &BigDecimal) -> BigDecimal {
    amount.with_scale_round(MAX_DECIMAL_PLACES as i64, RoundingMode::HalfEven)
}

/// Validates that a BigDecimal amount is non-negative and has appropriate precision
/// 
/// # Arguments
/// * `amount` - The BigDecimal amount to validate
/// * `operation_name` - Description of the operation for error messages
/// 
/// # Returns
/// * `Ok(())` if the amount is valid
/// * `Err(AppError)` if validation fails
pub fn validate_financial_amount(amount: &BigDecimal, operation_name: &str) -> Result<(), AppError> {
    // Check for negative amounts
    if amount < &BigDecimal::from(0) {
        return Err(AppError::InvalidArgument(
            format!("{} amount cannot be negative: {}", operation_name, amount)
        ));
    }
    
    // Check decimal precision
    if amount.fractional_digit_count() > MAX_DECIMAL_PLACES as i64 {
        return Err(AppError::InvalidArgument(
            format!("{} amount cannot exceed {} decimal places: {}", 
                operation_name, MAX_DECIMAL_PLACES, amount)
        ));
    }
    
    // Check normalization - ensure no precision would be lost
    if amount != &normalize_cost(amount) {
        return Err(AppError::InvalidArgument(
            format!("{} amount would lose precision during normalization: {}", operation_name, amount)
        ));
    }
    
    Ok(())
}

/// Validates that a credit balance adjustment would not result in a negative balance
/// 
/// # Arguments
/// * `current_balance` - The current balance before adjustment
/// * `adjustment` - The adjustment amount (can be positive or negative)
/// * `operation_name` - Description of the operation for error messages
/// 
/// # Returns
/// * `Ok(BigDecimal)` - The calculated new balance if valid
/// * `Err(AppError)` if the adjustment would result in a negative balance
pub fn validate_balance_adjustment(
    current_balance: &BigDecimal, 
    adjustment: &BigDecimal, 
    operation_name: &str
) -> Result<BigDecimal, AppError> {
    let potential_new_balance = current_balance + adjustment;
    
    if potential_new_balance < BigDecimal::from(0) {
        return Err(AppError::InvalidArgument(
            format!("{} would result in negative balance. Current: {}, Adjustment: {}, Resulting: {}", 
                operation_name, current_balance, adjustment, potential_new_balance)
        ));
    }
    
    Ok(potential_new_balance)
}

/// Validates a credit purchase amount (must be positive and properly formatted)
/// 
/// # Arguments
/// * `amount` - The purchase amount to validate
/// 
/// # Returns
/// * `Ok(())` if the amount is valid for purchase
/// * `Err(AppError)` if validation fails
pub fn validate_credit_purchase_amount(amount: &BigDecimal) -> Result<(), AppError> {
    validate_financial_amount(amount, "Credit purchase")?;
    
    // Check normalization - ensure no precision would be lost
    if amount != &normalize_cost(amount) {
        return Err(AppError::InvalidArgument(
            format!("Credit purchase amount would lose precision during normalization: {}", amount)
        ));
    }
    
    // Additional validation for purchases - must be positive (not just non-negative)
    if amount == &BigDecimal::from(0) {
        return Err(AppError::InvalidArgument(
            "Credit purchase amount must be greater than zero".to_string()
        ));
    }
    
    Ok(())
}

/// Validates a credit refund amount (must be positive and properly formatted)
/// 
/// # Arguments
/// * `amount` - The refund amount to validate
/// 
/// # Returns
/// * `Ok(())` if the amount is valid for refund
/// * `Err(AppError)` if validation fails
pub fn validate_credit_refund_amount(amount: &BigDecimal) -> Result<(), AppError> {
    // Check for precision errors first
    let normalized_amount = normalize_cost(amount);
    if amount != &normalized_amount {
        return Err(AppError::InvalidArgument(
            format!("Credit refund amount has precision errors. Original: {}, Normalized: {}", 
                amount, normalized_amount)
        ));
    }
    
    validate_financial_amount(amount, "Credit refund")?;
    
    // Additional validation for refunds - must be positive (not just non-negative)
    if amount == &BigDecimal::from(0) {
        return Err(AppError::InvalidArgument(
            "Credit refund amount must be greater than zero".to_string()
        ));
    }
    
    Ok(())
}

/// Validates a credit adjustment amount (can be positive or negative, but must have proper precision)
/// 
/// # Arguments
/// * `amount` - The adjustment amount to validate
/// 
/// # Returns
/// * `Ok(())` if the amount is valid for adjustment
/// * `Err(AppError)` if validation fails
pub fn validate_credit_adjustment_amount(amount: &BigDecimal) -> Result<(), AppError> {
    // Check for precision errors first
    let normalized_amount = normalize_cost(amount);
    if amount != &normalized_amount {
        return Err(AppError::InvalidArgument(
            format!("Credit adjustment amount has precision errors. Original: {}, Normalized: {}", 
                amount, normalized_amount)
        ));
    }
    
    // For adjustments, we only check precision, not sign (can be positive or negative)
    if amount.fractional_digit_count() > MAX_DECIMAL_PLACES as i64 {
        return Err(AppError::InvalidArgument(
            format!("Credit adjustment amount cannot exceed {} decimal places: {}", 
                MAX_DECIMAL_PLACES, amount)
        ));
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    
    #[test]
    fn test_validate_financial_amount_valid() {
        let amount = BigDecimal::from_str("10.123456").unwrap();
        assert!(validate_financial_amount(&amount, "Test").is_ok());
    }
    
    #[test]
    fn test_validate_financial_amount_negative() {
        let amount = BigDecimal::from_str("-10.00").unwrap();
        assert!(validate_financial_amount(&amount, "Test").is_err());
    }
    
    #[test]
    fn test_validate_financial_amount_too_many_decimals() {
        let amount = BigDecimal::from_str("10.1234567").unwrap();
        assert!(validate_financial_amount(&amount, "Test").is_err());
    }
    
    #[test]
    fn test_validate_balance_adjustment_positive() {
        let current = BigDecimal::from_str("100.00").unwrap();
        let adjustment = BigDecimal::from_str("50.00").unwrap();
        let result = validate_balance_adjustment(&current, &adjustment, "Test");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), BigDecimal::from_str("150.00").unwrap());
    }
    
    #[test]
    fn test_validate_balance_adjustment_negative_result() {
        let current = BigDecimal::from_str("100.00").unwrap();
        let adjustment = BigDecimal::from_str("-150.00").unwrap();
        assert!(validate_balance_adjustment(&current, &adjustment, "Test").is_err());
    }
}