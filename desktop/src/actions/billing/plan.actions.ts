import { invoke } from '@tauri-apps/api/core';
import type { SubscriptionDetails, SubscriptionPlan } from '@/types/tauri-commands';



// Re-export the SubscriptionPlan type for convenience
export type { SubscriptionPlan };

/**
 * Get current subscription details
 */
export async function getSubscriptionDetails(): Promise<SubscriptionDetails> {
  return await invoke<SubscriptionDetails>('get_subscription_details_command');
}

/**
 * Get available subscription plans from the server
 */
export async function getAvailablePlans(): Promise<SubscriptionPlan[]> {
  return await invoke<SubscriptionPlan[]>('get_subscription_plans_command');
}