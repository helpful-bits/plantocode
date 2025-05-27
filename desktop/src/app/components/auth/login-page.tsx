/**
 * Login Page Component for Vibe Manager Desktop
 */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../contexts/auth-context";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "LoginPage" });

export default function LoginPage() {
  const { signIn, loading, error } = useAuth();
  const appName = "Vibe Manager";
  const [authInProgress, setAuthInProgress] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Effect to update the local error state when the auth error changes
  useEffect(() => {
    if (error) {
      setLastError(error);
      // Auto-clear auth in progress state if there's an error
      setAuthInProgress(false);
      // Clear the polling timeout if authentication failed
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    }
  }, [error]);

  // Clear timeout when auth is no longer in progress (successful auth)
  useEffect(() => {
    if (!authInProgress && pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, [authInProgress]);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle sign-in with Auth0
  const handleSignIn = async (providerHint?: string) => {
    // Clear any previous errors and timeout
    setLastError(null);
    setAuthInProgress(true);
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    
    try {
      logger.debug("Initiating Auth0 sign in");
      logger.debug(`Current URL: ${window.location.href}`);
      logger.debug(`Auth loading state: ${loading}`);
      
      await signIn(providerHint);
      // We don't immediately set authInProgress to false since we're waiting for a callback
      // The external browser will be opened and we'll poll for authentication completion
      logger.debug("Auth0 sign in initiated, browser opened for authentication");
      
      // Add a timeout to detect if polling takes too long
      pollingTimeoutRef.current = setTimeout(() => {
        if (authInProgress) {
          logger.warn("Still waiting for authentication after 120 seconds");
          setLastError("Authentication is taking longer than expected. If you've completed sign-in in your browser, please try again.");
        }
      }, 120000); // 2 minutes for Auth0
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Auth0 sign in failed:", error);
      setLastError(`Sign in failed: ${errorMessage}`);
      setAuthInProgress(false);
      // Clear the timeout on error
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="max-w-md w-full space-y-8 p-10 bg-card rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">
            {appName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to continue to your workspace
          </p>
        </div>

        {(error || lastError) && (
          <div className="bg-destructive-background border border-destructive-border text-destructive-foreground p-3 rounded-md text-sm">
            {error || lastError}
          </div>
        )}

        {authInProgress && !loading && (
          <div className="bg-info-background border border-info-border text-info-foreground p-3 rounded-md text-sm">
            Authentication in progress. Please complete the sign-in in your browser.
            The app will automatically detect when you've finished signing in.
          </div>
        )}

        <div className="mt-8 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted-foreground">
                Sign in with your preferred provider
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSignIn('google-oauth2')}
              disabled={loading || authInProgress}
              className="flex items-center justify-center py-2 px-4 border border-border rounded-md text-sm font-medium text-card-foreground bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Google
            </button>
            <button
              onClick={() => handleSignIn('github')}
              disabled={loading || authInProgress}
              className="flex items-center justify-center py-2 px-4 border border-border rounded-md text-sm font-medium text-card-foreground bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              GitHub
            </button>
            <button
              onClick={() => handleSignIn('windowslive')}
              disabled={loading || authInProgress}
              className="flex items-center justify-center py-2 px-4 border border-border rounded-md text-sm font-medium text-card-foreground bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Microsoft
            </button>
            <button
              onClick={() => handleSignIn('apple')}
              disabled={loading || authInProgress}
              className="flex items-center justify-center py-2 px-4 border border-border rounded-md text-sm font-medium text-card-foreground bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apple
            </button>
          </div>

          <div className="text-sm text-center mt-6">
            <p className="text-muted-foreground">
              By signing in, you agree to our Terms of Service and Privacy
              Policy
            </p>
          </div>
          
        </div>
      </div>
    </div>
  );
}
