/**
 * Session Synchronization Service
 * 
 * Provides a centralized mechanism to coordinate session operations
 * and prevent race conditions between multiple components accessing
 * the same session state.
 */

import { Session } from '@/types';
import { safeFetch } from '@/lib/utils';

// Represents the state of a session operation
type OperationState = 'idle' | 'loading' | 'saving' | 'deleting';

// Type for session operation callback
type SessionCallback = () => Promise<void>;

// Custom error class for session operations
export class SessionOperationError extends Error {
  constructor(
    message: string,
    public readonly operation: 'load' | 'save' | 'delete',
    public readonly sessionId: string | null,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SessionOperationError';
  }
}

// Operation timeout error
export class OperationTimeoutError extends SessionOperationError {
  constructor(
    operation: 'load' | 'save' | 'delete',
    sessionId: string | null,
    timeoutMs: number
  ) {
    super(
      `Operation ${operation} for session ${sessionId || 'new'} timed out after ${timeoutMs}ms`,
      operation,
      sessionId
    );
    this.name = 'OperationTimeoutError';
  }
}

interface SessionOperation {
  id: string;
  operation: 'load' | 'save' | 'delete';
  sessionId: string | null;
  timestamp: number;
  priority: number; // Higher number = higher priority
  callback: SessionCallback;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutMs?: number; // Operation-specific timeout
}

class SessionSyncService {
  private static instance: SessionSyncService;
  
  // Active operations by session ID
  private activeOperations: Map<string, OperationState> = new Map();
  
  // Queue of pending operations
  private operationQueue: SessionOperation[] = [];
  
  // Lock for the queue processing
  private processingQueue = false;
  
  // Map to track last complete timestamp for each session
  private lastCompletedOperations: Map<string, number> = new Map();
  
  // Cooldowns to prevent operations right after certain events
  private cooldowns: Map<string, { operation: string, until: number }> = new Map();
  
  // Timeout tracking
  private operationTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  // Default operation timeout (30 seconds)
  private readonly DEFAULT_OPERATION_TIMEOUT = 30000;
  
  // Maximum number of consecutive errors before service reset
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  
  // Error counter
  private consecutiveErrors = 0;

  private constructor() {
    // Start the queue processor
    this.processQueue();
    
    // Set up periodic health check to recover from stuck states
    setInterval(() => this.healthCheck(), 30000); // Every 30 seconds
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SessionSyncService {
    if (!SessionSyncService.instance) {
      SessionSyncService.instance = new SessionSyncService();
    }
    return SessionSyncService.instance;
  }
  
  /**
   * Periodic health check to recover from stuck states
   */
  private async healthCheck() {
    // Check for stuck operations (operations that have been active for too long)
    const now = Date.now();
    
    // If we have too many consecutive errors, reset the service and attempt database recovery
    if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      console.warn(`[SessionSync] Detected ${this.consecutiveErrors} consecutive errors, resetting service state and attempting database recovery`);
      this.resetServiceState();
      
      // Attempt to fix database issues
      try {
        await this.attemptDatabaseRecovery();
      } catch (error) {
        console.error('[SessionSync] Failed to recover database during health check:', error);
      }
      
      return;
    }
    
    // Check for stuck active operations (operations that have been active for too long)
    if (this.activeOperations.size > 0) {
      console.log(`[SessionSync] HealthCheck: ${this.activeOperations.size} active operations found`);
      
      // Force reset active operations that might be stuck
      let stuckFound = false;
      for (const [sessionId, state] of this.activeOperations.entries()) {
        // Check if there's an operation timeout for this session
        // If no timeout found, the operation might be stuck
        stuckFound = true;
        console.warn(`[SessionSync] Potentially stuck operation for session ${sessionId}: ${state}`);
        
        // Forcibly clear this stuck operation
        this.activeOperations.delete(sessionId);
      }
      
      if (stuckFound) {
        console.warn(`[SessionSync] Cleared potentially stuck operations`);
        
        // Also reset processing queue if stuck
        if (this.processingQueue) {
          console.warn(`[SessionSync] Queue was being processed, resetting processing state`);
          this.processingQueue = false;
          
          // Restart queue processing
          setTimeout(() => this.processQueue(), 100);
        }
        
        // If we found stuck operations, attempt database recovery as a precaution
        try {
          await this.attemptDatabaseRecovery();
        } catch (error) {
          console.error('[SessionSync] Failed to recover database after clearing stuck operations:', error);
        }
      }
    }
    
    // Check if queue processing is stuck
    if (this.processingQueue && this.operationQueue.length > 0) {
      const oldestOp = this.operationQueue[0];
      const queueStuckTime = now - oldestOp.timestamp;
      
      // If oldest operation has been queued for more than 15 seconds, try to recover
      if (queueStuckTime > 15000) {
        console.warn(`[SessionSync] Queue appears stuck for ${queueStuckTime}ms, attempting recovery`);
        
        // Reset processing flag to allow queue to process again
        this.processingQueue = false;
        
        // Clear any active operations that might be stuck
        this.activeOperations.clear();
        
        // Attempt database recovery
        try {
          await this.attemptDatabaseRecovery();
        } catch (error) {
          console.error('[SessionSync] Failed to recover database after clearing stuck queue:', error);
        }
        
        // Restart queue processing
        this.processQueue();
      }
    }
  }
  
  /**
   * Attempt to recover the database by calling the fix-permissions API
   */
  private async attemptDatabaseRecovery(): Promise<boolean> {
    console.log('[SessionSync] Attempting database recovery');
    
    try {
      // Call the database maintenance API to fix permissions and handle readonly issues
      const response = await fetch('/api/database-maintenance/fix-permissions', {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('[SessionSync] Database recovery API returned error:', response.status, response.statusText);
        return false;
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('[SessionSync] Database recovery successful:', result);
        return true;
      } else {
        console.warn('[SessionSync] Database recovery failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[SessionSync] Error calling database recovery API:', error);
      return false;
    }
  }
  
  /**
   * Reset the service state in case of catastrophic failure
   */
  private resetServiceState() {
    // Clear all pending operations
    while (this.operationQueue.length > 0) {
      const op = this.operationQueue.shift();
      if (op) {
        console.warn(`[SessionSync] Rejecting operation ${op.operation} for session ${op.sessionId || 'new'} due to service reset`);
        try {
          op.reject(new SessionOperationError('Service reset due to too many errors', op.operation, op.sessionId));
        } catch (error) {
          console.error('[SessionSync] Error rejecting operation during reset:', error);
        }
      }
    }
    
    // Clear all active operations
    this.activeOperations.clear();
    
    // Clear all timeouts
    this.operationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.operationTimeouts.clear();
    
    // Reset processing flag
    this.processingQueue = false;
    
    // Reset error counter
    this.consecutiveErrors = 0;
    
    console.log('[SessionSync] Service state has been reset');
  }

  /**
   * Queue a session operation with proper synchronization
   * 
   * @param operation Type of operation (load, save, delete)
   * @param sessionId Session ID (or null for new session operations)
   * @param callback The callback function to execute
   * @param priority Priority of the operation (higher = more important)
   * @param timeoutMs Optional timeout in milliseconds
   * @returns Promise that resolves when operation completes
   */
  public async queueOperation(
    operation: 'load' | 'save' | 'delete',
    sessionId: string | null,
    callback: SessionCallback,
    priority: number = 1,
    timeoutMs?: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const opId = Math.random().toString(36).substring(2, 15);
      
      console.log(`[SessionSync] Queuing ${operation} operation for session ${sessionId || 'new'} with priority ${priority}`);
      
      // Check if this operation is in cooldown
      if (sessionId) {
        const cooldown = this.cooldowns.get(sessionId);
        if (cooldown && cooldown.operation === operation && cooldown.until > Date.now()) {
          console.log(`[SessionSync] Operation ${operation} for session ${sessionId} is in cooldown, skipping`);
          resolve(); // Resolve immediately but don't execute
          return;
        }
      }
      
      // Add to queue with optional timeout
      this.operationQueue.push({
        id: opId,
        operation,
        sessionId,
        timestamp: Date.now(),
        priority,
        callback,
        resolve,
        reject,
        timeoutMs
      });
      
      // Sort queue by priority (higher first) then by timestamp (older first)
      this.operationQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.timestamp - b.timestamp; // Older first
      });
      
      // Trigger queue processing
      this.processQueue();
    });
  }

  /**
   * Set a cooldown period for a specific session operation
   * to prevent excessive operations
   */
  public setCooldown(sessionId: string, operation: 'load' | 'save' | 'delete', durationMs: number): void {
    if (!sessionId) return;
    
    this.cooldowns.set(sessionId, {
      operation,
      until: Date.now() + durationMs
    });
    
    // Auto-clear the cooldown after it expires
    setTimeout(() => {
      const current = this.cooldowns.get(sessionId);
      if (current && current.operation === operation) {
        this.cooldowns.delete(sessionId);
      }
    }, durationMs + 100); // Add a little buffer
  }

  /**
   * Process the operation queue asynchronously
   */
  private async processQueue(): Promise<void> {
    // Return if already processing
    if (this.processingQueue) {
      return;
    }
    
    this.processingQueue = true;
    
    // Track when processing started to detect stuck processing
    const processingStartTime = Date.now();
    
    try {
      while (this.operationQueue.length > 0) {
        // Check if we've been processing too long - could indicate a stuck condition
        if (Date.now() - processingStartTime > 10000) { // 10 seconds max processing time
          console.warn('[SessionSync] Queue processing has been running for too long, possible stuck condition. Resetting processing state.');
          break; // Exit the loop to reset processing state
        }
        
        // Get the next operation
        const op = this.operationQueue[0];
        
        // Skip if this session has a more recent operation of the same type already completed
        const lastCompleted = this.lastCompletedOperations.get(`${op.sessionId}-${op.operation}`);
        if (lastCompleted && lastCompleted > op.timestamp) {
          console.log(`[SessionSync] Skipping outdated ${op.operation} for session ${op.sessionId || 'new'}`);
          op.resolve(); // Resolve without executing
          this.operationQueue.shift(); // Remove from queue
          continue;
        }
        
        // Skip if session is busy with an incompatible operation
        if (op.sessionId && this.activeOperations.has(op.sessionId)) {
          const currentState = this.activeOperations.get(op.sessionId);
          const operationAge = Date.now() - op.timestamp;
          
          // Define which operations can run concurrently
          const canRun = (
            // Loading can run during saving
            (op.operation === 'load' && currentState === 'saving') ||
            // No other combinations allowed
            false
          );
          
          // If operation has been waiting too long, clear the active operation that's blocking it
          if (!canRun && operationAge > 5000) { // 5 seconds wait threshold
            console.warn(`[SessionSync] Operation ${op.operation} for session ${op.sessionId} has been waiting for ${Math.floor(operationAge/1000)}s, clearing blocking operation ${currentState}`);
            this.activeOperations.delete(op.sessionId);
            // Continue with this operation (don't break)
          } else if (!canRun) {
            console.log(`[SessionSync] Session ${op.sessionId} is busy with ${currentState}, can't ${op.operation} yet`);
            // Don't remove from queue, try again later
            break;
          }
        }
        
        // Remove from queue immediately to prevent double-processing
        this.operationQueue.shift();
        
        // Mark as active
        const operationKey = op.sessionId ? op.sessionId : 'global';
        this.activeOperations.set(operationKey, this.getOperationState(op.operation));
        
        // Setup operation timeout
        const timeout = op.timeoutMs || this.DEFAULT_OPERATION_TIMEOUT;
        const timeoutKey = `${op.id}-${Date.now()}`;
        
        // Create a wrapped callback with timeout
        const wrappedCallback = async () => {
          // Track if the operation has completed
          let hasCompleted = false;
          
          // Add operation timeout
          const timeoutId = setTimeout(() => {
            if (hasCompleted) return; // Operation already completed
            
            console.warn(`[SessionSync] Operation ${op.operation} for session ${op.sessionId || 'new'} timed out after ${timeout}ms`);
            
            // Clear the active operation
            this.activeOperations.delete(operationKey);
            
            // Remove the timeout tracking
            this.operationTimeouts.delete(timeoutKey);
            
            // Reject with timeout error
            const timeoutError = new OperationTimeoutError(op.operation, op.sessionId, timeout);
            op.reject(timeoutError);
            
            // Increment error counter
            this.consecutiveErrors++;
            
            // Mark as completed to prevent double resolution/rejection
            hasCompleted = true;
            
          }, timeout);
          
          // Store timeout reference
          this.operationTimeouts.set(timeoutKey, timeoutId);
          
          try {
            console.log(`[SessionSync] Executing ${op.operation} for session ${op.sessionId || 'new'}`);
            await op.callback();
            
            // Skip further processing if already completed due to timeout
            if (hasCompleted) return;
            
            // Clear timeout
            clearTimeout(timeoutId);
            this.operationTimeouts.delete(timeoutKey);
            
            // Mark as completed
            this.lastCompletedOperations.set(`${op.sessionId}-${op.operation}`, Date.now());
            
            // Reset consecutive error counter on success
            this.consecutiveErrors = 0;
            
            // Resolve successfully
            op.resolve();
            
            // Mark as completed to prevent double resolution/rejection
            hasCompleted = true;
          } catch (error) {
            // Skip further processing if already completed due to timeout
            if (hasCompleted) return;
            
            // Clear timeout
            clearTimeout(timeoutId);
            this.operationTimeouts.delete(timeoutKey);
            
            console.error(`[SessionSync] Error during ${op.operation} for session ${op.sessionId || 'new'}:`, error);
            
            // Increment error counter
            this.consecutiveErrors++;
            
            const sessionError = new SessionOperationError(
              `Error during ${op.operation} operation${op.sessionId ? ` for session ${op.sessionId}` : ''}`,
              op.operation,
              op.sessionId,
              error
            );
            op.reject(sessionError);
            
            // Mark as completed to prevent double resolution/rejection
            hasCompleted = true;
          } finally {
            // Clear active status
            this.activeOperations.delete(operationKey);
          }
        };
        
        // Execute operation with error handling
        wrappedCallback().catch(error => {
          console.error(`[SessionSync] Unhandled error in wrapped callback:`, error);
          // Clear active status if not already done
          this.activeOperations.delete(operationKey);
        });
      }
    } catch (error) {
      console.error(`[SessionSync] Error processing operation queue:`, error);
      // Increment error counter
      this.consecutiveErrors++;
    } finally {
      this.processingQueue = false;
      
      // If there are still items in the queue, process again after a short delay
      if (this.operationQueue.length > 0) {
        setTimeout(() => this.processQueue(), 50);
      }
    }
  }

  /**
   * Convert operation to operation state
   */
  private getOperationState(operation: 'load' | 'save' | 'delete'): OperationState {
    switch (operation) {
      case 'load': return 'loading';
      case 'save': return 'saving';
      case 'delete': return 'deleting';
      default: return 'idle';
    }
  }

  /**
   * Check if a session currently has an active operation
   */
  public isSessionBusy(sessionId: string | null): boolean {
    if (!sessionId) return false;
    return this.activeOperations.has(sessionId);
  }
  
  /**
   * Get the current operation state for a session
   */
  public getSessionState(sessionId: string | null): OperationState {
    if (!sessionId) return 'idle';
    return this.activeOperations.get(sessionId) || 'idle';
  }

  /**
   * Get current queue status for debugging
   */
  public getQueueStatus(): {
    activeOperations: [string, OperationState][],
    pendingOperations: Array<{
      id: string,
      operation: string,
      sessionId: string | null,
      priority: number,
      age: number
    }>,
    cooldowns: Array<{
      sessionId: string,
      operation: string,
      remainingMs: number
    }>,
    consecutiveErrors: number
  } {
    const now = Date.now();
    
    return {
      activeOperations: [...this.activeOperations.entries()],
      pendingOperations: this.operationQueue.map(op => ({
        id: op.id,
        operation: op.operation,
        sessionId: op.sessionId,
        priority: op.priority,
        age: now - op.timestamp
      })),
      cooldowns: [...this.cooldowns.entries()].map(([sessionId, { operation, until }]) => ({
        sessionId,
        operation,
        remainingMs: Math.max(0, until - now)
      })),
      consecutiveErrors: this.consecutiveErrors
    };
  }

  /**
   * Execute multiple operations as a single atomic transaction
   * All operations will be queued with the same priority and executed in sequence
   * 
   * @param operations Array of operations to execute
   * @param priority Priority of the transaction (higher = more important)
   * @param timeoutMs Optional timeout for each operation (will use default if not specified)
   * @returns Promise that resolves when all operations complete
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
    if (operations.length === 0) return;
    
    // Group operations by session ID to ensure correct sequencing
    const sessionGroups = new Map<string | null, typeof operations>();
    
    // Add a special group for global operations (null sessionId)
    sessionGroups.set(null, []);
    
    // Group operations by sessionId
    for (const op of operations) {
      const key = op.sessionId || null;
      if (!sessionGroups.has(key)) {
        sessionGroups.set(key, []);
      }
      sessionGroups.get(key)!.push(op);
    }
    
    // Process global operations first
    const globalOps = sessionGroups.get(null) || [];
    if (globalOps.length > 0) {
      console.log(`[SessionSync] Transaction: Processing ${globalOps.length} global operations`);
      for (const op of globalOps) {
        await this.queueOperation(op.operation, op.sessionId, op.callback, priority, timeoutMs);
      }
      sessionGroups.delete(null);
    }
    
    // Then process each session's operations sequentially
    for (const [sessionId, ops] of sessionGroups.entries()) {
      if (ops.length === 0) continue;
      
      console.log(`[SessionSync] Transaction: Processing ${ops.length} operations for session ${sessionId}`);
      
      for (const op of ops) {
        try {
          await this.queueOperation(op.operation, op.sessionId, op.callback, priority, timeoutMs);
        } catch (error) {
          console.error(`[SessionSync] Transaction: Error in operation for session ${sessionId}:`, error);
          throw error; // Rethrow to abort transaction
        }
      }
    }
    
    console.log(`[SessionSync] Transaction: All operations completed successfully`);
  }

  /**
   * Get a session by ID directly from the database
   * This is used as a fallback in case the normal session loading gets stuck
   */
  public async getSessionById(sessionId: string): Promise<Session | null> {
    if (!sessionId) return null;
    
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: any = null;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`[SessionSync] Getting session ${sessionId} directly from database (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Use fetch API instead of direct database access to avoid Node.js modules in browser
        const response = await safeFetch(`/api/session?id=${encodeURIComponent(sessionId)}`);
        
        if (!response.ok) {
          throw new Error(`Error fetching session: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.session) {
          console.log(`[SessionSync] Successfully retrieved session ${sessionId} on attempt ${retryCount + 1}`);
          return data.session;
        } else {
          throw new Error('Session data not found in response');
        }
      } catch (error) {
        lastError = error;
        console.error(`[SessionSync] Error getting session ${sessionId} (attempt ${retryCount + 1}/${maxRetries}):`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          // Wait before retrying (exponential backoff)
          const waitTime = 500 * Math.pow(2, retryCount - 1);
          console.log(`[SessionSync] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    console.error(`[SessionSync] Failed to get session ${sessionId} after ${maxRetries} attempts. Last error:`, lastError);
    return null;
  }

  /**
   * Reliably load a session directly with high priority
   * This bypasses normal queue mechanisms when a session is stuck
   */
  public async forceLoadSession(sessionId: string): Promise<Session | null> {
    if (!sessionId) return null;
    
    try {
      console.log(`[SessionSync] Force loading session ${sessionId}`);
      
      // First clear any stuck operations for this session
      this.clearStuckSession(sessionId);
      
      // Try to get the session directly from DB
      const session = await this.getSessionById(sessionId);
      if (!session) {
        console.error(`[SessionSync] Could not force load session ${sessionId}: Session not found in database`);
        return null;
      }
      
      // Set appropriate completion timestamps to prevent any confusion
      this.lastCompletedOperations.set(`${sessionId}-load`, Date.now());
      
      console.log(`[SessionSync] Successfully force loaded session ${sessionId}`);
      return session;
    } catch (error) {
      console.error(`[SessionSync] Error force loading session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Updates the state fields of a session without saving the entire session
   * Useful for partial updates like when auto-saving form fields
   * 
   * @param sessionId Session ID to update
   * @param sessionData Partial session data to update
   * @returns Promise that resolves when the operation completes
   */
  public async updateSessionState(sessionId: string, sessionData: Partial<Session>): Promise<void> {
    // Check if we have a session ID
    if (!sessionId) {
      throw new Error('Session ID is required for updating');
    }
    
    // Try to check if the session exists first
    try {
      const sessionExists = await this.getSessionById(sessionId);
      if (!sessionExists) {
        throw new Error(`Session not found: ${sessionId}`);
      }
    } catch (error) {
      // If we can't verify the session, we'll still try the update operation
      console.warn(`[SessionSync] Error checking session ${sessionId}:`, error);
    }
    
    // Maximum retries for database errors
    const MAX_RETRIES = 5;
    let attemptCount = 0;
    
    return this.queueOperation(
      'save',
      sessionId,
      async () => {
        while (attemptCount < MAX_RETRIES) {
          try {
            // If we've already retried, try to fix database permissions before next attempt
            if (attemptCount > 0) {
              try {
                // Call the API to fix permissions
                const fixResponse = await fetch('/api/database-maintenance/fix-permissions', {
                  method: 'POST',
                });
                
                if (fixResponse.ok) {
                  console.log(`[SessionSync] Database permissions fix attempted before retry ${attemptCount}`);
                }
              } catch (fixErr) {
                console.warn(`[SessionSync] Error attempting to fix database permissions:`, fixErr);
              }
              
              // Add an exponential backoff delay before retrying
              const delay = Math.min(500 * Math.pow(2, attemptCount - 1), 5000);
              console.log(`[SessionSync] Retrying session update (${attemptCount}/${MAX_RETRIES}) after ${delay}ms delay`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Use the API route to update session state
            const response = await fetch(`/api/session/${sessionId}/state`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(sessionData),
            });
            
            if (!response.ok) {
              let errorMsg = `Failed to update session state: ${response.statusText}`;
              let isRetryableError = false;
              let errorCode = '';
              
              try {
                const data = await response.json();
                if (data.error) {
                  errorMsg = data.error;
                  if (data.code) {
                    errorCode = data.code;
                  }
                  
                  // Determine if this is a retryable error
                  isRetryableError = 
                    errorMsg.includes('SQLITE_READONLY') || 
                    errorMsg.includes('readonly database') ||
                    errorMsg.includes('database is locked') ||
                    errorMsg.includes('SQLITE_BUSY') ||
                    errorMsg.includes('Unknown database error') ||
                    errorMsg.includes('disk I/O error') ||
                    response.status === 503;
                } else if (data.message) {
                  errorMsg = data.message;
                }
              } catch (jsonErr) {
                // Could not parse JSON response
                console.error(`[SessionSync] Could not parse error response:`, jsonErr);
                // Assume it's retryable if we can't parse the response
                isRetryableError = true;
              }
              
              // If this is a retryable error and we have retries left
              if (isRetryableError && attemptCount < MAX_RETRIES - 1) {
                attemptCount++;
                console.warn(`[SessionSync] Database error detected, retrying (${attemptCount}/${MAX_RETRIES}): ${errorMsg} [${errorCode}]`);
                continue;
              }
              
              // Log the detailed error
              console.error(`[SessionSync] Error updating session ${sessionId}:`, errorMsg);
              throw new Error(errorMsg);
            }
            
            // Success, exit the retry loop
            console.log(`[SessionSync] Successfully updated session ${sessionId}`);
            break;
          } catch (error) {
            // Check if this is a retryable database error
            const errorStr = String(error);
            const isRetryableError = 
              errorStr.includes('SQLITE_READONLY') || 
              errorStr.includes('readonly database') ||
              errorStr.includes('database is locked') ||
              errorStr.includes('SQLITE_BUSY') ||
              errorStr.includes('Unknown database error') ||
              errorStr.includes('disk I/O error') ||
              errorStr.includes('network error');
            
            if (isRetryableError && attemptCount < MAX_RETRIES - 1) {
              attemptCount++;
              console.warn(`[SessionSync] Retryable error caught, retrying (${attemptCount}/${MAX_RETRIES}): ${errorStr}`);
              continue;
            }
            
            // If not a retryable error or we've exhausted retries, rethrow
            console.error(`[SessionSync] Error in updateSessionState for ${sessionId}:`, error);
            throw error;
          }
        }
      },
      2 // Medium priority
    );
  }

  /**
   * Forcibly clear a session that might be stuck
   * This is a public method that can be called directly to recover a session
   */
  public clearStuckSession(sessionId: string | null): void {
    if (!sessionId) return;
    
    console.warn(`[SessionSync] Manually clearing potentially stuck session: ${sessionId}`);
    
    // Remove from active operations
    if (this.activeOperations.has(sessionId)) {
      console.warn(`[SessionSync] Removing session ${sessionId} from active operations`);
      this.activeOperations.delete(sessionId);
    }
    
    // Remove any pending operations for this session
    const pendingOpsForSession = this.operationQueue.filter(op => op.sessionId === sessionId);
    if (pendingOpsForSession.length > 0) {
      console.warn(`[SessionSync] Resolving ${pendingOpsForSession.length} pending operations for session ${sessionId}`);
      
      // Force resolve all pending operations for this session
      // This prevents the queue from getting stuck
      this.operationQueue = this.operationQueue.filter(op => {
        if (op.sessionId === sessionId) {
          try {
            // Resolve the operation to allow other operations to proceed
            op.resolve();
            return false; // Remove from queue
          } catch (err) {
            console.error(`[SessionSync] Error resolving pending operation for session ${sessionId}:`, err);
            return false; // Still remove from queue
          }
        }
        return true; // Keep in queue
      });
    }
    
    // Set completion timestamp to prevent duplicate operations
    this.lastCompletedOperations.set(`${sessionId}-load`, Date.now());
    this.lastCompletedOperations.set(`${sessionId}-save`, Date.now());
    this.lastCompletedOperations.set(`${sessionId}-delete`, Date.now());
    
    // Restart queue processing if there are pending operations
    if (this.operationQueue.length > 0 && !this.processingQueue) {
      this.processQueue();
    }
  }

  /**
   * Update a session's project directory
   */
  public async updateSessionProjectDirectory(sessionId: string, projectDirectory: string): Promise<void> {
    console.log(`[SessionSync] Updating project directory for session ${sessionId} to ${projectDirectory}`);
    
    return this.queueOperation(
      'save',
      sessionId,
      async () => {
        const response = await safeFetch(`/actions/session-actions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'updateSessionProjectDirectory',
            sessionId,
            projectDirectory
          })
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to update session project directory');
        }
      },
      2 // Medium priority
    );
  }

  /**
   * Set the active session for a project
   */
  public async setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
    console.log(`[SessionSync] Setting active session for project ${projectDirectory} to ${sessionId || 'null'}`);
    
    return this.queueOperation(
      'save',
      sessionId, // Use the session ID as the operation key
      async () => {
        const response = await safeFetch(`/api/project-state`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            projectDirectory,
            key: 'activeSessionId',
            value: sessionId
          })
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to set active session');
        }
      },
      2 // Medium priority
    );
  }
}

// Export the singleton instance
export const sessionSyncService = SessionSyncService.getInstance();