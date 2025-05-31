import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  type SpendingStatusInfo,
} from '@/types/tauri-commands';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';

export interface ServiceAccessResponse {
  hasAccess: boolean;
  message: string;
}

export interface UseSpendingDataReturn {
  spendingStatus: SpendingStatusInfo | null;
  serviceAccess: ServiceAccessResponse | null;
  isLoading: boolean;
  error: string | null;
  refreshSpendingData: () => Promise<void>;
  acknowledgeSpendingAlert: (alertId: string) => Promise<void>;
}

export function useSpendingData(): UseSpendingDataReturn {
  const [spendingStatus, setSpendingStatus] = useState<SpendingStatusInfo | null>(null);
  const [serviceAccess, setServiceAccess] = useState<ServiceAccessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const isMountedRef = useRef(true);

  const fetchSpendingData = useCallback(async () => {
    try {
      if (!isMountedRef.current) return;
      setIsLoading(true);
      setError(null);

      // Fetch both spending status and service access in parallel using Tauri commands
      const [statusData, accessData] = await Promise.all([
        invoke<SpendingStatusInfo>('get_spending_status_command'),
        invoke<ServiceAccessResponse>('check_service_access_command'),
      ]);

      if (!isMountedRef.current) return;
      setSpendingStatus(statusData);
      setServiceAccess(accessData);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      const errorMessage = getErrorMessage(err);
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
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [showNotification]);

  const refreshSpendingData = useCallback(async () => {
    await fetchSpendingData();
  }, [fetchSpendingData]);

  const acknowledgeSpendingAlert = useCallback(async (alertId: string) => {
    try {
      await invoke<boolean>('acknowledge_spending_alert_command', { alertId });
      
      // Refresh spending data to get updated alert status
      await refreshSpendingData();
      
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
        if (isMountedRef.current) {
          fetchSpendingData();
        }
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
    return undefined;
  }, [spendingStatus?.servicesBlocked, spendingStatus?.usagePercentage, fetchSpendingData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    spendingStatus,
    serviceAccess,
    isLoading,
    error,
    refreshSpendingData,
    acknowledgeSpendingAlert,
  };
}