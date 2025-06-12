use tauri::{AppHandle, Emitter};
use serde_json::Value;
use log::{debug, error, warn};
use uuid::Uuid;

/// Event types for payment-related updates
#[derive(Debug, Clone)]
pub enum PaymentEventType {
    PaymentSucceeded,
    PaymentFailed,
    PaymentProcessing,
    SubscriptionCreated,
    SubscriptionUpdated,
    SubscriptionCanceled,
    SubscriptionTrialWillEnd,
    InvoicePaid,
    InvoicePaymentFailed,
    CreditsPurchased,
    PaymentMethodAdded,
    PaymentMethodRemoved,
}

impl PaymentEventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PaymentEventType::PaymentSucceeded => "payment:succeeded",
            PaymentEventType::PaymentFailed => "payment:failed",
            PaymentEventType::PaymentProcessing => "payment:processing",
            PaymentEventType::SubscriptionCreated => "subscription:created",
            PaymentEventType::SubscriptionUpdated => "subscription:updated",
            PaymentEventType::SubscriptionCanceled => "subscription:canceled",
            PaymentEventType::SubscriptionTrialWillEnd => "subscription:trial_will_end",
            PaymentEventType::InvoicePaid => "invoice:paid",
            PaymentEventType::InvoicePaymentFailed => "invoice:payment_failed",
            PaymentEventType::CreditsPurchased => "credits:purchased",
            PaymentEventType::PaymentMethodAdded => "payment_method:added",
            PaymentEventType::PaymentMethodRemoved => "payment_method:removed",
        }
    }
}

/// Payment event payload structure
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentEventPayload {
    pub event_type: String,
    pub user_id: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub data: Value,
    pub metadata: Option<Value>,
}

/// Payment event emitter for sending real-time updates to the frontend
pub struct PaymentEventEmitter {
    app_handle: AppHandle,
}

impl PaymentEventEmitter {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Emit a payment event to all listening windows
    pub fn emit_payment_event(
        &self,
        event_type: PaymentEventType,
        user_id: Option<&Uuid>,
        data: Value,
        metadata: Option<Value>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let payload = PaymentEventPayload {
            event_type: event_type.as_str().to_string(),
            user_id: user_id.map(|id| id.to_string()),
            timestamp: chrono::Utc::now(),
            data,
            metadata,
        };

        debug!("Emitting payment event: {:?}", payload);

        // Emit to all windows
        if let Err(e) = self.app_handle.emit("payment-event", &payload) {
            error!("Failed to emit payment event: {}", e);
            return Err(Box::new(e));
        }

        // Also emit the specific event type for targeted listeners
        if let Err(e) = self.app_handle.emit(event_type.as_str(), &payload) {
            warn!("Failed to emit specific payment event {}: {}", event_type.as_str(), e);
        }

        Ok(())
    }

    /// Emit payment succeeded event
    pub fn emit_payment_succeeded(
        &self,
        user_id: &Uuid,
        payment_intent_id: &str,
        amount: i64,
        currency: &str,
        description: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "paymentIntentId": payment_intent_id,
            "amount": amount,
            "currency": currency,
            "description": description,
            "status": "succeeded"
        });

        self.emit_payment_event(PaymentEventType::PaymentSucceeded, Some(user_id), data, None)
    }

    /// Emit payment failed event
    pub fn emit_payment_failed(
        &self,
        user_id: &Uuid,
        payment_intent_id: &str,
        error_message: &str,
        decline_code: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "paymentIntentId": payment_intent_id,
            "error": error_message,
            "declineCode": decline_code,
            "status": "failed"
        });

        self.emit_payment_event(PaymentEventType::PaymentFailed, Some(user_id), data, None)
    }

    /// Emit credits purchased event
    pub fn emit_credits_purchased(
        &self,
        user_id: &Uuid,
        credits_amount: f64,
        purchase_amount: i64,
        currency: &str,
        new_balance: f64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "creditsAmount": credits_amount,
            "purchaseAmount": purchase_amount,
            "currency": currency,
            "newBalance": new_balance,
            "status": "completed"
        });

        self.emit_payment_event(PaymentEventType::CreditsPurchased, Some(user_id), data, None)
    }

    /// Emit subscription created event
    pub fn emit_subscription_created(
        &self,
        user_id: &Uuid,
        subscription_id: &str,
        plan_id: &str,
        status: &str,
        trial_end: Option<chrono::DateTime<chrono::Utc>>,
        current_period_end: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "subscriptionId": subscription_id,
            "planId": plan_id,
            "status": status,
            "trialEnd": trial_end.map(|t| t.to_rfc3339()),
            "currentPeriodEnd": current_period_end.map(|t| t.to_rfc3339())
        });

        self.emit_payment_event(PaymentEventType::SubscriptionCreated, Some(user_id), data, None)
    }

    /// Emit subscription updated event
    pub fn emit_subscription_updated(
        &self,
        user_id: &Uuid,
        subscription_id: &str,
        previous_status: &str,
        new_status: &str,
        changes: Value,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "subscriptionId": subscription_id,
            "previousStatus": previous_status,
            "newStatus": new_status,
            "changes": changes
        });

        self.emit_payment_event(PaymentEventType::SubscriptionUpdated, Some(user_id), data, None)
    }

    /// Emit subscription canceled event
    pub fn emit_subscription_canceled(
        &self,
        user_id: &Uuid,
        subscription_id: &str,
        canceled_at: chrono::DateTime<chrono::Utc>,
        cancel_at_period_end: bool,
        reason: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "subscriptionId": subscription_id,
            "canceledAt": canceled_at.to_rfc3339(),
            "cancelAtPeriodEnd": cancel_at_period_end,
            "reason": reason
        });

        self.emit_payment_event(PaymentEventType::SubscriptionCanceled, Some(user_id), data, None)
    }

    /// Emit subscription trial will end event
    pub fn emit_subscription_trial_will_end(
        &self,
        user_id: &Uuid,
        subscription_id: &str,
        trial_end: chrono::DateTime<chrono::Utc>,
        days_remaining: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "subscriptionId": subscription_id,
            "trialEnd": trial_end.to_rfc3339(),
            "daysRemaining": days_remaining
        });

        self.emit_payment_event(PaymentEventType::SubscriptionTrialWillEnd, Some(user_id), data, None)
    }

    /// Emit invoice paid event
    pub fn emit_invoice_paid(
        &self,
        user_id: &Uuid,
        invoice_id: &str,
        amount_paid: i64,
        currency: &str,
        subscription_id: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "invoiceId": invoice_id,
            "amountPaid": amount_paid,
            "currency": currency,
            "subscriptionId": subscription_id
        });

        self.emit_payment_event(PaymentEventType::InvoicePaid, Some(user_id), data, None)
    }

    /// Emit invoice payment failed event
    pub fn emit_invoice_payment_failed(
        &self,
        user_id: &Uuid,
        invoice_id: &str,
        amount_due: i64,
        currency: &str,
        attempt_count: u32,
        next_payment_attempt: Option<chrono::DateTime<chrono::Utc>>,
        error_message: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "invoiceId": invoice_id,
            "amountDue": amount_due,
            "currency": currency,
            "attemptCount": attempt_count,
            "nextPaymentAttempt": next_payment_attempt.map(|t| t.to_rfc3339()),
            "error": error_message
        });

        self.emit_payment_event(PaymentEventType::InvoicePaymentFailed, Some(user_id), data, None)
    }

    /// Emit payment method added event
    pub fn emit_payment_method_added(
        &self,
        user_id: &Uuid,
        payment_method_id: &str,
        payment_method_type: &str,
        card_brand: Option<&str>,
        card_last_four: Option<&str>,
        is_default: bool,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "paymentMethodId": payment_method_id,
            "type": payment_method_type,
            "cardBrand": card_brand,
            "cardLastFour": card_last_four,
            "isDefault": is_default
        });

        self.emit_payment_event(PaymentEventType::PaymentMethodAdded, Some(user_id), data, None)
    }

    /// Emit payment method removed event
    pub fn emit_payment_method_removed(
        &self,
        user_id: &Uuid,
        payment_method_id: &str,
        was_default: bool,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::json!({
            "paymentMethodId": payment_method_id,
            "wasDefault": was_default
        });

        self.emit_payment_event(PaymentEventType::PaymentMethodRemoved, Some(user_id), data, None)
    }
}

/// Global payment event emitter instance management
use std::sync::OnceLock;

static PAYMENT_EVENT_EMITTER: OnceLock<PaymentEventEmitter> = OnceLock::new();

/// Initialize the global payment event emitter
pub fn init_payment_event_emitter(app_handle: AppHandle) {
    let emitter = PaymentEventEmitter::new(app_handle);
    if let Err(_) = PAYMENT_EVENT_EMITTER.set(emitter) {
        warn!("Payment event emitter was already initialized");
    }
}

/// Get the global payment event emitter
pub fn get_payment_event_emitter() -> Option<&'static PaymentEventEmitter> {
    PAYMENT_EVENT_EMITTER.get()
}

/// Convenience function to emit payment events globally
pub fn emit_payment_event(
    event_type: PaymentEventType,
    user_id: Option<&Uuid>,
    data: Value,
    metadata: Option<Value>,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(emitter) = get_payment_event_emitter() {
        emitter.emit_payment_event(event_type, user_id, data, metadata)
    } else {
        error!("Payment event emitter not initialized");
        Err("Payment event emitter not initialized".into())
    }
}