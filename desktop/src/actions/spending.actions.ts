import { securedFetchJson } from '@/utils/secured-fetch';
import { getErrorMessage } from '@/utils/error-handling';

const SERVER_URL = (import.meta.env.VITE_MAIN_SERVER_BASE_URL as string) || "http://localhost:8080";

export interface SpendingStatus {
  currentSpending: number;
  includedAllowance: number;
  remainingAllowance: number;
  overageAmount: number;
  usagePercentage: number;
  servicesBlocked: boolean;
  hardLimit: number;
  nextBillingDate: string;
  currency: string;
  alerts: SpendingAlert[];
}

export interface SpendingAlert {
  id: string;
  alertType: string;
  thresholdAmount: number;
  currentSpending: number;
  alertSentAt: string;
  acknowledged: boolean;
}

export interface ServiceAccessResponse {
  hasAccess: boolean;
  message: string;
}

export interface UpdateSpendingLimitsRequest {
  monthlySpendingLimit?: number;
  hardLimit?: number;
}

/**
 * Get current spending status for the user
 */
export async function getSpendingStatus(): Promise<SpendingStatus> {
  try {
    const response = await securedFetchJson<SpendingStatus>(
      `${SERVER_URL}/api/spending/status`,
      {
        method: 'GET',
      }
    );

    if (!response) {
      throw new Error('No spending status data received');
    }

    return response;
  } catch (error) {
    console.error('Failed to get spending status:', error);
    throw new Error(`Failed to get spending status: ${getErrorMessage(error)}`);
  }
}

/**
 * Check if AI services are accessible for the user
 */
export async function checkServiceAccess(): Promise<ServiceAccessResponse> {
  try {
    const response = await securedFetchJson<ServiceAccessResponse>(
      `${SERVER_URL}/api/spending/access`,
      {
        method: 'GET',
      }
    );

    if (!response) {
      throw new Error('No service access data received');
    }

    return response;
  } catch (error) {
    console.error('Failed to check service access:', error);
    throw new Error(`Failed to check service access: ${getErrorMessage(error)}`);
  }
}

/**
 * Update user spending limits
 */
export async function updateSpendingLimits(limits: UpdateSpendingLimitsRequest): Promise<void> {
  try {
    await securedFetchJson(
      `${SERVER_URL}/api/spending/limits`,
      {
        method: 'PUT',
        body: JSON.stringify(limits),
      }
    );
  } catch (error) {
    console.error('Failed to update spending limits:', error);
    throw new Error(`Failed to update spending limits: ${getErrorMessage(error)}`);
  }
}

/**
 * Acknowledge a spending alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  try {
    await securedFetchJson(
      `${SERVER_URL}/api/spending/alerts/acknowledge`,
      {
        method: 'POST',
        body: JSON.stringify({ alertId }),
      }
    );
  } catch (error) {
    console.error('Failed to acknowledge alert:', error);
    throw new Error(`Failed to acknowledge alert: ${getErrorMessage(error)}`);
  }
}

/**
 * Get spending history for the user
 */
export async function getSpendingHistory(): Promise<any> {
  try {
    const response = await securedFetchJson(
      `${SERVER_URL}/api/spending/history`,
      {
        method: 'GET',
      }
    );

    return response;
  } catch (error) {
    console.error('Failed to get spending history:', error);
    throw new Error(`Failed to get spending history: ${getErrorMessage(error)}`);
  }
}