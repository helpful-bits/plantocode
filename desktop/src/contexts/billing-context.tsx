import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData, type CustomerBillingInfo } from '@/types/tauri-commands';
import { JOB_STATUSES, type JobStatus } from '@/types/session-types';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';
import { safeListen } from '@/utils/tauri-event-utils';

export interface BillingContextData {
  dashboardData: BillingDashboardData | null;
  customerBillingInfo: CustomerBillingInfo | null;
  creditBalance: number;
  creditBalanceUsd: number;
  paidCreditBalanceUsd: number; // Add paid credits separately
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  
  // Store the ongoing request promise to prevent duplicate calls
  const ongoingRequest = useRef<Promise<void> | null>(null);

  const fetchBillingData = useCallback(async () => {
    // If there's already an ongoing request, wait for it instead of creating a new one
    if (ongoingRequest.current) {
      await ongoingRequest.current;
      return;
    }

    // Create and store the request promise
    ongoingRequest.current = (async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        
        // Fetch consolidated billing dashboard data
        const dashboardData = await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
        
        setDashboardData(dashboardData);
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
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await safeListen('job_updated', async (event) => {
          try {
            // Event payload includes job details
            const payload = event.payload as { id: string; status: JobStatus; actualCost?: number | null };
            
            // Only refresh billing data if job reached a terminal state
            if (JOB_STATUSES.TERMINAL.includes(payload.status)) {
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
      unlisten?.();
    };
  }, [refreshBillingData]);

  // Listen for billing-data-updated events to refresh billing data
  useEffect(() => {
    const handleBillingDataUpdated = async () => {
      try {
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

  // Calculate TOTAL available balance (paid + free credits)
  const totalAvailableBalance = useMemo(() => {
    const paid = dashboardData?.creditBalanceUsd || 0;
    const free = dashboardData?.freeCreditBalanceUsd || 0;
    return Number(Number(paid + free).toFixed(6));
  }, [dashboardData]);

  const contextValue = useMemo(() => ({
    dashboardData,
    customerBillingInfo: dashboardData?.customerBillingInfo || null,
    creditBalance: totalAvailableBalance, // Use total available balance
    creditBalanceUsd: totalAvailableBalance, // Use total available balance
    paidCreditBalanceUsd: creditBalance, // Keep paid balance separate
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
    creditBalance,
    totalAvailableBalance,
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