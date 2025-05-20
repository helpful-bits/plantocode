import { createContext, useContext, type ReactNode } from "react";

import { type AuthContextType } from "../auth/auth-context-interface";
import { useFirebaseAuthHandler } from "../auth/use-firebase-auth-handler";
import { getToken } from "../auth/token-storage";

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
    initializeStrongholdAndResumeSession,
    signIn,
    signOut: firebaseSignOut,
  } = useFirebaseAuthHandler();

  const getAppToken = async (): Promise<string | null> => {
    return await getToken();
  };

  const value: DesktopAuthContextType = {
    user,
    loading,
    error,
    token,
    initializeStrongholdAndResumeSession,
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