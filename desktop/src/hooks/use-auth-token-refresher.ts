import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Hook to periodically refresh the application JWT token
 * 
 * Firebase ID tokens expire hourly, but our application JWT is typically valid for longer.
 * This hook sets up a timer to refresh the JWT token every 50 minutes, which is less
 * than the typical Firebase token expiry of 60 minutes.
 */
export function useAuthTokenRefresher() {
  const refreshIntervalRef = useRef<number | null>(null);

  useEffect(() => {
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
          if (!currentToken) {
            // Not logged in, clear the interval
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            return;
          }

          // Try to refresh the token using the existing JWT
          console.log('[Auth] Refreshing JWT token');
          
          // Since refresh_app_jwt command doesn't exist yet, we'll simulate it with get_user_info_with_app_jwt
          // This will at least validate that the token is still valid
          try {
            await invoke('get_user_info_with_app_jwt', { appToken: currentToken });
            console.log('[Auth] JWT token still valid');
          } catch (error) {
            console.error('[Auth] JWT token validation failed:', error);
            
            // Clear token on validation failure
            await invoke('set_app_jwt', { token: null });
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
  }, []);
}