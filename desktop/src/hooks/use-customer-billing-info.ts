import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type CustomerBillingInfo } from '@/types/tauri-commands';
import { getErrorMessage } from '@/utils/error-handling';

export interface UseCustomerBillingInfoReturn {
  billingInfo: CustomerBillingInfo | null;
  isLoading: boolean;
  error: string | null;
  refreshBillingInfo: () => Promise<void>;
}

export function useCustomerBillingInfo(): UseCustomerBillingInfoReturn {
  const [billingInfo, setBillingInfo] = useState<CustomerBillingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBillingInfo = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await invoke<CustomerBillingInfo | null>('get_customer_billing_info_command');
      setBillingInfo(data);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to fetch billing info:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshBillingInfo = useCallback(async () => {
    await fetchBillingInfo();
  }, [fetchBillingInfo]);

  useEffect(() => {
    fetchBillingInfo();
  }, [fetchBillingInfo]);

  return {
    billingInfo,
    isLoading,
    error,
    refreshBillingInfo,
  };
}