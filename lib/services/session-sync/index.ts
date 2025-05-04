/**
 * Session Sync Service - Entry Point
 * 
 * This module provides a centralized service for synchronizing session state
 * between the client and server, with automatic queuing and retrying of operations.
 */

// Export types
export * from './types';

// Export main components
export { queueManager } from './queue-manager';
export { checkServiceHealth, attemptDatabaseRecovery } from './health-checker';

// Re-export the session sync service instance
import { sessionSyncService } from '../session-sync-service';
export { sessionSyncService };
export default sessionSyncService;

// Export individual modules
export * as apiHandler from './api-handler'; 