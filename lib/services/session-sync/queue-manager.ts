/**
 * Queue Manager for Session Sync Service
 * 
 * Manages the queue of session operations, ensuring they're processed in order
 * according to priority and session state.
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionCallback, SessionOperation, OperationTimeoutError, QueuedOperation } from '@/lib/services/session-sync/types';

// Default timeout for operations (1 minute)
const DEFAULT_OPERATION_TIMEOUT = 60000;

// Operation-specific timeout values in milliseconds
const OPERATION_TIMEOUTS = {
  load: 90000,    // 1.5 minutes for load operations (reduced from 2 minutes)
  save: 60000,    // 1 minute for save operations (reduced from 1.5 minutes)
  delete: 30000,  // 30 seconds for delete operations (reduced from 1 minute)
  setActive: 30000 // 30 seconds for setActive operations
};

// Maximum time an operation can be in the "processing" state before considered stuck
const MAX_PROCESSING_TIME = 120000; // 2 minutes

// Tracking of operations being processed
const processingOperations = new Map<string, {
  operation: SessionOperation,
  startTime: number
}>();

/**
 * Service options for the queue manager
 */
export interface ServiceOptions {
  operationDequeueCallback: (operation: SessionOperation) => Promise<any>;
  maxConcurrentOperations: number;
  processingIntervalMs?: number;
  operationLockTimeoutMs?: number;
}

// Default service options
const DEFAULT_SERVICE_OPTIONS: ServiceOptions = {
  operationDequeueCallback: async () => {},
  maxConcurrentOperations: 2,
  processingIntervalMs: 100,
  operationLockTimeoutMs: 5000
};

/**
 * Interface for the queue manager
 */
export interface QueueManager {
  getQueueStats(): {
    pendingOperations: SessionOperation[];
    priorityGroups: Record<number, number>;
    size: number;
  };
  size(): number;
  enqueue(operation: SessionOperation): void;
  dequeue(): SessionOperation | undefined;
  isEmpty(): boolean;
  clear(): void;
  resetQueue(): void;
  queueOperation(
    operation: 'load' | 'save' | 'delete' | 'setActive',
    sessionId: string | null,
    callback: SessionCallback,
    priority?: number,
    timeoutMs?: number
  ): Promise<any>;
  clearSessionOperations(
    sessionId: string | null, 
    operationTypes?: Array<'load' | 'save' | 'delete' | 'setActive'>,
    preserveInProgress?: boolean
  ): number;
  setServiceOptions(options: ServiceOptions): void;
  registerOperationCompletion(operationId: string, result: any, error?: Error): void;
  requestQueueRefresh(adjustPriorities?: boolean): void;
  _processQueue(): void;
  _processOperation(operation: SessionOperation): void;
  cleanupStuckOperations(): void;
  adjustSessionOperationPriorities(): void;
}

/**
 * Create a new queue manager
 */
export function createQueueManager(): QueueManager {
  // Queue of operations
  const queue: SessionOperation[] = [];
  
  // Store promises for operations to resolve them when they complete
  const operationPromises = new Map<string, { 
    resolve: (value: any) => void, 
    reject: (error: Error) => void,
    timeoutId?: NodeJS.Timeout
  }>();
  
  // Service options with defaults
  let serviceOptions: ServiceOptions = DEFAULT_SERVICE_OPTIONS;
  
  // Processing timer
  let processingTimer: NodeJS.Timeout | null = null;
  
  // Flag to track if we're currently processing the queue
  let isProcessingQueue = false;
  
  // Tracking active operations to prevent too many concurrent operations
  let activeOperationCount = 0;
  
  // Last cleanup time for stuck operations
  let lastStuckOperationCleanupTime = Date.now();
  
  return {
    /**
     * Get stats about the queue
     */
    getQueueStats() {
      // Count operations by priority
      const priorityGroups: Record<number, number> = {};
      
      queue.forEach(op => {
        if (!priorityGroups[op.priority]) {
          priorityGroups[op.priority] = 0;
        }
        priorityGroups[op.priority]++;
      });
      
      return {
        pendingOperations: [...queue], // Copy to prevent external modification
        priorityGroups,
        size: queue.length
      };
    },
    
    /**
     * Get the number of operations in the queue
     */
    size() {
      return queue.length;
    },
    
    /**
     * Add an operation to the queue
     */
    enqueue(operation: SessionOperation) {
      // Validate operation
      if (!operation.type || !operation.id || (operation.sessionId !== null && typeof operation.sessionId !== 'string')) {
        console.error(`[QueueManager] Invalid operation rejected:`, operation);
        return;
      }
      
      queue.push(operation);
      // Sort the queue by priority (high to low) and then by timestamp (low to high)
      queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.addedAt - b.addedAt; // Earlier timestamp first
      });
      
      console.log(`[QueueManager] Added operation ${operation.id} to queue, new size: ${queue.length}`);
    },
    
    /**
     * Remove and return the next operation from the queue
     * with improved session priority logic
     */
    dequeue() {
      if (queue.length === 0) {
        return undefined;
      }
      
      // First check for any operations that should be prioritized
      // to prevent starvation of sessions
      const now = Date.now();
      const TIME_THRESHOLD = 10000; // 10 seconds
      
      // Group operations by session ID to check for potential issues
      const sessionGroups = new Map<string, SessionOperation[]>();
      for (const op of queue) {
        const key = op.sessionId || 'new';
        if (!sessionGroups.has(key)) {
          sessionGroups.set(key, []);
        }
        sessionGroups.get(key)!.push(op);
      }
      
      // Check for sessions with both load and save operations which could lead to deadlocks
      let potentialDeadlockSession: string | null = null;
      sessionGroups.forEach((operations, sessionId) => {
        const hasLoad = operations.some(op => op.type === 'load');
        const hasSave = operations.some(op => op.type === 'save');
        
        if (hasLoad && hasSave) {
          potentialDeadlockSession = sessionId;
          console.warn(`[QueueManager] Potential deadlock detected for session ${sessionId}: has both load and save operations pending`);
        }
      });
      
      // IMPROVED SESSION HANDLING: Better deadlock detection and resolution
      if (potentialDeadlockSession) {
        const sessionOps = sessionGroups.get(potentialDeadlockSession) || [];
        console.log(`[QueueManager] Analyzing ${sessionOps.length} operations for deadlock-prone session ${potentialDeadlockSession}`);
        
        // Check the timing pattern of these operations
        if (sessionOps.length >= 2) {
          // Sort by timestamp (oldest first)
          const sortedOps = [...sessionOps].sort((a, b) => a.addedAt - b.addedAt);
          
          // Look at the operation types in order of arrival to understand the sequence
          const operationSequence = sortedOps.map(op => op.type);
          console.log(`[QueueManager] Operation sequence for session ${potentialDeadlockSession}: ${operationSequence.join(' → ')}`);
          
          // Different strategies based on operation patterns:
          
          // Pattern 1: save → load → save
          // In this case, we want to process a save first, then load, then remaining saves
          if (operationSequence[0] === 'save' && operationSequence.includes('load')) {
            // Find the first save operation
            const firstSaveIndex = queue.findIndex(op => 
              op.sessionId === potentialDeadlockSession && op.type === 'save' &&
              op.addedAt === sortedOps[0].addedAt
            );
            
            if (firstSaveIndex !== -1) {
              console.log(`[QueueManager] Prioritizing initial save operation for session ${potentialDeadlockSession} to resolve deadlock pattern (save → load → save)`);
              return queue.splice(firstSaveIndex, 1)[0];
            }
          }
          
          // Pattern 2: load → save → load
          // In this case, we prefer to process the loads first before saves
          if (operationSequence[0] === 'load') {
            // Find the oldest load operation
            const oldestLoadIndex = queue.findIndex(op => 
              op.sessionId === potentialDeadlockSession && op.type === 'load' &&
              op.addedAt === sortedOps[0].addedAt
            );
            
            if (oldestLoadIndex !== -1) {
              console.log(`[QueueManager] Prioritizing oldest load operation for session ${potentialDeadlockSession} to resolve deadlock pattern (load → save → load)`);
              return queue.splice(oldestLoadIndex, 1)[0];
            }
          }
          
          // Default deadlock resolution: Process loads first, as they're likely to unblock the session
          const loadOpIndex = queue.findIndex(op => 
            op.sessionId === potentialDeadlockSession && op.type === 'load');
          
          if (loadOpIndex !== -1) {
            console.log(`[QueueManager] Prioritizing load operation for session ${potentialDeadlockSession} to break potential deadlock`);
            return queue.splice(loadOpIndex, 1)[0];
          }
        }
      }
      
      // Check for sessions with multiple operations of the same type
      // and process them in a more intelligent way
      for (const [sessionId, operations] of sessionGroups.entries()) {
        if (operations.length > 1) {
          // Group by operation type
          const loadOps = operations.filter(op => op.type === 'load');
          const saveOps = operations.filter(op => op.type === 'save');
          const deleteOps = operations.filter(op => op.type === 'delete');
          
          // For multiple save operations, prioritize them based on recency
          if (saveOps.length > 1) {
            // Sort saves by priority first, then by time (newest first for same priority)
            saveOps.sort((a, b) => {
              if (a.priority !== b.priority) return b.priority - a.priority;
              return b.addedAt - a.addedAt;
            });
            
            // Pick the highest priority, most recent save
            const highestPrioritySave = saveOps[0];
            
            // Find this save in the actual queue
            const saveOpIndex = queue.findIndex(op => op.id === highestPrioritySave.id);
            
            if (saveOpIndex !== -1) {
              console.log(`[QueueManager] For session ${sessionId} with ${saveOps.length} pending saves, prioritizing highest priority save (${highestPrioritySave.priority}) from ${new Date(highestPrioritySave.addedAt).toISOString()}`);
              return queue.splice(saveOpIndex, 1)[0];
            }
          }
          
          // For multiple load operations, just process the oldest one first
          if (loadOps.length > 1) {
            // Find the oldest load by time
            const oldestLoad = loadOps.sort((a, b) => a.addedAt - b.addedAt)[0];
            
            // Find this load in the actual queue
            const loadOpIndex = queue.findIndex(op => op.id === oldestLoad.id);
            
            if (loadOpIndex !== -1) {
              console.log(`[QueueManager] For session ${sessionId} with ${loadOps.length} pending loads, prioritizing oldest load from ${new Date(oldestLoad.addedAt).toISOString()}`);
              return queue.splice(loadOpIndex, 1)[0];
            }
          }
        }
      }
      
      // Check for session switching scenario (Session B load while Session A save)
      // Identify 'load' operations for new sessions when there are pending 'save' operations for other sessions
      const loadOps = queue.filter(op => op.type === 'load');
      if (loadOps.length > 0) {
        // Get all sessions with pending save operations
        const sessionsWithSaveOps = new Set<string>();
        queue.forEach(op => {
          if (op.type === 'save' && op.sessionId !== null) {
            sessionsWithSaveOps.add(op.sessionId);
          }
        });
        
        // Find a load operation for a different session than the ones being saved
        const loadOpForDifferentSession = loadOps.find(loadOp => {
          // If this is a load for a new session (null) or a session that doesn't have pending saves
          return loadOp.sessionId === null || !sessionsWithSaveOps.has(loadOp.sessionId);
        });
        
        // If found, prioritize this load to facilitate session switching
        if (loadOpForDifferentSession) {
          const loadOpIndex = queue.findIndex(op => op.id === loadOpForDifferentSession.id);
          if (loadOpIndex !== -1) {
            console.log(`[QueueManager] Prioritizing load operation for session ${loadOpForDifferentSession.sessionId || 'new'} to facilitate session switching`);
            return queue.splice(loadOpIndex, 1)[0];
          }
        }
      }
      
      // Check for operations that have been waiting too long
      // and prioritize them to prevent starvation
      const oldestOpIndex = queue.findIndex(op => (now - op.addedAt) > TIME_THRESHOLD);
      if (oldestOpIndex !== -1) {
        console.log(`[QueueManager] Prioritizing operation waiting for ${(now - queue[oldestOpIndex].addedAt) / 1000}s`);
        return queue.splice(oldestOpIndex, 1)[0];
      }
      
      // Default to standard priority-based dequeue
      return queue.shift();
    },
    
    /**
     * Check if the queue is empty
     */
    isEmpty() {
      return queue.length === 0;
    },
    
    /**
     * Clear the queue
     */
    clear() {
      // Reject all pending promises with error
      operationPromises.forEach((promise, opId) => {
        if (promise.timeoutId) {
          clearTimeout(promise.timeoutId);
        }
        promise.reject(new Error(`Operation canceled due to queue clear`));
      });
      
      operationPromises.clear();
      queue.length = 0;
    },
    
    /**
     * Reset the queue
     */
    resetQueue() {
      this.clear();
    },
    
    /**
     * Update service options
     */
    setServiceOptions(options: ServiceOptions) {
      // Merge with default options to ensure all properties exist
      serviceOptions = {
        ...DEFAULT_SERVICE_OPTIONS,
        ...options
      };
      console.log('[QueueManager] Service options updated:', serviceOptions);
    },
    
    /**
     * Register operation completion
     */
    registerOperationCompletion(operationId: string, result: any, error?: Error) {
      const promiseData = operationPromises.get(operationId);
      
      if (promiseData) {
        // Clear timeout if it exists
        if (promiseData.timeoutId) {
          clearTimeout(promiseData.timeoutId);
        }
        
        if (error) {
          promiseData.reject(error);
        } else {
          promiseData.resolve(result);
        }
        
        // Remove from map
        operationPromises.delete(operationId);
        
        // Remove from processing operations map if present
        processingOperations.delete(operationId);
        
        // Decrement active operation count
        activeOperationCount = Math.max(0, activeOperationCount - 1);
        
        console.log(`[QueueManager] Operation ${operationId} completion registered, active operations: ${activeOperationCount}`);
      } else {
        console.warn(`[QueueManager] No promise found for completed operation ${operationId}`);
      }
      
      // Trigger queue processing to handle next operations
      this.requestQueueRefresh();
    },
    
    /**
     * Queue an operation
     */
    async queueOperation(
      operation: 'load' | 'save' | 'delete' | 'setActive',
      sessionId: string | null,
      callback: SessionCallback,
      priority: number = 1,
      timeoutMs?: number
    ): Promise<any> {
      // Validate sessionId
      if (sessionId !== null && typeof sessionId !== 'string') {
        throw new Error(`Invalid sessionId: ${String(sessionId)}`);
      }
      
      return new Promise((resolve, reject) => {
        try {
          // Generate unique operation ID
          const operationId = uuidv4();
          const timestamp = new Date().toISOString();
          
          console.log(`[QueueManager][${timestamp}] 🔄 QUEUEING: ${operation} operation for session ${sessionId || 'new'} (ID: ${operationId}, priority: ${priority})`);
          
          // Set timeout for operation
          const timeout = timeoutMs || OPERATION_TIMEOUTS[operation] || DEFAULT_OPERATION_TIMEOUT;
          
          // Store promise handlers with a timeout
          const timeoutId = setTimeout(() => {
            const timeoutTime = new Date().toISOString();
            // Operation timed out - remove it from the queue if it's still there
            const index = queue.findIndex(op => op.id === operationId);
            if (index !== -1) {
              queue.splice(index, 1);
              console.log(`[QueueManager][${timeoutTime}] ⏱️ Operation ${operationId} timed out and was removed from queue`);
            }
            
            // Check if this operation is being processed (potential hang)
            const isProcessing = processingOperations.has(operationId);
            
            // Log detailed info about the timeout
            console.error(`[QueueManager][${timeoutTime}] ⏱️ TIMEOUT: ${operation} operation ${operationId} timed out after ${timeout}ms for session ${sessionId}`);
            console.error(`[QueueManager][${timeoutTime}] Operation timeout details:`, {
              sessionId: sessionId,
              sessionIdType: typeof sessionId,
              operationType: operation,
              operationId: operationId,
              priority: priority,
              queueSize: queue.length,
              isCurrentlyProcessing: isProcessing,
              processingTime: isProcessing 
                ? `${Date.now() - (processingOperations.get(operationId)?.startTime || 0)}ms` 
                : 'Not started'
            });
            
            // Show operations for this session
            const sessionOps = queue.filter(op => op.sessionId === sessionId);
            if (sessionOps.length > 0) {
              console.error(`[QueueManager][${timeoutTime}] Other queued operations for this session: ${sessionOps.length}`);
              sessionOps.forEach(op => {
                console.error(`[QueueManager][${timeoutTime}]   - ${op.type} (ID: ${op.id}, priority: ${op.priority})`);
              });
            }
            
            // Remove from processing operations
            if (processingOperations.has(operationId)) {
              processingOperations.delete(operationId);
              activeOperationCount = Math.max(0, activeOperationCount - 1);
              console.log(`[QueueManager][${timeoutTime}] ⏱️ Operation ${operationId} was processing for ${Date.now() - (processingOperations.get(operationId)?.startTime || 0)}ms when it timed out`);
            }
            
            // Remove from promises map and reject
            operationPromises.delete(operationId);
            reject(new OperationTimeoutError(`Operation ${operation} timed out after ${timeout}ms`, operation as 'load' | 'save' | 'delete', sessionId));
          }, timeout);
          
          operationPromises.set(operationId, { resolve, reject, timeoutId });
          
          // Create operation object
          const newOperation: SessionOperation = {
            id: operationId,
            type: operation,
            sessionId,
            callback,
            priority,
            addedAt: Date.now()
          };
          
          // Add to queue
          this.enqueue(newOperation);
          
          // Get queue stats
          const queueSize = queue.length;
          const operationsAhead = queue.filter(op => op.id !== operationId && op.priority <= priority).length;
          console.log(`[QueueManager][${timestamp}] Added operation ${operationId} to queue, new size: ${queueSize} (${operationsAhead} operations ahead in queue)`);
          
          // Trigger queue processing
          this.requestQueueRefresh();
        } catch (error) {
          reject(error);
        }
      });
    },
    
    /**
     * Clear operations for a session
     * @param sessionId The session ID to clear operations for
     * @param operationTypes Optional array of operation types to clear (e.g., ['save', 'delete'])
     *                       If not provided, all operation types will be cleared
     * @param preserveInProgress If true, operations currently being processed will not be canceled
     * @returns The number of operations that were cleared
     */
    clearSessionOperations(
      sessionId: string | null, 
      operationTypes?: Array<'load' | 'save' | 'delete' | 'setActive'>,
      preserveInProgress: boolean = false
    ): number {
      // Check for a valid session ID format
      if (sessionId !== null && typeof sessionId !== 'string') {
        console.error(`[QueueManager] Invalid sessionId format in clearSessionOperations: ${typeof sessionId}`);
        return 0;
      }
      
      const timestamp = new Date().toISOString();
      console.log(`[QueueManager][${timestamp}] Clearing operations for session ${sessionId || 'new'}: ` + 
                  `types=${operationTypes ? operationTypes.join(',') : 'all'}, preserveInProgress=${preserveInProgress}`);
      
      const initialQueueSize = queue.length;
      
      // Filter operations for this session (and by type if specified)
      let sessionOperations = queue.filter(op => {
        const matchesSession = op.sessionId === sessionId;
        const matchesType = !operationTypes || operationTypes.includes(op.type as any);
        return matchesSession && matchesType;
      });
      
      if (sessionOperations.length === 0) {
        console.log(`[QueueManager][${timestamp}] No matching operations found to clear for session ${sessionId || 'new'}`);
        return 0;
      }
      
      // Log details about what we're clearing
      console.log(`[QueueManager][${timestamp}] Found ${sessionOperations.length} operations to clear for session ${sessionId || 'new'}:`);
      const typeCount = sessionOperations.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Log a breakdown of operation types
      Object.entries(typeCount).forEach(([type, count]) => {
        console.log(`[QueueManager][${timestamp}]   - ${type}: ${count} operations`);
      });
      
      // Filter save operations separately - we'll handle them differently
      const saveOperations = sessionOperations.filter(op => op.type === 'save');
      const otherOperations = sessionOperations.filter(op => op.type !== 'save');
      
      console.log(`[QueueManager][${timestamp}] Found ${saveOperations.length} save operations and ${otherOperations.length} other operations to clear`);
      
      // Handle save operations - only keep the most recent one for each path/property combination
      if (saveOperations.length > 0) {
        // Get the most recent save operation - the one with the highest sequence number
        const mostRecentSave = saveOperations.reduce((latest, current) => {
          // Handle undefined sequence values by defaulting to 0
          const latestSeq = latest?.sequence || 0;
          const currentSeq = current.sequence || 0;
          return (!latest || currentSeq > latestSeq) ? current : latest;
        }, null as SessionOperation | null);
        
        // Keep only the most recent save operation in the queue
        if (mostRecentSave) {
          console.log(`[QueueManager][${timestamp}] Keeping the most recent save operation: ${mostRecentSave.id}`);
          // Make it highest priority to ensure it completes quickly
          mostRecentSave.priority = 11; // Higher than normal high priority
          // Remove it from our list of operations to remove
          sessionOperations = sessionOperations.filter(op => op.id !== mostRecentSave.id);
        }
      }
      
      // Remove operations for this session from the queue (except the most recent save we want to keep)
      const newQueue = queue.filter(op => {
        // Keep if it's not in our filtered list of operations to remove
        return !sessionOperations.some(removeOp => removeOp.id === op.id);
      });
      
      // Update the queue
      queue.length = 0;
      queue.push(...newQueue);
      
      const clearedQueueCount = initialQueueSize - queue.length;
      console.log(`[QueueManager][${timestamp}] Removed ${clearedQueueCount} operations from queue for session ${sessionId || 'new'}`);
      
      // Reject promises for the operations we're removing
      let rejectedPromisesCount = 0;
      sessionOperations.forEach(op => {
        const promiseData = operationPromises.get(op.id);
        if (promiseData) {
          if (promiseData.timeoutId) {
            clearTimeout(promiseData.timeoutId);
          }
          
          // Create a descriptive error message with operation details to help with debugging
          const errorMessage = `Operation ${op.type} (ID: ${op.id}) canceled during session clear: ${sessionId || 'new'}`;
          promiseData.reject(new Error(errorMessage));
          operationPromises.delete(op.id);
          rejectedPromisesCount++;
        }
      });
      
      console.log(`[QueueManager][${timestamp}] Rejected ${rejectedPromisesCount} promises for cleared operations`);
      
      // Clean up processing operations for this session (unless preserveInProgress is true)
      if (!preserveInProgress) {
        let canceledProcessingCount = 0;
        const processingOpIds: string[] = [];
        
        processingOperations.forEach((data, opId) => {
          const op = data.operation;
          const matchesSession = op.sessionId === sessionId;
          const matchesType = !operationTypes || operationTypes.includes(op.type as any);
          
          if (matchesSession && matchesType) {
            processingOpIds.push(opId);
            processingOperations.delete(opId);
            
            // Adjust active operation count
            activeOperationCount = Math.max(0, activeOperationCount - 1);
            canceledProcessingCount++;
          }
        });
        
        if (canceledProcessingCount > 0) {
          console.log(`[QueueManager][${timestamp}] Canceled ${canceledProcessingCount} in-progress operations for session ${sessionId || 'new'}:`, processingOpIds);
        }
      } else {
        // Just log the in-progress operations we're preserving
        const inProgressOps = Array.from(processingOperations.entries())
          .filter(([_, data]) => data.operation.sessionId === sessionId)
          .map(([opId, data]) => ({
            id: opId,
            type: data.operation.type,
            runningFor: `${Date.now() - data.startTime}ms`
          }));
          
        if (inProgressOps.length > 0) {
          console.log(`[QueueManager][${timestamp}] Preserving ${inProgressOps.length} in-progress operations for session ${sessionId || 'new'}:`, inProgressOps);
        }
      }
      
      return clearedQueueCount;
    },
    
    /**
     * Request queue processing refresh
     * Optionally performs priority adjustments for operations on the same session
     */
    requestQueueRefresh(adjustPriorities: boolean = false) {
      if (processingTimer) {
        clearTimeout(processingTimer);
      }
      
      // If requested, adjust priorities of operations for the same session
      // to optimize processing order
      if (adjustPriorities && queue.length > 1) {
        this.adjustSessionOperationPriorities();
      }
      
      processingTimer = setTimeout(() => {
        this._processQueue();
      }, serviceOptions.processingIntervalMs || 100);
    },
    
    /**
     * Adjusts operation priorities for operations on the same session
     * to help prevent state transition issues
     */
    adjustSessionOperationPriorities() {
      // Group operations by session ID
      const sessionGroups = new Map<string, SessionOperation[]>();
      for (const op of queue) {
        const key = op.sessionId || 'new';
        if (!sessionGroups.has(key)) {
          sessionGroups.set(key, []);
        }
        sessionGroups.get(key)!.push(op);
      }
      
      // Only process sessions with multiple operations
      sessionGroups.forEach((operations, sessionId) => {
        if (operations.length > 1) {
          console.log(`[QueueManager] Adjusting priorities for session ${sessionId} with ${operations.length} operations`);
          
          // Group by operation type
          const loadOps = operations.filter(op => op.type === 'load');
          const saveOps = operations.filter(op => op.type === 'save');
          const deleteOps = operations.filter(op => op.type === 'delete');
          
          // When there are mixed operation types, we need to be careful about ordering
          if (loadOps.length > 0 && saveOps.length > 0) {
            console.log(`[QueueManager] Mixed operation types detected for session ${sessionId}: loads=${loadOps.length}, saves=${saveOps.length}`);
            
            // Sort operations by age (oldest first)
            const sortedOps = [...operations].sort((a, b) => a.addedAt - b.addedAt);
            
            // Get the operation sequence (oldest to newest)
            const sequence = sortedOps.map(op => op.type);
            console.log(`[QueueManager] Operation sequence for session ${sessionId}: ${sequence.join(' → ')}`);
            
            // Check for patterns and apply appropriate priority adjustments
            
            // Pattern: save → load (common when switching sessions)
            // Priority: Complete save before load
            if (sequence[0] === 'save' && sequence.includes('load')) {
              console.log(`[QueueManager] Applying save → load pattern priority adjustments for session ${sessionId}`);
              
              // Boost priority of the first save
              const oldestSave = saveOps.sort((a, b) => a.addedAt - b.addedAt)[0];
              oldestSave.priority = Math.max(oldestSave.priority, 8);
              console.log(`[QueueManager] Boosted priority of oldest save (ID: ${oldestSave.id}) to ${oldestSave.priority}`);
              
              // Reduce priority of intermediate saves (if any)
              if (saveOps.length > 1) {
                // Sort by timestamp (oldest first)
                const sortedSaves = [...saveOps].sort((a, b) => a.addedAt - b.addedAt);
                
                // Skip the first one (we already boosted it) and adjust intermediates
                for (let i = 1; i < sortedSaves.length; i++) {
                  const oldPriority = sortedSaves[i].priority;
                  sortedSaves[i].priority = Math.min(oldPriority, 3);
                  console.log(`[QueueManager] Reduced priority of intermediate save (ID: ${sortedSaves[i].id}) from ${oldPriority} to ${sortedSaves[i].priority}`);
                }
              }
            }
            
            // Pattern: load → save (common during normal operation)
            // Priority: Complete load before save to avoid data loss
            else if (sequence[0] === 'load' && sequence.includes('save')) {
              console.log(`[QueueManager] Applying load → save pattern priority adjustments for session ${sessionId}`);
              
              // Boost priority of the first load
              const oldestLoad = loadOps.sort((a, b) => a.addedAt - b.addedAt)[0];
              oldestLoad.priority = Math.max(oldestLoad.priority, 7);
              console.log(`[QueueManager] Boosted priority of oldest load (ID: ${oldestLoad.id}) to ${oldestLoad.priority}`);
              
              // If there are multiple loads followed by saves, process the first load first
              if (loadOps.length > 1) {
                // Sort by timestamp (oldest first)
                const sortedLoads = [...loadOps].sort((a, b) => a.addedAt - b.addedAt);
                
                // Skip the first one (we already boosted it) and adjust others
                for (let i = 1; i < sortedLoads.length; i++) {
                  const oldPriority = sortedLoads[i].priority;
                  
                  // See if this load is newer than any save, if so it should be lower priority
                  const isNewerThanSave = saveOps.some(save => sortedLoads[i].addedAt > save.addedAt);
                  
                  if (isNewerThanSave) {
                    sortedLoads[i].priority = Math.min(oldPriority, 2);
                    console.log(`[QueueManager] Reducing priority of load (ID: ${sortedLoads[i].id}) that is newer than a save from ${oldPriority} to ${sortedLoads[i].priority}`);
                  }
                }
              }
            }
          }
          // For multiple operations of the same type, handle more simply
          else if (saveOps.length > 1) {
            console.log(`[QueueManager] Multiple saves detected for session ${sessionId}: saves=${saveOps.length}`);
            
            // For multiple saves, prioritize the newest ones (they have latest data)
            // and lower the priority of older ones
            
            // Sort by timestamp (newest first)
            const sortedSaves = [...saveOps].sort((a, b) => b.addedAt - a.addedAt);
            
            // Boost priority of the most recent save
            const newestSave = sortedSaves[0];
            newestSave.priority = Math.max(newestSave.priority, 6);
            console.log(`[QueueManager] Boosted priority of newest save (ID: ${newestSave.id}) to ${newestSave.priority}`);
            
            // Lower priority of older saves (except the oldest which we might want to keep)
            if (sortedSaves.length > 2) {
              for (let i = 1; i < sortedSaves.length - 1; i++) {
                const oldPriority = sortedSaves[i].priority;
                sortedSaves[i].priority = Math.min(oldPriority, 2);
                console.log(`[QueueManager] Reduced priority of intermediate save (ID: ${sortedSaves[i].id}) from ${oldPriority} to ${sortedSaves[i].priority}`);
              }
            }
          }
          else if (loadOps.length > 1) {
            console.log(`[QueueManager] Multiple loads detected for session ${sessionId}: loads=${loadOps.length}`);
            
            // For multiple loads, typically we want the oldest one to complete first
            
            // Sort by timestamp (oldest first)
            const sortedLoads = [...loadOps].sort((a, b) => a.addedAt - b.addedAt);
            
            // Boost priority of the oldest load
            const oldestLoad = sortedLoads[0];
            oldestLoad.priority = Math.max(oldestLoad.priority, 5);
            console.log(`[QueueManager] Boosted priority of oldest load (ID: ${oldestLoad.id}) to ${oldestLoad.priority}`);
            
            // Lower priority of newer loads
            if (sortedLoads.length > 1) {
              for (let i = 1; i < sortedLoads.length; i++) {
                const oldPriority = sortedLoads[i].priority;
                sortedLoads[i].priority = Math.min(oldPriority, 2);
                console.log(`[QueueManager] Reduced priority of newer load (ID: ${sortedLoads[i].id}) from ${oldPriority} to ${sortedLoads[i].priority}`);
              }
            }
          }
        }
      });
      
      // Re-sort the queue by priority since we've adjusted priorities
      queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.addedAt - b.addedAt; // Earlier timestamp first
      });
      
      console.log(`[QueueManager] Queue re-sorted after priority adjustments`);
    },
    
    /**
     * Process the queue
     */
    _processQueue() {
      // If already processing, don't start another processing cycle
      if (isProcessingQueue) {
        return;
      }
      
      isProcessingQueue = true;
      
      try {
        // Check for stuck operations periodically
        const now = Date.now();
        if (now - lastStuckOperationCleanupTime > 30000) { // Check every 30 seconds
          this.cleanupStuckOperations();
          lastStuckOperationCleanupTime = now;
        }
        
        // Check if we're at max concurrent operations
        if (activeOperationCount >= serviceOptions.maxConcurrentOperations) {
          console.log(`[QueueManager] Max concurrent operations (${serviceOptions.maxConcurrentOperations}) reached, deferring queue processing`);
          isProcessingQueue = false;
          return;
        }
        
        // Get next operation from queue if exists
        if (!this.isEmpty()) {
          const operation = this.dequeue();
          
          if (operation) {
            // Increment active operation count
            activeOperationCount++;
            
            // Process operation
            this._processOperation(operation);
            
            // Continue processing queue after a short delay
            setTimeout(() => {
              isProcessingQueue = false;
              this.requestQueueRefresh();
            }, 50);
          } else {
            isProcessingQueue = false;
          }
        } else {
          isProcessingQueue = false;
        }
      } catch (error) {
        console.error(`[QueueManager] Error processing queue:`, error);
        isProcessingQueue = false;
      }
    },
    
    /**
     * Process a single operation from the queue
     */
    _processOperation(operation: SessionOperation) {
      const { id: operationId, type, sessionId, callback } = operation;
      const processStartTime = Date.now();
      const startTimestamp = new Date(processStartTime).toISOString();
      
      // Mark operation as being processed
      processingOperations.set(operationId, {
        operation,
        startTime: processStartTime
      });
      
      // Log processing start
      console.log(`[QueueManager][${startTimestamp}] 🔄 PROCESSING: Operation ${operationId} (${type}) for session ${sessionId || 'new'}`);
      
      // Call the operation callback via the service
      serviceOptions.operationDequeueCallback(operation)
        .then((result) => {
          const processingDuration = Date.now() - processStartTime;
          const endTimestamp = new Date().toISOString();
          
          console.log(`[QueueManager][${endTimestamp}] ✅ COMPLETED: Operation ${operationId} (${type}) completed in ${processingDuration}ms`);
          
          // Register completion
          this.registerOperationCompletion(operationId, result);
          
          // Continue processing the queue
          this.requestQueueRefresh();
        })
        .catch((error) => {
          const processingDuration = Date.now() - processStartTime;
          const endTimestamp = new Date().toISOString();
          
          // Log proper error
          if (error instanceof Error) {
            console.error(`[QueueManager][${endTimestamp}] ❌ ERROR: Operation ${operationId} (${type}) failed after ${processingDuration}ms:`, {
              errorName: error.name,
              errorMessage: error.message,
              operationType: type,
              sessionId: sessionId || 'new'
            });
          } else {
            console.error(`[QueueManager][${endTimestamp}] ❌ ERROR: Operation ${operationId} (${type}) failed after ${processingDuration}ms with non-Error object:`, String(error));
          }
          
          // Register completion with error
          this.registerOperationCompletion(operationId, null, error);
          
          // Continue processing the queue even when there's an error
          this.requestQueueRefresh();
        });
    },
    
    /**
     * Clean up stuck operations
     */
    cleanupStuckOperations() {
      const now = Date.now();
      let cleanedCount = 0;
      
      // Look for operations that have been processing for too long
      processingOperations.forEach((data, opId) => {
        const processingTime = now - data.startTime;
        
        // If processing for more than MAX_PROCESSING_TIME, consider it stuck
        if (processingTime > MAX_PROCESSING_TIME) {
          console.warn(`[QueueManager] Detected stuck operation ${opId} (${data.operation.type}) for session ${data.operation.sessionId || 'new'} - processing for ${processingTime}ms`);
          
          // Get promise data if exists
          const promiseData = operationPromises.get(opId);
          if (promiseData) {
            if (promiseData.timeoutId) {
              clearTimeout(promiseData.timeoutId);
            }
            
            // Reject with a descriptive error
            promiseData.reject(new OperationTimeoutError(
              `Operation ${data.operation.type} stuck after ${processingTime}ms`,
              data.operation.type as 'load' | 'save' | 'delete',
              data.operation.sessionId
            ));
            
            // Remove from promises map
            operationPromises.delete(opId);
          }
          
          // Remove from processing operations
          processingOperations.delete(opId);
          
          // Adjust active operation count
          activeOperationCount = Math.max(0, activeOperationCount - 1);
          
          cleanedCount++;
        }
      });
      
      // NEW CODE: Identify potentially competing operations for same session
      // Check if there are multiple operations for the same session in the processing state
      // which could indicate a deadlock during rapid session switching
      const sessionOperationCounts = new Map<string, { count: number, operations: Array<{id: string, type: string, startTime: number}> }>();
      
      processingOperations.forEach((data, opId) => {
        const sessionKey = data.operation.sessionId || 'new';
        if (!sessionOperationCounts.has(sessionKey)) {
          sessionOperationCounts.set(sessionKey, { count: 0, operations: [] });
        }
        
        const sessionData = sessionOperationCounts.get(sessionKey)!;
        sessionData.count++;
        sessionData.operations.push({
          id: opId,
          type: data.operation.type,
          startTime: data.startTime
        });
      });
      
      // Check for sessions with multiple operations
      sessionOperationCounts.forEach((data, sessionKey) => {
        if (data.count > 1) {
          console.warn(`[QueueManager] Session ${sessionKey} has ${data.count} concurrent operations which may indicate contention during switching:`);
          
          // Sort by start time (oldest first)
          data.operations.sort((a, b) => a.startTime - b.startTime);
          
          // Log all operations
          data.operations.forEach((op, index) => {
            const processingTime = now - op.startTime;
            console.warn(`[QueueManager]   ${index + 1}. ${op.type} (ID: ${op.id}) - processing for ${processingTime}ms`);
          });
          
          // If one save and one load on same session, potential deadlock during switching
          const hasSave = data.operations.some(op => op.type === 'save');
          const hasLoad = data.operations.some(op => op.type === 'load');
          
          if (hasSave && hasLoad) {
            console.warn(`[QueueManager] Detected potential deadlock during session switching: session ${sessionKey} has both save and load operations running`);
            
            // Find oldest operation to clean up (likely the cause of the issue)
            const oldestOp = data.operations[0];
            const oldestOpId = oldestOp.id;
            
            // Get promise data if exists
            const promiseData = operationPromises.get(oldestOpId);
            if (promiseData) {
              if (promiseData.timeoutId) {
                clearTimeout(promiseData.timeoutId);
              }
              
              // Reject with a descriptive error
              promiseData.reject(new OperationTimeoutError(
                `Operation ${oldestOp.type} aborted due to detected session switching conflict`,
                oldestOp.type as 'load' | 'save' | 'delete' | 'setActive',
                sessionKey
              ));
              
              // Remove from promises map
              operationPromises.delete(oldestOpId);
            }
            
            // Remove from processing operations
            processingOperations.delete(oldestOpId);
            
            // Adjust active operation count
            activeOperationCount = Math.max(0, activeOperationCount - 1);
            
            cleanedCount++;
            console.warn(`[QueueManager] Cleaned up oldest operation (${oldestOp.type}, ID: ${oldestOpId}) to resolve potential deadlock`);
          }
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`[QueueManager] Cleaned up ${cleanedCount} stuck operations`);
      }
      
      return cleanedCount;
    }
  };
}

// Create a singleton instance of the queue manager
export const queueManager = createQueueManager();