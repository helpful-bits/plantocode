import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useAuth } from "@/contexts/auth-context";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/error-handling";
import { type SpendingStatusInfo } from "@/types/tauri-commands";

const logger = createLogger({ namespace: "CostUsage" });

/**
 * Cost usage data interface
 * Represents the cost-based usage information returned from the server
 */
export interface CostUsageData {
  currentSpending: number;
  monthlyAllowance: number;
  hardLimit: number;
  cycleStartDate?: string;
  cycleEndDate?: string;
  usagePercentage: number;
  servicesBlocked: boolean;
  currency?: string;
  trialDaysRemaining?: number | null;
  planName?: string;
  creditBalance: number;
}

interface UseCostUsageOptions {
  autoRefreshInterval?: number | null; // Milliseconds, null for no auto-refresh
}

/**
 * Hook to fetch cost-based usage data using Tauri commands
 *
 * @param options Configuration options for the hook
 * @returns Cost usage data, loading state, error state, and a refresh function
 */
export function useCostUsage(options: UseCostUsageOptions = {}) {
  const [usage, setUsage] = useState<CostUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshTime = useRef(0);
  const { user } = useAuth();

  const {
    autoRefreshInterval = null,
  } = options;

  // Convert SpendingStatusInfo to CostUsageData format
  const convertToCostUsageData = (spendingStatus: SpendingStatusInfo): CostUsageData => {
    return {
      currentSpending: spendingStatus.currentSpending,
      monthlyAllowance: spendingStatus.includedAllowance,
      hardLimit: spendingStatus.hardLimit,
      usagePercentage: spendingStatus.usagePercentage,
      servicesBlocked: spendingStatus.servicesBlocked,
      currency: spendingStatus.currency,
      creditBalance: spendingStatus.creditBalance,
      // Additional fields that may not be in SpendingStatusInfo
      cycleStartDate: undefined,
      cycleEndDate: spendingStatus.nextBillingDate,
      trialDaysRemaining: null,
      planName: undefined,
    };
  };

  const refreshUsage = useCallback(async () => {
    // Skip if we've refreshed in the last 5 seconds to prevent rapid calls
    const now = Date.now();
    if (now - lastRefreshTime.current < 5000) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use Tauri command to get spending status
      const spendingStatus = await invoke<SpendingStatusInfo>("get_spending_status_command");
      
      // Convert to expected format
      const costUsageData = convertToCostUsageData(spendingStatus);
      setUsage(costUsageData);
      lastRefreshTime.current = now;
    } catch (e) {
      logger.error("Error:", e);
      const errorMessage = getErrorMessage(e);
      setError(errorMessage);
      // NO MOCK DATA - Real data from server only
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (user) {
      refreshUsage();
    }
  }, [user, refreshUsage]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) {
      return;
    }

    const interval = setInterval(() => {
      if (user) {
        refreshUsage();
      }
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [user, autoRefreshInterval, refreshUsage]);

  return {
    usage,
    isLoading,
    error,
    refreshUsage,
  };
}