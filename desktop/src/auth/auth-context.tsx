/**
 * Authentication Context for Vibe Manager Desktop
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { firebaseAuth } from './firebase-client';
import { invoke } from '@tauri-apps/api/core';

/**
 * User interface
 */
interface User {
  id: string;
  email: string;
  name?: string;
}

/**
 * Authentication context interface
 */
interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  signIn: (providerName?: 'google' | 'github' | 'microsoft' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Authentication Provider component
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize authentication state
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Try to retrieve token from secure storage
        const savedToken = await retrieveTokenFromStorage();
        
        if (savedToken) {
          // Validate token with server
          const userData = await validateToken(savedToken);
          setUser(userData);
          setToken(savedToken);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError('Failed to initialize authentication');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Handle sign in
  const signIn = async (providerName?: 'google' | 'github' | 'microsoft' | 'apple') => {
    try {
      setLoading(true);
      setError(null);
      
      // Start Firebase sign-in flow with the selected provider
      await firebaseAuth.signIn(providerName || 'google');
      
      // The redirect will happen, and we'll handle the result when the app reopens
    } catch (err) {
      console.error('Sign in error:', err);
      setError('Failed to sign in');
      setLoading(false);
    }
  };

  // Handle sign out
  const signOut = async () => {
    try {
      setLoading(true);
      
      // Sign out from Firebase
      await firebaseAuth.signOut();
      
      // Clear token from secure storage
      await invoke('clear_stored_token');
      
      // Reset state
      setUser(null);
      setToken(null);
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  // Get the current token (for API calls)
  const getToken = async (): Promise<string | null> => {
    if (token) {
      return token;
    }
    
    try {
      // Try to retrieve from storage
      const savedToken = await retrieveTokenFromStorage();
      if (savedToken) {
        setToken(savedToken);
        return savedToken;
      }
      return null;
    } catch (err) {
      console.error('Get token error:', err);
      return null;
    }
  };

  // Helper to retrieve token from secure storage
  const retrieveTokenFromStorage = async (): Promise<string | null> => {
    try {
      const token = await invoke<string>('get_stored_token');
      return token || null;
    } catch (err) {
      console.error('Error retrieving token from storage:', err);
      return null;
    }
  };

  // Helper to validate token with server
  const validateToken = async (token: string): Promise<User> => {
    // Get server URL from environment
    const serverUrl = import.meta.env.SERVER_URL || 'http://localhost:8080';
    
    // Call server to validate token
    const response = await fetch(`${serverUrl}/api/auth/validate`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Invalid token');
    }
    
    return await response.json();
  };

  // Handle Firebase redirect result
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        // Check if we have a pending auth result
        const result = await firebaseAuth.handleRedirect();
        
        if (result) {
          setLoading(true);
          
          // Get Firebase ID token
          const firebaseToken = await result.user.getIdToken();
          
          // Get server URL from environment
          const serverUrl = import.meta.env.SERVER_URL || 'http://localhost:8080';
          
          // Exchange Firebase token for server JWT
          const response = await fetch(`${serverUrl}/auth/firebase/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id_token: firebaseToken })
          });
          
          if (!response.ok) {
            throw new Error('Failed to exchange token');
          }
          
          const { access_token } = await response.json();
          
          // Store token securely
          await invoke('store_token', { token: access_token });
          
          // Update state
          setToken(access_token);
          
          // Get user info from token
          const userData = await validateToken(access_token);
          setUser(userData);
        }
      } catch (err) {
        console.error('Auth redirect handling error:', err);
        setError('Authentication failed');
      } finally {
        setLoading(false);
      }
    };

    handleRedirectResult();
  }, []);

  // Context value
  const value = {
    user,
    loading,
    error,
    token,
    signIn,
    signOut,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use authentication context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}