import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { shell } from "@/utils/shell-utils";

import { type User } from "./auth-context-interface";
import { type FrontendUser } from "../types";

interface Auth0AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
}

/**
 * Custom hook to handle Auth0 authentication and token management
 * Token persistence is handled exclusively by the Rust backend
 */
export function useAuth0AuthHandler() {
  const [state, setState] = useState<Auth0AuthState>({
    user: null,
    loading: true,
    error: null,
    token: null
  });

  // Initialize auth when component mounts
  useEffect(() => {
    const initializeAuth = async () => {
      setState((prev: Auth0AuthState) => ({ ...prev, loading: true }));
      
      console.log("[Auth] Initializing Auth0 authentication...");
      
      try {
        // Check if we have a stored token
        console.log("[Auth] Checking for stored token");
        const storedToken = await invoke<string | null>('get_app_jwt');
        
        if (storedToken) {
          try {
            console.log("[Auth] Found stored token, validating...");
            // Validate token by fetching user info
            const userInfo = await invoke<FrontendUser>('get_user_info_with_app_jwt', { 
              appToken: storedToken 
            });
            
            console.log("[Auth] Token validated, user authenticated:", userInfo.id);
            setState((prev: Auth0AuthState) => ({ 
              ...prev, 
              user: userInfo, 
              token: storedToken, 
              loading: false, 
              error: null
            }));
          } catch (error) {
            // Token is invalid, clear it
            console.error("[Auth] Stored token invalid:", error);
            await invoke('set_app_jwt', { token: null });
            
            setState((prev: Auth0AuthState) => ({ 
              ...prev, 
              user: null, 
              token: null, 
              loading: false, 
              error: "Your session has expired. Please log in again."
            }));
          }
        } else {
          // No stored token, ready for login
          console.log("[Auth] No stored token, ready for login");
          setState((prev: Auth0AuthState) => ({ 
            ...prev, 
            user: null, 
            token: null, 
            loading: false, 
            error: null
          }));
        }
      } catch (error) {
        console.error("[Auth] Initialization failed:", error);
        setState((prev: Auth0AuthState) => ({ 
          ...prev, 
          loading: false, 
          error: error instanceof Error ? error.message : "Failed to initialize authentication" 
        }));
      }
    };
    
    // Execute initialization
    initializeAuth();
  }, []);

  // Sign in with Auth0 using the polling flow
  const signIn = useCallback(
    async (providerHint?: string): Promise<void> => {
      setState((prev: Auth0AuthState) => ({ ...prev, loading: true, error: null }));
      
      try {
        console.log("[Auth] Starting Auth0 authentication flow");
        
        // Step 1: Start Auth0 login flow - get auth URL and polling ID
        const [authUrl, pollingId] = await invoke<[string, string]>('start_auth0_login_flow', { providerHint });
        
        console.log(`[Auth] Got auth URL: ${authUrl}`);
        console.log(`[Auth] Got polling ID: ${pollingId}`);
        
        // Step 2: Open browser with the auth URL
        await shell.open(authUrl);
        
        // Step 3: Start polling for authentication result
        setState((prev: Auth0AuthState) => ({ 
          ...prev, 
          loading: true, 
          error: null
        }));
        
        console.log("[Auth] Polling for authentication result...");
        
        // Keep polling until we get a result or hit the timeout
        let pollingAttempts = 0;
        const maxPollingAttempts = 60; // 60 attempts with 2-second interval = 2 minutes max
        const pollingInterval = 2000; // 2 seconds
        
        const pollForToken = async (): Promise<void> => {
          try {
            if (pollingAttempts >= maxPollingAttempts) {
              console.error("[Auth] Polling timeout reached");
              setState((prev: Auth0AuthState) => ({
                ...prev,
                loading: false,
                error: "Authentication timed out. Please try again.",
              }));
              return;
            }
            
            pollingAttempts++;
            
            // Check auth status and exchange token if ready
            const result = await invoke<FrontendUser | null>('check_auth_status_and_exchange_token', {
              pollingId
            });
            
            if (result) {
              // Authentication successful
              console.log("[Auth] Authentication successful for user:", result.email);
              
              // Get the token that was stored by the Tauri command
              const storedToken = await invoke<string | null>('get_app_jwt');
              
              setState((prev: Auth0AuthState) => ({
                ...prev,
                user: result,
                token: storedToken,
                loading: false,
                error: null,
              }));
              
              return;
            }
            
            // Still pending, continue polling
            console.log(`[Auth] Still waiting for authentication... (attempt ${pollingAttempts})`);
            setTimeout(pollForToken, pollingInterval);
            
          } catch (error: any) {
            console.error("[Auth] Polling error:", error);
            setState((prev: Auth0AuthState) => ({
              ...prev,
              loading: false,
              error: error?.message || "Failed to check authentication status",
            }));
          }
        };
        
        // Start the polling
        pollForToken();
      } catch (error: any) {
        console.error("[Auth] Sign-in error:", error);
        setState((prev: Auth0AuthState) => ({
          ...prev,
          loading: false,
          error: error?.message || "Failed to start authentication flow",
        }));
      }
    },
    []
  );

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    setState((prev: Auth0AuthState) => ({ ...prev, loading: true, error: null }));

    try {
      // Call Auth0 logout which clears token and opens logout URL
      await invoke('logout_auth0');
      
      setState({
        user: null,
        token: null,
        loading: false,
        error: null
      });
    } catch (error: any) {
      console.error("[Auth] Sign out error:", error);
      setState((prev: Auth0AuthState) => ({
        ...prev,
        loading: false,
        error: error?.message || "Sign out failed",
      }));
    }
  }, []);

  // Get token from backend
  const getToken = useCallback(async (): Promise<string | null> => {
    return state.token || await invoke<string | null>('get_app_jwt');
  }, [state.token]);

  // Return the auth state and methods
  return {
    ...state,
    signIn,
    signOut,
    getToken
  };
}