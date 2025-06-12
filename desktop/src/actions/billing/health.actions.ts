import { invoke } from '@tauri-apps/api/core';

/**
 * Billing health status information
 */
export interface BillingHealthStatus {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  serverConnectivity: boolean;
  authenticationStatus: boolean;
  subscriptionAccessible: boolean;
  paymentMethodsAccessible: boolean;
  creditSystemAccessible: boolean;
  invoiceSystemAccessible: boolean;
  lastChecked: string;
  errorDetails: string[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Perform a comprehensive billing health check
 * Verifies all critical billing system components including subscription, payment methods, credits, and invoices
 */
export async function checkBillingHealth(): Promise<BillingHealthStatus> {
  return await invoke('check_billing_health_command');
}

/**
 * Quick connectivity test to the billing service
 * Returns true if the billing service is reachable, false otherwise
 */
export async function pingBillingService(): Promise<boolean> {
  return await invoke('ping_billing_service_command');
}