use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentMethod {
    pub id: String,
    pub object: String,
    #[serde(rename = "type")]
    pub type_: PaymentMethodType,
    pub card: Option<PaymentMethodCard>,
    pub customer: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub created: i64,
    pub livemode: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PaymentMethodType {
    Card,
    BankAccount,
    SepaDebit,
    AchCreditTransfer,
    AchDebit,
    Acss,
    AfterpayClearpay,
    Alipay,
    AuBecsDebit,
    BacsDebit,
    Bancontact,
    Blik,
    Boleto,
    CustomerBalance,
    Eps,
    Fpx,
    Giropay,
    Grabpay,
    Ideal,
    InteracPresent,
    Klarna,
    Konbini,
    Link,
    Oxxo,
    P24,
    Paynow,
    Pix,
    Promptpay,
    SofortPayment,
    UsBankAccount,
    WechatPay,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentMethodCard {
    pub brand: String,
    pub country: Option<String>,
    pub exp_month: i64,
    pub exp_year: i64,
    pub fingerprint: Option<String>,
    pub funding: Option<String>,
    pub last4: String,
    pub networks: Option<PaymentMethodCardNetworks>,
    pub three_d_secure_usage: Option<PaymentMethodCardThreeDSecureUsage>,
    pub wallet: Option<PaymentMethodCardWallet>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentMethodCardNetworks {
    pub available: Vec<String>,
    pub preferred: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentMethodCardThreeDSecureUsage {
    pub supported: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentMethodCardWallet {
    #[serde(rename = "type")]
    pub type_: String,
    pub dynamic_last4: Option<String>,
}

// Helper structs for listing payment methods
#[derive(Debug)]
pub struct ListPaymentMethods {
    pub customer: Option<crate::stripe_types::customer::CustomerIdWrapper>,
    pub type_: Option<PaymentMethodTypeFilter>,
    pub limit: Option<u64>,
    pub starting_after: Option<String>,
}

impl ListPaymentMethods {
    pub fn new() -> Self {
        Self {
            customer: None,
            type_: None,
            limit: None,
            starting_after: None,
        }
    }
}

impl Default for ListPaymentMethods {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub enum PaymentMethodTypeFilter {
    Card,
    BankAccount,
    SepaDebit,
    AchCreditTransfer,
    AchDebit,
    Acss,
    AfterpayClearpay,
    Alipay,
    AuBecsDebit,
    BacsDebit,
    Bancontact,
    Blik,
    Boleto,
    CustomerBalance,
    Eps,
    Fpx,
    Giropay,
    Grabpay,
    Ideal,
    InteracPresent,
    Klarna,
    Konbini,
    Link,
    Oxxo,
    P24,
    Paynow,
    Pix,
    Promptpay,
    SofortPayment,
    UsBankAccount,
    WechatPay,
}

// List response structure
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PaymentMethodList {
    pub object: String,
    pub data: Vec<PaymentMethod>,
    pub has_more: bool,
    pub url: String,
}