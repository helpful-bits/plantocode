use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Charge {
    pub id: String,
    pub object: String,
    pub amount: i64,
    pub currency: String,
    pub customer: Option<String>,
    pub payment_intent: Option<String>,
    pub balance_transaction: Option<BalanceTransaction>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct BalanceTransaction {
    pub id: String,
    pub object: String,
    pub amount: i64,
    pub fee: i64,
    pub net: i64,
    pub currency: String,
}
