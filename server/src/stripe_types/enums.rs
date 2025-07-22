// Stripe enum constants for type safety and consistency
// These constants replace magic strings throughout the codebase

// Payment Intent Statuses
pub const PAYMENT_INTENT_STATUS_SUCCEEDED: &str = "succeeded";
pub const PAYMENT_INTENT_STATUS_REQUIRES_PAYMENT_METHOD: &str = "requires_payment_method";
pub const PAYMENT_INTENT_STATUS_REQUIRES_CONFIRMATION: &str = "requires_confirmation";
pub const PAYMENT_INTENT_STATUS_REQUIRES_ACTION: &str = "requires_action";
pub const PAYMENT_INTENT_STATUS_PROCESSING: &str = "processing";
pub const PAYMENT_INTENT_STATUS_REQUIRES_CAPTURE: &str = "requires_capture";
pub const PAYMENT_INTENT_STATUS_CANCELED: &str = "canceled";

// Checkout Session Statuses  
pub const CHECKOUT_SESSION_STATUS_COMPLETE: &str = "complete";
pub const CHECKOUT_SESSION_STATUS_EXPIRED: &str = "expired";
pub const CHECKOUT_SESSION_STATUS_OPEN: &str = "open";

// Checkout Session Modes
pub const CHECKOUT_SESSION_MODE_PAYMENT: &str = "payment";
pub const CHECKOUT_SESSION_MODE_SETUP: &str = "setup";

// Webhook Event Types
pub const EVENT_PAYMENT_INTENT_SUCCEEDED: &str = "payment_intent.succeeded";
pub const EVENT_PAYMENT_METHOD_ATTACHED: &str = "payment_method.attached";
pub const EVENT_PAYMENT_METHOD_DETACHED: &str = "payment_method.detached";
pub const EVENT_CUSTOMER_DEFAULT_SOURCE_UPDATED: &str = "customer.default_source_updated";
pub const EVENT_CHECKOUT_SESSION_COMPLETED: &str = "checkout.session.completed";

