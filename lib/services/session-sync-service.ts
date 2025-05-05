/**
 * Session Synchronization Service
 * 
 * Provides a centralized mechanism to coordinate session operations
 * and prevent race conditions between multiple components accessing
 * the same session state.
 */

import { Session } from '@/types';
import { SessionRepository } from '@/lib/db/repositories';
import { queueManager } from './session-sync/queue-manager';
import * as healthChecker from './session-sync/health-checker';

// Import helper modules
import * as apiHandler from './session-sync/api-handler';
import {
  OperationState,
  SessionCallback,
  QueuedOperation,
  SessionOperationError,
  OperationTimeoutError,
  SessionOperation,
  OperationStateInfo
} from './session-sync/types';

// IMPORTANT: `createSessionRepository` pulls in `better-sqlite3`, which is a
// native Node.js module and cannot be bundled for the browser.  If we import
// it unconditionally at the top level the module graph of any **client**
// component that references `session-sync-service` will include
// `better-sqlite3` and the build will crash at runtime (`The "original"
// argument must be of type Function`).

// To avoid that we *lazy-load* the repository factory the first time we really
// need it *and* only when we are on the server (i.e. `window` is not defined).
// This stops the client bundle from containing any of the database related
// code while preserving the existing synchronous looking API.

// Create a lazy-loaded session repository
let _sessionRepository: SessionRepository | null = null;

/**
 * Operation lock acquisition error
 */
export class OperationLockError extends Error {
  constructor(operation: string, sessionId: string | null) {
    super(`Could not acquire lock for ${operation} on session ${sessionId || 'new'}: already in progress`);
    this.name = "OperationLockError";
  }
}

/**
 * Get the session repository singleton instance
 */
async function getSessionRepository() {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    console.log('[SessionSyncService] Browser environment detected, skipping database access');
    // Return null or a mock implementation for browser environments
    return null;
  }
  
  if (_sessionRepository) {
    return _sessionRepository;
  }
  
  try {
    // Dynamically import the session repository to avoid dependency cycles
    const { sessionRepository } = await import('@/lib/db/repositories');
    _sessionRepository = sessionRepository;
    return sessionRepository;
  } catch (error) {
    console.error("Error loading session repository:", error);
    throw error;
  }
}

/**
 * Session synchronization service 
 */
export class SessionSyncService {
  private static instance: SessionSyncService;
  
  // Map of active session operations
  private activeOperations: Map<string, OperationStateInfo> = new Map();
  
  // Map of timestamps for last completed operations
  private lastCompletedOperations: Map<string, number> = new Map();
  
  // Map of cooldown periods for specific operations
  private cooldowns: Map<string, { operation: 'load' | 'save' | 'delete', until: number }> = new Map();
  
  // Cache for active session settings to prevent duplicate calls
  private lastProjectActiveSession: Map<string, { timestamp: number, value: string | null }> = new Map();
  
  // Count of consecutive errors for health monitoring
  private consecutiveErrors = 0;
  
  // Timestamp of last health check
  private lastHealthCheckTime = 0;
  
  // Sessions that are currently in the process of being switched to
  // This helps prioritize load operations during session switching
  private switchingSessions: Map<string, { timestamp: number, previousSessionId: string | null }> = new Map();
  
  /**
   * Constructor
   */
  constructor() {
    // Initialize the service
    (queueManager as any).setServiceOptions({
      operationDequeueCallback: this.processOperation.bind(this),
      maxConcurrentOperations: 3,
      processingIntervalMs: 100,
      operationLockTimeoutMs: 5000
    });
    
    // Initialize health check interval
    if (typeof window !== 'undefined') {
      setInterval(() => this.healthCheck(), 60000); // Every 60 seconds
    }
    
    // Initialize debug interface
    this.setupDebugInterface();
  }
  
  /**
   * Get the singleton instance of the service
   */
  public static getInstance(): SessionSyncService {
    if (!SessionSyncService.instance) {
      SessionSyncService.instance = new SessionSyncService();
    }
    return SessionSyncService.instance;
  }
  
  /**
   * Process a dequeued operation
   */
  private async processOperation(operation: SessionOperation): Promise<any> {
    const { type, sessionId, callback, id: operationId, signal } = operation;
    const sessionKey = sessionId || 'new';
    
    // Log the beginning of the operation
    const startTime = Date.now();
    const startDateTime = new Date(startTime).toISOString();
    console.log(`[SessionSyncService][${startDateTime}] 🔄 OPERATION STARTED: ${type} operation ${operationId} for session ${sessionKey}`);
    
    try {
      // Check if the operation is already aborted
      if (signal?.aborted) {
        console.log(`[SessionSyncService] Operation ${operationId} for session ${sessionKey} was already aborted, skipping`);
        throw new Error('Operation aborted');
      }
      
      // Get the current state for this session
      const prevState = this.activeOperations.get(sessionKey)?.state || 'idle';
      
      // IMPROVED OPERATION HANDLING: If there's already an operation in progress for this session,
      // we need to handle the case more intelligently based on operation types
      if (prevState !== 'idle') {
        console.warn(`[SessionSyncService] ⚠️ Operation state transition from non-idle state: ${prevState} → ${type} for session ${sessionKey}`);
        
        // Get details of the previous operation
        const previousOp = this.activeOperations.get(sessionKey);
        const previousOpType = previousOp?.lastOperationType;
        const runningTime = previousOp?.lastStartTime ? (Date.now() - previousOp.lastStartTime) : 0;
        
        console.warn(`[SessionSyncService] ⚠️ Details of previous operation:`, {
          lastOperationId: previousOp?.lastOperationId,
          lastOperationType: previousOpType || 'unknown',
          lastStartTime: previousOp?.lastStartTime ? 
            new Date(previousOp?.lastStartTime).toISOString() : 'unknown',
          running: `${Math.round(runningTime / 1000)}s (${runningTime}ms)`
        });
        
        // If the previous operation is of the same type as the current one, we can
        // coalesce them - especially for save operations
        if (previousOpType === type) {
          // For 'save' operations, we can often coalesce them (combine the latest state)
          if (type === 'save') {
            console.log(`[SessionSyncService] Multiple consecutive save operations detected for session ${sessionKey}`);
            console.log(`[SessionSyncService] Will continue with current save and ensure the latest state is persisted`);
            
            // We'll proceed with the operation - the callback should include the most recent state
            // This effectively coalesces multiple fast save operations into one
          } 
          // For 'load' operations, it doesn't make sense to have multiple concurrent loads
          // for the same session, but we'll proceed anyway with a warning
          else if (type === 'load') {
            console.warn(`[SessionSyncService] Multiple concurrent load operations detected for session ${sessionKey} - this may indicate a logic issue in the calling code`);
          }
        } 
        // If previous operation is load and current is save, or vice versa, warn about this pattern
        else if ((previousOpType === 'load' && type === 'save') || 
                (previousOpType === 'save' && type === 'load')) {
          console.warn(`[SessionSyncService] ⚠️ Conflicting operation types for session ${sessionKey}: ${previousOpType} → ${type}`);
          console.warn(`[SessionSyncService] This pattern may lead to data inconsistency or race conditions`);
          
          // For 'load' operation following a 'save', we might want to wait briefly for the save to complete
          if (previousOpType === 'save' && type === 'load' && runningTime < 5000) {
            console.log(`[SessionSyncService] Save operation in progress for less than 5s, proceeding with load which will get latest state`);
          }
        }
      }
      
      // Session switching detection - Check for potential session switching scenarios
      if (type === 'load') {
        // Get active operations for all sessions
        const activeSessionsStates = Array.from(this.activeOperations.entries());
        const pendingQueueStats = queueManager.getQueueStats();
        
        // Check if there are any other sessions with save operations in progress
        const otherSessionsSaving = activeSessionsStates.filter(([key, info]) => 
          key !== sessionKey && info.state === 'saving'
        );
        
        if (otherSessionsSaving.length > 0) {
          console.log(`[SessionSyncService] 🔄 Session switching detected: Loading session ${sessionKey} while ${otherSessionsSaving.length} other sessions are saving:`);
          
          // Log details of the other sessions being saved
          otherSessionsSaving.forEach(([otherKey, info]) => {
            const saveDuration = info.lastStartTime ? (Date.now() - info.lastStartTime) : 0;
            console.log(`[SessionSyncService]   - Session ${otherKey} being saved for ${saveDuration}ms (ID: ${info.lastOperationId})`);
          });
          
          // Check if there are any saves for this session in the queue (potential issue)
          const savesForThisSession = pendingQueueStats.pendingOperations.filter(
            op => op.type === 'save' && (op.sessionId || 'new') === sessionKey
          );
          
          if (savesForThisSession.length > 0) {
            console.warn(`[SessionSyncService] ⚠️ Potential issue: Loading session ${sessionKey} while ${savesForThisSession.length} saves for the same session are pending in queue`);
            
            // IMPROVED HANDLING: Analyze if we should proceed or try to rearrange queue order
            if (savesForThisSession.length === 1 && prevState === 'idle') {
              // If there's just one save and the session is idle, it might be better to process 
              // that save first to prevent potential data loss
              console.log(`[SessionSyncService] Proceeding with load, but this may overwrite pending saves`);
            } else if (savesForThisSession.length > 1) {
              console.warn(`[SessionSyncService] Multiple save operations waiting while attempting to load - potential queue ordering issue`);
              // Note: We're proceeding with the load, but in a more advanced implementation 
              // we might want to:
              // 1. Prioritize the most recent save
              // 2. Cancel older saves
              // 3. Then proceed with the load after the save completes
            }
          }
        }
        
        // Queue analysis: Check for saves of different sessions in the queue
        const pendingSavesForOtherSessions = pendingQueueStats.pendingOperations.filter(
          op => op.type === 'save' && (op.sessionId || 'new') !== sessionKey
        );
        
        if (pendingSavesForOtherSessions.length > 0) {
          // Group by session
          const sessionSaveGroups = new Map<string, number>();
          pendingSavesForOtherSessions.forEach(op => {
            const key = op.sessionId || 'new';
            sessionSaveGroups.set(key, (sessionSaveGroups.get(key) || 0) + 1);
          });
          
          console.log(`[SessionSyncService] 🔄 Session switching queue status: Loading session ${sessionKey} with ${pendingSavesForOtherSessions.length} saves pending for other sessions:`);
          
          // Log each session's pending saves
          sessionSaveGroups.forEach((count, otherSessionKey) => {
            console.log(`[SessionSyncService]   - Session ${otherSessionKey}: ${count} save operations pending`);
          });
        }
      }
      // For save operations, check for similar pattern
      else if (type === 'save') {
        // Get pending operations
        const pendingQueueStats = queueManager.getQueueStats();
        
        // Check for conflicting operations types for the same session
        const loadsForThisSession = pendingQueueStats.pendingOperations.filter(
          op => op.type === 'load' && (op.sessionId || 'new') === sessionKey
        );
        
        if (loadsForThisSession.length > 0) {
          console.warn(`[SessionSyncService] ⚠️ Saving session ${sessionKey} while ${loadsForThisSession.length} load operations for the same session are pending`);
          
          // IMPROVED HANDLING: Make an intelligent decision about how to proceed
          if (loadsForThisSession.length === 1 && prevState === 'idle') {
            // If there's just one load and the session is idle, we should proceed with the save
            // to ensure the latest state is saved before loading
            console.log(`[SessionSyncService] Proceeding with save before load to ensure latest state is persisted`);
          } else if (loadsForThisSession.length > 1) {
            console.warn(`[SessionSyncService] Multiple load operations waiting while attempting to save - this may indicate a logic issue`);
          }
        }
        
        // Check for multiple save operations for this session
        const savesForThisSession = pendingQueueStats.pendingOperations.filter(
          op => op.type === 'save' && op.id !== operationId && (op.sessionId || 'new') === sessionKey
        );
        
        if (savesForThisSession.length > 0) {
          console.log(`[SessionSyncService] Found ${savesForThisSession.length} additional save operations queued for session ${sessionKey}`);
          
          // Log some details about these saves to identify potential patterns
          const oldestSave = [...savesForThisSession].sort((a, b) => a.addedAt - b.addedAt)[0];
          const newestSave = [...savesForThisSession].sort((a, b) => b.addedAt - a.addedAt)[0];
          
          if (oldestSave && newestSave) {
            const oldestAge = Date.now() - oldestSave.addedAt;
            const newestAge = Date.now() - newestSave.addedAt;
            
            console.log(`[SessionSyncService] Oldest pending save: ${Math.round(oldestAge/1000)}s old, newest: ${Math.round(newestAge/1000)}s old`);
            
            // If we have saves that are very close in time, it might indicate a UI component
            // triggering too many updates
            if (newestAge < 1000 && savesForThisSession.length > 2) {
              console.warn(`[SessionSyncService] High frequency of save operations detected for session ${sessionKey} - possible UI component issue`);
            }
          }
        }
      }
      
      // Update operation state with complete information
      this.activeOperations.set(sessionKey, {
        state: type === 'load' ? 'loading' : type === 'save' ? 'saving' : 'deleting',
        lastOperationId: operationId,
        lastStartTime: startTime,
        lastOperationType: type,
        lastComplete: this.activeOperations.get(sessionKey)?.lastComplete || 0,
        lastOperationDuration: this.activeOperations.get(sessionKey)?.lastOperationDuration || 0,
        lastError: this.activeOperations.get(sessionKey)?.lastError
      });
      
      // Log transition
      console.log(`[SessionSyncService][${startDateTime}] State transition for session ${sessionKey}: ${prevState} → ${this.activeOperations.get(sessionKey)?.state}`);
      
      // Add an abort signal listener if signal is provided
      let abortListener: (() => void) | undefined;
      if (signal) {
        abortListener = () => {
          const abortTime = new Date().toISOString();
          console.log(`[SessionSyncService][${abortTime}] ⚠️ Operation ${operationId} for session ${sessionKey} was aborted during execution after ${Date.now() - startTime}ms`);
        };
        signal.addEventListener('abort', abortListener);
      }
      
      // Execute the callback with timing
      console.time(`[SessionSyncService] Operation ${operationId} callback execution time`);
      const callbackStartTime = Date.now();
      
      // Check again before executing the callback
      if (signal?.aborted) {
        console.log(`[SessionSyncService] Operation ${operationId} for session ${sessionKey} was aborted before callback execution`);
        throw new Error('Operation aborted');
      }
      
      const result = await callback();
      const callbackDuration = Date.now() - callbackStartTime;
      console.timeEnd(`[SessionSyncService] Operation ${operationId} callback execution time`);
      
      // Remove abort listener if it was added
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
      
      // Calculate operation duration
      const endTime = Date.now();
      const duration = endTime - startTime;
      const endDateTime = new Date(endTime).toISOString();
      
      // Update last complete timestamp
      this.lastCompletedOperations.set(sessionKey, endTime);
      
      // Reset state to idle - ensure we preserve relevant data but clear the operation state
      const currentState = this.activeOperations.get(sessionKey)?.state;
      this.activeOperations.set(sessionKey, {
        state: 'idle',
        lastComplete: endTime,
        lastOperationDuration: duration,
        lastOperationId: operationId,
        lastOperationType: type,
        lastStartTime: undefined,
        lastError: undefined
      });
      
      console.log(`[SessionSyncService][${endDateTime}] 🔄 OPERATION COMPLETED: ${type} operation ${operationId} for session ${sessionKey}`);
      console.log(`[SessionSyncService][${endDateTime}] Operation duration: ${duration}ms (started: ${startDateTime}, completed: ${endDateTime})`);
      
      // Log callback time as percentage of total operation time
      const callbackPercentage = duration > 0 ? Math.round((callbackDuration / duration) * 100) : 0;
      console.log(`[SessionSyncService][${endDateTime}] Callback execution took ${callbackDuration}ms (${callbackPercentage}% of total operation time)`);
      
      // Check for remaining operations for this session
      const pendingOperations = queueManager.getQueueStats().pendingOperations;
      const sessionOperationCount = pendingOperations.filter(op => (op.sessionId || 'new') === sessionKey).length;
      
      // Log information about operation types
      if (sessionOperationCount > 0) {
        const opTypes = {
          load: pendingOperations.filter(op => op.type === 'load' && (op.sessionId || 'new') === sessionKey).length,
          save: pendingOperations.filter(op => op.type === 'save' && (op.sessionId || 'new') === sessionKey).length,
          delete: pendingOperations.filter(op => op.type === 'delete' && (op.sessionId || 'new') === sessionKey).length
        };
        
        console.log(`[SessionSyncService][${endDateTime}] After operation ${operationId}, session ${sessionKey} still has ${sessionOperationCount} pending operations (load=${opTypes.load}, save=${opTypes.save}, delete=${opTypes.delete})`);
        
        // IMPROVED OPERATIONS ORDERING: Try to optimize queue processing for this session
        // if we have multiple operations of the same type, or mixed operation types
        if ((opTypes.load > 0 && opTypes.save > 0) || 
            opTypes.load > 1 || 
            opTypes.save > 1) {
          console.log(`[SessionSyncService] Requesting queue refresh with priority adjustment to optimize pending operations for session ${sessionKey}`);
          queueManager.requestQueueRefresh(true); // Request with priority adjustment
        }
      } else {
        console.log(`[SessionSyncService][${endDateTime}] Session ${sessionKey} has no more pending operations after operation ${operationId}`);
      }
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - (this.activeOperations.get(sessionKey)?.lastStartTime || startTime);
      const currentState = this.activeOperations.get(sessionKey)?.state;
      const endDateTime = new Date(endTime).toISOString();
      
      console.error(`[SessionSyncService][${endDateTime}] ========================================`);
      console.error(`[SessionSyncService][${endDateTime}] ❌ ERROR: ${type} operation ${operationId} for session ${sessionKey} failed after ${duration}ms`);
      console.error(`[SessionSyncService][${endDateTime}] Error occurred after ${duration}ms (started: ${startDateTime}, error: ${endDateTime})`);
      
      // Safer error logging - avoid direct stringification which can cause TypeError
      let errorDetails;
      try {
        if (error instanceof Error) {
          errorDetails = {
            name: error.name,
            message: error.message,
            stack: error.stack
          };
        } else {
          errorDetails = String(error);
        }
        console.error(`[SessionSyncService][${endDateTime}] Error details:`, errorDetails);
      } catch (logError) {
        console.error(`[SessionSyncService][${endDateTime}] Unable to log error details: ${logError instanceof Error ? logError.message : 'Unknown error during logging'}`);
      }
      
      // Handle errors
      this.consecutiveErrors++;
      console.warn(`[SessionSyncService][${endDateTime}] Consecutive errors: ${this.consecutiveErrors}`);
      
      // Create a safe error object
      let safeError: Error;
      if (error instanceof Error) {
        safeError = error;
      } else {
        // Create a new error with a fallback message if we can't properly stringify the original error
        try {
          safeError = new Error(String(error));
        } catch (e) {
          safeError = new Error('Unknown error occurred during operation processing');
        }
      }
      
      // Set error state and ALWAYS reset to idle to prevent stuck states
      this.activeOperations.set(sessionKey, {
        state: 'idle', 
        lastComplete: endTime,
        lastOperationDuration: duration,
        lastOperationId: operationId,
        lastOperationType: type,
        lastStartTime: undefined,
        lastError: safeError
      });
      
      // Log session state reset
      console.log(`[SessionSyncService][${endDateTime}] Reset state to idle after error for session ${sessionKey} (was: ${currentState})`);
      
      // Check for pending operations and potentially adjust queue after error
      const pendingOperations = queueManager.getQueueStats().pendingOperations;
      const sessionOperationCount = pendingOperations.filter(op => (op.sessionId || 'new') === sessionKey).length;
      
      if (sessionOperationCount > 0) {
        console.log(`[SessionSyncService][${endDateTime}] After error, session ${sessionKey} still has ${sessionOperationCount} pending operations`);
        console.log(`[SessionSyncService][${endDateTime}] Requesting queue refresh with priority adjustment to reassess priorities after error`);
        queueManager.requestQueueRefresh(true); // With priority adjustment
      }
      
      // Rethrow the error to be handled by the caller
      throw safeError;
    }
  }
  
  /**
   * Periodic health check to recover from stuck states
   */
  private async healthCheck() {
    const now = Date.now();
    const lastCheck = this.lastHealthCheckTime;
    const timeSinceLastCheck = now - lastCheck;
    this.lastHealthCheckTime = now;
    
    console.debug(`[SessionSyncService] ========================================`);
    console.debug(`[SessionSyncService] RUNNING HEALTH CHECK at ${new Date(now).toISOString()}`);
    console.debug(`[SessionSyncService] Time since last check: ${timeSinceLastCheck}ms`);
    
    // Create the expected format for health checker
    const operationStates = new Map<string, { inProgress: boolean; lastComplete: number; lastStartTime?: number }>();
    
    // Convert activeOperations to the expected format
    for (const [sessionId, info] of this.activeOperations.entries()) {
      operationStates.set(sessionId, {
        inProgress: info.state !== 'idle',
        lastComplete: info.lastComplete,
        lastStartTime: info.lastStartTime
      });
    }
    
    console.debug(`[SessionSyncService] Health check stats: ${this.activeOperations.size} sessions tracked, ${Array.from(this.activeOperations.values()).filter(s => s.state !== 'idle').length} active operations`);
    
    // Log any non-idle sessions for better visibility
    const nonIdleSessions = Array.from(this.activeOperations.entries())
      .filter(([_, info]) => info.state !== 'idle');
    
    if (nonIdleSessions.length > 0) {
      console.debug(`[SessionSyncService] Active sessions during health check:`);
      for (const [sessionId, info] of nonIdleSessions) {
        const operationRunTime = info.lastStartTime ? now - info.lastStartTime : 'unknown';
        const runningForStr = typeof operationRunTime === 'number' 
          ? `${operationRunTime}ms (${Math.round(operationRunTime/1000)}s)` 
          : operationRunTime;
        console.debug(`[SessionSyncService]   - Session ${sessionId}: state=${info.state}, operation=${info.lastOperationType || 'unknown'}, running for=${runningForStr}, operation ID=${info.lastOperationId || 'unknown'}`);
      }
    } else {
      console.debug(`[SessionSyncService] No active sessions during health check`);
    }
    
    // Log queue statistics
    const queueStats = queueManager.getQueueStats();
    console.debug(`[SessionSyncService] Queue stats: ${queueStats.pendingOperations.length} pending operations`);
    if (queueStats.pendingOperations.length > 0) {
      // Group by session
      const sessionOps = new Map<string, { load: number, save: number, delete: number }>();
      for (const op of queueStats.pendingOperations) {
        const sessionId = op.sessionId || 'new';
        if (!sessionOps.has(sessionId)) {
          sessionOps.set(sessionId, { load: 0, save: 0, delete: 0 });
        }
        const counts = sessionOps.get(sessionId)!;
        counts[op.type as keyof typeof counts]++;
      }
      
      // Log session operation counts
      console.debug(`[SessionSyncService] Pending operations by session:`);
      for (const [sessionId, counts] of sessionOps.entries()) {
        console.debug(`[SessionSyncService]   - Session ${sessionId}: load=${counts.load}, save=${counts.save}, delete=${counts.delete}, total=${counts.load + counts.save + counts.delete}`);
      }
      
      // Log operations waiting the longest
      const oldestOperations = [...queueStats.pendingOperations]
        .sort((a, b) => a.addedAt - b.addedAt)
        .slice(0, 3); // Show the 3 oldest operations
      
      if (oldestOperations.length > 0) {
        console.debug(`[SessionSyncService] Oldest pending operations:`);
        oldestOperations.forEach((op, idx) => {
          const waitTime = now - op.addedAt;
          console.debug(`[SessionSyncService]   ${idx + 1}. Session=${op.sessionId || 'new'}, Type=${op.type}, ID=${op.id}, Priority=${op.priority}, Waiting=${Math.round(waitTime/1000)}s, Added=${new Date(op.addedAt).toISOString()}`);
        });
      }
    }
    
    // Log cooldown state
    const activeCooldowns = Array.from(this.cooldowns.entries())
      .filter(([_, info]) => info.until > now);
    
    if (activeCooldowns.length > 0) {
      console.debug(`[SessionSyncService] Active cooldowns during health check:`);
      activeCooldowns.forEach(([key, info]) => {
        const remainingMs = info.until - now;
        console.debug(`[SessionSyncService]   - ${key}: operation=${info.operation}, remaining=${remainingMs}ms, until=${new Date(info.until).toISOString()}`);
      });
    }
    
    // Use the health checker module to check service health
    console.debug(`[SessionSyncService] Delegating health check to health checker module...`);
    const healthStatus = healthChecker.checkServiceHealth({
      activeOperations: operationStates,
      operationQueue: queueManager.getQueueStats().pendingOperations,
      lastCompletedOperations: this.lastCompletedOperations,
      consecutiveErrors: this.consecutiveErrors,
      lastHealthCheckTime: this.lastHealthCheckTime
    });
    
    console.debug(`[SessionSyncService] Health check result: ${healthStatus.isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    
    // Handle service reset if needed
    if (healthStatus.needsReset) {
      console.warn(`[SessionSyncService] ============ SERVICE RESET REQUIRED ============`);
      console.warn(`[SessionSyncService] Health check determined SERVICE RESET REQUIRED due to ${this.consecutiveErrors} consecutive errors`);
      console.warn(`[SessionSyncService] Initiating service state reset and attempting database recovery`);
      
      // Log current state before reset
      console.warn(`[SessionSyncService] Pre-reset state: ${this.activeOperations.size} tracked sessions, ${queueStats.pendingOperations.length} pending operations`);
      
      this.resetServiceState();
      
      // Attempt to fix database issues
      try {
        console.debug(`[SessionSyncService] Attempting database recovery after service reset...`);
        const recoveryStartTime = Date.now();
        const recovered = await healthChecker.attemptDatabaseRecovery();
        const recoveryDuration = Date.now() - recoveryStartTime;
        
        console.debug(`[SessionSyncService] Database recovery completed after service reset: ${recovered ? 'SUCCESSFUL' : 'FAILED'} (duration: ${recoveryDuration}ms)`);
        if (recovered) {
          this.consecutiveErrors = 0; // Reset error counter after successful recovery
          console.debug(`[SessionSyncService] Reset consecutive error counter after successful recovery`);
        } else {
          console.warn(`[SessionSyncService] Database recovery failed, but service will continue with reset state`);
        }
      } catch (error) {
        console.error('[SessionSyncService] Failed to recover database during health check:', error);
      }
      
      console.warn(`[SessionSyncService] ============ SERVICE RESET COMPLETE ============`);
      console.debug(`[SessionSyncService] ========================================`);
      return;
    }
    
    // Handle stuck sessions
    if (healthStatus.stuckSessions.length > 0) {
      console.warn(`[SessionSyncService] ============ STUCK SESSIONS DETECTED ============`);
      console.warn(`[SessionSyncService] Health check detected ${healthStatus.stuckSessions.length} STUCK SESSIONS: ${healthStatus.stuckSessions.join(', ')}`);
      
      // Dump detailed state information for all stuck sessions
      console.warn(`[SessionSyncService] Detailed state information for stuck sessions:`);
      for (const sessionId of healthStatus.stuckSessions) {
        const sessionState = this.activeOperations.get(sessionId);
        if (sessionState) {
          console.warn(`[SessionSyncService] Session ${sessionId}:`);
          console.warn(`[SessionSyncService]   - Current state: ${sessionState.state}`);
          console.warn(`[SessionSyncService]   - Last operation type: ${sessionState.lastOperationType || 'unknown'}`);
          console.warn(`[SessionSyncService]   - Last operation ID: ${sessionState.lastOperationId || 'unknown'}`);
          
          // Calculate and log duration information
          if (sessionState.lastStartTime) {
            const stuckDuration = now - sessionState.lastStartTime;
            console.warn(`[SessionSyncService]   - Started at: ${new Date(sessionState.lastStartTime).toISOString()}`);
            console.warn(`[SessionSyncService]   - Stuck for: ${stuckDuration}ms (${Math.round(stuckDuration/1000)}s)`);
          }
          
          // Check if there are any pending operations for this session
          const pendingOps = queueStats.pendingOperations.filter(op => op.sessionId === sessionId).length;
          console.warn(`[SessionSyncService]   - Pending operations: ${pendingOps}`);
          
          // Log any error information
          if (sessionState.lastError) {
            console.warn(`[SessionSyncService]   - Last error: ${sessionState.lastError.message}`);
          }
          
          // Log last completion
          if (sessionState.lastComplete) {
            console.warn(`[SessionSyncService]   - Last completion: ${new Date(sessionState.lastComplete).toISOString()}`);
          }
        } else {
          console.warn(`[SessionSyncService]   - No state information available for session ${sessionId}`);
        }
      }
      
      // Clear stuck sessions
      for (const sessionId of healthStatus.stuckSessions) {
        console.warn(`[SessionSyncService] Clearing stuck session: ${sessionId}`);
        
        // Get session details before clearing
        const sessionState = this.activeOperations.get(sessionId);
        if (sessionState) {
          const stuckDuration = sessionState.lastStartTime ? now - sessionState.lastStartTime : 'unknown';
          console.warn(`[SessionSyncService] Stuck session details - State: ${sessionState.state}, Operation: ${sessionState.lastOperationType || 'unknown'}, Duration: ${stuckDuration}ms, Operation ID: ${sessionState.lastOperationId || 'unknown'}`);
        }
        
        // Perform the clear operation
        const clearStartTime = Date.now();
        this.clearStuckSession(sessionId);
        const clearDuration = Date.now() - clearStartTime;
        console.log(`[SessionSyncService] Cleared stuck session: ${sessionId} (clearing took ${clearDuration}ms)`);
      }
      
      console.warn(`[SessionSyncService] ============ STUCK SESSIONS CLEARED ============`);
    }
    
    // Handle stalled sessions
    if (healthStatus.stalledSessions.length > 0) {
      console.warn(`[SessionSyncService] ============ STALLED SESSIONS DETECTED ============`);
      console.warn(`[SessionSyncService] Health check detected ${healthStatus.stalledSessions.length} STALLED SESSIONS: ${healthStatus.stalledSessions.join(', ')}`);
      
      // Log queue state for stalled sessions
      console.warn(`[SessionSyncService] Queue state for stalled sessions:`);
      for (const sessionId of healthStatus.stalledSessions) {
        const sessionOps = queueStats.pendingOperations.filter(op => op.sessionId === sessionId);
        const operationTypes = {
          load: sessionOps.filter(op => op.type === 'load').length,
          save: sessionOps.filter(op => op.type === 'save').length,
          delete: sessionOps.filter(op => op.type === 'delete').length
        };
        
        console.warn(`[SessionSyncService] Session ${sessionId}: ${sessionOps.length} operations (load=${operationTypes.load}, save=${operationTypes.save}, delete=${operationTypes.delete})`);
        
        // Log the state for this session
        const sessionState = this.activeOperations.get(sessionId);
        if (sessionState) {
          console.warn(`[SessionSyncService]   - Current state: ${sessionState.state}`);
          console.warn(`[SessionSyncService]   - Last operation: ${sessionState.lastOperationType || 'unknown'}`);
          console.warn(`[SessionSyncService]   - Last complete: ${new Date(sessionState.lastComplete).toISOString()}`);
        } else {
          console.warn(`[SessionSyncService]   - No state information available`);
        }
        
        // If there are load and save operations together, it could indicate a deadlock
        if (operationTypes.load > 0 && operationTypes.save > 0) {
          console.warn(`[SessionSyncService]   - POTENTIAL DEADLOCK DETECTED: session has both load (${operationTypes.load}) and save (${operationTypes.save}) operations`);
        }
      }
      
      // Process stalled queues to prioritize operations and break deadlocks
      console.log(`[SessionSyncService] Calling healthChecker.processStalledQueues to adjust operation priorities...`);
      const processingStartTime = Date.now();
      
      const updatedQueue = healthChecker.processStalledQueues(
        healthStatus.stalledSessions,
        queueManager.getQueueStats().pendingOperations
      );
      
      const processingDuration = Date.now() - processingStartTime;
      console.log(`[SessionSyncService] Applied priority adjustments to stalled session queues (processing took ${processingDuration}ms)`);
      
      // Request queue refresh to apply changes
      queueManager.requestQueueRefresh();
      console.log(`[SessionSyncService] Requested queue refresh to process reprioritized operations`);
      
      console.warn(`[SessionSyncService] ============ STALLED SESSIONS PROCESSED ============`);
    }
    
    if (healthStatus.isHealthy) {
      console.log(`[SessionSyncService] Health check completed successfully - system is healthy`);
    }
    
    console.debug(`[SessionSyncService] ========================================`);
  }

  /**
   * Reset service state in case of major issues
   */
  private resetServiceState() {
    console.log(`[SessionSyncService] ======== RESETTING SERVICE STATE ========`);
    const resetTime = new Date().toISOString();
    console.log(`[SessionSyncService] Starting full service state reset at ${resetTime}`);
    
    // Log the current state of active operations before clearing
    console.log(`[SessionSyncService] Current active operations before reset: ${this.activeOperations.size}`);
    if (this.activeOperations.size > 0) {
      console.log(`[SessionSyncService] Active operation details before reset:`);
      for (const [sessionId, info] of this.activeOperations.entries()) {
        let runningTime = 'N/A';
        if (info.state !== 'idle' && info.lastStartTime) {
          runningTime = `${Date.now() - info.lastStartTime}ms`;
        }
        console.log(`[SessionSyncService]   - Session ${sessionId}: state=${info.state}, type=${info.lastOperationType || 'unknown'}, running=${runningTime}, opId=${info.lastOperationId || 'unknown'}`);
      }
    }
    
    // Log the cooldowns before clearing
    console.log(`[SessionSyncService] Current cooldowns before reset: ${this.cooldowns.size}`);
    if (this.cooldowns.size > 0) {
      console.log(`[SessionSyncService] Cooldown details before reset:`);
      const now = Date.now();
      for (const [key, value] of this.cooldowns.entries()) {
        const remainingMs = Math.max(0, value.until - now);
        console.log(`[SessionSyncService]   - ${key}: operation=${value.operation}, remaining=${remainingMs}ms, until=${new Date(value.until).toISOString()}`);
      }
    }
    
    // Log queue state before reset
    const queueStats = queueManager.getQueueStats();
    console.log(`[SessionSyncService] Queue state before reset: ${queueStats.pendingOperations.length} pending operations`);
    if (queueStats.pendingOperations.length > 0) {
      // Group operations by session and type for clearer reporting
      const sessionOps = new Map<string, { load: number, save: number, delete: number }>();
      for (const op of queueStats.pendingOperations) {
        const sessionId = op.sessionId || 'new';
        if (!sessionOps.has(sessionId)) {
          sessionOps.set(sessionId, { load: 0, save: 0, delete: 0 });
        }
        const counts = sessionOps.get(sessionId)!;
        counts[op.type as keyof typeof counts]++;
      }
      
      console.log(`[SessionSyncService] Queue details by session before reset:`);
      for (const [sessionId, counts] of sessionOps.entries()) {
        console.log(`[SessionSyncService]   - Session ${sessionId}: load=${counts.load}, save=${counts.save}, delete=${counts.delete}, total=${counts.load + counts.save + counts.delete}`);
      }
      
      // Find any long-waiting operations
      const oldOperations = queueStats.pendingOperations
        .filter(op => Date.now() - op.addedAt > 10000) // Operations waiting more than 10s
        .sort((a, b) => a.addedAt - b.addedAt); // Sort by age (oldest first)
      
      if (oldOperations.length > 0) {
        console.log(`[SessionSyncService] Found ${oldOperations.length} operations waiting >10s before reset:`);
        for (const op of oldOperations.slice(0, 5)) { // Show up to 5 oldest
          const waitTime = Date.now() - op.addedAt;
          console.log(`[SessionSyncService]   - ${op.type} operation for session ${op.sessionId || 'new'} waiting for ${waitTime}ms (ID: ${op.id})`);
        }
        if (oldOperations.length > 5) {
          console.log(`[SessionSyncService]   - ... and ${oldOperations.length - 5} more old operations`);
        }
      }
    }
    
    // Clear all active operations
    const activeOperationsCount = this.activeOperations.size;
    this.activeOperations.clear();
    
    // Clear cooldowns
    const cooldownsCount = this.cooldowns.size;
    this.cooldowns.clear();
    
    // Get number of pending operations before reset
    const pendingOperationsCount = queueStats.pendingOperations.length;
    
    // Reset the queue manager
    queueManager.resetQueue();
    
    // Clear last completed operations
    const lastCompletedOperationsCount = this.lastCompletedOperations.size;
    this.lastCompletedOperations.clear();
    
    // Log what was cleared
    console.log(`[SessionSyncService] Reset completed: cleared ${activeOperationsCount} active operations, ${cooldownsCount} cooldowns, ${pendingOperationsCount} pending operations, and ${lastCompletedOperationsCount} last completed operations`);
    console.log(`[SessionSyncService] Service state has been fully reset at ${new Date().toISOString()}`);
    console.log(`[SessionSyncService] ======== SERVICE STATE RESET COMPLETE ========`);
  }

  /**
   * Set a cooldown period for a specific session and operation
   */
  public setCooldown(sessionId: string | null, operation: 'load' | 'save' | 'delete', durationMs: number): void {
    const cooldownKey = `${sessionId || 'new'}_${operation}`;
    const now = Date.now();
    const until = now + durationMs;
    const untilTime = new Date(until).toISOString();
    
    // Check if there's already a cooldown for this operation
    const existingCooldown = this.cooldowns.get(cooldownKey);
    
    if (existingCooldown) {
      const existingUntil = new Date(existingCooldown.until).toISOString();
      const existingRemaining = Math.max(0, existingCooldown.until - now);
      
      console.log(`[SessionSyncService] Updating cooldown for ${operation} operations on session ${sessionId || 'new'}`);
      console.log(`[SessionSyncService] Previous cooldown: until ${existingUntil} (${existingRemaining}ms remaining)`);
      console.log(`[SessionSyncService] New cooldown: until ${untilTime} (${durationMs}ms from now)`);
    } else {
      console.log(`[SessionSyncService] Setting new cooldown for ${operation} operations on session ${sessionId || 'new'} for ${durationMs}ms (until ${untilTime})`);
    }
    
    this.cooldowns.set(cooldownKey, { operation, until });
  }

  /**
   * Queue an operation
   */
  public async queueOperation(
    operation: 'load' | 'save' | 'delete',
    sessionId: string | null,
    callback: SessionCallback,
    priority: number = 1,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<any> {
    // Validate sessionId format
    if (sessionId !== null && typeof sessionId !== 'string') {
      console.error(`[SessionSyncService] Invalid sessionId type provided to queueOperation: ${typeof sessionId}`);
      throw new SessionOperationError(`Invalid sessionId type: ${typeof sessionId}`);
    }
    
    const sessionKey = sessionId || 'new';
    const timestamp = new Date().toISOString();
    
    // Check if operation is on cooldown
    const cooldownKey = `${sessionKey}:${operation}`;
    const cooldown = this.cooldowns.get(cooldownKey);
    
    if (cooldown && Date.now() < cooldown.until) {
      const remainingMs = cooldown.until - Date.now();
      console.log(`[SessionSyncService][${timestamp}] Operation ${operation} for session ${sessionKey} is on cooldown for ${remainingMs}ms, skipping`);
      throw new SessionOperationError(`Operation ${operation} is on cooldown for ${remainingMs}ms`);
    }
    
    // Check for aborted signal
    if (signal?.aborted) {
      console.log(`[SessionSyncService][${timestamp}] Operation ${operation} for session ${sessionKey} was aborted before queueing`);
      throw new Error('Operation aborted');
    }
    
    try {
      // NEW FEATURE: Check for pending operations of the same type for the same session 
      // and potentially coalesce them to reduce queue contention
      const queueStats = queueManager.getQueueStats();
      const sameTypeOperations = queueStats.pendingOperations.filter(op => 
        op.type === operation && 
        (op.sessionId || 'new') === sessionKey
      );
      
      // Most effective for 'save' operations where we can often skip intermediate saves
      if (operation === 'save' && sameTypeOperations.length > 0) {
        console.log(`[SessionSyncService][${timestamp}] Found ${sameTypeOperations.length} pending save operations already in queue for session ${sessionKey}`);
        
        // If we have multiple save operations pending, consider coalescing
        if (sameTypeOperations.length > 1) {
          // Sort by timestamp (newest first)
          const sortedSaves = [...sameTypeOperations].sort((a, b) => b.addedAt - a.addedAt);
          
          // COALESCE SAVES: If there are more than 3 save operations pending 
          // for the same session, cancel all but the most recent 2
          if (sortedSaves.length >= 3) {
            const toKeep = sortedSaves.slice(0, 2); // Keep newest 2
            const toCancel = sortedSaves.slice(2);  // Cancel the rest
            
            if (toCancel.length > 0) {
              console.log(`[SessionSyncService][${timestamp}] 🔄 Coalescing saves: canceling ${toCancel.length} older save operations for session ${sessionKey}`);
              
              // Abort the older operations
              toCancel.forEach(op => {
                if (op.signal && !op.signal.aborted && 'abort' in op.signal) {
                  try {
                    (op.signal as any).abort?.();
                    console.log(`[SessionSyncService][${timestamp}] 🔄 Aborted older save operation ${op.id} during save coalescing`);
                  } catch (error) {
                    console.error(`[SessionSyncService][${timestamp}] Error aborting operation ${op.id}:`, error);
                  }
                }
              });
              
              // Raise priority of this new save since it now contains more changes
              const originalPriority = priority;
              priority = Math.max(priority, 5);
              console.log(`[SessionSyncService][${timestamp}] 🔄 Boosting priority of coalesced save from ${originalPriority} to ${priority}`);
            }
          } 
          // If we already have 1-2 save operations pending, boost priority of newest ones
          else if (sortedSaves.length > 0) {
            // If this is a frequent save pattern (saves added close together),
            // boost priority of this new save to help them process faster
            const newestSave = sortedSaves[0];
            const timeDistance = Date.now() - newestSave.addedAt;
            
            if (timeDistance < 2000) { // If saves are happening in quick succession
              const originalPriority = priority;
              priority = Math.max(priority, 4); // Moderately boost priority
              console.log(`[SessionSyncService][${timestamp}] 🔄 Boosting priority of rapid save from ${originalPriority} to ${priority}`);
            }
          }
        }
      }
      // For load operations, we usually want to let one complete before starting another
      else if (operation === 'load' && sameTypeOperations.length > 0) {
        // Multiple concurrent loads for same session is often wasteful
        console.log(`[SessionSyncService][${timestamp}] Found ${sameTypeOperations.length} pending load operations already in queue for session ${sessionKey}`);
        
        if (sameTypeOperations.length >= 2) {
          // Log the potential issue
          console.warn(`[SessionSyncService][${timestamp}] ⚠️ Multiple concurrent load operations for the same session could be wasteful`);
          
          // We'll still queue the operation, but with a note
          console.log(`[SessionSyncService][${timestamp}] Queuing additional load but consider reviewing app logic that triggers multiple loads`);
        }
      }
      
      // Session switching optimization - Enhanced version
      
      // 1. Check if this session is being switched to
      const isBeingSwitchedTo = this.switchingSessions.has(sessionId || 'new');
      const switchInfo = isBeingSwitchedTo ? this.switchingSessions.get(sessionId || 'new') : null;
      
      // 2. Check if this is a previous session being switched away from
      const isSwitchingFrom = Array.from(this.switchingSessions.values())
        .some(info => info.previousSessionId === sessionId);
        
      // 3. Apply prioritization based on session switching context
      if (operation === 'load' && isBeingSwitchedTo) {
        // Boost priority for load operations on sessions being switched to
        const originalPriority = priority;
        priority = Math.max(priority, 10); // Maximum priority for session being switched to
        
        // Provide longer timeout for priority loads
        if (!timeoutMs) {
          timeoutMs = 120000; // 2 minutes for priority loads
        }
        
        console.log(`[SessionSyncService][${timestamp}] 🔄 SWITCH TARGET: Boosting load priority from ${originalPriority} to ${priority} for session ${sessionKey}`);
        
        // Get queue stats to analyze pending operations
        const queueStats = queueManager.getQueueStats();
        
        // Find 'save' operations in queue for the PREVIOUS session
        if (switchInfo?.previousSessionId) {
          const saveOpsForPreviousSession = queueStats.pendingOperations.filter(op => 
            op.type === 'save' && 
            op.sessionId === switchInfo.previousSessionId &&
            op.signal // Only consider operations with abort signals
          );
          
          // If there are pending saves for the previous session, cancel all but the most recent
          if (saveOpsForPreviousSession.length > 0) {
            console.log(`[SessionSyncService][${timestamp}] 🔄 Found ${saveOpsForPreviousSession.length} pending save operations for previous session ${switchInfo.previousSessionId}`);
            
            if (saveOpsForPreviousSession.length > 1) {
              // Sort by timestamp (newest first)
              const sortedSaves = [...saveOpsForPreviousSession].sort((a, b) => b.addedAt - a.addedAt);
              
              // Keep the newest save, cancel all others
              const toCancel = sortedSaves.slice(1);
              
              if (toCancel.length > 0) {
                console.log(`[SessionSyncService][${timestamp}] 🔄 Canceling ${toCancel.length} older save operations for previous session ${switchInfo.previousSessionId}`);
                
                // Abort the older operations
                toCancel.forEach(op => {
                  if (op.signal && !op.signal.aborted && 'abort' in op.signal) {
                    try {
                      (op.signal as any).abort?.();
                      console.log(`[SessionSyncService][${timestamp}] 🔄 Aborted older save operation ${op.id} for previous session ${switchInfo.previousSessionId}`);
                    } catch (error) {
                      console.error(`[SessionSyncService][${timestamp}] Error aborting operation ${op.id}:`, error);
                    }
                  }
                });
              }
            }
          }
        }
      } else if (operation === 'save') {
        // For save operations, check if we're saving a session that's being switched AWAY from
        if (isSwitchingFrom) {
          // Reduce priority for save operations on sessions being switched away from
          const originalPriority = priority;
          priority = Math.min(priority, 2); // Lower priority for session being switched away from
          
          console.log(`[SessionSyncService][${timestamp}] 🔄 SWITCH SOURCE: Reducing save priority from ${originalPriority} to ${priority} for session ${sessionKey} being switched away from`);
          
          // Additionally, look for any load operations for new target sessions
          const queueStats = queueManager.getQueueStats();
          const newSessionLoads = queueStats.pendingOperations.filter(op => 
            op.type === 'load' && 
            this.switchingSessions.has(op.sessionId || 'new')
          );
          
          if (newSessionLoads.length > 0) {
            console.log(`[SessionSyncService][${timestamp}] 🔄 Found ${newSessionLoads.length} load operations for new sessions while saving session being switched away from`);
          }
        } else {
          // Regular save operation - check if we should optimize queue
          this.optimizeQueueForSessionSwitching(operation, sessionId, timestamp);
        }
      } else if (operation === 'load') {
        // Regular load operation - check for session switching optimization
        this.optimizeQueueForSessionSwitching(operation, sessionId, timestamp);
      }
      
      return await queueManager.queueOperation(
        operation,
        sessionId,
        callback,
        priority,
        timeoutMs,
        signal
      );
    } catch (error) {
      this.consecutiveErrors++;
      throw error;
    }
  }
  
  /**
   * Optimize queue for session switching scenarios
   * This is an internal helper method to reduce code duplication
   */
  private optimizeQueueForSessionSwitching(
    operation: 'load' | 'save' | 'delete',
    sessionId: string | null,
    timestamp: string
  ): void {
    const sessionKey = sessionId || 'new';
    
    // Session switching optimization - Check for load/save patterns
    if (operation === 'load') {
      // Get queue stats to analyze pending operations
      const queueStats = queueManager.getQueueStats();
      
      // Check for active operations saving other sessions
      const activeSessionsStates = Array.from(this.activeOperations.entries());
      const otherSessionsSaving = activeSessionsStates.filter(([key, info]) => 
        key !== sessionKey && info.state === 'saving'
      );
      
      // Find 'save' operations in queue for OTHER sessions
      const saveOpsForOtherSessions = queueStats.pendingOperations.filter(op => 
        op.type === 'save' && 
        (op.sessionId || 'new') !== sessionKey &&
        op.signal // Only consider operations with abort signals
      );
      
      // If we're switching sessions and there are pending saves for other sessions,
      // we might want to cancel some of those saves to prioritize the loading
      if (saveOpsForOtherSessions.length > 0) {
        const processingMessage = otherSessionsSaving.length > 0 
          ? `and ${otherSessionsSaving.length} save operations actively processing` 
          : '';
        
        console.log(`[SessionSyncService][${timestamp}] 🔄 Session switching optimization: Found ${saveOpsForOtherSessions.length} pending save operations ${processingMessage} for other sessions while loading ${sessionKey}`);
        
        // Group pending saves by session
        const sessionSaveCounts = new Map<string, Array<SessionOperation>>();
        
        saveOpsForOtherSessions.forEach(op => {
          const opSessionKey = op.sessionId || 'new';
          if (!sessionSaveCounts.has(opSessionKey)) {
            sessionSaveCounts.set(opSessionKey, []);
          }
          sessionSaveCounts.get(opSessionKey)!.push(op);
        });
        
        // For each session with multiple pending saves, cancel all but the last one
        sessionSaveCounts.forEach((operations, otherSessionKey) => {
          if (operations.length > 1) {
            // Sort by timestamp (newest first)
            operations.sort((a, b) => b.addedAt - a.addedAt);
            
            // Keep the newest save, cancel older ones
            const toCancel = operations.slice(1);
            
            if (toCancel.length > 0) {
              console.log(`[SessionSyncService][${timestamp}] 🔄 Session switching optimization: Canceling ${toCancel.length} older save operations for session ${otherSessionKey} to prioritize loading ${sessionKey}`);
              
              // Abort the older operations
              toCancel.forEach(op => {
                if (op.signal && !op.signal.aborted && 'abort' in op.signal) {
                  try {
                    // Use any as a workaround for the fact that AbortSignal doesn't have an abort method directly
                    // In practice, this is likely an AbortController's signal
                    (op.signal as any).abort?.();
                    console.log(`[SessionSyncService][${timestamp}] 🔄 Aborted older save operation ${op.id} for session ${otherSessionKey}`);
                  } catch (error) {
                    console.error(`[SessionSyncService][${timestamp}] Error aborting operation ${op.id}:`, error);
                  }
                }
              });
            }
          }
        });
      }
    }
  }

  /**
   * Helper to check if a session currently has an active operation
   */
  public isSessionBusy(sessionId: string | null): boolean {
    const state = this.activeOperations.get(sessionId || 'new');
    return state ? state.state !== 'idle' : false;
  }

  /**
   * Get the current state for a session
   */
  public getSessionState(sessionId: string | null): OperationStateInfo | undefined {
    return this.activeOperations.get(sessionId || 'new');
  }

  /**
   * Get the current queue status for debugging
   */
  public getQueueStatus(): {
    activeOperations: [string, OperationStateInfo][],
    queueStats: ReturnType<typeof queueManager.getQueueStats>,
    cooldowns: Array<{
      sessionId: string,
      operation: string,
      remainingMs: number
    }>,
    consecutiveErrors: number
  } {
    const now = Date.now();
    
    return {
      activeOperations: Array.from(this.activeOperations.entries()),
      queueStats: queueManager.getQueueStats(),
      cooldowns: Array.from(this.cooldowns.entries()).map(([key, value]) => {
        const [sessionId, operation] = key.split('_');
        return {
          sessionId,
          operation,
          remainingMs: Math.max(0, value.until - now)
        };
      }),
      consecutiveErrors: this.consecutiveErrors
    };
  }

  /**
   * Execute a transaction of multiple operations
   * All operations will be executed with the same priority and timeout
   */
  public async executeTransaction(
    operations: Array<{
      operation: 'load' | 'save' | 'delete',
      sessionId: string | null,
      callback: SessionCallback
    }>,
    priority: number = 3,
    timeoutMs?: number
  ): Promise<void> {
    // Track the primary session ID from the first operation
    const primarySessionId = operations[0]?.sessionId || null;
    
    // Create a combined callback that executes all operations
    const groupCallback = async () => {
      for (const op of operations) {
        await op.callback();
      }
    };
    
    // Queue the transaction as a single high-priority operation
    await this.queueOperation(
      'save', // Use 'save' as the primary operation type for transactions
      primarySessionId,
      groupCallback,
      priority,
      timeoutMs
    );
  }

  /**
   * Get a session by ID
   */
  public async getSessionById(sessionId: string, signal?: AbortSignal): Promise<Session | null> {
    try {
      // Add validation for sessionId
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new SessionOperationError('Invalid session ID provided');
      }
      
      // Simply ensure sessionId is a string
      const sessionIdStr = String(sessionId);
      
      // Queue a load operation
      return this.queueOperation(
        'load',
        sessionIdStr,
        async () => {
          // Check if the operation was aborted before making the database call
          if (signal?.aborted) {
            console.log(`[SessionSyncService] Operation aborted before database query for session ${sessionIdStr}`);
            throw new Error('Operation aborted');
          }
          
          const sessionRepo = await getSessionRepository();
          
          // Handle browser environment where repository is null
          if (!sessionRepo) {
            console.log(`[SessionSyncService] Session repository not available in this environment for session ${sessionIdStr}`);
            return null;
          }
          
          return sessionRepo.getSession(sessionIdStr);
        },
        undefined,
        undefined,
        signal
      );
    } catch (error) {
      console.error(`[SessionSyncService] Error getting session by ID ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Force load a session from the database
   * Clears any pending operations for the session before loading
   * Enhanced for session switching optimization with improved error handling
   */
  public async forceLoadSession(sessionId: string): Promise<any> {
    try {
      // Add validation for sessionId
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new SessionOperationError('Invalid session ID provided');
      }
      
      // Simply ensure sessionId is a string
      const sessionIdStr = String(sessionId);
      const timestamp = new Date().toISOString();
      const operationId = `force_load_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      console.log(`[SessionSyncService][${timestamp}][${operationId}] 🔄 Forcing load for session ${sessionIdStr} with high priority`);
      
      // Mark this as a session being switched to for queue prioritization
      this.markSessionSwitching(sessionIdStr);
      
      // Clear any pending operations for this session
      const clearedCount = queueManager.clearSessionOperations(sessionIdStr);
      console.log(`[SessionSyncService][${timestamp}][${operationId}] Cleared ${clearedCount} pending operations for session ${sessionIdStr}`);
      
      // Create a new AbortController for this operation
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Set up a timeout to automatically abort the operation if it takes too long
      const timeoutId = setTimeout(() => {
        console.warn(`[SessionSyncService][${timestamp}][${operationId}] Force load operation for session ${sessionIdStr} timed out after 120 seconds`);
        controller.abort();
      }, 120000); // 2-minute timeout
      
      try {
        // Queue a load operation with highest priority (10)
        return await new Promise<any>((resolve, reject) => {
          this.queueOperation(
            'load',
            sessionIdStr,
            async () => {
              try {
                const sessionRepo = await getSessionRepository();
                
                // Handle browser environment where repository is null
                if (!sessionRepo) {
                  console.log(`[SessionSyncService][${timestamp}][${operationId}] Session repository not available in this environment`);
                  return {
                    isSuccess: false,
                    message: "Session repository unavailable",
                    data: null
                  };
                }
                
                // Check if the operation is already aborted before proceeding
                if (signal.aborted) {
                  console.log(`[SessionSyncService][${timestamp}][${operationId}] Operation was aborted before database query`);
                  throw new Error('Operation aborted');
                }
                
                // Use the enhanced getSession method with the prioritized flag and signal
                const session = await sessionRepo.getSession(sessionIdStr, signal, true);
                
                if (!session) {
                  console.warn(`[SessionSyncService][${timestamp}][${operationId}] Session not found: ${sessionIdStr}`);
                  return {
                    isSuccess: false,
                    message: `Session not found: ${sessionIdStr}`,
                    data: null
                  };
                }
                
                console.log(`[SessionSyncService][${timestamp}][${operationId}] Successfully force-loaded session ${sessionIdStr}`);
                
                // Return detailed success information
                return {
                  isSuccess: true,
                  message: "Session loaded successfully",
                  data: session,
                  timing: {
                    totalTime: Date.now() - new Date(timestamp).getTime(),
                    filesCount: {
                      included: session.includedFiles?.length || 0,
                      excluded: session.forceExcludedFiles?.length || 0
                    }
                  }
                };
              } catch (error) {
                // Check if this was an abort error
                if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted')) {
                  console.log(`[SessionSyncService][${timestamp}][${operationId}] Operation was aborted during execution`);
                  return {
                    isSuccess: false,
                    message: 'Operation was aborted',
                    data: null
                  };
                }
                
                // For other errors, log and return as failure
                console.error(`[SessionSyncService][${timestamp}][${operationId}] Error force-loading session:`, error);
                return {
                  isSuccess: false,
                  message: error instanceof Error ? error.message : String(error),
                  data: null
                };
              }
            },
            10, // Highest priority
            120000 // 2-minute timeout for priority loads
          ).then(result => {
            // Clear the timeout as we've successfully completed
            clearTimeout(timeoutId);
            resolve(result);
          }).catch((error) => {
            console.error(`[SessionSyncService][${timestamp}][${operationId}] Error force loading session:`, error);
            
            // Return a better structured error response
            const errorResponse = {
              isSuccess: false,
              message: error instanceof Error ? error.message : String(error),
              data: null,
              error: {
                name: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined
              }
            };
            
            reject(errorResponse);
          });
        });
      } finally {
        // Ensure we clean up our timeout and abort controller
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error('[SessionSyncService] Error in forceLoadSession:', error);
      
      // Return a standardized error response
      return {
        isSuccess: false,
        message: error instanceof Error ? error.message : String(error),
        data: null
      };
    }
  }

  /**
   * Updates session state via the API handler
   */
  public async updateSessionState(sessionId: string, sessionData: Partial<Session>, signal?: AbortSignal): Promise<void> {
    if (!sessionId) {
      console.error("[SessionSyncService] Cannot update session state: Session ID is missing");
      return;
    }
    
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    console.log(`[SessionSyncService] Creating operation to patch session state fields for ${sessionId} (Operation: ${operationId})`);
    
    // Queue the operation to update session state
    await this.queueOperation(
      'save',
      sessionId,
      () => apiHandler.patchSessionStateFields(sessionId, sessionData, operationId, signal),
      3, // Higher priority for state updates
      undefined,
      signal // Pass the abort signal
    );
  }

  /**
   * Mark a session as the target of a session switch
   * This helps prioritize load operations during session switching
   */
  public markSessionSwitching(sessionId: string | null, previousSessionId: string | null = null): void {
    if (!sessionId) {
      console.warn('[SessionSyncService] Cannot mark null sessionId as switching target');
      return;
    }
    
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    console.log(`[SessionSyncService][${timestamp}] Marking session ${sessionId} as switching target (previous: ${previousSessionId || 'null'})`);
    
    // Add to the switchingSessions map
    this.switchingSessions.set(sessionId, {
      timestamp: now,
      previousSessionId
    });
    
    // Clean up old entries from the map (older than 2 minutes)
    const cleanupThreshold = now - 120000; // 2 minutes
    for (const [id, data] of this.switchingSessions.entries()) {
      if (data.timestamp < cleanupThreshold) {
        this.switchingSessions.delete(id);
      }
    }
    
    // Prioritize any pending load operations for this session
    try {
      const queueStats = queueManager.getQueueStats();
      const pendingLoadsForSession = queueStats.pendingOperations.filter(
        op => op.sessionId === sessionId && op.type === 'load'
      );
      
      if (pendingLoadsForSession.length > 0) {
        console.log(`[SessionSyncService][${timestamp}] Found ${pendingLoadsForSession.length} pending load operations for switching target ${sessionId}, requesting priority boost`);
        
        // Request queue refresh to reprocess prioritized operations
        queueManager.requestQueueRefresh();
      }
      
      // If there is a previous session, try to cancel any pending save operations
      if (previousSessionId) {
        const pendingSavesForPreviousSession = queueStats.pendingOperations.filter(
          op => op.sessionId === previousSessionId && op.type === 'save' && op.signal
        );
        
        if (pendingSavesForPreviousSession.length > 0) {
          console.log(`[SessionSyncService][${timestamp}] Found ${pendingSavesForPreviousSession.length} pending save operations for previous session ${previousSessionId}, considering abort`);
          
          // If there are multiple saves pending, abort all but the most recent one
          if (pendingSavesForPreviousSession.length > 1) {
            // Sort by timestamp (newest first)
            const sortedSaves = [...pendingSavesForPreviousSession].sort((a, b) => b.addedAt - a.addedAt);
            
            // Keep the newest one, abort the rest
            const savesToAbort = sortedSaves.slice(1);
            
            console.log(`[SessionSyncService][${timestamp}] Aborting ${savesToAbort.length} older save operations for previous session ${previousSessionId}`);
            
            // Abort older save operations
            savesToAbort.forEach(op => {
              if (op.signal && 'abort' in op.signal) {
                try {
                  // Use any as a workaround for type issues
                  (op.signal as any).abort();
                  console.log(`[SessionSyncService][${timestamp}] Aborted older save operation ${op.id} for previous session ${previousSessionId}`);
                } catch (error) {
                  console.error(`[SessionSyncService][${timestamp}] Error aborting operation ${op.id}:`, error);
                }
              }
            });
          }
        }
      }
    } catch (error) {
      console.error(`[SessionSyncService][${timestamp}] Error prioritizing session switch:`, error);
    }
  }

  /**
   * Clear a stuck session state and related operations
   */
  public clearStuckSession(sessionId: string | null): void {
    const sessionKey = sessionId || 'new';
    const clearStartTime = Date.now();
    
    console.log(`[SessionSyncService] ======== CLEARING STUCK SESSION ========`);
    console.log(`[SessionSyncService] Clearing stuck session: ${sessionKey} at ${new Date(clearStartTime).toISOString()}`);
    
    try {
      // Get current state info
      const stateInfo = this.activeOperations.get(sessionKey);
      const currentState = stateInfo?.state || 'idle';
      
      // Log detailed current state before clearing
      console.log(`[SessionSyncService] Current state before clearing: ${currentState}`);
      
      if (stateInfo) {
        // Log operation details
        if (stateInfo.lastOperationId) {
          console.log(`[SessionSyncService] Last operation ID: ${stateInfo.lastOperationId}`);
        }
        
        if (stateInfo.lastOperationType) {
          console.log(`[SessionSyncService] Last operation type: ${stateInfo.lastOperationType}`);
        }
        
        // Calculate and log running time
        if (stateInfo.lastStartTime) {
          const runningTime = clearStartTime - stateInfo.lastStartTime;
          const startedAt = new Date(stateInfo.lastStartTime).toISOString();
          console.log(`[SessionSyncService] Operation started at: ${startedAt}`);
          console.log(`[SessionSyncService] Operation was running for: ${runningTime}ms`);
          
          // Warn if the operation was running for an unusually long time
          if (runningTime > 30000) {
            console.warn(`[SessionSyncService] Operation was running for MORE THAN 30 SECONDS (${Math.round(runningTime/1000)}s)!`);
          }
        }
        
        // Log last error if one exists
        if (stateInfo.lastError) {
          console.log(`[SessionSyncService] Last recorded error: ${stateInfo.lastError.message}`);
        }
        
        // Log last completion time if available
        if (stateInfo.lastComplete) {
          const lastCompleteTime = new Date(stateInfo.lastComplete).toISOString();
          const timeSinceComplete = clearStartTime - stateInfo.lastComplete;
          console.log(`[SessionSyncService] Last operation completed at: ${lastCompleteTime} (${Math.round(timeSinceComplete/1000)}s ago)`);
        }
      } else {
        console.log(`[SessionSyncService] No state information found for session ${sessionKey}`);
      }
      
      // Get current queue stats before clearing
      const queueStatsBefore = queueManager.getQueueStats();
      const pendingOperationsForSession = queueStatsBefore.pendingOperations.filter(op => op.sessionId === sessionId).length;
      
      if (pendingOperationsForSession > 0) {
        console.log(`[SessionSyncService] Found ${pendingOperationsForSession} pending operations for session ${sessionKey} before clearing:`);
        
        // Group by operation type
        const loadOps = queueStatsBefore.pendingOperations.filter(op => op.sessionId === sessionId && op.type === 'load').length;
        const saveOps = queueStatsBefore.pendingOperations.filter(op => op.sessionId === sessionId && op.type === 'save').length;
        const deleteOps = queueStatsBefore.pendingOperations.filter(op => op.sessionId === sessionId && op.type === 'delete').length;
        
        console.log(`[SessionSyncService] Operation breakdown: load=${loadOps}, save=${saveOps}, delete=${deleteOps}`);
        
        // Check for potential deadlock
        if (loadOps > 0 && saveOps > 0) {
          console.warn(`[SessionSyncService] Potential deadlock detected: session has both load and save operations pending`);
        }
        
        // Log details of oldest pending operation
        const sortedOps = [...queueStatsBefore.pendingOperations.filter(op => op.sessionId === sessionId)]
          .sort((a, b) => a.addedAt - b.addedAt);
        
        if (sortedOps.length > 0) {
          const oldestOp = sortedOps[0];
          const waitTime = clearStartTime - oldestOp.addedAt;
          console.log(`[SessionSyncService] Oldest pending operation: ${oldestOp.type} (ID: ${oldestOp.id}) waiting for ${Math.round(waitTime/1000)}s`);
        }
        
        // Create an AbortController to abort pending operations
        const controller = new AbortController();
        
        // Abort any operations with signals
        const operationsWithSignals = queueStatsBefore.pendingOperations
          .filter(op => op.sessionId === sessionId && op.signal);
        
        if (operationsWithSignals.length > 0) {
          console.log(`[SessionSyncService] Aborting ${operationsWithSignals.length} operations with AbortSignals for session ${sessionKey}`);
          
          // Trigger abort on all operations with signals
          controller.abort();
          
          // Log each aborted operation
          operationsWithSignals.forEach(op => {
            console.log(`[SessionSyncService] Aborted operation ${op.id} (${op.type}) for session ${sessionKey}`);
          });
        }
      } else {
        console.log(`[SessionSyncService] No pending operations found for session ${sessionKey}`);
      }
      
      // Reset the session state to idle
      this.activeOperations.set(sessionKey, {
        state: 'idle',
        lastError: new Error(`Session state forcibly cleared due to detected stuck operation`),
        lastComplete: clearStartTime,
        lastOperationId: stateInfo?.lastOperationId,
        lastOperationType: stateInfo?.lastOperationType,
        lastOperationDuration: stateInfo?.lastStartTime ? clearStartTime - stateInfo.lastStartTime : 0,
        lastStartTime: undefined
      });
      
      console.log(`[SessionSyncService] Reset session ${sessionKey} state to idle`);
      
      // Use the health checker to clear operations, providing a callback to reject operations
      if (sessionId !== null) {
        const pendingOps = queueStatsBefore.pendingOperations;
        
        // Define the reject operation callback for health checker
        const rejectOperation = (operationId: string, error: Error) => {
          console.log(`[SessionSyncService] Rejecting operation ${operationId} due to stuck session cleanup`);
          queueManager.registerOperationCompletion(operationId, null, error);
        };
        
        // Use the health checker's clearStuckSession function
        const updatedQueue = healthChecker.clearStuckSession(
          sessionId,
          pendingOps,
          rejectOperation
        );
        
        // Report on how many were cleared
        const operationsCleared = pendingOps.length - updatedQueue.length;
        console.log(`[SessionSyncService] Health checker removed ${operationsCleared} operations for stuck session ${sessionKey}`);
      } else {
        // For null sessionId, use the existing clearSessionOperations
        const clearedCount = queueManager.clearSessionOperations(sessionId);
        console.log(`[SessionSyncService] Cleared ${clearedCount} queued operations for session ${sessionKey}`);
      }
      
      // Apply cooldown to prevent immediate reprocessing
      this.setCooldown(sessionId, 'load', 2000); // 2 second cooldown for load operations
      this.setCooldown(sessionId, 'save', 2000); // 2 second cooldown for save operations
      console.log(`[SessionSyncService] Applied 2 second cooldown for load/save operations on session ${sessionKey}`);
      
      // Request queue refresh to process other operations
      setTimeout(() => {
        queueManager.requestQueueRefresh();
        console.log(`[SessionSyncService] Requested queue refresh after clearing session ${sessionKey}`);
      }, 100);
      
      // Log transition
      console.log(`[SessionSyncService] Session ${sessionKey} state transition: ${currentState} → idle (forced)`);
      
      // Calculate total time for clear operation
      const clearEndTime = Date.now();
      const clearDuration = clearEndTime - clearStartTime;
      console.log(`[SessionSyncService] Stuck session clearing completed in ${clearDuration}ms`);
      console.log(`[SessionSyncService] ======== END CLEARING STUCK SESSION ========`);
      
    } catch (error) {
      console.error(`[SessionSyncService] ERROR clearing stuck session ${sessionKey}:`, error);
      console.error(`[SessionSyncService] ======== ERROR CLEARING STUCK SESSION ========`);
    }
  }

  /**
   * Update session project directory
   */
  public async updateSessionProjectDirectory(sessionId: string, projectDirectory: string): Promise<void> {
    // Add validation for sessionId
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new SessionOperationError('Invalid session ID provided');
    }
    
    // Queue a save operation
    return new Promise<void>((resolve, reject) => {
      this.queueOperation(
        'save',
        sessionId,
        async () => {
          try {
            const sessionRepo = await getSessionRepository();
            
            // Handle browser environment where repository is null
            if (!sessionRepo) {
              console.log(`[SessionSyncService] Session repository not available in this environment for session ${sessionId}`);
              resolve(); // No-op in browser environment
              return;
            }
            
            await sessionRepo.updateSessionProjectDirectory(sessionId, projectDirectory);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      ).catch((error) => {
        console.error(`[SessionSync] Error updating project directory for ${sessionId}:`, error);
        reject(error);
      });
    });
  }

  /**
   * Set the active session for a project directory
   */
  public async setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
    // Track request metadata
    const requestTimestamp = Date.now();
    const requestId = `setActive_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    // Create a tracking key for this project
    const projectKey = `active_session_${projectDirectory}`;
    
    // Add throttling for frequent calls
    // We maintain a record of the last setting time and value for each project
    if (!this.lastProjectActiveSession) {
      this.lastProjectActiveSession = new Map();
    }
    
    const lastSetRecord = this.lastProjectActiveSession.get(projectKey);
    
    // If we have a record and we're trying to set the same sessionId within the throttle window
    if (lastSetRecord) {
      const { timestamp, value } = lastSetRecord;
      const timeSinceLastSet = requestTimestamp - timestamp;
      
      // If we've set this exact same value recently (within 2 seconds), just ignore the request
      if (value === sessionId && timeSinceLastSet < 2000) {
        console.log(`[SessionSync] Throttling active session set for project ${projectDirectory}: 
          - Request ID: ${requestId}
          - Time since last identical request: ${timeSinceLastSet}ms
          - Value unchanged: ${sessionId || 'null'}
        `);
        return; // Skip making the actual API call
      }
    }
    
    // Log we're setting the active session (with more context)
    console.log(`[SessionSync] Setting active session to ${sessionId || 'null'} for project ${projectDirectory}
      - Request ID: ${requestId}
      - Last set: ${lastSetRecord ? `${requestTimestamp - lastSetRecord.timestamp}ms ago` : 'never'}
    `);
    
    try {
      // Generate a unique operation ID
      const operationId = `set_active_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      
      // Update the last set record before making the call
      this.lastProjectActiveSession.set(projectKey, {
        timestamp: requestTimestamp,
        value: sessionId
      });
      
      // Use the API handler to set the active session
      return await apiHandler.setActiveSession(projectDirectory, sessionId, operationId);
    } catch (error) {
      console.error(`[SessionSync] Error setting active session:`, error);
      throw error;
    }
  }

  /**
   * Clear all session data from tracking
   */
  public clearAllSessions(): void {
    console.log('[SessionSync] Clearing all session data');
    
    // Clear active operations
    this.activeOperations.clear();
    
    // Clear last completed operations
    this.lastCompletedOperations.clear();
    
    // Clear cooldowns
    this.cooldowns.clear();
    
    // Reset queue
    queueManager.resetQueue();
    
    // Reset error counter
    this.consecutiveErrors = 0;
  }

  /**
   * Expose debug information for monitoring
   * This allows other parts of the application to access the current service state
   */
  private setupDebugInterface(): void {
    if (typeof global !== 'undefined') {
      (global as any).__DEBUG_SESSION_SYNC_STATE = () => {
        // Create a safe copy of active operations for debugging
        const activeOps = Array.from(this.activeOperations.entries()).map(([sessionId, info]) => {
          return {
            sessionId,
            state: info.state,
            lastComplete: info.lastComplete,
            lastStartTime: info.lastStartTime,
            lastOperationId: info.lastOperationId,
            operationRunTime: info.lastStartTime ? Date.now() - info.lastStartTime : undefined,
            lastOperationDuration: info.lastOperationDuration
          };
        });

        const queueInfo = queueManager.getQueueStats();
        
        return {
          activeOperations: activeOps,
          queueSize: queueInfo.size,
          pendingByPriority: queueInfo.priorityGroups,
          consecutiveErrors: this.consecutiveErrors,
          lastHealthCheck: this.lastHealthCheckTime,
        };
      };
    }
  }

  /**
   * Perform a complete health check and return detailed status
   */
  public async performHealthCheck(): Promise<any> {
    const now = Date.now();
    
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        console.log('[SessionSyncService] Skipping database health check in browser environment');
        return {
          timestamp: now,
          isBrowser: true,
          sessionCount: 0,
          activeOperations: {
            count: this.activeOperations.size,
            sessions: Array.from(this.activeOperations.entries()).map(([sessionId, state]) => ({
              sessionId,
              inProgress: state.state !== 'idle',
              state: state.state
            }))
          },
          queueStats: queueManager.getQueueStats(),
          consecutiveErrors: this.consecutiveErrors
        };
      }
      
      // Get session stats
      const sessionRepo = await getSessionRepository();
      
      // Handle case when repository is null
      if (!sessionRepo) {
        return {
          timestamp: now,
          repositoryAvailable: false,
          activeOperations: {
            count: this.activeOperations.size,
            sessions: Array.from(this.activeOperations.entries()).map(([sessionId, state]) => ({
              sessionId,
              inProgress: state.state !== 'idle',
              state: state.state
            }))
          },
          queueStats: queueManager.getQueueStats(),
          consecutiveErrors: this.consecutiveErrors
        };
      }
      
      const sessionCount = await sessionRepo.getSessionCount();
      
      // Get service stats
      const serviceStats = this.getQueueStatus();
      
      // Get database info
      let dbInfo = { ok: false, message: 'Not checked', fileSize: 0 };
      try {
        dbInfo = await sessionRepo.getDatabaseInfo();
      } catch (error) {
        dbInfo = { 
          ok: false, 
          message: error instanceof Error ? error.message : String(error),
          fileSize: 0
        };
      }
      
      return {
        timestamp: now,
        sessionCount,
        activeOperations: {
          count: serviceStats.activeOperations.length,
          sessions: serviceStats.activeOperations.map(([sessionId, state]) => ({
            sessionId,
            inProgress: state.state !== 'idle',
            lastComplete: state.lastComplete,
            lastOperationId: state.lastOperationId,
            lastOperationDuration: state.lastOperationDuration,
            hasError: state.lastError !== undefined,
            errorMessage: state.lastError ? state.lastError.message : undefined
          }))
        },
        queueStats: serviceStats.queueStats,
        cooldowns: serviceStats.cooldowns,
        consecutiveErrors: serviceStats.consecutiveErrors,
        database: dbInfo
      };
    } catch (error) {
      console.error('[SessionSync] Error performing health check:', error);
      
      return {
        timestamp: now,
        error: error instanceof Error ? error.message : String(error),
        consecutiveErrors: this.consecutiveErrors
      };
    }
  }
}

// Export the instance both as default and named export
export const sessionSyncService = new SessionSyncService();
export default sessionSyncService;