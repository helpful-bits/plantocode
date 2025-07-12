//! Custom Stripe types module

pub mod billing_portal_session;
pub mod checkout_session;
pub mod customer;
pub mod enums;
pub mod event;
pub mod invoice;
pub mod payment_intent;
pub mod payment_method;
pub mod price;
pub mod product;
pub mod setup_intent;

// Re-export all types for convenience
pub use billing_portal_session::BillingPortalSession;
pub use checkout_session::{CheckoutSession, CheckoutSessionMode, CreateCheckoutSessionLineItems};
pub use customer::Customer;
pub use enums::*;
pub use event::{Event, EventObject};
pub use invoice::{Invoice, InvoiceStatus, InvoiceList};
pub use payment_intent::{PaymentIntent, PaymentIntentStatus};
pub use payment_method::{PaymentMethod, PaymentMethodList};
pub use price::Price;
pub use product::Product;
pub use setup_intent::SetupIntent;

// Common enums and types
#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub enum Currency {
    #[serde(rename = "usd")]
    USD,
    #[serde(rename = "eur")]
    EUR,
    #[serde(rename = "gbp")]
    GBP,
    #[serde(rename = "cad")]
    CAD,
    #[serde(rename = "aud")]
    AUD,
    #[serde(rename = "jpy")]
    JPY,
}

impl std::fmt::Display for Currency {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Currency::USD => write!(f, "usd"),
            Currency::EUR => write!(f, "eur"),
            Currency::GBP => write!(f, "gbp"),
            Currency::CAD => write!(f, "cad"),
            Currency::AUD => write!(f, "aud"),
            Currency::JPY => write!(f, "jpy"),
        }
    }
}