import { useEffect, useState, useCallback } from "react";

import { fetchValidatedUser } from "./auth-api-service";
import { type User } from "./auth-context-interface";
import { firebaseAuth } from "./firebase-client";
import {
  storeToken,
  getToken,
  clearToken,
  initStronghold,
} from "./token-storage";

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

  // Initialize Stronghold and check for existing authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Initialize Stronghold secure storage
        await initStronghold();

        // Check for existing token in secure storage
        const storedToken = await getToken();

        if (storedToken) {
          try {
            // Verify token with server and get user data
            const currentUser = firebaseAuth.getCurrentUser();

            if (currentUser) {
              try {
                // Validate token with server
                const validatedUser = await fetchValidatedUser(storedToken);

                setState({
                  user: validatedUser,
                  token: storedToken,
                  loading: false,
                  error: null,
                });
                return;
              } catch (validationError) {
                console.error(
                  "[Auth] Error validating token with server:",
                  validationError
                );
                // Token is invalid according to server, clear it
                await clearToken();
              }
            }
          } catch (error) {
            console.error("[Auth] Error validating stored token:", error);
            // Token might be invalid, clear it
            await clearToken();
          }
        }

        // Try to handle any pending redirect result
        const result = await firebaseAuth.handleRedirect();

        if (result && result.user) {
          // Get ID token and store it
          const idToken = await result.user.getIdToken();
          await storeToken(idToken);

          try {
            // Validate token with server
            const validatedUser = await fetchValidatedUser(idToken);

            setState({
              user: validatedUser,
              token: idToken,
              loading: false,
              error: null,
            });
          } catch (validationError) {
            console.error(
              "[Auth] Error validating token with server after redirect:",
              validationError
            );
            setState({
              user: null,
              token: null,
              loading: false,
              error: "Server validation failed",
            });
          }
        } else {
          // No user is signed in
          setState({
            user: null,
            token: null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error("[Auth] Error during auth initialization:", error);
        setState({
          user: null,
          token: null,
          loading: false,
          error: (error as Error).message,
        });
      }
    };

    void initAuth();
  }, []);

  // Handle URL-based auth redirect, used for deep links
  const handleRedirectResult = useCallback(
    async (url: string): Promise<void> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {

        // Parse the URL to get auth parameters
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        const code = params.get("code");
        const redirectState = params.get("state");

        if (code && redirectState) {
          // Process the OAuth redirect
          const result = await firebaseAuth.processRedirect(code, redirectState);

          if (result && result.user) {
            // Get ID token
            const idToken = await result.user.getIdToken();

            // Store token securely
            await storeToken(idToken);

            try {
              // Validate token with server
              const validatedUser = await fetchValidatedUser(idToken);

              setState({
                user: validatedUser,
                token: idToken,
                loading: false,
                error: null,
              });
            } catch (validationError) {
              console.error(
                "[Auth] Error validating token with server after redirect URL processing:",
                validationError
              );
              setState({
                user: null,
                token: null,
                loading: false,
                error: "Server validation failed",
              });
            }
          } else {
            setState((prev) => ({ ...prev, loading: false }));
          }
        } else {
          console.warn("[Auth] URL does not contain auth parameters");
          setState((prev) => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error("[Auth] Error processing redirect URL:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (error as Error).message,
        }));
      }
    },
    []
  );

  // Sign in with a specific provider
  const signIn = useCallback(
    async (
      provider: "google" | "github" | "microsoft" | "apple" = "google"
    ): Promise<void> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        await firebaseAuth.signIn(provider);
        // Note: Auth result will be handled in the redirect
      } catch (error) {
        console.error("[Auth] Sign in error:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (error as Error).message,
        }));
      }
    },
    []
  );

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      await firebaseAuth.signOut();
      await clearToken();

      setState({
        user: null,
        token: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
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
