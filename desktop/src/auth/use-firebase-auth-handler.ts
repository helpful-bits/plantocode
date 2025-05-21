import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type User as FirebaseUser } from "firebase/auth";

import { type User } from "./auth-context-interface";
import { firebaseAuth } from "./firebase-client";
import { type AuthDataResponse, type FrontendUser } from "../types";

interface FirebaseAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
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
    token: null
  });

  /**
   * Process a Firebase user by exchanging the ID token with the server
   * The JWT is stored directly in the Rust backend's TokenManager via OS keyring
   */
  const processFirebaseUser = useCallback(async (firebaseUser: FirebaseUser): Promise<boolean> => {
    try {
      console.log("[Auth] Processing Firebase user:", firebaseUser.uid);
      
      // Get Firebase ID token
      const firebaseIdToken = await firebaseUser.getIdToken(true);
      
      // Exchange Firebase token for app JWT and store it in Rust backend
      const authData = await invoke<AuthDataResponse>('exchange_and_store_firebase_token', { 
        firebaseIdToken 
      });
      console.log("[Auth] Exchanged Firebase token for app JWT");
      
      // Update UI state
      setState((prev: FirebaseAuthState) => ({ 
        ...prev, 
        user: authData.user, 
        token: authData.token, 
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
      
      try {
        // Initialize Firebase
        await firebaseAuth.init();
        
        // Wait for authentication state to resolve
        const firebaseUser = await firebaseAuth.awaitAuth();
        
        if (firebaseUser) {
          // User is authenticated via Firebase
          await processFirebaseUser(firebaseUser);
        } else {
          // No Firebase user, check if we have a stored token
          const storedToken = await invoke<string | null>('get_app_jwt');
          
          if (storedToken) {
            try {
              // Validate token by fetching user info
              const userInfo = await invoke<FrontendUser>('get_user_info_with_app_jwt', { 
                appToken: storedToken 
              });
              
              setState((prev: FirebaseAuthState) => ({ 
                ...prev, 
                user: userInfo, 
                token: storedToken, 
                loading: false, 
                error: null
              }));
            } catch (error) {
              // Token is invalid, clear it
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
            setState((prev: FirebaseAuthState) => ({ 
              ...prev, 
              user: null, 
              token: null, 
              loading: false, 
              error: null
            }));
          }
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
  }, [processFirebaseUser]);

  // Sign in with provider
  const signIn = useCallback(
    async (provider: "google" | "github" | "microsoft" | "apple" = "google"): Promise<void> => {
      setState((prev: FirebaseAuthState) => ({ ...prev, loading: true, error: null }));
      
      try {
        await firebaseAuth.signIn(provider);
        // Loading state will be handled by the redirect flow
      } catch (error: any) {
        console.error("[Auth] Sign-in error:", error);
        setState((prev: FirebaseAuthState) => ({
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
    setState((prev: FirebaseAuthState) => ({ ...prev, loading: true, error: null }));

    try {
      // Sign out from Firebase
      await firebaseAuth.signOut();
      
      // Clear token from backend
      await invoke('clear_stored_app_jwt');
      
      setState({
        user: null,
        token: null,
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
    getToken: async () => state.token || await invoke<string | null>('get_app_jwt')
  };
}