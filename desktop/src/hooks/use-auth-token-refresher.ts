import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type User } from '@/auth/auth-context-interface';
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
export function useAuthTokenRefresher(user: User | undefined) {
  const { token, tokenExpiresAt } = useAuth();
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
      
      if (tokenExpiresAt && tokenExpiresAt > Date.now()) {
        // Token has a known expiry time and it's in the future
        const now = Date.now();
        const expiresInMs = tokenExpiresAt - now;
        const refreshBufferMs = 5 * 60 * 1000; // 5 minutes buffer
        
        // Refresh at least 5 minutes before expiry, but at least 1 minute from now
        refreshIntervalMs = Math.max(60 * 1000, expiresInMs - refreshBufferMs);
        
        logger.info(`[AuthTokenRefresher] Token expires in ${Math.round(expiresInMs / 1000 / 60)} minutes, scheduling refresh in ${Math.round(refreshIntervalMs / 1000 / 60)} minutes`);
      } else {
        // No expiry info or token is already expired, use fallback
        refreshIntervalMs = 50 * 60 * 1000; // 50 minutes fallback
        
        if (tokenExpiresAt && tokenExpiresAt <= Date.now()) {
          logger.warn('[AuthTokenRefresher] Token appears to be expired, using fallback refresh interval');
        } else {
          logger.info('[AuthTokenRefresher] No token expiry info available, using fallback 50-minute refresh interval');
        }
      }

      // Set up new interval with calculated timing
      refreshIntervalRef.current = window.setInterval(async () => {
        try {
          const currentToken = await invoke<string | null>('get_app_jwt');

          if (!user) {
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            logger.info('[AuthTokenRefresher] User is not available during scheduled refresh, stopping refresh interval.');
            return;
          }

          if (!currentToken) {
            logger.info('[AuthTokenRefresher] No token found during scheduled refresh, stopping refresh interval.');
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
            return;
          }

          logger.info('[AuthTokenRefresher] Attempting to refresh app JWT.');
          try {
            await invoke('refresh_app_jwt_auth0');
            logger.info('[AuthTokenRefresher] Successfully refreshed app JWT.');
          } catch (refreshError) {
            await logError(refreshError as Error, '[AuthTokenRefresher] App JWT refresh failed');
            
            try {
              await invoke('get_user_info_with_app_jwt', { appToken: currentToken });
              logger.info('[AuthTokenRefresher] Existing JWT token still valid after refresh attempt failed.');
            } catch (validationError) {
              await logError(validationError as Error, '[AuthTokenRefresher] Existing JWT token validation failed after refresh error');
              
              try {
                await invoke('set_app_jwt', { token: null });
                logger.info('[AuthTokenRefresher] Cleared invalid JWT token.');
                if (refreshIntervalRef.current) {
                  window.clearInterval(refreshIntervalRef.current);
                  refreshIntervalRef.current = null;
                }
              } catch (clearTokenError) {
                await logError(clearTokenError as Error, '[AuthTokenRefresher] Failed to clear invalid JWT token');
              }
            }
          }
        } catch (intervalError) {
          await logError(intervalError as Error, '[AuthTokenRefresher] Error in refresh interval');
        }
      }, refreshIntervalMs);
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