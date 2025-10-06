use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Event {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub created: i64,
    pub data: serde_json::Value,
    pub livemode: bool,
    pub api_version: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "object")]
pub enum EventObject {
    #[serde(rename = "payment_intent")]
    PaymentIntent(crate::stripe_types::PaymentIntent),
    #[serde(rename = "checkout.session")]
    CheckoutSession(crate::stripe_types::CheckoutSession),
    #[serde(rename = "customer")]
    Customer(crate::stripe_types::Customer),
    #[serde(rename = "payment_method")]
    PaymentMethod(crate::stripe_types::PaymentMethod),
}

// Event types that are commonly used in webhooks
#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum EventType {
    #[serde(rename = "payment_intent.succeeded")]
    PaymentIntentSucceeded,
    #[serde(rename = "payment_intent.payment_failed")]
    PaymentIntentPaymentFailed,
    #[serde(rename = "checkout.session.completed")]
    CheckoutSessionCompleted,
    #[serde(rename = "payment_method.attached")]
    PaymentMethodAttached,
    #[serde(rename = "payment_method.detached")]
    PaymentMethodDetached,
}
