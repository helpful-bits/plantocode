import { invoke } from '@tauri-apps/api/core';
import type { 
  UpdateSpendingLimitsRequest, 
  UpdateSpendingLimitsResponse
} from '@/types/tauri-commands';

/**
 * Update user spending limits for monthly allowance and hard limits
 */
export async function updateSpendingLimits(
  limits: UpdateSpendingLimitsRequest
): Promise<UpdateSpendingLimitsResponse> {
  return await invoke<UpdateSpendingLimitsResponse>('update_spending_limits_command', {
    monthly_spending_limit: limits.monthlySpendingLimit,
    hard_limit: limits.hardLimit,
  });
}

/**
 * Acknowledge a specific spending alert
 */
export async function acknowledgeSpendingAlert(alertId: string): Promise<boolean> {
  return await invoke<boolean>('acknowledge_spending_alert_command', { alertId });
}