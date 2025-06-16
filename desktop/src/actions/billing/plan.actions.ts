import { invoke } from '@tauri-apps/api/core';
import type { BillingDashboardData, SubscriptionPlan } from '@/types/tauri-commands';

export type { SubscriptionPlan };

export async function getBillingDashboardData(): Promise<BillingDashboardData> {
  return await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
}

export async function getAvailablePlans(): Promise<SubscriptionPlan[]> {
  return await invoke<SubscriptionPlan[]>('get_subscription_plans_command');
}