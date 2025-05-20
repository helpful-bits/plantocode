import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

import { type User } from "./auth-context-interface";
import { firebaseAuth } from "./firebase-client";
import { getToken, clearToken } from "./token-storage";
import { type AuthDataResponse, type FrontendUser } from "../types";

interface FirebaseAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
}

/**
 * Custom hook to handle Firebase authentication
 * Encapsulates authentication logic including sign-in/out flows, token management,
 * and Stronghold secure storage integration
 */
export function useFirebaseAuthHandler() {
  const [state, setState] = useState<FirebaseAuthState>({
    user: null,
    loading: true,
    error: null,
    token: null,
  });

  // Set up deep link handler
  useEffect(() => {
    // Set up deep link handler for auth callbacks
    const setupAuthCallbackHandler = async () => {
      console.log("[Auth] Setting up deep link handler for auth callbacks");
      
      // Get unlisten function for cleanup
      const unlisten = await firebaseAuth.setupDeepLinkHandler(async (url) => {
        console.log("[Auth] Deep Link Handler: Received URL");
        
        // Check if this is an authentication callback URL (contains protocol matching our app)
        if (url.startsWith("vibe-manager://") && url.includes("id_token=")) {
          console.log("[Auth] Deep Link Handler: URL matches auth callback pattern. Processing...");
          setState((prev) => ({ ...prev, loading: true, error: null }));
          
          try {
            // Process the auth callback to extract the Firebase ID token
            const idToken = await firebaseAuth.processAuthCallback(url);
            console.log("[Auth] Deep Link Handler: ID token processed:", !!idToken);
            
            if (!idToken) {
              console.error("[Auth] Deep Link Handler: No valid ID token extracted from callback URL");
              setState((prev) => ({ 
                ...prev, 
                loading: false, 
                error: "Authentication failed - invalid callback data" 
              }));
              return;
            }
            
            // Exchange the Firebase ID token for our application JWT and user info using Tauri command
            try {
              console.log("[Auth] Deep Link Handler: Exchanging Firebase token for app JWT");
              const authData = await invoke<AuthDataResponse>('exchange_and_store_firebase_token', { 
                firebaseIdToken: idToken 
              });
              
              console.log("[Auth] Deep Link Handler: Token exchange successful");
              
              // Update auth state with the user details and application JWT
              setState({
                user: authData.user,
                token: authData.token,
                loading: false,
                error: null,
              });
              console.log("[Auth] Deep Link Handler: Auth state updated with user info");
            } catch (exchangeError: any) {
              console.error("[Auth] Deep Link Handler: Token exchange failed:", exchangeError);
              
              // Clear any stored token
              try { await clearToken(); } catch (e) { 
                console.error("[Auth] Failed to clear token on error", e); 
              }
              
              setState({
                user: null,
                token: null,
                loading: false,
                error: exchangeError?.message || "Server validation failed - please try again",
              });
            }
          } catch (error: any) {
            console.error("[Auth] Deep Link Handler: Error processing auth callback:", error);
            
            // Clear any stored token
            try { await clearToken(); } catch (e) { 
              console.error("[Auth] Failed to clear token on error", e); 
            }
            
            setState((prev) => ({
              ...prev,
              user: null,
              token: null,
              loading: false,
              error: error?.message || "Authentication failed during callback processing",
            }));
          }
        } else if (url.startsWith("vibe-manager://")) {
          console.log("[Auth] Deep Link Handler: Received non-auth vibe-manager URL");
        } else {
          console.log("[Auth] Deep Link Handler: Received URL with unexpected scheme or format");
        }
      });
      
      // Clean up listener when component unmounts
      return unlisten;
    };
    
    const unlistenPromise = setupAuthCallbackHandler();
    
    return () => {
      // Clean up the deep link handler
      unlistenPromise.then(unlisten => unlisten()).catch(console.error);
    };
  }, []);

  // Check for existing authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log("[Auth] Starting authentication initialization");
        
        // Try to get user info using stored application JWT
        try {
          console.log("[Auth] Checking for existing authenticated session");
          const userInfo = await invoke<FrontendUser>('get_user_info_from_stored_app_jwt');
          
          if (userInfo) {
            console.log("[Auth] Found valid user session:", userInfo);
            
            // Get the token for API calls
            const appToken = await getToken();
            
            setState({
              user: userInfo,
              token: appToken,
              loading: false,
              error: null,
            });
            return;
          }
        } catch (error: any) {
          console.log("[Auth] No active user session or token is invalid:", error?.message);
          // Cleared by the Tauri command if token was invalid
        }

        // No user is signed in
        console.log("[Auth] No active user session found");
        setState({
          user: null,
          token: null,
          loading: false,
          error: null,
        });
      } catch (error: any) {
        console.error("[Auth] Error during auth initialization:", error);
        setState({
          user: null,
          token: null,
          loading: false,
          error: error?.message || "Authentication initialization failed",
        });
      }
    };

    void initAuth();
  }, []);

  // Sign in with provider
  const signIn = useCallback(
    async (
      provider: "google" | "github" | "microsoft" | "apple" = "google"
    ): Promise<void> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        console.log(`[Auth] Starting sign-in with ${provider}`);
        
        // Launch external browser for OAuth
        await firebaseAuth.signIn(provider);
        
        // Set loading to false since we're waiting for the callback
        setState((prev) => ({ ...prev, loading: false }));
        
        console.log(`[Auth] Waiting for ${provider} authentication in external browser`);
      } catch (error) {
        console.error("[Auth] Sign in error:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Authentication failed",
        }));
      }
    },
    []
  );

  // Handle deep link redirect directly
  const handleRedirectResult = useCallback(
    async (url: string): Promise<void> => {
      // This function handles cases where a deep link is manually passed to the app
      // This is less likely in a desktop app but still supported for completeness
      
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        console.log("[Auth] Processing explicit redirect URL");
        
        // Process the auth callback to extract Firebase ID token
        const idToken = await firebaseAuth.processAuthCallback(url);
        
        if (!idToken) {
          console.error("[Auth] No valid ID token in redirect URL");
          setState((prev) => ({ 
            ...prev, 
            loading: false, 
            error: "Authentication failed - invalid redirect data" 
          }));
          return;
        }
        
        // Exchange the Firebase ID token for our application JWT and user info
        try {
          console.log("[Auth] Exchanging Firebase token for app JWT");
          const authData = await invoke<AuthDataResponse>('exchange_and_store_firebase_token', { 
            firebaseIdToken: idToken 
          });
          
          console.log("[Auth] Token exchange successful");
          
          // Update auth state with the user info
          setState({
            user: authData.user,
            token: authData.token,
            loading: false,
            error: null,
          });
        } catch (exchangeError: any) {
          console.error("[Auth] Token exchange failed:", exchangeError);
          await clearToken(); // Clear any invalid token
          setState({
            user: null,
            token: null,
            loading: false,
            error: exchangeError?.message || "Server validation failed - please try again",
          });
        }
      } catch (error: any) {
        console.error("[Auth] Error processing redirect URL:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Authentication failed",
        }));
      }
    },
    []
  );

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      console.log("[Auth] Signing out");
      
      // Clear token first from Tauri backend
      await clearToken();
      
      // Then sign out from Firebase (cleans up Firebase SDK state)
      await firebaseAuth.signOut();
      
      setState({
        user: null,
        token: null,
        loading: false,
        error: null,
      });
      console.log("[Auth] Sign out complete");
    } catch (error: any) {
      console.error("[Auth] Sign out error:", error);
      setState((prev) => ({
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
    handleRedirectResult,
  };
}