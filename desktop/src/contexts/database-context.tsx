"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "DatabaseContext" });

// Database context interface
export interface DatabaseContextValue {
  isInitialized: boolean;
  error: string | null;
  isRecoveryMode: boolean;
  triggerDatabaseErrorModal: (message: string) => void;
}

// Default context value
const defaultContextValue: DatabaseContextValue = {
  isInitialized: true, // Assume true by default on client
  error: null,
  isRecoveryMode: false,
  triggerDatabaseErrorModal: () => {},
};

// Create the context
const DatabaseContext =
  createContext<DatabaseContextValue>(defaultContextValue);

// Provider component
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(true); // Start with true
  const [isRecoveryMode] = useState<boolean>(false);

  // Function to trigger the database error modal - wrapped in useCallback
  const triggerDatabaseErrorModal = useCallback((message: string) => {
    logger.error("Database error:", message);
    setError(message);
    setIsInitialized(false);

    // Dispatch custom event to show the error modal
    if (typeof window !== "undefined") {
      const event = new CustomEvent("database_error", {
        detail: {
          type: "database_error",
          message: message,
        },
      });
      window.dispatchEvent(event);
    }
  }, []);

  // Create context value
  const contextValue: DatabaseContextValue = {
    isInitialized,
    error,
    isRecoveryMode,
    triggerDatabaseErrorModal,
  };

  return (
    <DatabaseContext.Provider value={contextValue}>
      {children}
    </DatabaseContext.Provider>
  );
}

// Hook for components to use the context
export function useDatabase() {
  return useContext(DatabaseContext);
}
