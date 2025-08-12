'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  full_name?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function WebAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    isAuthenticated: false
  });

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include', // Include httpOnly cookies
      });

      if (response.ok) {
        const user = await response.json();
        setState(prev => ({
          ...prev,
          user,
          isAuthenticated: true,
          loading: false,
          error: null
        }));
      } else {
        setState(prev => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          loading: false,
          error: null
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Auth check failed'
      }));
    }
  };

  const signIn = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Get Auth0 authorization URL from your server
      const response = await fetch('/api/auth/login-url', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to get login URL');
      }
      
      const { authUrl, pollId } = await response.json();
      
      // Open Auth0 in popup window
      const popup = window.open(
        authUrl,
        'auth0-login',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for authentication.');
      }
      
      // Poll for authentication completion
      const pollForAuth = async () => {
        try {
          const pollResponse = await fetch(`/api/auth/poll/${pollId}`, {
            method: 'GET',
            credentials: 'include'
          });
          
          if (pollResponse.ok) {
            const result = await pollResponse.json();
            if (result.status === 'completed') {
              popup.close();
              await checkAuthStatus(); // Refresh auth state
              return;
            } else if (result.status === 'failed') {
              popup.close();
              throw new Error(result.error || 'Authentication failed');
            }
          }
          
          // Continue polling if still pending
          if (!popup.closed) {
            setTimeout(pollForAuth, 2000);
          } else {
            // User closed popup
            setState(prev => ({
              ...prev,
              loading: false,
              error: 'Authentication cancelled'
            }));
          }
        } catch (error) {
          popup.close();
          setState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Authentication failed'
          }));
        }
      };
      
      // Start polling
      setTimeout(pollForAuth, 2000);
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Sign in failed'
      }));
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      setState({
        user: null,
        isAuthenticated: false,
        loading: false,
        error: null
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Sign out failed'
      }));
    }
  };

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signOut,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useWebAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useWebAuth must be used within a WebAuthProvider');
  }
  return context;
}