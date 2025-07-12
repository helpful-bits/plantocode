import { useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData, type CustomerBillingInfo } from '@/types/tauri-commands';
import { JOB_STATUSES, type JobStatus } from '@/types/session-types';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';
import { isTauriAvailable, safeCleanupListenerPromise } from '@/utils/tauri-utils';


export interface UseBillingDataReturn {
  dashboardData: BillingDashboardData | null;
  customerBillingInfo: CustomerBillingInfo | null;
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
  const [customerBillingInfo, setCustomerBillingInfo] = useState<CustomerBillingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const fetchBillingData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch both dashboard data and customer billing info in parallel
      const [dashboardData, customerInfo] = await Promise.all([
        invoke<BillingDashboardData>('get_billing_dashboard_data_command'),
        invoke<CustomerBillingInfo | null>('get_customer_billing_info_command')
      ]);
      
      setDashboardData(dashboardData);
      setCustomerBillingInfo(customerInfo);
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

  // Listen for job_updated events to refresh billing data in real-time
  useEffect(() => {
    let unlistenPromise: Promise<() => void> | null = null;

    const setupListener = async () => {
      try {
        unlistenPromise = listen('job_updated', async (event) => {
          try {
            // Event payload includes job details
            const payload = event.payload as { id: string; status: JobStatus; actualCost?: number | null };
            
            // Only refresh billing data if job reached a terminal state
            if (JOB_STATUSES.TERMINAL.includes(payload.status)) {
              console.log('[BillingData] Job reached terminal state, refreshing billing data:', payload);
              await refreshBillingData();
            }
          } catch (err) {
            console.error('[BillingData] Error processing job_updated event:', err);
          }
        });
      } catch (err) {
        console.error('[BillingData] Error setting up job_updated listener:', err);
      }
    };

    void setupListener();

    // Cleanup listener on unmount
    return () => {
      if (!isTauriAvailable()) {
        // Tauri context already destroyed, skip cleanup
        return;
      }

      if (unlistenPromise) {
        safeCleanupListenerPromise(unlistenPromise);
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
    customerBillingInfo,
    creditBalance,
    creditBalanceUsd: creditBalance,
    isPaymentMethodRequired: dashboardData?.isPaymentMethodRequired || false,
    isBillingInfoRequired: dashboardData?.isBillingInfoRequired || false,
    isLoading,
    error,
    refreshBillingData,
  }), [
    dashboardData,
    customerBillingInfo,
    creditBalance,
    isLoading,
    error,
    refreshBillingData,
  ]);
}