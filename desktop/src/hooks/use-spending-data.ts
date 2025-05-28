import { useState, useEffect, useCallback } from 'react';
import { 
  getSpendingStatus, 
  checkServiceAccess, 
  acknowledgeAlert,
  type SpendingStatus, 
  type ServiceAccessResponse 
} from '@/actions/spending.actions';
import { useNotification } from '@/contexts/notification-context';

export interface UseSpendingDataReturn {
  spendingStatus: SpendingStatus | null;
  serviceAccess: ServiceAccessResponse | null;
  isLoading: boolean;
  error: string | null;
  refreshSpendingData: () => Promise<void>;
  acknowledgeSpendingAlert: (alertId: string) => Promise<void>;
}

export function useSpendingData(): UseSpendingDataReturn {
  const [spendingStatus, setSpendingStatus] = useState<SpendingStatus | null>(null);
  const [serviceAccess, setServiceAccess] = useState<ServiceAccessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const fetchSpendingData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch both spending status and service access in parallel
      const [statusData, accessData] = await Promise.all([
        getSpendingStatus(),
        checkServiceAccess(),
      ]);

      setSpendingStatus(statusData);
      setServiceAccess(accessData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Failed to fetch spending data:', err);
      
      // Show notification for critical errors
      if (errorMessage.includes('spending_limit_exceeded') || errorMessage.includes('services_blocked')) {
        showNotification({
          title: 'Service Access Limited',
          message: 'AI services are currently blocked due to spending limits.',
          type: 'error',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const refreshSpendingData = useCallback(async () => {
    await fetchSpendingData();
  }, [fetchSpendingData]);

  const acknowledgeSpendingAlert = useCallback(async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      
      // Refresh spending data to get updated alert status
      await refreshSpendingData();
      
      showNotification({
        title: 'Alert Acknowledged',
        message: 'Spending alert has been acknowledged.',
        type: 'success',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to acknowledge alert';
      setError(errorMessage);
      
      showNotification({
        title: 'Error',
        message: errorMessage,
        type: 'error',
      });
    }
  }, [refreshSpendingData, showNotification]);

  // Initial data fetch
  useEffect(() => {
    fetchSpendingData();
  }, [fetchSpendingData]);

  // Auto-refresh spending data every 30 seconds when services are blocked
  // or when approaching limits (>80% usage)
  useEffect(() => {
    if (
      spendingStatus?.servicesBlocked || 
      (spendingStatus?.usagePercentage && spendingStatus.usagePercentage > 80)
    ) {
      const interval = setInterval(() => {
        fetchSpendingData();
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
    return undefined;
  }, [spendingStatus?.servicesBlocked, spendingStatus?.usagePercentage, fetchSpendingData]);

  return {
    spendingStatus,
    serviceAccess,
    isLoading,
    error,
    refreshSpendingData,
    acknowledgeSpendingAlert,
  };
}