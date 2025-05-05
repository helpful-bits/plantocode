"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from "react";

// Create a minimal interface that matches what other code expects
interface RepositoryInterface {
  // Basic methods that might be needed by components
  getCachedState: (scope: string | null, key: string) => Promise<string | null>;
  saveCachedState: (scope: string | null, key: string, value: string) => Promise<void>;
  getActiveSessionId: (projectDir: string) => Promise<string | null>;
  setActiveSession: (projectDir: string, sessionId: string | null) => Promise<void>;
}

// Database context interface
interface DatabaseContextType {
  repository: RepositoryInterface;
  isInitialized: boolean;
  error: string | null;
  isRecoveryMode: boolean;
  triggerDatabaseErrorModal: (message: string) => void;
}

// Create a dummy repository implementation
const dummyRepository: RepositoryInterface = {
  getCachedState: async () => {
    console.warn("DatabaseContext: getCachedState called but database-context is disabled");
    return null;
  },
  saveCachedState: async () => {
    console.warn("DatabaseContext: saveCachedState called but database-context is disabled");
  },
  getActiveSessionId: async () => {
    console.warn("DatabaseContext: getActiveSessionId called but database-context is disabled");
    return null;
  },
  setActiveSession: async () => {
    console.warn("DatabaseContext: setActiveSession called but database-context is disabled");
  }
};

// Default context with dummy repository
const defaultContextValue: DatabaseContextType = {
  repository: dummyRepository,
  isInitialized: true,
  error: null,
  isRecoveryMode: false,
  triggerDatabaseErrorModal: () => {}
};

// Create the context
const DatabaseContext = createContext<DatabaseContextType>(defaultContextValue);

// Provider component
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(false);
  const [initAttempted, setInitAttempted] = useState<boolean>(false);
  const [healthCheckAttempts, setHealthCheckAttempts] = useState<number>(0);
  
  // Use a ref to track if initialization has been started, regardless of component re-renders
  const initStartedRef = React.useRef<boolean>(false);

  // Function to trigger the database error modal - wrapped in useCallback
  const triggerDatabaseErrorModal = useCallback((message: string) => {
    console.error('Database error:', message);
    setError(message);
    
    // Dispatch custom event to show the error modal
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('database_error', {
        detail: {
          type: 'database_error',
          message: message
        }
      });
      window.dispatchEvent(event);
    }
  }, []);

  // Check database health - wrapped in useCallback
  const checkDatabaseHealth = useCallback(async () => {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        // Update attempt counter
        setHealthCheckAttempts(prev => prev + 1);
        
        console.log('[DatabaseContext] Checking database health, attempt #', healthCheckAttempts + 1);
        
        // Make a simple API call to verify database connection
        const response = await fetch('/api/database/health', { 
          method: 'GET',
          cache: 'no-cache', // Prevent caching to get real-time status
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          }
        });
        
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('Error parsing health check response:', parseError);
          triggerDatabaseErrorModal('Error parsing health check response: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
          setIsInitialized(false);
          
          // If we're still failing after 3 attempts, stop trying
          if (healthCheckAttempts >= 3) {
            console.error('Database health check failed repeatedly, giving up');
            return;
          }
          
          // Try again in 2 seconds
          setTimeout(checkDatabaseHealth, 2000);
          return;
        }
        
        if (!response.ok) {
          triggerDatabaseErrorModal(data.error || 'Database connection check failed');
          setIsInitialized(false);
          
          // If we're still failing after 3 attempts, stop trying
          if (healthCheckAttempts >= 3) {
            console.error('Database health check failed repeatedly, giving up');
            return;
          }
          
          // Try again in 2 seconds
          setTimeout(checkDatabaseHealth, 2000);
          return;
        }
        
        // Parse the health check response
        if (data.status === 'warning') {
          // We have a connection but with warnings
          console.warn('Database health warning:', data.error);
          setIsInitialized(true);
          if (data.needsRepair) {
            triggerDatabaseErrorModal(data.error || 'Database needs repair');
          }
        } else if (data.status === 'ok') {
          // All good
          console.log('[DatabaseContext] Database health check passed, status: ok');
          setIsInitialized(true);
          setError(null);
          
          // Check if we're in recovery mode
          if (data.recoveryMode) {
            setIsRecoveryMode(true);
            console.warn('Database is running in recovery mode with limited functionality');
          } else {
            setIsRecoveryMode(false);
          }
        } else {
          // Unexpected status
          const statusMessage = data?.status ? String(data.status) : 'undefined';
          console.warn('Unexpected database health status:', statusMessage);
          setIsInitialized(false);
          triggerDatabaseErrorModal('Unexpected database health status received from API: ' + statusMessage);
        }
      }
    } catch (err) {
      console.error('Error checking database health:', err);
      const errorMessage = err instanceof Error ? err.message : 'Database health check failed';
      triggerDatabaseErrorModal(errorMessage);
      setIsInitialized(false);
      
      // If we're still failing after 3 attempts, stop trying
      if (healthCheckAttempts >= 3) {
        console.error('Database health check failed repeatedly, giving up');
        return;
      }
      
      // Try again in 2 seconds
      setTimeout(checkDatabaseHealth, 2000);
    }
  }, [healthCheckAttempts, triggerDatabaseErrorModal]);

  // Initialize database
  useEffect(() => {
    let isMounted = true;
    
    // Log current dependency values
    console.log('[DatabaseContext] InitDatabase useEffect running with dependencies:',
      {
        checkDatabaseHealthFnChanged: !!checkDatabaseHealth,
        initAttempted,
        triggerDatabaseErrorModalFnChanged: !!triggerDatabaseErrorModal,
        initStarted: initStartedRef.current
      }
    );
    
    // Check the ref to see if initialization has already started
    if (initStartedRef.current) {
      console.log('[DatabaseContext] Skipping database initialization because initStartedRef.current is true');
      return;
    }
    
    // Immediately mark initialization as started to prevent duplicate calls
    // This happens even before the async initialization begins
    initStartedRef.current = true;
    
    const initDatabase = async () => {
      try {
        console.log('[DatabaseContext] Starting database initialization');
        setInitAttempted(true);
        
        // First try to explicitly initialize the database
        console.log('[DatabaseContext] Making POST request to /api/database/init');
        const initResponse = await fetch('/api/database/init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'setup' }),
          cache: 'no-store',
        });
        
        if (!initResponse.ok) {
          const data = await initResponse.json();
          if (isMounted) {
            console.error('[DatabaseContext] Database initialization failed with status:', initResponse.status);
            triggerDatabaseErrorModal(data.error || 'Database initialization failed');
            setIsInitialized(false);
          }
          return;
        }
        
        console.log('[DatabaseContext] Database initialization successful, checking health');
        
        // Then check health
        await checkDatabaseHealth();
      } catch (err) {
        console.error('Error initializing database:', err);
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Database initialization failed';
          triggerDatabaseErrorModal(errorMessage);
          setIsInitialized(false);
        }
      }
    };
    
    initDatabase();
    
    return () => {
      isMounted = false;
      console.log('[DatabaseContext] Init effect cleanup - component unmounting');
      // We intentionally do NOT reset initStartedRef here because we want to
      // prevent re-initialization even after unmount/remount cycles
    };
  }, [checkDatabaseHealth, triggerDatabaseErrorModal, initAttempted]);

  // Create context value
  const contextValue: DatabaseContextType = {
    repository: dummyRepository,
    isInitialized,
    error,
    isRecoveryMode,
    triggerDatabaseErrorModal
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