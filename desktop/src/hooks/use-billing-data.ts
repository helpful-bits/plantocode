import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  type BillingDashboardData,
} from '@/types/tauri-commands';
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
  isLoading: boolean;
  error: string | null;
  refreshBillingData: () => Promise<void>;
  acknowledgeSpendingAlert: (alertId: string) => Promise<void>;
}

export function useBillingData(): UseBillingDataReturn {
  const [dashboardData, setDashboardData] = useState<BillingDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBillingData = useCallback(async () => {
    // Abort any existing request
    if (abortControllerRef.current) {
      console.log('Aborting previous request');
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      if (!isMountedRef.current || signal.aborted) return;
      
      setIsLoading(true);
      setError(null);

      // Get fresh billing data - NEVER cache financial information
      const data = await invoke<BillingDashboardData>('get_billing_dashboard_data_command');

      if (!isMountedRef.current || signal.aborted) return;

      setDashboardData(data);

    } catch (err) {
      if (!isMountedRef.current || signal.aborted) return;
      
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      // Don't clear dashboardData on error - keep previous data if available
      
      // Show notification for critical errors
      if ((errorMessage.includes('spending_limit_exceeded') || errorMessage.includes('services_blocked')) &&
          !sessionStorage.getItem('billing-error-notified')) {
        sessionStorage.setItem('billing-error-notified', 'true');
        showNotification({
          title: 'Service Access Limited',
          message: 'AI services are currently blocked due to spending limits.',
          type: 'error',
        });
      }
    } finally {
      if (isMountedRef.current && !signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []); // Remove showNotification dependency to prevent re-renders

  const refreshBillingData = useCallback(async () => {
    // Always fetch fresh data - no caching for billing information
    await fetchBillingData();
  }, [fetchBillingData]);

  const acknowledgeSpendingAlert = useCallback(async (alertId: string) => {
    try {
      await invoke<boolean>('acknowledge_spending_alert_command', { alertId });
      
      // Refresh data after acknowledgment
      await fetchBillingData();
      
      showNotification({
        title: 'Alert Acknowledged',
        message: 'Spending alert has been acknowledged.',
        type: 'success',
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: 'Error',
        message: errorMessage,
        type: 'error',
      });
    }
  }, [fetchBillingData, showNotification]);

  // Initial data fetch
  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);
  
  // Retry if no data after mount (auth timing issue)
  useEffect(() => {
    if (!dashboardData && !isLoading && !error) {
      const retryTimer = setTimeout(fetchBillingData, 2000);
      return () => clearTimeout(retryTimer);
    }
    return;
  }, [dashboardData, isLoading, error, fetchBillingData]);

  // Smart refresh based on critical states with improved logic
  useEffect(() => {
    // Check if services are blocked based on spending data
    const servicesBlocked = dashboardData && 
      dashboardData.spendingDetails.currentSpendingUsd >= dashboardData.spendingDetails.spendingLimitUsd;
    
    if (!servicesBlocked) {
      return; // Only set up listeners when services are blocked
    }

    const handleUserActivity = () => {
      if (isMountedRef.current) {
        void fetchBillingData();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        void fetchBillingData();
      }
    };

    // Use passive listeners for better performance
    window.addEventListener('focus', handleUserActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    return () => {
      window.removeEventListener('focus', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [dashboardData, fetchBillingData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Abort any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Compute spending status from dashboard data
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

  // Memoize the return object to prevent unnecessary re-renders
  const returnValue = useMemo(() => ({
    dashboardData,
    spendingStatus,
    isLoading,
    error,
    refreshBillingData,
    acknowledgeSpendingAlert,
  }), [
    dashboardData,
    spendingStatus,
    isLoading,
    error,
    refreshBillingData,
    acknowledgeSpendingAlert,
  ]);

  return returnValue;
}