use crate::error::AppError;
use crate::api_clients::billing_client::BillingClient;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use std::sync::Arc;
use log::{debug, info, warn, error};

/// Billing system health status
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingHealthStatus {
    pub overall_status: HealthStatus,
    pub server_connectivity: bool,
    pub authentication_status: bool,
    pub subscription_accessible: bool,
    pub payment_methods_accessible: bool,
    pub credit_system_accessible: bool,
    pub invoice_system_accessible: bool,
    pub last_checked: String,
    pub error_details: Vec<String>,
    pub warnings: Vec<String>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

/// Comprehensive billing health check
#[tauri::command]
pub async fn check_billing_health_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<BillingHealthStatus, AppError> {
    debug!("Running comprehensive billing health check");
    
    let mut status = BillingHealthStatus {
        overall_status: HealthStatus::Healthy,
        server_connectivity: false,
        authentication_status: false,
        subscription_accessible: false,
        payment_methods_accessible: false,
        credit_system_accessible: false,
        invoice_system_accessible: false,
        last_checked: chrono::Utc::now().to_rfc3339(),
        error_details: Vec::new(),
        warnings: Vec::new(),
        recommendations: Vec::new(),
    };
    
    let mut errors = 0;
    let mut warnings = 0;
    
    // Test server connectivity and authentication by trying to get subscription details
    match billing_client.get_subscription_details().await {
        Ok(_) => {
            status.server_connectivity = true;
            status.authentication_status = true;
            status.subscription_accessible = true;
            info!("Billing health check: Subscription details accessible");
        }
        Err(e) => {
            errors += 1;
            let error_msg = format!("Failed to access subscription details: {}", e);
            status.error_details.push(error_msg.clone());
            error!("Billing health check error: {}", error_msg);
            
            // Try to determine if it's a connectivity or auth issue
            if format!("{}", e).contains("network") || format!("{}", e).contains("connection") {
                status.recommendations.push("Check internet connection and server availability".to_string());
            } else if format!("{}", e).contains("auth") || format!("{}", e).contains("token") {
                status.authentication_status = false;
                status.recommendations.push("Re-authenticate through the login flow".to_string());
            } else {
                status.recommendations.push("Check billing service configuration".to_string());
            }
        }
    }
    
    
    // Test payment methods accessibility  
    match billing_client.get_payment_methods().await {
        Ok(_) => {
            status.payment_methods_accessible = true;
            info!("Billing health check: Payment methods accessible");
        }
        Err(e) => {
            warnings += 1;
            let warning_msg = format!("Payment methods not accessible: {}", e);
            status.warnings.push(warning_msg.clone());
            warn!("Billing health check warning: {}", warning_msg);
        }
    }
    
    // Test credit system accessibility
    match billing_client.get_credit_balance().await {
        Ok(_) => {
            status.credit_system_accessible = true;
            info!("Billing health check: Credit system accessible");
        }
        Err(e) => {
            warnings += 1;
            let warning_msg = format!("Credit system not accessible: {}", e);
            status.warnings.push(warning_msg.clone());
            warn!("Billing health check warning: {}", warning_msg);
        }
    }
    
    // Test invoice system accessibility
    match billing_client.get_invoice_history(Some(1), Some(0), None, None).await {
        Ok(_) => {
            status.invoice_system_accessible = true;
            info!("Billing health check: Invoice system accessible");
        }
        Err(e) => {
            warnings += 1;
            let warning_msg = format!("Invoice system not accessible: {}", e);
            status.warnings.push(warning_msg.clone());
            warn!("Billing health check warning: {}", warning_msg);
        }
    }
    
    // Determine overall health status
    status.overall_status = if errors > 0 {
        HealthStatus::Unhealthy
    } else if warnings > 0 {
        HealthStatus::Degraded
    } else {
        HealthStatus::Healthy
    };
    
    // Add general recommendations based on status
    match status.overall_status {
        HealthStatus::Healthy => {
            status.recommendations.push("Billing system is operating normally".to_string());
        }
        HealthStatus::Degraded => {
            status.recommendations.push("Some billing features may not be available".to_string());
            status.recommendations.push("Consider refreshing authentication or checking network connection".to_string());
        }
        HealthStatus::Unhealthy => {
            status.recommendations.push("Billing system requires immediate attention".to_string());
            status.recommendations.push("Check authentication status and server connectivity".to_string());
        }
    }
    
    info!("Billing health check completed with status: {:?}", status.overall_status);
    Ok(status)
}

/// Quick billing connectivity test
#[tauri::command]
pub async fn ping_billing_service_command(
    billing_client: State<'_, Arc<BillingClient>>,
) -> Result<bool, AppError> {
    debug!("Running quick billing service connectivity test");
    
    // Try a lightweight call to test connectivity
    match billing_client.get_stripe_publishable_key().await {
        Ok(_) => {
            info!("Billing service ping successful");
            Ok(true)
        }
        Err(e) => {
            warn!("Billing service ping failed: {}", e);
            Ok(false)
        }
    }
}