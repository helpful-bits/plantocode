import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData, type CustomerBillingInfo } from '@/types/tauri-commands';
import { JOB_STATUSES, type JobStatus } from '@/types/session-types';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';
import { isTauriAvailable, safeCleanupListenerPromise } from '@/utils/tauri-utils';

export interface BillingContextData {
  dashboardData: BillingDashboardData | null;
  customerBillingInfo: CustomerBillingInfo | null;
  creditBalance: number;
  creditBalanceUsd: number;
  isPaymentMethodRequired: boolean;
  isBillingInfoRequired: boolean;
  isLoading: boolean;
  error: string | null;
  refreshBillingData: () => Promise<void>;
  freeCreditBalanceUsd: number;
  usageLimitUsd: number;
  currentUsage: number;
  freeCreditsExpiresAt: string | null;
}

const BillingContext = createContext<BillingContextData | undefined>(undefined);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [dashboardData, setDashboardData] = useState<BillingDashboardData | null>(null);
  const [customerBillingInfo, setCustomerBillingInfo] = useState<CustomerBillingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  
  // Store the ongoing request promise to prevent duplicate calls
  const ongoingRequest = useRef<Promise<void> | null>(null);

  const fetchBillingData = useCallback(async () => {
    // If there's already an ongoing request, wait for it instead of creating a new one
    if (ongoingRequest.current) {
      console.log('[BillingContext] Request already in progress, waiting for existing request');
      await ongoingRequest.current;
      return;
    }

    // Create and store the request promise
    ongoingRequest.current = (async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('[BillingContext] Fetching billing data...');
        
        // Fetch both dashboard data and customer billing info in parallel
        const [dashboardData, customerInfo] = await Promise.all([
          invoke<BillingDashboardData>('get_billing_dashboard_data_command'),
          invoke<CustomerBillingInfo | null>('get_customer_billing_info_command')
        ]);
        
        setDashboardData(dashboardData);
        setCustomerBillingInfo(customerInfo);
        console.log('[BillingContext] Billing data fetched successfully');
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
        console.error('[BillingContext] Error fetching billing data:', errorMessage);
        
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
        ongoingRequest.current = null; // Clear the promise when done
      }
    })();

    await ongoingRequest.current;
  }, [showNotification]);

  const refreshBillingData = useCallback(async () => {
    await fetchBillingData();
  }, [fetchBillingData]);

  // Initial data fetch
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
              console.log('[BillingContext] Job reached terminal state, refreshing billing data:', payload);
              await refreshBillingData();
            }
          } catch (err) {
            console.error('[BillingContext] Error processing job_updated event:', err);
          }
        });
      } catch (err) {
        console.error('[BillingContext] Error setting up job_updated listener:', err);
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
        console.log('[BillingContext] Received billing-data-updated event, refreshing data');
        await refreshBillingData();
      } catch (err) {
        console.error('[BillingContext] Error processing billing-data-updated event:', err);
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

  const contextValue = useMemo(() => ({
    dashboardData,
    customerBillingInfo,
    creditBalance,
    creditBalanceUsd: creditBalance,
    isPaymentMethodRequired: dashboardData?.isPaymentMethodRequired || false,
    isBillingInfoRequired: dashboardData?.isBillingInfoRequired || false,
    isLoading,
    error,
    refreshBillingData,
    freeCreditBalanceUsd: dashboardData?.freeCreditBalanceUsd || 0,
    usageLimitUsd: dashboardData?.usageLimitUsd || 0,
    currentUsage: dashboardData?.currentUsage || 0,
    freeCreditsExpiresAt: dashboardData?.freeCreditsExpiresAt || null,
  }), [
    dashboardData,
    customerBillingInfo,
    creditBalance,
    isLoading,
    error,
    refreshBillingData,
  ]);

  return (
    <BillingContext.Provider value={contextValue}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBillingData(): BillingContextData {
  const context = useContext(BillingContext);
  if (context === undefined) {
    throw new Error('useBillingData must be used within a BillingProvider');
  }
  return context;
}