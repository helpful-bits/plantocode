import { createContext, useContext, useMemo, useState, useEffect } from "react";
import type { ReactNode } from "react";

import { type AuthContextType } from "../auth/auth-context-interface";
import { useAuth0AuthHandler } from "../auth/use-auth0-auth-handler";
import { logError } from "@/utils/error-handling";

// No more need for separate handleRedirectResult in the context
export type DesktopAuthContextType = AuthContextType;

const AuthContext = createContext<DesktopAuthContextType | undefined>(
  undefined
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    user,
    loading,
    error,
    token,
    tokenExpiresAt,
    signIn,
    signOut: auth0SignOut,
    getToken,
  } = useAuth0AuthHandler();

  const [isTokenExpired, setTokenExpired] = useState(false);

  // Reset token expired state when user successfully logs in
  useEffect(() => {
    if (user && token) {
      setTokenExpired(false);
    }
  }, [user, token]);

  const value: DesktopAuthContextType = useMemo(() => ({
    user,
    loading,
    error,
    token,
    tokenExpiresAt,
    isTokenExpired,
    setTokenExpired,
    signIn,
    signOut: auth0SignOut,
    getToken,
  }), [user, loading, error, token, tokenExpiresAt, isTokenExpired, signIn, auth0SignOut, getToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): DesktopAuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    const error = new Error("useAuth must be used within an AuthProvider");
    logError(error, "Auth Context - Hook Used Outside Provider").catch(() => {
      // Swallow logging errors to prevent recursive failures
    });
    throw error;
  }
  return context;
}