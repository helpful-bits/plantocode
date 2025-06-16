import { invoke } from '@tauri-apps/api/core';
import type { BillingDashboardData, SubscriptionPlan } from '@/types/tauri-commands';



// Re-export the SubscriptionPlan type for convenience
export type { SubscriptionPlan };

/**
 * Get consolidated billing dashboard data
 */
export async function getBillingDashboardData(): Promise<BillingDashboardData> {
  return await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
}

/**
 * Get available subscription plans from the server
 */
export async function getAvailablePlans(): Promise<SubscriptionPlan[]> {
  return await invoke<SubscriptionPlan[]>('get_subscription_plans_command');
}