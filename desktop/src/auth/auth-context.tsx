/**
 * Authentication Context for Vibe Manager Desktop
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { firebaseAuth } from './firebase-client';
import { initStronghold, storeToken, getToken as getStoredToken, clearToken } from './token-storage';

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
  handleRedirectResult: (url?: string) => Promise<void>;
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
        // Initialize Stronghold vault
        await initStronghold();
        
        // Set up deep link handler for OAuth redirects
        const unlistenDeepLink = await firebaseAuth.setupDeepLinkHandler((url) => {
          console.log('Auth context received deep link:', url);
          handleRedirectResult(url);
        });
        
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
      
      // Clear token from Stronghold secure storage
      try {
        await clearToken();
      } catch (err) {
        console.error('Error clearing token from secure storage:', err);
      }
      
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
      // Use Stronghold to get the token
      const token = await getStoredToken();
      return token;
    } catch (err) {
      console.error('Error retrieving token from secure storage:', err);
      return null;
    }
  };

  // Helper to validate token with server
  const validateToken = async (token: string): Promise<User> => {
    // Get server URL from environment
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
    
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
          const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
          
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
          
          // Store token securely using Stronghold
          try {
            await storeToken(access_token);
          } catch (err) {
            console.error('Error storing token in secure storage:', err);
          }
          
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

  // Handle redirect result explicitly (useful for deep links)
  const handleRedirectResult = async (url?: string) => {
    try {
      setLoading(true);
      
      // If URL is provided, parse it for auth parameters
      if (url) {
        // Extract code and state from URL
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        const state = urlObj.searchParams.get('state');
        
        if (code && state) {
          // Process OAuth redirect
          const result = await firebaseAuth.processRedirect(code, state);
          
          if (result && result.user) {
            // Get Firebase ID token
            const firebaseToken = await result.user.getIdToken();
            
            // Get server URL from environment
            const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
            
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
            
            // Store token securely using Stronghold
            await storeToken(access_token);
            
            // Update state
            setToken(access_token);
            
            // Get user info from token
            const userData = await validateToken(access_token);
            setUser(userData);
          }
        }
      } else {
        // No URL provided, check for pending auth result
        const result = await firebaseAuth.handleRedirect();
        
        if (result) {
          // Process as regular redirect
          // Get Firebase ID token
          const firebaseToken = await result.user.getIdToken();
          
          // Get server URL from environment
          const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
          
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
          
          // Store token securely using Stronghold
          await storeToken(access_token);
          
          // Update state
          setToken(access_token);
          
          // Get user info from token
          const userData = await validateToken(access_token);
          setUser(userData);
        }
      }
    } catch (err) {
      console.error('Auth redirect handling error:', err);
      setError('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Context value
  const value = {
    user,
    loading,
    error,
    token,
    signIn,
    signOut,
    getToken,
    handleRedirectResult, // Expose this method for deep link handling
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