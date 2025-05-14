import { ActionState } from '@core/types';

/**
 * Helper function to handle errors in server actions
 */
export function handleActionError(error: unknown, actionName: string): ActionState<any> {
  console.error(`[${actionName}] Error:`, error);
  
  return {
    isSuccess: false,
    message: `Action failed: ${error instanceof Error ? error.message : String(error)}`,
    error: error instanceof Error ? error : new Error(String(error))
  };
} 