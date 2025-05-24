/**
 * Login Page Component for Vibe Manager Desktop
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/auth-context";

export default function LoginPage() {
  const { signIn, loading, error } = useAuth();
  const appName = "Vibe Manager";
  const [authInProgress, setAuthInProgress] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Effect to update the local error state when the auth error changes
  useEffect(() => {
    if (error) {
      setLastError(error);
      // Auto-clear auth in progress state if there's an error
      setAuthInProgress(false);
    }
  }, [error]);

  // Handle sign-in with Auth0
  const handleSignIn = async (providerHint?: string) => {
    // Clear any previous errors
    setLastError(null);
    setAuthInProgress(true);
    
    try {
      console.log(`[LoginPage] Initiating Auth0 sign in`);
      console.log(`[LoginPage] Current URL: ${window.location.href}`);
      console.log(`[LoginPage] Auth loading state: ${loading}`);
      
      await signIn(providerHint);
      // We don't immediately set authInProgress to false since we're waiting for a callback
      // The external browser will be opened and we'll poll for authentication completion
      console.log(`[LoginPage] Auth0 sign in initiated, browser opened for authentication`);
      
      // Add a timeout to detect if polling takes too long
      setTimeout(() => {
        if (authInProgress) {
          console.log("[LoginPage] Still waiting for authentication after 120 seconds");
          setLastError("Authentication is taking longer than expected. If you've completed sign-in in your browser, please try again.");
        }
      }, 120000); // 2 minutes for Auth0
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LoginPage] Auth0 sign in failed:`, error);
      setLastError(`Sign in failed: ${errorMessage}`);
      setAuthInProgress(false);
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
