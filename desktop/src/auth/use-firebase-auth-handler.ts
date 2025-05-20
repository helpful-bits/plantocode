import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { type User } from "./auth-context-interface";
import { firebaseAuth } from "./firebase-client";
import { getToken, storeToken, clearToken } from "./token-storage";
import { type AuthDataResponse, type FrontendUser } from "../types";
import { strongholdService } from "./stronghold-service";

interface FirebaseAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
}

/**
 * Custom hook to handle Firebase authentication and token management
 * This handler orchestrates Stronghold initialization, token storage, and Firebase auth
 */
export function useFirebaseAuthHandler() {
  const [state, setState] = useState<FirebaseAuthState>({
    user: null,
    loading: true,
    error: null,
    token: null
  });

  /**
   * Initializes Stronghold service and attempts to resume an existing session
   * Uses a ref to track initialization to prevent duplicate initializations
   */
  const initializingRef = useRef(false);
  const initializeStrongholdAndResumeSession = useCallback(async () => {
    // Prevent multiple parallel initializations
    if (initializingRef.current) {
      console.log("[Auth] Initialization already in progress, skipping duplicate call");
      return;
    }
    
    initializingRef.current = true;
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      if (!strongholdService.isInitialized()) { 
        console.log("[Auth] Initializing Stronghold service");
        await strongholdService.initialize();
        console.log("[Auth] Stronghold service initialized successfully");
      } else {
        console.log("[Auth] Stronghold service already initialized");
      }
      
      console.log("[Auth] Attempting to resume session");
      await tryResumeExistingSession();
    } catch (error: any) {
      console.error("[Auth] Stronghold initialization failed:", error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || "Failed to initialize secure storage." 
      }));
    } finally {
      initializingRef.current = false;
    }
  }, []);

  /**
   * Attempts to resume an existing session using the token from Stronghold
   * This is called during initialization to restore sessions
   */
  const tryResumeExistingSession = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    // Check if Stronghold is initialized - this should always be true at this point
    if (!strongholdService.isInitialized()) {
      console.warn("[Auth] Attempted to resume session but Stronghold is not initialized");
      setState(prev => ({ ...prev, loading: false }));
      return;
    }
    
    // Don't try to resume if we already have a user
    if (state.user) {
      console.log("[Auth] User already exists, no need to resume session");
      setState(prev => ({ ...prev, loading: false }));
      return;
    }
    
    try {
      console.log("[Auth] Checking for existing token in Stronghold");
      const retrievedToken = await getToken();
      
      if (retrievedToken) {
        console.log("[Auth] Found token in Stronghold, syncing with Rust backend");
        try {
          await invoke('set_in_memory_token', { token: retrievedToken });
          
          console.log("[Auth] Validating token and fetching user info");
          const userInfo = await invoke<FrontendUser>('get_user_info_with_app_jwt', { 
            appToken: retrievedToken 
          });
          
          console.log("[Auth] Valid user session found:", userInfo);
          setState(prev => ({ 
            ...prev, 
            user: userInfo, 
            token: retrievedToken, 
            loading: false, 
            error: null
          }));
        } catch (validateError: any) {
          // Token is invalid or server validation failed
          console.error("[Auth] Token validation failed:", validateError);
          
          // Clear the invalid token
          await clearToken();
          await invoke('clear_in_memory_token').catch(e => 
            console.error("[Auth] Failed to clear in-memory token:", e)
          );
          
          setState(prev => ({ 
            ...prev, 
            user: null, 
            token: null, 
            loading: false, 
            error: "Your session has expired. Please log in again."
          }));
        }
      } else {
        // No token found, proceed to login
        console.log("[Auth] No token found in Stronghold");
        setState(prev => ({ 
          ...prev, 
          user: null, 
          token: null, 
          loading: false, 
          error: null
        }));
      }
    } catch (error: any) { 
      // Error fetching token from Stronghold
      console.error("[Auth] Error checking for stored token:", error);
      setState(prev => ({ 
        ...prev, 
        user: null, 
        token: null, 
        loading: false, 
        error: "Failed to check login status. Please try again."
      }));
    }
  }, [state.user]);

  // Initial initialization on component mount
  useEffect(() => {
    // Use the same initialization function to avoid duplication
    if (!initializingRef.current && !strongholdService.isInitialized()) {
      console.log("[Auth] Initial initialization via useEffect");
      initializeStrongholdAndResumeSession().catch(error => {
        console.error("[Auth] Initial initialization failed:", error);
      });
    } else {
      console.log("[Auth] Skipping initial initialization in useEffect - already initialized or in progress");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref for deep link handler setup
  const deepLinkHandlerSetupRef = useRef(false);
  
  // Set up deep link handler for OAuth callbacks
  useEffect(() => {
    const setupAuthCallbackHandler = async () => {
      // Prevent multiple setup attempts
      if (deepLinkHandlerSetupRef.current) {
        console.log("[Auth] Deep link handler already being set up, skipping");
        return () => {};
      }
      
      deepLinkHandlerSetupRef.current = true;
      console.log("[Auth] Setting up deep link handler for auth callbacks");
      
      const unlisten = await firebaseAuth.setupDeepLinkHandler(async () => {
        console.log("[Auth] Deep Link Handler: Received OAuth callback URL");
        
        // Make sure Stronghold is initialized before processing OAuth callback
        if (!strongholdService.isInitialized()) {
          console.log("[Auth] Deep Link Handler: Stronghold not initialized. Initializing now.");
          try {
            await strongholdService.initialize();
          } catch (error) {
            console.error("[Auth] Deep Link Handler: Failed to initialize Stronghold:", error);
            setState(prev => ({ 
              ...prev, 
              loading: false, 
              error: "Failed to initialize secure storage. Please try again." 
            }));
            return;
          }
        }
        
        setState(prev => ({ ...prev, loading: true, error: null }));
        
        let retryAttempts = 3;
        
        while (retryAttempts >= 0) {
          try {
            if (retryAttempts < 3) {
              // Add delay between retries
              const delayMs = 500 * (3 - retryAttempts);
              console.log(`[Auth] Deep Link Handler: Retry attempt ${3 - retryAttempts} with ${delayMs}ms delay`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            console.log("[Auth] Deep Link Handler: Processing Firebase redirect result");
            const credential = await firebaseAuth.handleRedirect();
            
            if (credential?.user) {
              console.log("[Auth] Deep Link Handler: Received Firebase credential");
              
              try {
                // Get Firebase ID token
                const firebaseIdToken = await credential.user.getIdToken();
                console.log("[Auth] Deep Link Handler: Got Firebase ID token");
                
                // Exchange Firebase token for app JWT
                const authData = await invoke<AuthDataResponse>('exchange_and_store_firebase_token', { 
                  firebaseIdToken 
                });
                console.log("[Auth] Deep Link Handler: Exchanged Firebase token for app JWT");
                
                // Store token in Stronghold
                await storeToken(authData.token);
                console.log("[Auth] Deep Link Handler: Stored app JWT in Stronghold");
                
                // Update auth state
                setState(prev => ({ 
                  ...prev, 
                  user: authData.user, 
                  token: authData.token, 
                  loading: false, 
                  error: null
                }));
                console.log("[Auth] Deep Link Handler: Authentication complete");
                
                // Successfully processed, break out of retry loop
                break;
              } catch (exchangeError: any) {
                console.error("[Auth] Deep Link Handler: Token exchange failed:", exchangeError);
                
                // Clean up on error
                try { 
                  await clearToken(); 
                  await invoke('clear_in_memory_token');
                } catch (e) { 
                  console.error("[Auth] Failed to clear token on error", e); 
                }
                
                // Set error state
                setState(prev => ({
                  ...prev,
                  user: null,
                  token: null,
                  loading: false,
                  error: exchangeError?.message || "Server validation failed - please try again",
                }));
                
                // Token exchange error is fatal, break out of retry
                break;
              }
            } else {
              // No credential found
              if (retryAttempts > 0) {
                // Try again if we have retries left
                retryAttempts--;
                console.log(`[Auth] Deep Link Handler: No credential found, ${retryAttempts} retries left`);
                continue;
              } else {
                // No more retries
                console.log("[Auth] Deep Link Handler: No pending redirect after all retries");
                setState(prev => ({ ...prev, loading: false }));
                break;
              }
            }
          } catch (error: any) {
            console.error("[Auth] Deep Link Handler: Error processing Firebase redirect:", error);
            
            // Some errors are expected and shouldn't be retried
            if (error.code === 'auth/no-auth-event') {
              console.log("[Auth] Deep Link Handler: No auth event was in progress (normal)");
              setState(prev => ({ ...prev, loading: false }));
              break;
            }
            
            // For other errors, retry if we have attempts left
            if (retryAttempts > 0) {
              retryAttempts--;
              console.log(`[Auth] Deep Link Handler: Error, will retry. ${retryAttempts} retries left`);
              continue;
            } else {
              // No more retries, set error state
              setState(prev => ({
                ...prev,
                loading: false,
                error: "Firebase sign-in failed after multiple attempts. Please try again.",
              }));
              break;
            }
          }
        }
      });
      
      // Return cleanup function
      return () => {
        unlisten();
        deepLinkHandlerSetupRef.current = false;
        console.log("[Auth] Deep link handler cleaned up");
      };
    };
    
    // Track the unlisten function
    let cleanup: (() => void) | undefined;
    
    // Start the async setup process
    setupAuthCallbackHandler()
      .then(unlistenFn => {
        cleanup = unlistenFn;
      })
      .catch(error => {
        console.error("[Auth] Failed to set up deep link handler:", error);
        deepLinkHandlerSetupRef.current = false;
      });
    
    return () => {
      // Clean up the deep link handler if it was set up
      if (cleanup) {
        cleanup();
      } else {
        // If cleanup isn't available yet, make sure we reset the ref
        deepLinkHandlerSetupRef.current = false;
      }
    };
  }, []);

  // Sign in with provider
  const signIn = useCallback(
    async (
      provider: "google" | "github" | "microsoft" | "apple" = "google"
    ): Promise<void> => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        // Initialize Stronghold if needed using our shared initialization method
        if (!strongholdService.isInitialized()) {
          console.log("[Auth] Stronghold not initialized, initializing before sign-in");
          try {
            // Use the central initialization function for consistency
            await initializeStrongholdAndResumeSession();
          } catch (error) {
            // initializeStrongholdAndResumeSession already sets error state on failure
            console.error("[Auth] Failed to initialize Stronghold before sign-in:", error);
            return;
          }
        }
        
        console.log(`[Auth] Starting sign-in with ${provider}`);
        
        // Initialize Firebase with retries
        try {
          // Force Firebase initialization before sign-in
          const auth = await firebaseAuth.getAuth();
          console.log("[Auth] Firebase auth obtained:", !!auth);
          
          // Attempt to sign in
          await firebaseAuth.signIn(provider);
          
          // Set loading to false since we're waiting for the callback
          setState(prev => ({ ...prev, loading: false }));
          console.log(`[Auth] Waiting for ${provider} authentication in external browser`);
        } catch (firebaseError: any) {
          console.error("[Auth] Firebase initialization or sign-in error:", firebaseError);
          setState(prev => ({
            ...prev,
            loading: false,
            error: firebaseError.message || "Failed to initialize authentication provider",
          }));
        }
      } catch (error: any) {
        console.error("[Auth] Unexpected error during sign-in process:", error);
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message || "Authentication failed with an unexpected error",
        }));
      }
    },
    [initializeStrongholdAndResumeSession] // Add the dependency
  );

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log("[Auth] Signing out");
      
      // Sign out from Firebase first (cleans up Firebase SDK state)
      await firebaseAuth.signOut();
      console.log("[Auth] Signed out from Firebase");
      
      // Clear token from Stronghold
      if (strongholdService.isInitialized()) {
        await clearToken();
        console.log("[Auth] Cleared token from Stronghold");
        
        // Clear Stronghold state
        await strongholdService.clearStrongholdStateAndLogout();
        console.log("[Auth] Cleared Stronghold state");
      }
      
      // Clear token from Rust's in-memory cache
      await invoke('clear_in_memory_token');
      console.log("[Auth] Cleared token from Rust's in-memory cache");
      
      setState({
        user: null,
        token: null,
        loading: false,
        error: null
      });
      console.log("[Auth] Sign out complete");
    } catch (error: any) {
      console.error("[Auth] Sign out error:", error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || "Sign out failed",
      }));
    }
  }, []);

  // Return the auth state and methods
  return {
    ...state,
    signIn,
    signOut,
    initializeStrongholdAndResumeSession
  };
}