/**
 * Authentication Context for Vibe Manager Desktop
 *
 * Implements the shared AuthContextType interface
 */

import { createContext, useContext, type ReactNode } from "react";

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
    signIn: firebaseSignIn,
    signOut: firebaseSignOut,
    handleRedirectResult: firebaseHandleRedirect,
  } = useFirebaseAuthHandler();

  // Get the current token for API calls - updated to return Promise to match interface
  const getToken = (): Promise<string | null> => {
    return Promise.resolve(token);
  };

  // Wrap the signIn method with a more flexible parameter type to match interface
  const signIn = async (providerName?: string): Promise<void> => {
    // Default to Google if no provider specified
    let provider: "google" | "github" | "microsoft" | "apple" = "google";
    
    if (providerName && ["google", "github", "microsoft", "apple"].includes(providerName)) {
      provider = providerName as "google" | "github" | "microsoft" | "apple";
    }
    
    await firebaseSignIn(provider);
  };

  // Wrap the handleRedirectResult method
  const handleRedirectResult = async (url?: string): Promise<void> => {
    if (url) {
      await firebaseHandleRedirect(url);
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
