import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { type AuthContextType } from "../auth/auth-context-interface";
import { useAuth0AuthHandler } from "../auth/use-auth0-auth-handler";
import { useAuthTokenRefresher } from "../hooks/use-auth-token-refresher";

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
    signIn,
    signOut: auth0SignOut,
    getToken,
  } = useAuth0AuthHandler();
  
  // Use the token refresher hook to keep the JWT fresh
  useAuthTokenRefresher();

  const value: DesktopAuthContextType = {
    user,
    loading,
    error,
    token,
    signIn,
    signOut: auth0SignOut,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): DesktopAuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}