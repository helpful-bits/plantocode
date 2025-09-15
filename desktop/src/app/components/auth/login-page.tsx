/**
 * Login Page Component for Vibe Manager Desktop
 */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../contexts/auth-context";
import { createLogger } from "@/utils/logger";
import { open } from "@/utils/shell-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { usePlausible } from "@/hooks/use-plausible";

const logger = createLogger({ namespace: "LoginPage" });

export default function LoginPage() {
  const { trackEvent } = usePlausible();
  const { signIn, loading, error } = useAuth();
  const appName = "Vibe Manager";
  const [authInProgress, setAuthInProgress] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pollingTimeoutRef = useRef<number | null>(null);

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
    // Track login attempt
    trackEvent('desktop_login_started', {
      provider: providerHint || 'default',
      location: 'login_page'
    });
    
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-card dark:bg-gradient-to-br dark:from-background dark:via-popover dark:to-muted p-4">
      <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm border-border/60 shadow-soft rounded-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            {appName}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {(error || lastError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error || lastError}
              </AlertDescription>
            </Alert>
          )}

          {authInProgress && !loading && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Authentication in progress. Please complete the sign-in in your browser.
                The app will automatically detect when you've finished signing in.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="flex items-center text-sm">
              <div className="flex-1 border-t border-border/60"></div>
              <span className="px-4 text-muted-foreground">
                Sign in with your preferred provider
              </span>
              <div className="flex-1 border-t border-border/60"></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSignIn('google-oauth2')}
                disabled={loading || authInProgress}
                className="text-white bg-[#4285F4] hover:bg-[#4285F4]/90 focus:ring-4 focus:outline-none focus:ring-[#4285F4]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-[#4285F4]/55 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#4285F4] transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('github')}
                disabled={loading || authInProgress}
                className="text-white bg-[#24292F] hover:bg-[#24292F]/90 focus:ring-4 focus:outline-none focus:ring-[#24292F]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-gray-500 dark:hover:bg-[#050708]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#24292F] transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('windowslive')}
                disabled={loading || authInProgress}
                className="text-white bg-[#00A4EF] hover:bg-[#00A4EF]/90 focus:ring-4 focus:outline-none focus:ring-[#00A4EF]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-[#00A4EF]/55 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#00A4EF] transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
                </svg>
                Microsoft
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('apple')}
                disabled={loading || authInProgress}
                className="text-white bg-[#050708] hover:bg-[#050708]/90 focus:ring-4 focus:outline-none focus:ring-[#050708]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-[#050708]/50 dark:hover:bg-[#050708]/30 dark:border dark:border-border/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#050708] transition-all duration-200"
              >
                <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Apple
              </button>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              By continuing, you agree to our{' '}
              <button
                onClick={() => open('https://vibemanager.app/terms')}
                className="underline hover:text-foreground transition-colors"
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                onClick={() => open('https://vibemanager.app/privacy')}
                className="underline hover:text-foreground transition-colors"
              >
                Privacy Policy
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
