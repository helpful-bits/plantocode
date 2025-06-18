import { invoke } from '@tauri-apps/api/core';
import type { BillingDashboardData, SubscriptionPlan } from '@/types/tauri-commands';

export type { SubscriptionPlan };

export interface DetailedUsage {
  service_name: string;
  model_display_name: string;
  provider_code: string;
  model_type: string;
  total_cost: number;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_duration_ms: number;
}

export async function getBillingDashboardData(): Promise<BillingDashboardData> {
  return await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
}

export async function getAvailablePlans(): Promise<SubscriptionPlan[]> {
  return await invoke<SubscriptionPlan[]>('get_subscription_plans_command');
}

export async function getDetailedUsage(startDate: string, endDate: string): Promise<DetailedUsage[]> {
  return await invoke<DetailedUsage[]>('get_detailed_usage_command', { startDate, endDate });
}