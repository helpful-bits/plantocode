import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { shell } from "@/utils/shell-utils";

import { type User } from "./auth-context-interface";
import { type AuthDataResponse, type FrontendUser } from "../types";

interface FirebaseAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  firebaseUid: string | null;
}

/**
 * Custom hook to handle Firebase authentication and token management
 * Token persistence is handled exclusively by the Rust backend
 */
export function useFirebaseAuthHandler() {
  const [state, setState] = useState<FirebaseAuthState>({
    user: null,
    loading: true,
    error: null,
    token: null,
    firebaseUid: null
  });

  /**
   * Process a Firebase user by exchanging the ID token with the server
   * The JWT is stored directly in the Rust backend's TokenManager via OS keyring
   */
  const processFirebaseUser = useCallback(async (firebaseIdToken: string, firebaseUid: string): Promise<boolean> => {
    try {
      console.log("[Auth] Processing Firebase token with UID:", firebaseUid);
      
      // Exchange Firebase token for app JWT and store it in Rust backend
      const authData = await invoke<AuthDataResponse>('exchange_main_server_tokens_and_store_app_jwt', { 
        firebaseIdToken 
      });
      console.log("[Auth] Exchanged Firebase token for app JWT");
      
      // Update UI state
      setState((prev: FirebaseAuthState) => ({ 
        ...prev, 
        user: authData.user, 
        token: authData.token, 
        firebaseUid: authData.firebase_uid || firebaseUid,
        loading: false, 
        error: null
      }));
      
      return true;
    } catch (error: any) {
      console.error("[Auth] Error processing Firebase user:", error);
      
      setState((prev: FirebaseAuthState) => ({
        ...prev,
        user: null,
        token: null,
        firebaseUid: null,
        loading: false,
        error: error?.message || "Authentication failed - please try again",
      }));
      return false;
    }
  }, []);

  // Initialize auth when component mounts
  useEffect(() => {
    const initializeAuth = async () => {
      setState((prev: FirebaseAuthState) => ({ ...prev, loading: true }));
      
      console.log("[Auth] Initializing authentication...");
      
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
            setState((prev: FirebaseAuthState) => ({ 
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
            
            setState((prev: FirebaseAuthState) => ({ 
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
          setState((prev: FirebaseAuthState) => ({ 
            ...prev, 
            user: null, 
            token: null, 
            loading: false, 
            error: null
          }));
        }
      } catch (error) {
        console.error("[Auth] Initialization failed:", error);
        setState((prev: FirebaseAuthState) => ({ 
          ...prev, 
          loading: false, 
          error: error instanceof Error ? error.message : "Failed to initialize authentication" 
        }));
      }
    };
    
    // Execute initialization
    initializeAuth();
  }, []);

  // Sign in with provider using the web-based flow
  const signIn = useCallback(
    async (provider: "google" | "github" | "microsoft" | "apple" = "google"): Promise<void> => {
      setState((prev: FirebaseAuthState) => ({ ...prev, loading: true, error: null }));
      
      try {
        console.log(`[Auth] Starting web-based authentication flow with provider: ${provider}`);
        
        // Step 1: Initiate OAuth flow on main server - get auth URL and polling ID
        const [authUrl, pollingId] = await invoke<[string, string]>('initiate_oauth_flow_on_main_server', { 
          provider 
        });
        
        console.log(`[Auth] Got auth URL: ${authUrl}`);
        console.log(`[Auth] Got polling ID: ${pollingId}`);
        
        // Step 2: Open browser with the auth URL
        await shell.open(authUrl);
        
        // Step 3: Start polling the server for the Firebase token
        // Show a loading state to the user
        setState((prev: FirebaseAuthState) => ({ 
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
              setState((prev: FirebaseAuthState) => ({
                ...prev,
                loading: false,
                error: "Authentication timed out. Please try again.",
              }));
              return;
            }
            
            pollingAttempts++;
            
            // Construct the polling URL using the server URL from the environment
            const response = await fetch(`${import.meta.env.VITE_MAIN_SERVER_BASE_URL || 'http://localhost:8080'}/api/auth/get-token?pid=${pollingId}`);
            
            // If we get a 204 No Content, keep polling
            if (response.status === 204) {
              console.log(`[Auth] Still waiting for authentication... (attempt ${pollingAttempts})`);
              setTimeout(pollForToken, pollingInterval);
              return;
            }
            
            // If we get a 200 OK, we have the token
            if (response.status === 200) {
              const data = await response.json();
              console.log("[Auth] Got Firebase token from server");
              
              // Exchange the Firebase token for an app JWT and store it
              await processFirebaseUser(data.firebase_id_token, data.firebase_uid);
              
              return;
            }
            
            // Any other status is an error
            const errorText = await response.text();
            console.error(`[Auth] Polling error: ${response.status} - ${errorText}`);
            setState((prev: FirebaseAuthState) => ({
              ...prev,
              loading: false,
              error: `Authentication error: ${errorText}`,
            }));
          } catch (error: any) {
            console.error("[Auth] Polling error:", error);
            setState((prev: FirebaseAuthState) => ({
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
        setState((prev: FirebaseAuthState) => ({
          ...prev,
          loading: false,
          error: error?.message || "Failed to start authentication flow",
        }));
      }
    },
    [processFirebaseUser]
  );

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    setState((prev: FirebaseAuthState) => ({ ...prev, loading: true, error: null }));

    try {
      // Clear token from backend
      await invoke('clear_stored_app_jwt');
      
      setState({
        user: null,
        token: null,
        firebaseUid: null,
        loading: false,
        error: null
      });
    } catch (error: any) {
      console.error("[Auth] Sign out error:", error);
      setState((prev: FirebaseAuthState) => ({
        ...prev,
        loading: false,
        error: error?.message || "Sign out failed",
      }));
    }
  }, []);

  // Return the auth state and methods
  return {
    ...state,
    signIn,
    signOut,
    getToken: async () => state.token || await invoke<string | null>('get_app_jwt'),
    firebaseUid: state.firebaseUid
  };
}