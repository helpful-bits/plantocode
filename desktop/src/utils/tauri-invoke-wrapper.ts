/**
 * Centralized Tauri invoke wrapper with automatic error logging and auth handling
 * This intercepts ALL Tauri command calls and logs errors automatically
 */

import { invoke as tauriInvoke, type InvokeArgs } from '@tauri-apps/api/core';
import { logError } from './error-handling';
import { triggerGlobalAuthErrorHandler } from '@/utils/auth-error-handler';


/**
 * Wrapped invoke function that automatically logs all errors and handles auth failures
 * This is the CENTRAL point for all Tauri command error logging and auth error handling
 */
interface InvokeOptions {
  suppressErrorLog?: boolean;
}

export async function invoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions
): Promise<T> {
  const { suppressErrorLog = false } = options ?? {};
  const startTime = performance.now();
  
  try {
    const result = await tauriInvoke<T>(command, args);
    
    // Log slow commands for performance monitoring (> 1 second)
    const duration = performance.now() - startTime;
    if (duration > 1000) {
      console.warn(`Slow Tauri command: ${command} took ${duration.toFixed(0)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    // Check if this is an authentication error
    const errorStr = String(error);
    const isAuthError = errorStr.includes('AuthError') || 
                       errorStr.includes('Authentication failed') ||
                       errorStr.includes('Token expired') ||
                       errorStr.includes('Unauthorized');
    
    // If it's an auth error, trigger the global handler
    if (isAuthError) {
      triggerGlobalAuthErrorHandler();
    }
    
    // Centralized error logging for ALL Tauri command failures
    if (!suppressErrorLog) {
      await logError(error, `Tauri Command Failed: ${command}`, {
        command,
        args,
        duration: `${duration.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
        isAuthError,
      }).catch(() => {
        // Prevent recursive failure if logging itself fails
        console.error(`Failed to log error for command: ${command}`, error);
      });
    }
    
    // Re-throw to maintain existing error handling behavior
    throw error;
  }
}

/**
 * Export all the specialized invoke functions that use the wrapped version
 */
export { invoke as wrappedInvoke };
