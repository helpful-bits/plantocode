"use client";

import React, { useState, useEffect } from 'react';
import { SessionProvider as OriginalSessionProvider } from './session-context';

/**
 * A wrapper around SessionProvider that only renders after client-side hydration
 * This prevents the session context from running intensive initialization during SSR
 * and initial hydration, which can cause the page to freeze.
 *
 * Additionally, adds error boundary protection to prevent session errors from
 * crashing the entire application.
 */
export function SessionProviderSafe({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Mount immediately with no timeout to prevent UI freeze
    setIsMounted(true);
  }, []);

  // Error handler for session provider
  const handleError = (error: Error) => {
    console.error('[SessionProviderSafe] Caught session provider error:', error);
    setHasError(true);
  };

  // Show nothing until client-side mounted
  if (!isMounted) {
    return null;
  }

  // If an error occurred, render a fallback UI that allows the app to function
  // with limited functionality rather than failing completely
  if (hasError) {
    return (
      <div className="p-4">
        <div className="mb-4 p-4 border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-md">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Session Error</h3>
          <p className="text-red-700 dark:text-red-300">
            There was a problem loading your session data. Some features may be limited.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm"
          >
            Reload Page
          </button>
        </div>
        {children}
      </div>
    );
  }

  try {
    // Once mounted on client, render the actual session provider with error handling
    return <OriginalSessionProvider>{children}</OriginalSessionProvider>;
  } catch (error) {
    // Handle synchronous errors during render
    handleError(error instanceof Error ? error : new Error(String(error)));

    // Return fallback UI
    return (
      <div className="p-4">
        <div className="mb-4 p-4 border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-md">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Session Error</h3>
          <p className="text-red-700 dark:text-red-300">
            There was a problem initializing your session. Some features may be limited.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm"
          >
            Reload Page
          </button>
        </div>
        {children}
      </div>
    );
  }
}