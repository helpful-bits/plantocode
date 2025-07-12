import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type FrontendUser } from '@/types';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/utils/logger';
import { logError } from '@/utils/error-handling';

const logger = createLogger({ namespace: "AuthTokenRefresher" });

/**
 * Hook to periodically refresh the application JWT token
 * 
 * Auth0 refresh tokens are used to get new access tokens.
 * This hook calculates the optimal refresh interval based on the token's expiry time,
 * refreshing 5 minutes before expiry. Falls back to 50-minute intervals if expiry is unknown.
 */
export function useAuthTokenRefresher(user: FrontendUser | undefined) {
  const { token, tokenExpiresAt, setTokenExpired } = useAuth();
  const refreshIntervalRef = useRef<number | null>(null);

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

      // Calculate refresh interval based on token expiry
      let refreshIntervalMs: number;
      let initialRefreshDelayMs: number;
      
      if (tokenExpiresAt && tokenExpiresAt > Date.now()) {
        // Token has a known expiry time and it's in the future
        const now = Date.now();
        const expiresInMs = tokenExpiresAt - now;
        const refreshBufferMs = 5 * 60 * 1000; // 5 minutes buffer
        
        // Refresh at least 5 minutes before expiry, but at least 1 minute from now
        refreshIntervalMs = Math.max(60 * 1000, expiresInMs - refreshBufferMs);
        initialRefreshDelayMs = refreshIntervalMs;
        
        logger.debug(`[AuthTokenRefresher] Token expires in ${Math.round(expiresInMs / 1000 / 60)} minutes, scheduling refresh in ${Math.round(refreshIntervalMs / 1000 / 60)} minutes`);
      } else {
        // No expiry info or token is already expired, use fallback
        refreshIntervalMs = 50 * 60 * 1000; // 50 minutes fallback
        
        if (tokenExpiresAt && tokenExpiresAt <= Date.now()) {
          logger.warn('[AuthTokenRefresher] Token is already expired. Attempting immediate refresh.');
          initialRefreshDelayMs = 0; // Attempt refresh immediately
        } else {
          logger.debug('[AuthTokenRefresher] No token expiry info available, using fallback 50-minute refresh interval');
          initialRefreshDelayMs = refreshIntervalMs;
        }
      }

      // Create the refresh function to avoid code duplication
      const performRefresh = async () => {
        try {
          const currentToken = await invoke<string | null>('get_app_jwt');

          if (!user) {
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            logger.debug('[AuthTokenRefresher] User is not available during scheduled refresh, stopping refresh interval.');
            return;
          }

          if (!currentToken) {
            logger.debug('[AuthTokenRefresher] No token found during scheduled refresh, stopping refresh interval.');
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            return;
          }

          logger.debug('[AuthTokenRefresher] Attempting to refresh app JWT.');
          try {
            await invoke('refresh_app_jwt_auth0');
            logger.debug('[AuthTokenRefresher] Successfully refreshed app JWT.');
          } catch (refreshError) {
            await logError(refreshError as Error, '[AuthTokenRefresher] App JWT refresh failed');
            
            try {
              await invoke('get_user_info_with_app_jwt', { app_token: currentToken });
              logger.debug('[AuthTokenRefresher] Existing JWT token still valid after refresh attempt failed.');
            } catch (validationError) {
              await logError(validationError as Error, '[AuthTokenRefresher] Existing JWT token validation failed after refresh error');
              
              try {
                await invoke('set_app_jwt', { token: null });
                logger.warn('[AuthTokenRefresher] Cleared invalid JWT token, initiating sign out.');
                
                // Clear the refresh interval since token is invalid
                if (refreshIntervalRef.current) {
                  window.clearInterval(refreshIntervalRef.current);
                  refreshIntervalRef.current = null;
                }
                
                // Mark token as expired to trigger re-authentication
                setTokenExpired(true);
              } catch (clearTokenError) {
                await logError(clearTokenError as Error, '[AuthTokenRefresher] Failed to clear invalid JWT token');
              }
            }
          }
        } catch (intervalError) {
          await logError(intervalError as Error, '[AuthTokenRefresher] Error in refresh interval');
        }
      };

      // Handle immediate refresh for expired tokens
      if (initialRefreshDelayMs === 0) {
        // Perform immediate refresh, then set up the regular interval
        void performRefresh();
      }

      // Set up new interval with calculated timing
      refreshIntervalRef.current = window.setInterval(performRefresh, refreshIntervalMs);
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
  }, [user?.id, token, tokenExpiresAt]); // Dependency on user ID and token expiry to restart the refresh cycle if they change
}