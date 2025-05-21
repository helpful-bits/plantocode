import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

import { type AuthContextType } from "../auth/auth-context-interface";
import { useFirebaseAuthHandler } from "../auth/use-firebase-auth-handler";
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
    signOut: firebaseSignOut,
  } = useFirebaseAuthHandler();
  
  // Use the token refresher hook to keep the JWT fresh
  useAuthTokenRefresher();

  const getAppToken = async (): Promise<string | null> => {
    return await invoke<string | null>('get_app_jwt');
  };

  const value: DesktopAuthContextType = {
    user,
    loading,
    error,
    token,
    signIn,
    signOut: firebaseSignOut,
    getToken: getAppToken,
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