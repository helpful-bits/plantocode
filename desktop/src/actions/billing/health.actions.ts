import { invoke } from '@tauri-apps/api/core';

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

export async function checkBillingHealth(): Promise<BillingHealthStatus> {
  return await invoke('check_billing_health_command');
}

export async function pingBillingService(): Promise<boolean> {
  return await invoke('ping_billing_service_command');
}