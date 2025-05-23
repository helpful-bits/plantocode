import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '@/contexts/auth-context';

/**
 * Hook to periodically refresh the application JWT token
 * 
 * Auth0 refresh tokens are used to get new access tokens.
 * This hook sets up a timer to refresh the JWT token every 50 minutes.
 */
export function useAuthTokenRefresher() {
  const refreshIntervalRef = useRef<number | null>(null);
  
  // Safely try to get the auth context
  let user: any = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch (e) {
    console.warn("Auth context not available yet, token refresh won't be initialized");
    return; // Early return if auth context is not available
  }

  useEffect(() => {
    // Only start token refresh if user is authenticated
    if (!user) {
      // Clear any existing interval if user is not available
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    const startTokenRefresh = () => {
      // Clear any existing interval
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
      }

      // Set up new interval - 50 minutes (3,000,000 milliseconds)
      refreshIntervalRef.current = window.setInterval(async () => {
        try {
          // Check if we're still logged in
          const currentToken = await invoke<string | null>('get_app_jwt');
          
          if (!currentToken || !user) {
            // Not logged in, clear the interval
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            console.log('[Auth] Not logged in, skipping token refresh');
            return;
          }

          // Try to refresh the app JWT using Auth0 refresh token
          console.log('[Auth] Refreshing app JWT via Auth0');
          
          try {
            await invoke('refresh_app_jwt_auth0');
            console.log('[Auth] Successfully refreshed app JWT via Auth0');
          } catch (error) {
            console.error('[Auth] Auth0 token refresh failed:', error);
            
            // Fall back to validating the existing token
            try {
              await invoke('get_user_info_with_app_jwt', { appToken: currentToken });
              console.log('[Auth] Existing JWT token still valid');
            } catch (validationError) {
              console.error('[Auth] JWT token validation failed:', validationError);
              
              // Clear token on validation failure
              await invoke('set_app_jwt', { token: null });
            }
          }
        } catch (error) {
          console.error('[Auth] Failed to refresh JWT token:', error);
        }
      }, 3000000); // 50 minutes = 3,000,000 milliseconds
    };

    // Start the refresh cycle
    startTokenRefresh();

    // Cleanup on unmount
    return () => {
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [user]); // Dependency on user to restart the refresh cycle if it changes
}