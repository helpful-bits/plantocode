import { useState, useEffect, useCallback, useMemo } from 'react';
import { getBillingDashboardData } from '@/actions/billing';
import { type BillingDashboardData } from '@/types/tauri-commands';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';

export interface SpendingStatus {
  currentSpending: number;
  includedAllowance: number;
  usagePercentage: number;
  servicesBlocked: boolean;
  currency: string;
}

export interface UseBillingDataReturn {
  dashboardData: BillingDashboardData | null;
  spendingStatus: SpendingStatus | null;
  planDetails: BillingDashboardData['planDetails'] | null;
  creditBalance: number;
  trialDaysLeft: number | null;
  isLoading: boolean;
  error: string | null;
  refreshBillingData: () => Promise<void>;
}

export function useBillingData(): UseBillingDataReturn {
  const [dashboardData, setDashboardData] = useState<BillingDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const fetchBillingData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await getBillingDashboardData();
      setDashboardData(data);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      if (errorMessage.includes('spending_limit_exceeded') || errorMessage.includes('services_blocked')) {
        showNotification({
          title: 'Service Access Limited',
          message: 'AI services are currently blocked due to spending limits.',
          type: 'error',
        });
      } else {
        showNotification({
          title: 'Billing Data Update',
          message: 'Unable to fetch latest billing data. Please try again.',
          type: 'warning',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const refreshBillingData = useCallback(async () => {
    await fetchBillingData();
  }, [fetchBillingData]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const spendingStatus = useMemo((): SpendingStatus | null => {
    if (!dashboardData) {
      return null;
    }

    const { currentSpendingUsd, spendingLimitUsd } = dashboardData.spendingDetails;
    
    return {
      currentSpending: currentSpendingUsd,
      includedAllowance: spendingLimitUsd,
      usagePercentage: spendingLimitUsd > 0 ? (currentSpendingUsd / spendingLimitUsd) * 100 : 0,
      servicesBlocked: currentSpendingUsd >= spendingLimitUsd,
      currency: 'USD'
    };
  }, [dashboardData]);

  const planDetails = useMemo(() => {
    return dashboardData?.planDetails || null;
  }, [dashboardData]);

  const creditBalance = useMemo(() => {
    return dashboardData?.creditBalanceUsd || 0;
  }, [dashboardData]);

  const trialDaysLeft = useMemo(() => {
    if (!dashboardData || dashboardData.subscriptionStatus !== 'trialing' || !dashboardData.trialEndsAt) {
      return null;
    }

    const trialEndDate = new Date(dashboardData.trialEndsAt);
    const today = new Date();
    const timeDiff = trialEndDate.getTime() - today.getTime();
    const daysLeft = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
    
    return daysLeft;
  }, [dashboardData]);

  return useMemo(() => ({
    dashboardData,
    spendingStatus,
    planDetails,
    creditBalance,
    trialDaysLeft,
    isLoading,
    error,
    refreshBillingData,
  }), [
    dashboardData,
    spendingStatus,
    planDetails,
    creditBalance,
    trialDaysLeft,
    isLoading,
    error,
    refreshBillingData,
  ]);
}