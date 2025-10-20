/**
 * Login Page Component for PlanToCode Desktop
 */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../contexts/auth-context";
import { createLogger } from "@/utils/logger";
import { open } from "@/utils/shell-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { usePlausible } from "@/hooks/use-plausible";

const logger = createLogger({ namespace: "LoginPage" });

export default function LoginPage() {
  const { trackEvent } = usePlausible();
  const { signIn, loading, error } = useAuth();
  const appName = "PlanToCode";
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
                <span className="w-5 h-5 mr-2 bg-white rounded-full flex items-center justify-center p-0.5">
                  <img src="/src/assets/icons/google-icon.svg" alt="" className="w-full h-full" />
                </span>
                Google
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('github')}
                disabled={loading || authInProgress}
                className="text-white bg-[#24292F] hover:bg-[#24292F]/90 focus:ring-4 focus:outline-none focus:ring-[#24292F]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-gray-500 dark:hover:bg-[#050708]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#24292F] transition-all duration-200"
              >
                <img src="/src/assets/icons/github-icon.svg" alt="" className="w-5 h-5 mr-2 brightness-0 invert" />
                GitHub
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('windowslive')}
                disabled={loading || authInProgress}
                className="text-white bg-[#00A4EF] hover:bg-[#00A4EF]/90 focus:ring-4 focus:outline-none focus:ring-[#00A4EF]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-[#00A4EF]/55 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#00A4EF] transition-all duration-200"
              >
                <img src="/src/assets/icons/microsoft-icon.svg" alt="" className="w-4 h-4 mr-2" />
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
                onClick={() => open('https://plantocode.com/terms')}
                className="underline hover:text-foreground transition-colors"
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                onClick={() => open('https://plantocode.com/privacy')}
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
