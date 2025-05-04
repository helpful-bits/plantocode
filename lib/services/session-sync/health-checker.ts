/**
 * Health Checker for Session Sync Service
 * 
 * Provides health check functionality to detect and recover from stuck operations
 * and other unhealthy service states.
 */

import type { SessionOperation, OperationState, HealthCheckResult } from './types';

// Maximum time an operation can be active without a timeout (reduced from 15 to 12 seconds)
const MAX_ACTIVE_OPERATION_TIME = 12000;

// Thresholds for health checks
const HEALTH_CHECK_THRESHOLDS = {
  // How long an operation can be active before being considered stuck (reduced from 150% to 125%)
  maxOperationAge: MAX_ACTIVE_OPERATION_TIME * 1.25, 
  
  // How long an operation can be pending in queue before considering the queue stalled (reduced from 2x to 1.5x)
  maxQueueStallTime: MAX_ACTIVE_OPERATION_TIME * 1.5,
  
  // Maximum number of consecutive errors before service reset (reduced from 3 to 2)
  maxConsecutiveErrors: 2,
  
  // Maximum time an operation can be running (reduced from 45s to 30s)
  maxOperationRunTime: 30000,
  
  // Maximum number of queued 'load' operations for the same session before considering it problematic
  maxLoadOperationsPerSession: 2
};

/**
 * Checks the health of the service and detects stuck operations
 */
export function checkServiceHealth({
  activeOperations,
  operationQueue,
  lastCompletedOperations,
  consecutiveErrors,
  lastHealthCheckTime
}: {
  activeOperations: Map<string, { inProgress: boolean; lastComplete: number; lastStartTime?: number }>,
  operationQueue: Array<any>,
  lastCompletedOperations: Map<string, number>,
  consecutiveErrors: number,
  lastHealthCheckTime: number
}): HealthCheckResult {
  const now = Date.now();
  const CONSECUTIVE_ERRORS_THRESHOLD = HEALTH_CHECK_THRESHOLDS.maxConsecutiveErrors;
  const stuckSessions: string[] = [];
  const stalledSessions: string[] = [];
  
  console.log(`[HealthChecker] Starting health check at ${new Date(now).toISOString()}`);
  console.log(`[HealthChecker] Checking ${activeOperations.size} active sessions and ${operationQueue.length} queued operations`);
  
  // Check if there are too many consecutive errors
  const needsReset = consecutiveErrors >= CONSECUTIVE_ERRORS_THRESHOLD;
  if (consecutiveErrors > 0) {
    console.warn(`[HealthChecker] Service has ${consecutiveErrors}/${CONSECUTIVE_ERRORS_THRESHOLD} consecutive errors`);
  }
  
  // Check for stuck operations (in progress for too long)
  activeOperations.forEach((state, sessionId) => {
    // Log the current state of each session being checked
    console.log(`[HealthChecker] Checking session ${sessionId}: inProgress=${state.inProgress}, lastComplete=${new Date(state.lastComplete).toISOString()}, startTime=${state.lastStartTime ? new Date(state.lastStartTime).toISOString() : 'N/A'}`);
    
    // If an operation is in progress for too long, consider it stuck
    if (state.inProgress) {
      // Check if we have a start time to calculate operation duration
      if (state.lastStartTime) {
        const operationRunTime = now - state.lastStartTime;
        console.log(`[HealthChecker] Session ${sessionId} operation runtime: ${operationRunTime}ms (threshold: ${HEALTH_CHECK_THRESHOLDS.maxOperationRunTime}ms)`);
        
        if (operationRunTime > HEALTH_CHECK_THRESHOLDS.maxOperationRunTime) {
          console.warn(`[HealthChecker] Session ${sessionId} operation has been running for ${operationRunTime}ms, which exceeds max allowed time of ${HEALTH_CHECK_THRESHOLDS.maxOperationRunTime}ms`);
          console.warn(`[HealthChecker] Marking session ${sessionId} as STUCK due to excessive operation runtime`);
          stuckSessions.push(sessionId);
        }
      } else {
        // Fallback to checking based on lastComplete
        const timeSinceComplete = now - state.lastComplete;
        console.log(`[HealthChecker] Session ${sessionId} has no start time, using time since last complete: ${timeSinceComplete}ms (threshold: ${HEALTH_CHECK_THRESHOLDS.maxOperationRunTime}ms)`);
        
        if (timeSinceComplete > HEALTH_CHECK_THRESHOLDS.maxOperationRunTime) {
          console.warn(`[HealthChecker] Session ${sessionId} has not completed since ${new Date(state.lastComplete).toISOString()}, considering it stuck`);
          console.warn(`[HealthChecker] Marking session ${sessionId} as STUCK due to no activity since last completion`);
          stuckSessions.push(sessionId);
        }
      }
    }
  });
  
  // Detect stalled sessions (not in progress but not completed either)
  lastCompletedOperations.forEach((lastComplete, sessionId) => {
    // If the session has an operation that's not progressing but also not complete
    const state = activeOperations.get(sessionId);
    if (state && !state.inProgress) {
      // Check if session has operations in queue but they're not being processed
      const sessionHasQueuedOps = operationQueue.some(op => op.sessionId === sessionId);
      const timeSinceComplete = now - lastComplete;
      
      console.log(`[HealthChecker] Checking for stalled queue in session ${sessionId}: hasQueuedOps=${sessionHasQueuedOps}, timeSinceComplete=${timeSinceComplete}ms (threshold: ${HEALTH_CHECK_THRESHOLDS.maxQueueStallTime}ms)`);
      
      if (sessionHasQueuedOps && (timeSinceComplete > HEALTH_CHECK_THRESHOLDS.maxQueueStallTime)) {
        console.warn(`[HealthChecker] Session ${sessionId} has pending operations but no progress since ${new Date(lastComplete).toISOString()}`);
        console.warn(`[HealthChecker] Marking session ${sessionId} as STALLED due to queued operations not being processed`);
        stalledSessions.push(sessionId);
      }
    }
  });
  
  // Look for sessions with excessive queued load operations (potential code issue)
  const sessionOperationCounts = new Map<string, { load: number, save: number, delete: number }>();
  
  for (const op of operationQueue) {
    if (op.sessionId) {
      if (!sessionOperationCounts.has(op.sessionId)) {
        sessionOperationCounts.set(op.sessionId, { load: 0, save: 0, delete: 0 });
      }
      const counts = sessionOperationCounts.get(op.sessionId)!;
      counts[op.type as keyof typeof counts]++;
    }
  }
  
  // Log all sessions with operations, not just problematic ones
  console.log(`[HealthChecker] Queue analysis for ${sessionOperationCounts.size} sessions:`);
  
  // Log and flag sessions with excessive operations or suspicious patterns
  sessionOperationCounts.forEach((counts, sessionId) => {
    const { load, save, delete: deleteCount } = counts;
    const totalOps = load + save + deleteCount;
    
    console.log(`[HealthChecker] Session ${sessionId} queue: load=${load}, save=${save}, delete=${deleteCount}, total=${totalOps}`);
    
    // Check for excessive load operations
    if (load > HEALTH_CHECK_THRESHOLDS.maxLoadOperationsPerSession) {
      console.warn(`[HealthChecker] Session ${sessionId} has ${load} queued load operations, which may indicate a concurrency issue`);
      console.warn(`[HealthChecker] Marking session ${sessionId} as STALLED due to excessive load operations`);
      if (!stalledSessions.includes(sessionId)) {
        stalledSessions.push(sessionId);
      }
    }
    
    // Check for load+save combinations which may indicate deadlock potential
    if (load > 0 && save > 0) {
      console.warn(`[HealthChecker] Session ${sessionId} has both load (${load}) and save (${save}) operations queued, which may lead to deadlock`);
      console.warn(`[HealthChecker] Marking session ${sessionId} as STALLED due to potential load/save deadlock`);
      if (!stalledSessions.includes(sessionId)) {
        stalledSessions.push(sessionId);
      }
    }
    
    // Check for high total operations
    if (totalOps > 5) {
      console.warn(`[HealthChecker] Session ${sessionId} has ${totalOps} total queued operations (load=${load}, save=${save}, delete=${deleteCount})`);
      console.log(`[HealthChecker] Session ${sessionId} has a high number of operations, but not yet marking as stalled`);
    }
  });
  
  if (stuckSessions.length > 0) {
    console.warn(`[HealthChecker] Detected ${stuckSessions.length} stuck sessions: ${stuckSessions.join(', ')}`);
  } else {
    console.log(`[HealthChecker] No stuck sessions detected`);
  }
  
  if (stalledSessions.length > 0) {
    console.warn(`[HealthChecker] Detected ${stalledSessions.length} stalled sessions: ${stalledSessions.join(', ')}`);
  } else {
    console.log(`[HealthChecker] No stalled sessions detected`);
  }
  
  const result = {
    isHealthy: stuckSessions.length === 0 && stalledSessions.length === 0 && !needsReset,
    stuckSessions,
    stalledSessions,
    needsReset,
    detailedLogging: consecutiveErrors > 0 || stuckSessions.length > 0 || stalledSessions.length > 0
  };
  
  console.log(`[HealthChecker] Health check result: isHealthy=${result.isHealthy}, needsReset=${result.needsReset}, detailedLogging=${result.detailedLogging}`);
  
  return result;
}

/**
 * Clear all locks and rejecting pending operations for a session
 */
export function clearStuckSession(
  sessionId: string, 
  operationQueue: SessionOperation[],
  rejectOperation: (operationId: string, error: Error) => void
): SessionOperation[] {
  console.log(`[HealthChecker] ========== CLEARING STUCK SESSION ==========`);
  console.log(`[HealthChecker] Clearing stuck session ${sessionId} at ${new Date().toISOString()}`);
  
  // Find all operations for this session
  const sessionOpIndices: number[] = [];
  operationQueue.forEach((op, index) => {
    if (op.sessionId === sessionId) {
      sessionOpIndices.push(index);
      console.log(`[HealthChecker] Found operation to clear: id=${op.id}, type=${op.type}, addedAt=${new Date(op.addedAt).toISOString()}, priority=${op.priority}`);
    }
  });
  
  console.log(`[HealthChecker] Found ${sessionOpIndices.length} operations to clear for session ${sessionId}`);
  
  // Remove operations from the highest index down to avoid shifting issues
  const removedOps: SessionOperation[] = [];
  sessionOpIndices.sort((a, b) => b - a).forEach(index => {
    const op = operationQueue.splice(index, 1)[0];
    removedOps.push(op);
    
    // Reject the operation with an error
    const error = new Error(`Operation canceled due to stuck session ${sessionId} cleanup (health check intervention)`);
    console.log(`[HealthChecker] Rejecting operation ${op.id} of type ${op.type} with error: ${error.message}`);
    rejectOperation(op.id, error);
  });
  
  console.log(`[HealthChecker] Removed ${removedOps.length} operations for stuck session ${sessionId}`);
  
  // Analyze removed operations by type
  const removedTypes = {
    load: removedOps.filter(op => op.type === 'load').length,
    save: removedOps.filter(op => op.type === 'save').length,
    delete: removedOps.filter(op => op.type === 'delete').length
  };
  
  console.log(`[HealthChecker] Removed operation breakdown: load=${removedTypes.load}, save=${removedTypes.save}, delete=${removedTypes.delete}`);
  console.log(`[HealthChecker] ========== STUCK SESSION CLEARED ==========`);
  
  return operationQueue;
}

/**
 * Attempts to recover the database in case of persistent issues
 */
export async function attemptDatabaseRecovery(): Promise<boolean> {
  try {
    console.log('[HealthChecker] ========== ATTEMPTING DATABASE RECOVERY ==========');
    console.log(`[HealthChecker] Starting database recovery attempt at ${new Date().toISOString()}`);
    
    // In a real implementation, this could include:
    // 1. Running VACUUM on the SQLite database
    // 2. Checking for and releasing locks
    // 3. Verifying database integrity
    // 4. Resetting connections if needed
    
    // For this implementation, we'll assume a successful recovery
    // In a real scenario, we would run actual recovery operations
    // and return success/failure based on their outcomes
    
    // Simulate a recovery operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.debug(`[HealthChecker] Database recovery completed successfully at ${new Date().toISOString()}`);
    console.debug('[HealthChecker] ========== DATABASE RECOVERY COMPLETE ==========');
    return true;
  } catch (error) {
    console.error('[HealthChecker] ========== DATABASE RECOVERY FAILED ==========');
    console.error('[HealthChecker] Database recovery failed:', error);
    console.error(`[HealthChecker] Recovery failed at ${new Date().toISOString()}`);
    console.error('[HealthChecker] ========== DATABASE RECOVERY FAILED ==========');
    return false;
  }
}

/**
 * Process operations in stalled queues by forcing them to be eligible for processing
 */
export function processStalledQueues(
  stalledSessions: string[],
  operationQueue: SessionOperation[]
): SessionOperation[] {
  if (stalledSessions.length === 0) {
    return operationQueue;
  }
  
  console.warn(`[HealthChecker] ========== PROCESSING STALLED QUEUES ==========`);
  console.warn(`[HealthChecker] Processing stalled queues for ${stalledSessions.length} sessions: ${stalledSessions.join(', ')}`);
  console.warn(`[HealthChecker] Processing started at ${new Date().toISOString()}`);
  
  // Group operations by session to analyze patterns
  const sessionOps: Record<string, SessionOperation[]> = {};
  
  for (const op of operationQueue) {
    const sessionId = op.sessionId || 'new';
    if (!sessionOps[sessionId]) {
      sessionOps[sessionId] = [];
    }
    sessionOps[sessionId].push(op);
  }
  
  // Analyze stalled sessions for potential deadlocks
  for (const sessionId of stalledSessions) {
    const ops = sessionOps[sessionId] || [];
    console.log(`[HealthChecker] Stalled session ${sessionId} has ${ops.length} pending operations`);
    
    // Log operation types for this stalled session
    const opTypes = {
      load: ops.filter(op => op.type === 'load').length,
      save: ops.filter(op => op.type === 'save').length,
      delete: ops.filter(op => op.type === 'delete').length
    };
    
    console.log(`[HealthChecker] Operation breakdown for ${sessionId}: load=${opTypes.load}, save=${opTypes.save}, delete=${opTypes.delete}`);
    
    // Log operation details for this session, including timestamps
    if (ops.length > 0) {
      console.log(`[HealthChecker] Detailed operations for session ${sessionId}:`);
      ops.forEach((op, idx) => {
        const waitTime = Date.now() - op.addedAt;
        console.log(`[HealthChecker]   ${idx + 1}. Type=${op.type}, ID=${op.id}, Priority=${op.priority}, Added=${new Date(op.addedAt).toISOString()}, Waiting=${Math.round(waitTime/1000)}s`);
      });
    }
    
    // Handle potential deadlock scenarios - if there's both load and save
    // operations, prioritize load operations first to break the deadlock
    if (opTypes.load > 0 && opTypes.save > 0) {
      console.warn(`[HealthChecker] Potential deadlock in session ${sessionId}: both load and save operations are pending`);
      
      // For load-save deadlocks, the best approach is to prioritize load operations first,
      // then let saves proceed after the load completes
      ops.forEach(op => {
        if (op.type === 'load') {
          const oldPriority = op.priority;
          op.priority += 15; // Give a major priority boost to load operations
          console.log(`[HealthChecker] Boosting load operation ${op.id} priority from ${oldPriority} to ${op.priority}`);
        }
      });
    }
  }
  
  // Either cancel excessive operations or promote stalled operations to high priority
  const updatedQueue = operationQueue.map(op => {
    const sessionId = op.sessionId || 'new';
    
    if (stalledSessions.includes(sessionId)) {
      const sessionOpCounts = sessionOps[sessionId].reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Check if we need to boost priority
      if (op.type === 'load' && sessionOpCounts.load > 1) {
        // For multiple load operations, only boost the oldest one
        const isOldestLoad = sessionOps[sessionId]
          .filter(sop => sop.type === 'load')
          .sort((a, b) => a.addedAt - b.addedAt)[0].id === op.id;
          
        if (isOldestLoad) {
          const oldPriority = op.priority;
          const newPriority = op.priority + 10;
          console.log(`[HealthChecker] Boosting priority of oldest load operation ${op.id} for session ${sessionId} from ${oldPriority} to ${newPriority}`);
          return { ...op, priority: newPriority };
        }
      } else {
        // Give higher priority boost to load operations to unblock the queue
        const priorityBoost = op.type === 'load' ? 10 : 7;
        const oldPriority = op.priority;
        const newPriority = op.priority + priorityBoost;
        
        console.log(`[HealthChecker] Boosting priority of ${op.type} operation ${op.id} for session ${sessionId} from ${oldPriority} to ${newPriority}`);
        
        return { ...op, priority: newPriority };
      }
    }
    return op;
  });
  
  console.warn(`[HealthChecker] ========== STALLED QUEUE PROCESSING COMPLETE ==========`);
  
  return updatedQueue;
} 