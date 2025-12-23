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

const logger = createLogger({ namespace: "LoginPage" });

// Inline SVG icons - guaranteed to work in Tauri production builds
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" className={className}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GitHubIcon = ({ className }: { className?: string }) => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"/>
  </svg>
);

const MicrosoftIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" width="16" height="16" className={className}>
    <path fill="#f35325" d="M1 1h10v10H1z"/>
    <path fill="#81bc06" d="M12 1h10v10H12z"/>
    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
    <path fill="#ffba08" d="M12 12h10v10H12z"/>
  </svg>
);

export default function LoginPage() {
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
                  <GoogleIcon className="w-full h-full" />
                </span>
                Google
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('github')}
                disabled={loading || authInProgress}
                className="text-white bg-[#24292F] hover:bg-[#24292F]/90 focus:ring-4 focus:outline-none focus:ring-[#24292F]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-gray-500 dark:hover:bg-[#050708]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#24292F] transition-all duration-200"
              >
                <GitHubIcon className="w-5 h-5 mr-2 brightness-0 invert" />
                GitHub
              </button>
              
              <button
                type="button"
                onClick={() => handleSignIn('windowslive')}
                disabled={loading || authInProgress}
                className="text-white bg-[#00A4EF] hover:bg-[#00A4EF]/90 focus:ring-4 focus:outline-none focus:ring-[#00A4EF]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center justify-center dark:focus:ring-[#00A4EF]/55 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#00A4EF] transition-all duration-200"
              >
                <span className="w-5 h-5 mr-2 bg-white flex items-center justify-center p-0.5">
                  <MicrosoftIcon className="w-full h-full" />
                </span>
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
