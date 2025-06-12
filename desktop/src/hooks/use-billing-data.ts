import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  type SpendingStatusInfo,
  type SubscriptionDetails,
} from '@/types/tauri-commands';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';


export interface UseBillingDataReturn {
  spendingStatus: SpendingStatusInfo | null;
  subscriptionDetails: SubscriptionDetails | null;
  creditBalance: number | null;
  isLoading: boolean;
  error: string | null;
  refreshBillingData: () => Promise<void>;
  acknowledgeSpendingAlert: (alertId: string) => Promise<void>;
}

export function useBillingData(): UseBillingDataReturn {
  const [spendingStatus, setSpendingStatus] = useState<SpendingStatusInfo | null>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const isMountedRef = useRef(true);

  const fetchBillingData = useCallback(async () => {
    try {
      if (!isMountedRef.current) return;
      if (isLoading) return; // Prevent concurrent calls
      setIsLoading(true);
      setError(null);

      // Fetch only the two primary data sources
      const [statusData, subscriptionData] = await Promise.all([
        invoke<SpendingStatusInfo>('get_spending_status_command'),
        invoke<SubscriptionDetails>('get_subscription_details_command'),
      ]);

      if (!isMountedRef.current) return;
      setSpendingStatus(statusData);
      setSubscriptionDetails(subscriptionData);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to fetch billing data:', err);
      
      // Show notification for critical errors only once per session
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
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isLoading, showNotification]);

  const refreshBillingData = useCallback(async () => {
    await fetchBillingData();
  }, [fetchBillingData]);

  const acknowledgeSpendingAlert = useCallback(async (alertId: string) => {
    try {
      await invoke<boolean>('acknowledge_spending_alert_command', { alertId });
      
      // Refresh data after acknowledgment
      await refreshBillingData();
      
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
  }, [refreshBillingData, showNotification]);

  // Initial data fetch
  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  // Smart refresh based on user activity and critical states  
  useEffect(() => {
    const handleUserActivity = () => {
      // Only refresh if we're in a critical state and user is active
      if (spendingStatus?.servicesBlocked && isMountedRef.current) {
        void fetchBillingData();
      }
    };

    const handleVisibilityChange = () => {
      // Refresh when user returns to tab if data might be stale
      if (document.visibilityState === 'visible' && spendingStatus?.servicesBlocked) {
        void fetchBillingData();
      }
    };

    // Optimized event listeners with passive flags for better performance
    window.addEventListener('focus', handleUserActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    return () => {
      window.removeEventListener('focus', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [spendingStatus?.servicesBlocked, fetchBillingData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Derive creditBalance from subscriptionDetails on the client side
  const creditBalance = useMemo(() => {
    return subscriptionDetails?.creditBalance ?? spendingStatus?.creditBalance ?? null;
  }, [subscriptionDetails?.creditBalance, spendingStatus?.creditBalance]);

  // Memoize the return object to prevent unnecessary re-renders
  const returnValue = useMemo(() => ({
    spendingStatus,
    subscriptionDetails,
    creditBalance,
    isLoading,
    error,
    refreshBillingData,
    acknowledgeSpendingAlert,
  }), [
    spendingStatus,
    subscriptionDetails,
    creditBalance,
    isLoading,
    error,
    refreshBillingData,
    acknowledgeSpendingAlert,
  ]);

  return returnValue;
}