import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '@/contexts/auth-context';

/**
 * Hook to periodically refresh the application JWT token
 * 
 * Firebase ID tokens expire hourly, but our application JWT is typically valid for longer.
 * This hook sets up a timer to refresh the JWT token every 50 minutes, which is less
 * than the typical Firebase token expiry of 60 minutes.
 * 
 * The new implementation uses the main server's Firebase refresh token flow.
 */
export function useAuthTokenRefresher() {
  const refreshIntervalRef = useRef<number | null>(null);
  
  // Safely try to get the auth context
  let firebaseUid: string | null = null;
  try {
    const auth = useAuth();
    firebaseUid = auth.firebaseUid;
  } catch (e) {
    console.warn("Auth context not available yet, token refresh won't be initialized");
    return; // Early return if auth context is not available
  }

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
          
          if (!currentToken || !firebaseUid) {
            // Not logged in or missing Firebase UID, clear the interval
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            console.log('[Auth] Not logged in or missing Firebase UID, skipping token refresh');
            return;
          }

          // Try to refresh the Firebase ID token using the main server's refresh endpoint
          console.log('[Auth] Refreshing Firebase ID token via main server');
          
          try {
            // Get a new Firebase ID token using the server's stored refresh token
            const newFirebaseIdToken = await invoke<string>(
              'trigger_firebase_id_token_refresh_on_main_server'
            );
            
            console.log('[Auth] Successfully refreshed Firebase ID token');
            
            // Exchange the new Firebase ID token for a new app JWT
            await invoke('exchange_main_server_tokens_and_store_app_jwt', {
              firebaseIdToken: newFirebaseIdToken
            });
            
            console.log('[Auth] Successfully refreshed app JWT');
            
            // Auth context will be updated automatically by the exchange command
          } catch (error) {
            console.error('[Auth] Firebase token refresh failed:', error);
            
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
  }, [firebaseUid]); // Dependency on firebaseUid to restart the refresh cycle if it changes
}