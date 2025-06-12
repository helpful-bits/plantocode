import { invoke } from '@tauri-apps/api/core';

/**
 * Cancel a subscription
 * @param atPeriodEnd - Whether to cancel at period end (true) or immediately (false)
 */
export async function cancelSubscription(atPeriodEnd: boolean = true): Promise<any> {
  return await invoke('cancel_subscription_command', { atPeriodEnd });
}

/**
 * Resume a canceled subscription
 */
export async function resumeSubscription(): Promise<any> {
  return await invoke('resume_subscription_command');
}