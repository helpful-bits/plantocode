/**
 * Queue Manager for Session Sync Service
 * 
 * Manages the queue of session operations, ensuring they're processed in order
 * according to priority and session state.
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionCallback, SessionOperation, OperationTimeoutError } from '@/lib/services/session-sync/types';

// Default timeout for operations (1 minute)
const DEFAULT_OPERATION_TIMEOUT = 60000;

// Operation-specific timeout values in milliseconds
const OPERATION_TIMEOUTS = {
  load: 90000,    // 1.5 minutes for load operations (reduced from 2 minutes)
  save: 60000,    // 1 minute for save operations (reduced from 1.5 minutes)
  delete: 30000   // 30 seconds for delete operations (reduced from 1 minute)
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
    operation: 'load' | 'save' | 'delete',
    sessionId: string | null,
    callback: SessionCallback,
    priority?: number,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<any>;
  clearSessionOperations(sessionId: string | null): number;
  setServiceOptions(options: ServiceOptions): void;
  registerOperationCompletion(operationId: string, result: any, error?: Error): void;
  requestQueueRefresh(): void;
  _processQueue(): void;
  _processOperation(operation: SessionOperation): void;
  cleanupStuckOperations(): void;
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
      
      // If we found a session with a potential deadlock, prioritize processing its load operations first
      if (potentialDeadlockSession) {
        const loadOpIndex = queue.findIndex(op => 
          op.sessionId === potentialDeadlockSession && op.type === 'load');
        
        if (loadOpIndex !== -1) {
          console.log(`[QueueManager] Prioritizing load operation for session ${potentialDeadlockSession} to break potential deadlock`);
          return queue.splice(loadOpIndex, 1)[0];
        }
      }
      
      // NEW CODE: Check for session switching scenario (Session B load while Session A save)
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
      
      // Check for long-waiting operations
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
      operation: 'load' | 'save' | 'delete',
      sessionId: string | null,
      callback: SessionCallback,
      priority: number = 1,
      timeoutMs?: number,
      signal?: AbortSignal
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
          
          // Check if already aborted
          if (signal?.aborted) {
            console.log(`[QueueManager][${timestamp}] Operation ${operationId} (${operation}) was already aborted before queuing`);
            return reject(new Error('Operation aborted'));
          }
          
          // Add abort listener if signal provided
          const abortHandler = () => {
            const abortTime = new Date().toISOString();
            // Remove from queue if still there
            const index = queue.findIndex(op => op.id === operationId);
            if (index !== -1) {
              queue.splice(index, 1);
              console.log(`[QueueManager][${abortTime}] ⚠️ Removed aborted operation ${operationId} from queue`);
            }
            
            // Reject promise if still in promises map
            if (operationPromises.has(operationId)) {
              const promiseData = operationPromises.get(operationId)!;
              if (promiseData.timeoutId) {
                clearTimeout(promiseData.timeoutId);
              }
              operationPromises.delete(operationId);
              reject(new Error('Operation aborted'));
            }
            
            // Remove from processing if currently being processed
            if (processingOperations.has(operationId)) {
              processingOperations.delete(operationId);
              activeOperationCount = Math.max(0, activeOperationCount - 1);
              console.log(`[QueueManager][${abortTime}] ⚠️ Operation ${operationId} was being processed when aborted, adjusted activeOperationCount to ${activeOperationCount}`);
            }
          };
          
          if (signal) {
            signal.addEventListener('abort', abortHandler);
            console.log(`[QueueManager][${timestamp}] Added abort listener for operation ${operationId}`);
          }
          
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
            
            // Remove abort listener if present
            if (signal) {
              signal.removeEventListener('abort', abortHandler);
              console.log(`[QueueManager][${timeoutTime}] Removed abort listener for operation ${operationId} due to timeout`);
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
            addedAt: Date.now(),
            signal
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
     */
    clearSessionOperations(sessionId: string | null): number {
      // Check for a valid session ID format
      if (sessionId !== null && typeof sessionId !== 'string') {
        console.error(`[QueueManager] Invalid sessionId format in clearSessionOperations: ${typeof sessionId}`);
        return 0;
      }
      
      const initialQueueSize = queue.length;
      
      // Filter operations for this session
      const sessionOperations = queue.filter(op => op.sessionId === sessionId);
      
      // Remove operations for this session from the queue
      const newQueue = queue.filter(op => op.sessionId !== sessionId);
      queue.length = 0;
      queue.push(...newQueue);
      
      console.log(`[QueueManager] Removed ${initialQueueSize - queue.length} operations for session ${sessionId || 'new'}`);
      
      // Reject all promises for these operations
      sessionOperations.forEach(op => {
        const promiseData = operationPromises.get(op.id);
        if (promiseData) {
          if (promiseData.timeoutId) {
            clearTimeout(promiseData.timeoutId);
          }
          promiseData.reject(new Error(`Operation canceled due to session clear: ${sessionId || 'new'}`));
          operationPromises.delete(op.id);
        }
      });
      
      // Clean up processing operations for this session
      processingOperations.forEach((data, opId) => {
        if (data.operation.sessionId === sessionId) {
          processingOperations.delete(opId);
          
          // Adjust active operation count
          activeOperationCount = Math.max(0, activeOperationCount - 1);
        }
      });
      
      return initialQueueSize - queue.length;
    },
    
    /**
     * Request queue processing refresh
     */
    requestQueueRefresh() {
      if (processingTimer) {
        clearTimeout(processingTimer);
      }
      
      processingTimer = setTimeout(() => {
        this._processQueue();
      }, serviceOptions.processingIntervalMs || 100);
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
      
      // Check if the operation has been aborted
      if (operation.signal?.aborted) {
        console.log(`[QueueManager][${startTimestamp}] ⚠️ Operation ${operationId} (${type}) for session ${sessionId || 'new'} was aborted, skipping execution`);
        
        // Register completion with an error
        const abortError = new Error('Operation aborted');
        this.registerOperationCompletion(operationId, null, abortError);
        
        // Continue processing the queue
        this.requestQueueRefresh();
        return;
      }
      
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
            const isAborted = error.name === 'AbortError' || error.message.includes('aborted');
            
            if (isAborted) {
              console.log(`[QueueManager][${endTimestamp}] ⚠️ Operation ${operationId} (${type}) was aborted after ${processingDuration}ms`);
            } else {
              console.error(`[QueueManager][${endTimestamp}] ❌ ERROR: Operation ${operationId} (${type}) failed after ${processingDuration}ms:`, {
                errorName: error.name,
                errorMessage: error.message,
                operationType: type,
                sessionId: sessionId || 'new'
              });
            }
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
                oldestOp.type as 'load' | 'save' | 'delete',
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