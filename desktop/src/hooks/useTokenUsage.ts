import { useState, useEffect, useCallback } from "react";

import { useAuth } from "@/contexts/auth-context";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "TokenUsage" });

/**
 * Token usage data interface
 * Represents the token usage information returned from the server
 */
export interface TokenUsageData {
  usedTokens: number;
  monthlyLimit: number;
  cycleStartDate?: string;
  cycleEndDate?: string;
  estimatedCost?: number;
  currency?: string;
  trialDaysRemaining?: number | null;
  planName?: string;
}

interface UseTokenUsageOptions {
  serverUrl?: string;
  getAuthToken?: () => Promise<string | null>;
  autoRefreshInterval?: number | null; // Milliseconds, null for no auto-refresh
}

type TokenUsageResponse = TokenUsageData;

/**
 * Hook to fetch token usage data from the server
 *
 * @param options Configuration options for the hook
 * @returns Token usage data, loading state, error state, and a refresh function
 */
export function useTokenUsage(options: UseTokenUsageOptions = {}) {
  const [usage, setUsage] = useState<TokenUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);

  // Use auth context for token retrieval
  const auth = useAuth();

  // Configuration options with defaults
  const serverUrlDefault = import.meta.env.VITE_SERVER_URL as string || "http://localhost:8080";
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
          `Failed to fetch token usage: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as TokenUsageResponse;
      setUsage(data);
      setLastRefreshTime(now);
    } catch (e) {
      logger.error("Error:", e);
      setError(e instanceof Error ? e.message : "Unknown error");

      // If in development or testing, use mock data
      if (import.meta.env.DEV) {
        logger.warn("Using mock data in development");
        const mockData: TokenUsageData = {
          usedTokens: 750000,
          monthlyLimit: 2000000,
          estimatedCost: 12.5,
          currency: "USD",
          trialDaysRemaining: 7,
          planName: "Pro Trial",
        };
        setUsage(mockData);
      }
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, getAuthToken, lastRefreshTime]);

  // Initial fetch on mount
  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  // Set up auto-refresh if enabled
  useEffect(() => {
    if (!autoRefreshInterval) return;

    const intervalId = setInterval(() => void fetchUsage(), autoRefreshInterval);
    return () => clearInterval(intervalId);
  }, [fetchUsage, autoRefreshInterval]);

  return {
    usage,
    isLoading,
    error,
    refreshUsage: fetchUsage,
  };
}
