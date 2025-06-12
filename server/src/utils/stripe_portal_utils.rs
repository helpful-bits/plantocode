use crate::services::stripe_service::StripeService;
use crate::error::AppError;
use log::{info, warn};

/// Utility functions for Stripe Customer Portal integration
pub struct StripePortalUtils;

impl StripePortalUtils {
    /// Generate Customer Portal URL with proper error handling
    pub async fn generate_portal_url(
        stripe_service: &StripeService,
        customer_id: &str,
        return_url: &str,
        operation: &str,
    ) -> Result<String, AppError> {
        info!("Generating portal URL for customer {} for operation: {}", customer_id, operation);
        
        let portal_session = stripe_service.create_billing_portal_session(
            customer_id,
            return_url,
        ).await.map_err(|e| {
            warn!("Failed to create portal session for customer {}: {}", customer_id, e);
            AppError::External(format!("Failed to create portal session: {}", e))
        })?;
        
        info!("Created portal session for customer {} for operation: {}", customer_id, operation);
        Ok(portal_session.url)
    }
    
    /// Check if an operation should redirect to Customer Portal
    pub fn should_redirect_to_portal(operation: &str) -> bool {
        match operation {
            // Complex operations → Portal
            "payment_method_management" => true,
            "payment_method_add" => true,
            "payment_method_update" => true,
            "payment_method_delete" => true,
            "complex_subscription_change" => true,
            "subscription_change_with_proration" => true,
            "billing_address_update" => true,
            "invoice_download" => true,
            "invoice_management" => true,
            "payment_failure_resolution" => true,
            "subscription_cancellation" => true,
            "subscription_pause" => true,
            "subscription_resume" => true,
            "plan_scheduling" => true,
            "tax_id_update" => true,
            "billing_contact_update" => true,
            
            // Simple operations → In-app
            "credit_purchase" => false,
            "basic_plan_upgrade" => false,
            "subscription_status_display" => false,
            "trial_creation" => false,
            "usage_display" => false,
            "credit_balance_display" => false,
            "plan_comparison" => false,
            "pricing_display" => false,
            
            // Default to portal for unknown operations (safer)
            _ => {
                warn!("Unknown operation '{}' - defaulting to Customer Portal", operation);
                true
            }
        }
    }
    
    /// Get user-friendly message for portal redirects
    pub fn get_portal_redirect_message(operation: &str) -> &'static str {
        match operation {
            "payment_method_management" => 
                "Payment method management is handled via Stripe Customer Portal for enhanced security.",
            "complex_subscription_change" => 
                "Complex subscription changes with proration are handled via Stripe Customer Portal for better user experience.",
            "billing_address_update" => 
                "Billing address updates are handled via Stripe Customer Portal to ensure accuracy and compliance.",
            "invoice_download" => 
                "Invoice downloads and detailed billing history are available via Stripe Customer Portal.",
            "subscription_cancellation" => 
                "Subscription cancellation is handled via Stripe Customer Portal to ensure proper processing and compliance.",
            "payment_failure_resolution" => 
                "Payment failure resolution is handled via Stripe Customer Portal for secure payment method updates.",
            _ => 
                "This operation is handled via Stripe Customer Portal for better security and user experience."
        }
    }
    
    /// Generate standardized portal redirect response
    pub fn create_portal_redirect_response(
        portal_url: String,
        operation: &str,
        additional_data: Option<serde_json::Value>,
    ) -> serde_json::Value {
        let mut response = serde_json::json!({
            "redirectToPortal": true,
            "portalUrl": portal_url,
            "operation": operation,
            "message": Self::get_portal_redirect_message(operation)
        });
        
        if let Some(data) = additional_data {
            response["additionalData"] = data;
        }
        
        response
    }
    
    /// Validate return URL for security
    pub fn validate_return_url(return_url: &str, allowed_domains: &[&str]) -> bool {
        if return_url.is_empty() {
            return false;
        }
        
        // Parse URL to check domain
        if let Ok(parsed_url) = url::Url::parse(return_url) {
            if let Some(domain) = parsed_url.domain() {
                return allowed_domains.iter().any(|&allowed| domain.ends_with(allowed));
            }
        }
        
        false
    }
    
    /// Get default return URL based on environment
    pub fn get_default_return_url(environment: &str) -> &'static str {
        match environment {
            "production" => "https://app.vibemanager.com/billing",
            "staging" => "https://staging.vibemanager.com/billing",
            "development" => "http://localhost:3000/billing",
            _ => "http://localhost:3000/billing", // Default to development
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_should_redirect_to_portal() {
        // Test portal operations
        assert!(StripePortalUtils::should_redirect_to_portal("payment_method_management"));
        assert!(StripePortalUtils::should_redirect_to_portal("complex_subscription_change"));
        assert!(StripePortalUtils::should_redirect_to_portal("subscription_cancellation"));
        
        // Test in-app operations
        assert!(!StripePortalUtils::should_redirect_to_portal("credit_purchase"));
        assert!(!StripePortalUtils::should_redirect_to_portal("basic_plan_upgrade"));
        assert!(!StripePortalUtils::should_redirect_to_portal("subscription_status_display"));
        
        // Test unknown operation (should default to portal)
        assert!(StripePortalUtils::should_redirect_to_portal("unknown_operation"));
    }
    
    #[test]
    fn test_validate_return_url() {
        let allowed_domains = &["vibemanager.com", "localhost"];
        
        // Valid URLs
        assert!(StripePortalUtils::validate_return_url("https://app.vibemanager.com/billing", allowed_domains));
        assert!(StripePortalUtils::validate_return_url("http://localhost:3000/billing", allowed_domains));
        
        // Invalid URLs
        assert!(!StripePortalUtils::validate_return_url("https://malicious.com/billing", allowed_domains));
        assert!(!StripePortalUtils::validate_return_url("", allowed_domains));
        assert!(!StripePortalUtils::validate_return_url("not-a-url", allowed_domains));
    }
    
    #[test]
    fn test_get_default_return_url() {
        assert_eq!(StripePortalUtils::get_default_return_url("production"), "https://app.vibemanager.com/billing");
        assert_eq!(StripePortalUtils::get_default_return_url("staging"), "https://staging.vibemanager.com/billing");
        assert_eq!(StripePortalUtils::get_default_return_url("development"), "http://localhost:3000/billing");
        assert_eq!(StripePortalUtils::get_default_return_url("unknown"), "http://localhost:3000/billing");
    }
}