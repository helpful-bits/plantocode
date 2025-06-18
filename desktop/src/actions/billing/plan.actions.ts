import { invoke } from '@tauri-apps/api/core';
import type { SubscriptionPlan, BillingDashboardData } from '@/types/tauri-commands';

export interface DetailedUsage {
  serviceName: string;
  modelDisplayName: string;
  providerCode: string;
  modelType: string;
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

export async function getDetailedUsage(
  startDate: string,
  endDate: string
): Promise<DetailedUsage[]> {
  return await invoke<DetailedUsage[]>('get_detailed_usage_command', { startDate, endDate });
}

export async function getAvailablePlans(): Promise<SubscriptionPlan[]> {
  return await invoke<SubscriptionPlan[]>('get_subscription_plans_command');
}

export async function getBillingDashboardData(): Promise<BillingDashboardData> {
  return await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
}