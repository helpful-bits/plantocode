import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@/utils/shell-utils";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/error-handling";

import { type FrontendUser } from "../types";

const logger = createLogger({ namespace: "Auth0Handler" });

/**
 * Decode JWT token and extract expiry timestamp
 * Returns timestamp in milliseconds, or undefined if decoding fails
 */
function decodeJwtExp(token: string): number | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return undefined;
    }

    const payload = parts[1];
    // Base64url decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const decoded = JSON.parse(jsonPayload);

    if (decoded.exp && typeof decoded.exp === 'number') {
      // JWT exp is in seconds, convert to milliseconds
      return decoded.exp * 1000;
    }

    return undefined;
  } catch (error) {
    logger.warn('Failed to decode JWT exp:', error);
    return undefined;
  }
}

interface Auth0AuthState {
  user?: FrontendUser;
  loading: boolean;
  error?: string;
  token?: string;
  tokenExpiresAt?: number;
}

/**
 * Custom hook to handle Auth0 authentication and token management
 * Token persistence is handled exclusively by the Rust backend
 */
export function useAuth0AuthHandler() {
  const [state, setState] = useState<Auth0AuthState>({
    user: undefined,
    loading: true,
    error: undefined,
    token: undefined
  });

  // Track component mount status to prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    // Reset mount status on mount (important for StrictMode)
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize auth when component mounts
  useEffect(() => {
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;
    
    const initializeAuth = async () => {
      if (!isMountedRef.current || abortController.signal.aborted) return;
      
      setState((prev: Auth0AuthState) => ({ ...prev, loading: true }));
      logger.debug("Initializing Auth0 authentication...");
      
      try {
        // Check if we have a stored token
        logger.debug("Checking for stored token");
        if (abortController.signal.aborted) return;
        
        const storedToken = await invoke<string | undefined>('get_app_jwt');
        
        if (abortController.signal.aborted) return;
        
        if (storedToken) {
          try {
            logger.debug("Found stored token, validating...");
            if (abortController.signal.aborted) return;
            
            // Add timeout for token validation to prevent hanging
            const validationTimeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Token validation timeout')), 10000); // 10 second timeout
            });
            
            // Validate token by fetching user info with timeout
            const userInfo = await Promise.race([
              invoke<FrontendUser>('get_user_info_with_app_jwt'),
              validationTimeoutPromise
            ]);
            
            if (abortController.signal.aborted) return;
            
            logger.debug("Token validated, user authenticated:", userInfo.id);
            if (isMountedRef.current && !abortController.signal.aborted) {
              // Decode JWT to get actual expiry, fall back to conservative estimate
              const tokenExpiresAt = decodeJwtExp(storedToken) || (Date.now() + (60 * 60 * 1000));
              setState((prev: Auth0AuthState) => ({
                ...prev,
                user: userInfo,
                token: storedToken,
                tokenExpiresAt,
                loading: false,
                error: undefined
              }));
            }
          } catch (error) {
            if (abortController.signal.aborted) return;
            
            // Token is invalid or validation timed out, clear it
            const isTimeout = error instanceof Error && error.message === 'Token validation timeout';
            logger.error(isTimeout ? "Token validation timed out" : "Stored token invalid:", error);
            let finalError = getErrorMessage(error) || "Failed to validate stored token";
            
            try {
              await invoke('set_app_jwt', { token: undefined });
              logger.debug("Successfully cleared invalid token");
            } catch (clearError) {
              logger.error("Failed to clear invalid token:", clearError);
              // Update error to reflect the secondary failure
              finalError = "Failed to clear invalid token and initialize auth.";
              
              // Force sign-out state since we can't clear the invalid token
              if (isMountedRef.current && !abortController.signal.aborted) {
                setState((prev: Auth0AuthState) => ({ 
                  ...prev, 
                  user: undefined, 
                  token: undefined, 
                  tokenExpiresAt: undefined,
                  loading: false, 
                  error: finalError
                }));
              }
              return; // Exit early to avoid duplicate state update
            }
            
            if (isMountedRef.current && !abortController.signal.aborted) {
              setState((prev: Auth0AuthState) => ({ 
                ...prev, 
                user: undefined, 
                token: undefined, 
                tokenExpiresAt: undefined,
                loading: false, 
                error: finalError
              }));
            }
          }
        } else {
          // No stored token, ready for login
          logger.debug("No stored token, ready for login");
          if (isMountedRef.current && !abortController.signal.aborted) {
            setState((prev: Auth0AuthState) => ({ 
              ...prev, 
              user: undefined, 
              token: undefined, 
              tokenExpiresAt: undefined,
              loading: false, 
              error: undefined
            }));
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        
        logger.error("Initialization failed:", error);
        if (isMountedRef.current && !abortController.signal.aborted) {
          setState((prev: Auth0AuthState) => ({ 
            ...prev, 
            loading: false, 
            error: getErrorMessage(error) || "Failed to initialize authentication" 
          }));
        }
      }
    };
    
    // Set up timeout protection
    timeoutId = setTimeout(() => {
      if (isMountedRef.current && !abortController.signal.aborted) {
        logger.error("Auth initialization timeout - setting loading to false");
        setState((prev: Auth0AuthState) => ({ 
          ...prev, 
          loading: false, 
          error: "Authentication initialization timed out. Please try refreshing the app."
        }));
      }
      abortController.abort();
    }, 30000); // 30 second timeout (increased for reliability)
    
    // Start initialization
    initializeAuth().finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    });
    
    // Cleanup function
    return () => {
      abortController.abort();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Sign in with Auth0 using the polling flow
  const signIn = useCallback(
    async (providerHint?: string): Promise<void> => {
      if (!isMountedRef.current) return;
      setState((prev: Auth0AuthState) => ({ ...prev, loading: true, error: undefined }));
      
      try {
        logger.debug("Starting Auth0 authentication flow");
        
        // Step 1: Start Auth0 login flow - get auth URL and polling ID
        const [authUrl, pollingId] = await invoke<[string, string]>('start_auth0_login_flow', { providerHint });
        
        logger.debug(`Got auth URL: ${authUrl}`);
        logger.debug(`Got polling ID: ${pollingId}`);
        
        // Step 2: Open browser with the auth URL
        await open(authUrl);
        
        // Step 3: Start polling for authentication result
        if (!isMountedRef.current) return;
        setState((prev: Auth0AuthState) => ({ 
          ...prev, 
          loading: true, 
          error: undefined
        }));
        
        logger.debug("Polling for authentication result...");
        
        // Keep polling until we get a result or hit the timeout
        let pollingAttempts = 0;
        const maxPollingAttempts = 60; // 60 attempts with 2-second interval = 2 minutes max
        const pollingInterval = 2000; // 2 seconds
        const startTime = Date.now();
        const maxPollingDuration = 150000; // 2.5 minutes in milliseconds (buffer beyond attempts)
        let pollingTimeoutId: NodeJS.Timeout | null = null;
        
        const pollForToken = async (): Promise<void> => {
          try {
            if (!isMountedRef.current) {
              if (pollingTimeoutId) {
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = null;
              }
              return;
            }
            
            // Check both attempt count and elapsed time for robust timeout handling
            const elapsedTime = Date.now() - startTime;
            if (pollingAttempts >= maxPollingAttempts || elapsedTime >= maxPollingDuration) {
              if (pollingTimeoutId) {
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = null;
              }
              logger.error(`Auth0 polling timeout reached after ${pollingAttempts} attempts (${Math.round(elapsedTime/1000)}s elapsed)`);
              if (isMountedRef.current) {
                setState((prev: Auth0AuthState) => ({
                  ...prev,
                  loading: false,
                  error: "Authentication timed out. Please close the browser tab and try again.",
                }));
              }
              return;
            }
            
            pollingAttempts++;
            
            // Check auth status and exchange token if ready
            const result = await invoke<FrontendUser | undefined>('check_auth_status_and_exchange_token', {
              pollingId
            });
            
            if (result) {
              // Authentication successful
              if (pollingTimeoutId) {
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = null;
              }
              logger.debug("Authentication successful for user:", result.email);
              
              // Get the token that was stored by the Tauri command
              const storedToken = await invoke<string | undefined>('get_app_jwt');
              
              if (isMountedRef.current) {
                // For new authentication, assume default 1 hour expiry (typical for JWT tokens)
                // This will be used by the token refresher to schedule refresh attempts
                const tokenExpiresAt = Date.now() + (60 * 60 * 1000); // 1 hour from now
                setState((prev: Auth0AuthState) => ({
                  ...prev,
                  user: result,
                  token: storedToken,
                  tokenExpiresAt,
                  loading: false,
                  error: undefined,
                }));
              }
              
              return;
            }
            
            // Still pending, continue polling with exponential backoff for later attempts
            const backoffMultiplier = pollingAttempts > 30 ? 1.5 : 1; // Slow down after 30 attempts
            const nextInterval = Math.min(pollingInterval * backoffMultiplier, 5000); // Cap at 5 seconds
            
            logger.debug(`Still waiting for authentication... (attempt ${pollingAttempts}/${maxPollingAttempts})`);
            pollingTimeoutId = setTimeout(() => {
              if (!isMountedRef.current || state.error) {
                if (pollingTimeoutId) {
                  clearTimeout(pollingTimeoutId);
                  pollingTimeoutId = null;
                }
                return;
              }
              pollForToken();
            }, nextInterval);
            
          } catch (error: any) {
            logger.error("Polling error:", error);
            // Ensure timeout is cleared to prevent further polling attempts
            if (pollingTimeoutId) {
              clearTimeout(pollingTimeoutId);
              pollingTimeoutId = null;
            }
            if (isMountedRef.current) {
              setState((prev: Auth0AuthState) => ({
                ...prev,
                loading: false,
                error: getErrorMessage(error) || "Failed to check authentication status",
              }));
            }
            return;
          }
        };
        
        // Start the polling
        pollForToken();
      } catch (error: any) {
        logger.error("Sign-in error:", error);
        if (isMountedRef.current) {
          setState((prev: Auth0AuthState) => ({
            ...prev,
            loading: false,
            error: getErrorMessage(error) || "Failed to start authentication flow",
          }));
        }
      }
    },
    []
  );

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return;
    setState((prev: Auth0AuthState) => ({ ...prev, loading: true, error: undefined }));

    try {
      // Call Auth0 logout which clears token and opens logout URL
      await invoke('logout_auth0');
      
      if (isMountedRef.current) {
        setState({
          user: undefined,
          token: undefined,
          tokenExpiresAt: undefined,
          loading: false,
          error: undefined
        });
      }
    } catch (error: any) {
      logger.error("Sign out error:", error);
      if (isMountedRef.current) {
        setState((prev: Auth0AuthState) => ({
          ...prev,
          loading: false,
          error: getErrorMessage(error) || "Sign out failed",
        }));
      }
    }
  }, []);

  // Get token from backend
  const getToken = useCallback(async (): Promise<string | undefined> => {
    return state.token || await invoke<string | undefined>('get_app_jwt');
  }, [state.token]);

  // Return the auth state and methods
  return {
    ...state,
    signIn,
    signOut,
    getToken
  };
}