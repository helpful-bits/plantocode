use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Price {
    pub id: String,
    pub object: String,
    pub active: bool,
    pub billing_scheme: Option<String>,
    pub created: i64,
    pub currency: String,
    pub custom_unit_amount: Option<PriceCustomUnitAmount>,
    pub livemode: bool,
    pub lookup_key: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub nickname: Option<String>,
    pub product: String,
    pub recurring: Option<PriceRecurring>,
    pub tax_behavior: Option<String>,
    pub tiers_mode: Option<String>,
    pub transform_quantity: Option<PriceTransformQuantity>,
    #[serde(rename = "type")]
    pub type_: String,
    pub unit_amount: Option<i64>,
    pub unit_amount_decimal: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PriceCustomUnitAmount {
    pub maximum: Option<i64>,
    pub minimum: Option<i64>,
    pub preset: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PriceRecurring {
    pub aggregate_usage: Option<String>,
    pub interval: PriceRecurringInterval,
    pub interval_count: i64,
    pub trial_period_days: Option<i64>,
    pub usage_type: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PriceRecurringInterval {
    Day,
    Week,
    Month,
    Year,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PriceTransformQuantity {
    pub divide_by: i64,
    pub round: String,
}

// Helper struct for creating prices
#[derive(Debug)]
pub struct CreatePrice {
    pub currency: String,
    pub product: String,
    pub active: Option<bool>,
    pub billing_scheme: Option<String>,
    pub lookup_key: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub nickname: Option<String>,
    pub recurring: Option<CreatePriceRecurring>,
    pub tax_behavior: Option<String>,
    pub tiers_mode: Option<String>,
    pub transform_quantity: Option<PriceTransformQuantity>,
    pub unit_amount: Option<i64>,
    pub unit_amount_decimal: Option<String>,
}

#[derive(Debug)]
pub struct CreatePriceRecurring {
    pub interval: CreatePriceRecurringInterval,
    pub interval_count: Option<i64>,
    pub aggregate_usage: Option<String>,
    pub trial_period_days: Option<i64>,
    pub usage_type: Option<String>,
}

#[derive(Debug, Clone)]
pub enum CreatePriceRecurringInterval {
    Day,
    Week,
    Month,
    Year,
}

impl std::fmt::Display for CreatePriceRecurringInterval {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CreatePriceRecurringInterval::Day => write!(f, "day"),
            CreatePriceRecurringInterval::Week => write!(f, "week"),
            CreatePriceRecurringInterval::Month => write!(f, "month"),
            CreatePriceRecurringInterval::Year => write!(f, "year"),
        }
    }
}