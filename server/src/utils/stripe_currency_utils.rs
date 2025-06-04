use bigdecimal::{BigDecimal, ToPrimitive, Signed};
use crate::error::AppError;
use std::str::FromStr;

/// Utilities for handling money precision between Stripe API and internal BigDecimal representation
/// 
/// Stripe API Requirements (as of 2025):
/// - All amounts are in the currency's smallest unit (cents for USD, yen for JPY, etc.)
/// - Amounts are always integers in the API
/// - Zero-decimal currencies (JPY, KRW) don't multiply by 100
/// - Two-decimal currencies (USD, EUR) multiply by 100

/// Convert Stripe amount (in cents/smallest unit) to BigDecimal
/// 
/// # Arguments
/// * `stripe_amount_cents` - Amount in smallest currency unit from Stripe API
/// * `currency` - ISO 4217 currency code (e.g., "USD", "JPY")
/// 
/// # Returns
/// BigDecimal representing the actual monetary amount
pub fn stripe_cents_to_decimal(stripe_amount_cents: i64, currency: &str) -> Result<BigDecimal, AppError> {
    if currency.is_empty() {
        return Err(AppError::InvalidArgument("Currency code cannot be empty".to_string()));
    }
    
    let amount = BigDecimal::from(stripe_amount_cents);
    
    if is_zero_decimal_currency(currency) {
        // For zero-decimal currencies (JPY, KRW, etc.), the amount is already in the correct unit
        Ok(amount)
    } else {
        // For two-decimal currencies (USD, EUR, etc.), divide by 100
        let divisor = BigDecimal::from(100);
        Ok(amount / divisor)
    }
}

/// Convert BigDecimal amount to Stripe cents (smallest currency unit)
/// 
/// # Arguments
/// * `amount` - BigDecimal representing the monetary amount
/// * `currency` - ISO 4217 currency code (e.g., "USD", "JPY")
/// 
/// # Returns
/// Integer amount in smallest currency unit for Stripe API
pub fn decimal_to_stripe_cents(amount: &BigDecimal, currency: &str) -> Result<i64, AppError> {
    if currency.is_empty() {
        return Err(AppError::InvalidArgument("Currency code cannot be empty".to_string()));
    }
    
    if amount.is_negative() {
        return Err(AppError::InvalidArgument(
            format!("Amount cannot be negative: {}", amount)
        ));
    }
    
    let stripe_amount = if is_zero_decimal_currency(currency) {
        // For zero-decimal currencies, use the amount as-is
        amount.clone()
    } else {
        // For two-decimal currencies, multiply by 100
        let multiplier = BigDecimal::from(100);
        amount * multiplier
    };
    
    // Convert to integer, ensuring no precision loss
    stripe_amount.to_i64()
        .ok_or_else(|| AppError::InvalidArgument(
            format!("Amount {} {} cannot be converted to Stripe integer format", amount, currency)
        ))
}

/// Check if a currency is a zero-decimal currency
/// 
/// Zero-decimal currencies don't use decimal places in Stripe's API
/// Source: https://docs.stripe.com/currencies#zero-decimal
fn is_zero_decimal_currency(currency: &str) -> bool {
    match currency.to_uppercase().as_str() {
        "BIF" | "CLP" | "DJF" | "GNF" | "JPY" | "KMF" | "KRW" | 
        "MGA" | "PYG" | "RWF" | "UGX" | "VND" | "VUV" | "XAF" | 
        "XOF" | "XPF" => true,
        _ => false,
    }
}

/// Validate that a Stripe amount matches our local BigDecimal amount
/// 
/// This is critical for webhook validation to ensure data integrity
pub fn validate_stripe_amount_matches(
    stripe_amount_cents: i64,
    local_amount: &BigDecimal,
    currency: &str,
) -> Result<(), AppError> {
    if currency.is_empty() {
        return Err(AppError::InvalidArgument("Currency code cannot be empty".to_string()));
    }
    
    if stripe_amount_cents < 0 {
        return Err(AppError::InvalidArgument(
            format!("Stripe amount cannot be negative: {}", stripe_amount_cents)
        ));
    }
    
    let converted_local = decimal_to_stripe_cents(local_amount, currency)?;
    
    if stripe_amount_cents != converted_local {
        return Err(AppError::InvalidArgument(
            format!(
                "Amount mismatch for {}: Stripe {} cents, local {} (converts to {} cents)", 
                currency, stripe_amount_cents, local_amount, converted_local
            )
        ));
    }
    
    Ok(())
}

/// Create a BigDecimal from a string with proper error handling
/// 
/// This is safer than unwrap() for parsing monetary amounts
pub fn parse_decimal(value: &str) -> Result<BigDecimal, AppError> {
    BigDecimal::from_str(value)
        .map_err(|e| AppError::InvalidArgument(format!("Invalid decimal format '{}': {}", value, e)))
}

/// Round a BigDecimal to the appropriate number of decimal places for a currency
/// 
/// This ensures consistent precision across the application
pub fn round_for_currency(amount: &BigDecimal, currency: &str) -> Result<BigDecimal, AppError> {
    if currency.is_empty() {
        return Err(AppError::InvalidArgument("Currency code cannot be empty".to_string()));
    }
    
    if is_zero_decimal_currency(currency) {
        // Round to whole number for zero-decimal currencies
        Ok(amount.round(0))
    } else {
        // Round to 2 decimal places for standard currencies
        Ok(amount.round(2))
    }
}

/// Generate a Stripe idempotency key for API operations
/// 
/// This prevents duplicate operations during retries
/// Keys are limited to 255 characters by Stripe
pub fn generate_idempotency_key(operation: &str, identifier: &str) -> Result<String, AppError> {
    let key = format!("{}_{}", operation, identifier);
    
    if key.len() > 255 {
        return Err(AppError::InvalidArgument(
            format!("Idempotency key too long: {} characters (max 255)", key.len())
        ));
    }
    
    Ok(key)
}
