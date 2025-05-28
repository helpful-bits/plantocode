import { useState, useEffect, useCallback, useRef } from "react";

import { useAuth } from "@/contexts/auth-context";
import { createLogger } from "@/utils/logger";

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
}

interface UseCostUsageOptions {
  serverUrl?: string;
  getAuthToken?: () => Promise<string | null>;
  autoRefreshInterval?: number | null; // Milliseconds, null for no auto-refresh
}

type CostUsageResponse = CostUsageData;

/**
 * Hook to fetch cost-based usage data from the server
 *
 * @param options Configuration options for the hook
 * @returns Cost usage data, loading state, error state, and a refresh function
 */
export function useCostUsage(options: UseCostUsageOptions = {}) {
  const [usage, setUsage] = useState<CostUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);

  // Use auth context for token retrieval
  const auth = useAuth();

  // Configuration options with defaults
  const serverUrlDefault = import.meta.env.VITE_MAIN_SERVER_BASE_URL as string || "http://localhost:8080";
  const getAuthTokenDefault = auth.getToken;
  
  const {
    serverUrl = serverUrlDefault,
    getAuthToken = options.getAuthToken || getAuthTokenDefault,
    autoRefreshInterval = null,
  } = options;

  // Function to fetch usage data from the server
  const fetchUsage = useCallback(async () => {
    // Skip if we've refreshed in the last 5 seconds to prevent rapid calls
    const now = Date.now();
    if (now - lastRefreshTime < 5000) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get auth token
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Authentication token not found");
      }

      // Make the API request
      const response = await fetch(`${serverUrl}/api/usage/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch cost usage: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as CostUsageResponse;
      setUsage(data);
      setLastRefreshTime(now);
    } catch (e) {
      logger.error("Error:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
      // NO MOCK DATA - Real data from server only
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, getAuthToken, lastRefreshTime]);

  // Use ref for fetchUsage to prevent dependency instability in auto-refresh
  const fetchUsageRef = useRef(fetchUsage);
  useEffect(() => {
    fetchUsageRef.current = fetchUsage;
  }, [fetchUsage]);

  // Initial fetch on mount
  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  // Set up auto-refresh if enabled
  useEffect(() => {
    if (!autoRefreshInterval) return;

    const intervalId = setInterval(() => void fetchUsageRef.current(), autoRefreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefreshInterval]);

  return {
    usage,
    isLoading,
    error,
    refreshUsage: fetchUsage,
  };
}