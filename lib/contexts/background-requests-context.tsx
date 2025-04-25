"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { GeminiRequest } from '@/types';
import { getActiveRequestsAction, clearRequestHistoryAction, updateRequestClearedStatusAction } from '@/actions/background-request-actions';
import { cancelGeminiRequestAction } from '@/actions/gemini-actions';

// Define context types
interface BackgroundRequestsContextType {
  // State
  activeRequests: GeminiRequest[];
  isLoading: boolean;
  error: string | null;
  // Actions
  fetchActiveRequests: () => Promise<void>;
  cancelRequest: (requestId: string) => Promise<boolean>;
  clearHistory: () => Promise<boolean>;
  clearSingleRequest: (requestId: string) => Promise<boolean>;
}

// Create the context with a default value
const BackgroundRequestsContext = createContext<BackgroundRequestsContextType>({
  activeRequests: [],
  isLoading: false,
  error: null,
  fetchActiveRequests: async () => {},
  cancelRequest: async () => false,
  clearHistory: async () => false,
  clearSingleRequest: async () => false,
});

// Define polling interval in ms (30 seconds instead of 10)
const POLLING_INTERVAL = 30000;
// Define debounce delay in ms
const DEBOUNCE_DELAY = 2000;

// Hook to use the context
export const useBackgroundRequests = () => useContext(BackgroundRequestsContext);

// Provider component
export const BackgroundRequestsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for requests, loading, and errors
  const [activeRequests, setActiveRequests] = useState<GeminiRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Reference to store the polling interval
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  // Add debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Add last fetch time ref
  const lastFetchTimeRef = useRef<number>(0);
  
  // Function to fetch active requests
  const fetchActiveRequests = useCallback(async (): Promise<void> => {
    // Skip if already loading
    if (isLoading) return;
    
    // Implement debounce to prevent excessive calls
    const now = Date.now();
    if (now - lastFetchTimeRef.current < DEBOUNCE_DELAY) {
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        fetchActiveRequests();
      }, DEBOUNCE_DELAY);
      
      return;
    }
    
    // Update last fetch time
    lastFetchTimeRef.current = now;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Get active requests from both API and action
      const result = await getActiveRequestsAction();
      if (result.isSuccess && result.data) {
        setActiveRequests(result.data);
      } else if (result.message) {
        setError(result.message);
      }
    } catch (error) {
      console.error("Error fetching active requests:", error);
      setError(error instanceof Error ? error.message : "Unknown error fetching requests");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);
  
  // Function to cancel a request
  const cancelRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      // Call the server action to cancel the request
      const result = await cancelGeminiRequestAction(requestId);
      
      if (result.isSuccess) {
        // Fetch updated list of active requests
        await fetchActiveRequests();
        return true;
      } else {
        console.error("Error canceling request:", result.message);
        setError(result.message);
        return false;
      }
    } catch (err) {
      console.error("Exception canceling request:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  }, [fetchActiveRequests]);
  
  // Function to clear request history
  const clearHistory = useCallback(async (): Promise<boolean> => {
    try {
      // Call the server action to clear request history
      const result = await clearRequestHistoryAction();
      
      if (result.isSuccess) {
        // Fetch updated list of active requests
        await fetchActiveRequests();
        return true;
      } else {
        console.error("Error clearing request history:", result.message);
        setError(result.message);
        return false;
      }
    } catch (err) {
      console.error("Exception clearing request history:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  }, [fetchActiveRequests]);
  
  // Function to clear a single request from history
  const clearSingleRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      // Call the server action to clear the request
      const result = await updateRequestClearedStatusAction(requestId, true);
      
      if (result.isSuccess) {
        // Remove the request from the active requests list
        setActiveRequests(prev => prev.filter(req => req.id !== requestId));
        return true;
      } else {
        console.error("Error clearing request:", result.message);
        setError(result.message);
        return false;
      }
    } catch (err) {
      console.error("Exception clearing request:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  }, []);
  
  // Setup polling for active requests
  useEffect(() => {
    // Fetch active requests on mount
    fetchActiveRequests();
    
    // Start polling only if not already polling
    if (!pollingIntervalRef.current) {
      console.log("[BackgroundRequestsProvider] Starting polling interval");
      pollingIntervalRef.current = setInterval(() => {
        console.log("[BackgroundRequestsProvider] Polling for active requests");
        fetchActiveRequests();
      }, POLLING_INTERVAL);
    }
    
    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        console.log("[BackgroundRequestsProvider] Cleaning up polling interval");
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [fetchActiveRequests]);
  
  // Provide the context value
  const contextValue: BackgroundRequestsContextType = {
    activeRequests,
    isLoading,
    error,
    fetchActiveRequests,
    cancelRequest,
    clearHistory,
    clearSingleRequest,
  };
  
  return (
    <BackgroundRequestsContext.Provider value={contextValue}>
      {children}
    </BackgroundRequestsContext.Provider>
  );
}; 