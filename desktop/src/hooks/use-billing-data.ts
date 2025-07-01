import { useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData } from '@/types/tauri-commands';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';


export interface UseBillingDataReturn {
  dashboardData: BillingDashboardData | null;
  creditBalance: number;
  creditBalanceUsd: number;
  isPaymentMethodRequired: boolean;
  isBillingInfoRequired: boolean;
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
      
      const data = await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
      setDashboardData(data);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      if (errorMessage.includes('insufficient_credits') || errorMessage.includes('credit_insufficient')) {
        showNotification({
          title: 'Insufficient Credits',
          message: 'You need to purchase additional credits to continue using AI features. Please visit your billing page to buy credits.',
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

  // Listen for job-terminated events to refresh billing data in real-time
  useEffect(() => {
    let unlistenPromise: Promise<() => void> | null = null;

    const setupListener = async () => {
      try {
        unlistenPromise = listen('job-terminated', async (event) => {
          try {
            // Event payload includes jobId and actualCost
            const payload = event.payload as { jobId: string; actualCost?: number | null };
            console.log('[BillingData] Job terminated, refreshing billing data:', payload);
            
            // Refresh billing data when a job completes to update cost tracking
            await refreshBillingData();
          } catch (err) {
            console.error('[BillingData] Error processing job-terminated event:', err);
          }
        });
      } catch (err) {
        console.error('[BillingData] Error setting up job-terminated listener:', err);
      }
    };

    void setupListener();

    // Cleanup listener on unmount
    return () => {
      if (unlistenPromise) {
        void unlistenPromise.then((cleanupFn) => cleanupFn());
      }
    };
  }, [refreshBillingData]);

  // Listen for billing-data-updated events to refresh billing data
  useEffect(() => {
    const handleBillingDataUpdated = async () => {
      try {
        console.log('[BillingData] Received billing-data-updated event, refreshing data');
        await refreshBillingData();
      } catch (err) {
        console.error('[BillingData] Error processing billing-data-updated event:', err);
      }
    };

    window.addEventListener('billing-data-updated', handleBillingDataUpdated);

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('billing-data-updated', handleBillingDataUpdated);
    };
  }, [refreshBillingData]);



  const creditBalance = useMemo(() => {
    const balance = dashboardData?.creditBalanceUsd || 0;
    // Apply display rounding safety to avoid BigDecimal string issues
    return Number(Number(balance).toFixed(6));
  }, [dashboardData]);


  return useMemo(() => ({
    dashboardData,
    creditBalance,
    creditBalanceUsd: creditBalance,
    isPaymentMethodRequired: dashboardData?.isPaymentMethodRequired || false,
    isBillingInfoRequired: dashboardData?.isBillingInfoRequired || false,
    isLoading,
    error,
    refreshBillingData,
  }), [
    dashboardData,
    creditBalance,
    isLoading,
    error,
    refreshBillingData,
  ]);
}