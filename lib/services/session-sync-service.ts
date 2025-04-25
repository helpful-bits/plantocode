/**
 * Session Synchronization Service
 * 
 * Provides a centralized mechanism to coordinate session operations
 * and prevent race conditions between multiple components accessing
 * the same session state.
 */

import { Session } from '@/types';

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

interface SessionOperation {
  id: string;
  operation: 'load' | 'save' | 'delete';
  sessionId: string | null;
  timestamp: number;
  priority: number; // Higher number = higher priority
  callback: SessionCallback;
  resolve: () => void;
  reject: (error: Error) => void;
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

  private constructor() {
    // Start the queue processor
    this.processQueue();
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
   * Queue a session operation with proper synchronization
   * 
   * @param operation Type of operation (load, save, delete)
   * @param sessionId Session ID (or null for new session operations)
   * @param callback The callback function to execute
   * @param priority Priority of the operation (higher = more important)
   * @returns Promise that resolves when operation completes
   */
  public async queueOperation(
    operation: 'load' | 'save' | 'delete',
    sessionId: string | null,
    callback: SessionCallback,
    priority: number = 1
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
      
      // Add to queue
      this.operationQueue.push({
        id: opId,
        operation,
        sessionId,
        timestamp: Date.now(),
        priority,
        callback,
        resolve,
        reject
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
    
    try {
      while (this.operationQueue.length > 0) {
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
          
          // Define which operations can run concurrently
          const canRun = (
            // Loading can run during saving
            (op.operation === 'load' && currentState === 'saving') ||
            // No other combinations allowed
            false
          );
          
          if (!canRun) {
            console.log(`[SessionSync] Session ${op.sessionId} is busy with ${currentState}, can't ${op.operation} yet`);
            // Don't remove from queue, try again later
            break;
          }
        }
        
        // Remove from queue immediately to prevent double-processing
        this.operationQueue.shift();
        
        // Mark as active
        if (op.sessionId) {
          this.activeOperations.set(op.sessionId, this.getOperationState(op.operation));
        }
        
        try {
          console.log(`[SessionSync] Executing ${op.operation} for session ${op.sessionId || 'new'}`);
          await op.callback();
          
          // Mark as completed
          if (op.sessionId) {
            this.lastCompletedOperations.set(`${op.sessionId}-${op.operation}`, Date.now());
          }
          
          op.resolve();
        } catch (error) {
          console.error(`[SessionSync] Error during ${op.operation} for session ${op.sessionId || 'new'}:`, error);
          const sessionError = new SessionOperationError(
            `Error during ${op.operation} operation${op.sessionId ? ` for session ${op.sessionId}` : ''}`,
            op.operation,
            op.sessionId,
            error
          );
          op.reject(sessionError);
        } finally {
          // Clear active status
          if (op.sessionId) {
            this.activeOperations.delete(op.sessionId);
          }
        }
      }
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
    }>
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
      }))
    };
  }

  /**
   * Execute multiple operations as a single atomic transaction
   * All operations will be queued with the same priority and executed in sequence
   * 
   * @param operations Array of operations to execute
   * @param priority Priority of the transaction (higher = more important)
   * @returns Promise that resolves when all operations complete
   */
  public async executeTransaction(
    operations: Array<{
      operation: 'load' | 'save' | 'delete',
      sessionId: string | null,
      callback: SessionCallback
    }>,
    priority: number = 3
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
        await this.queueOperation(op.operation, op.sessionId, op.callback, priority);
      }
      sessionGroups.delete(null);
    }
    
    // Then process each session's operations sequentially
    for (const [sessionId, ops] of sessionGroups.entries()) {
      if (ops.length === 0) continue;
      
      console.log(`[SessionSync] Transaction: Processing ${ops.length} operations for session ${sessionId}`);
      
      for (const op of ops) {
        try {
          await this.queueOperation(op.operation, op.sessionId, op.callback, priority);
        } catch (error) {
          console.error(`[SessionSync] Transaction: Error in operation for session ${sessionId}:`, error);
          throw error; // Rethrow to abort transaction
        }
      }
    }
    
    console.log(`[SessionSync] Transaction: All operations completed successfully`);
  }
}

// Export the singleton instance
export const sessionSyncService = SessionSyncService.getInstance();