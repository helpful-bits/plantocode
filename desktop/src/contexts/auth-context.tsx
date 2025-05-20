/**
 * Authentication Context for Vibe Manager Desktop
 *
 * Implements the shared AuthContextType interface
 */

import { createContext, useContext, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

import { type AuthContextType } from "../auth/auth-context-interface";
import { useFirebaseAuthHandler } from "../auth/use-firebase-auth-handler";

// Extended interface that includes platform-specific methods
export interface DesktopAuthContextType extends AuthContextType {
  handleRedirectResult: (url?: string) => Promise<void>;
}

// Create context
const AuthContext = createContext<DesktopAuthContextType | undefined>(
  undefined
);

/**
 * Authentication Provider component
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Use the Firebase auth handler hook which now directly provides the validated application user
  const {
    user,
    loading,
    error,
    token,
    signIn,
    signOut: firebaseSignOut,
    handleRedirectResult: firebaseHandleRedirect,
  } = useFirebaseAuthHandler();

  // Get the current token for API calls - from Tauri backend
  const getToken = (): Promise<string | null> => {
    return invoke("get_stored_token");
  };

  // Wrap the handleRedirectResult method
  const handleRedirectResult = async (url?: string): Promise<void> => {
    // When we receive a deep link URL, we process it as an authentication redirect
    if (url) {
      console.log("[AuthContext] Received deep link to process:", url);
      await firebaseHandleRedirect(url);
    } else {
      console.warn("[AuthContext] handleRedirectResult called without URL");
    }
  };

  // Context value
  const value: DesktopAuthContextType = {
    user,
    loading,
    error,
    token,
    signIn,
    signOut: firebaseSignOut,
    getToken,
    handleRedirectResult,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use authentication context
 */
export function useAuth(): DesktopAuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}