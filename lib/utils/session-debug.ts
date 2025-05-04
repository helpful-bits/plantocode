/**
 * Session Debug Utilities
 * 
 * Helper functions for debugging session synchronization issues
 */

import { sessionSyncService } from '@/lib/services/session-sync-service';
import { SessionOperation } from '@/lib/services/session-sync/types';

// Import the OperationStateInfo interface from where it's defined
interface OperationStateInfo {
  state: 'idle' | 'loading' | 'saving' | 'deleting';
  lastOperationId?: string;
  lastOperationDuration?: number;
  lastError?: Error;
  lastComplete: number;
  lastStartTime?: number;
  lastOperationType?: string;
}

/**
 * Logs detailed information about the current session state
 * @param sessionId The session ID to check, or null for global state
 * @returns Debug summary object or error information
 */
export function debugSessionState(sessionId: string | null = null): 
  | { sessionId: string | 'global'; timestamp: string; activeOperationsCount: number; pendingOperationsCount: number; hasRelevantOperations: boolean; sessionState: any; isBusy: boolean | null; consecutiveErrors: number }
  | { error: string; timestamp: string }
  | undefined {
  const debugTimestamp = new Date().toISOString();
  console.group(`[SessionDebug][${debugTimestamp}] 🔎 SESSION STATE CHECK${sessionId ? ` for ${sessionId}` : ' (global)'}`);
  
  try {
    const queueStatus = sessionSyncService.getQueueStatus();
    
    // 1. Check active operations
    console.log('🟢 Active Operations:');
    if (queueStatus.activeOperations.length === 0) {
      console.log('  None');
    } else {
      queueStatus.activeOperations.forEach(([sid, state]: [string, OperationStateInfo]) => {
        const isRelevant = !sessionId || sid === sessionId;
        let duration = 'unknown';
        let runningTime = 0;
        
        if (state.lastStartTime) {
          runningTime = Date.now() - state.lastStartTime;
          duration = `${Math.floor(runningTime / 1000)}s (${runningTime}ms)`;
        }
        
        console.log(`  ${sid}: ${state.state}, running for ${duration}${isRelevant ? ' 🔍 (RELEVANT)' : ''}`);
        
        if (isRelevant && runningTime > 5000) {
          console.warn(`  ⚠️ LONG RUNNING OPERATION for session ${sid}: ${state.state} has been running for ${duration}`);
          console.warn(`  ⚠️ Details: lastOperationId=${state.lastOperationId}, lastOperationType=${state.lastOperationType}`);
        }
      });
    }
    
    // 2. Check pending operations
    console.log('\n🟡 Pending Operations:');
    if (queueStatus.queueStats.pendingOperations.length === 0) {
      console.log('  None');
    } else {
      queueStatus.queueStats.pendingOperations.forEach((op: SessionOperation) => {
        const isRelevant = !sessionId || op.sessionId === sessionId;
        const age = Date.now() - op.addedAt;
        const ageSeconds = Math.floor(age / 1000);
        const ageFormatted = ageSeconds > 60 ? 
          `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s` : 
          `${ageSeconds}s`;
        
        console.log(`  ${op.id}: ${op.type} for ${op.sessionId || 'global'}, priority ${op.priority}, waiting for ${ageFormatted}${isRelevant ? ' 🔍 (RELEVANT)' : ''}`);
        
        if (isRelevant && age > 10000) {
          console.warn(`  ⚠️ LONG WAITING OPERATION: ${op.type} operation for session ${op.sessionId || 'global'} has been waiting for ${ageFormatted}`);
        }
      });
      
      // Add details about operation distribution by session
      console.log('\n  Summary of pending operations by session:');
      const sessionCounts = new Map<string, { total: number, load: number, save: number, delete: number }>();
      
      queueStatus.queueStats.pendingOperations.forEach((op: SessionOperation) => {
        const key = op.sessionId || 'global';
        if (!sessionCounts.has(key)) {
          sessionCounts.set(key, { total: 0, load: 0, save: 0, delete: 0 });
        }
        const counts = sessionCounts.get(key)!;
        counts.total++;
        counts[op.type]++;
      });
      
      sessionCounts.forEach((counts, sid) => {
        const isRelevant = !sessionId || sid === sessionId;
        console.log(`  ${sid}: ${counts.total} operations (load=${counts.load}, save=${counts.save}, delete=${counts.delete})${isRelevant ? ' 🔍 (RELEVANT)' : ''}`);
      });
      
      // Add details about pending operation queue position
      const relevantPendingOps = queueStatus.queueStats.pendingOperations
        .filter((op: SessionOperation) => !sessionId || op.sessionId === sessionId)
        .sort((a: SessionOperation, b: SessionOperation) => {
          // First sort by priority
          if (a.priority !== b.priority) return a.priority - b.priority;
          // Then by age (oldest first)
          return a.addedAt - b.addedAt;
        });
      
      if (relevantPendingOps.length > 0) {
        console.log('\n  Relevant pending operations by priority and age:');
        relevantPendingOps.forEach((op: SessionOperation, index: number) => {
          const age = Date.now() - op.addedAt;
          const ageSeconds = Math.floor(age / 1000);
          console.log(`    ${index + 1}. ${op.type} (priority ${op.priority}, age ${ageSeconds}s)`);
        });
      }
    }
    
    // 3. Check cooldowns
    console.log('\n🔵 Cooldowns:');
    if (queueStatus.cooldowns.length === 0) {
      console.log('  None');
    } else {
      queueStatus.cooldowns.forEach((cooldown: any) => {
        const isRelevant = !sessionId || cooldown.sessionId === sessionId;
        console.log(`  ${cooldown.sessionId}: ${cooldown.operation} for ${Math.floor(cooldown.remainingMs / 1000)}s remaining${isRelevant ? ' 🔍 (RELEVANT)' : ''}`);
      });
    }
    
    // 4. Current session state
    if (sessionId) {
      const state = sessionSyncService.getSessionState(sessionId);
      const isBusy = sessionSyncService.isSessionBusy(sessionId);
      console.log(`\n🔴 Session ${sessionId} state: ${state?.state || 'unknown'} (busy: ${isBusy})`);
      
      if (state) {
        console.log('  Session operation details:');
        console.log(`    Last operation ID: ${state.lastOperationId || 'none'}`);
        console.log(`    Last operation type: ${state.lastOperationType || 'none'}`);
        console.log(`    Last operation duration: ${state.lastOperationDuration ? `${state.lastOperationDuration}ms` : 'unknown'}`);
        console.log(`    Last complete: ${state.lastComplete ? new Date(state.lastComplete).toISOString() : 'never'} (${state.lastComplete ? `${Math.floor((Date.now() - state.lastComplete) / 1000)}s ago` : 'n/a'})`);
        
        if (state.lastError) {
          console.log(`    Last error: ${state.lastError.message}`);
        }
        
        // Check for potential issues
        if (state.state !== 'idle') {
          const runningTime = state.lastStartTime ? Date.now() - state.lastStartTime : 0;
          if (runningTime > 10000) { // 10 seconds
            console.warn(`  ⚠️ POTENTIAL STUCK SESSION: ${sessionId} has been in ${state.state} state for ${Math.floor(runningTime / 1000)}s`);
          }
        }
      }
    }
    
    // 5. Error count
    console.log(`\n⚠️ Consecutive errors: ${queueStatus.consecutiveErrors}`);
    if (queueStatus.consecutiveErrors > 3) {
      console.warn(`  ⚠️ HIGH ERROR COUNT: ${queueStatus.consecutiveErrors} consecutive errors detected`);
    }
    
    // 6. Return summary for easier inspection
    const summary = {
      sessionId: sessionId || 'global',
      timestamp: debugTimestamp,
      activeOperationsCount: queueStatus.activeOperations.length,
      pendingOperationsCount: queueStatus.queueStats.pendingOperations.length,
      hasRelevantOperations: queueStatus.activeOperations.some(([sid, _]: [string, OperationStateInfo]) => !sessionId || sid === sessionId) ||
                           queueStatus.queueStats.pendingOperations.some((op: SessionOperation) => !sessionId || op.sessionId === sessionId),
      sessionState: sessionId ? sessionSyncService.getSessionState(sessionId) : null,
      isBusy: sessionId ? sessionSyncService.isSessionBusy(sessionId) : null,
      consecutiveErrors: queueStatus.consecutiveErrors
    };
    
    console.log('\n📊 Debug Summary:', summary);
    
    // Check for potential deadlocks or queue contention
    const loadingOps = queueStatus.activeOperations.filter(([_, state]) => state.state === 'loading');
    const savingOps = queueStatus.activeOperations.filter(([_, state]) => state.state === 'saving');
    
    if (loadingOps.length > 0 && savingOps.length > 0) {
      console.warn('⚠️ POTENTIAL SESSION SWITCHING SCENARIO: Both load and save operations active simultaneously');
      console.warn(`  Loading sessions: ${loadingOps.map(([sid]) => sid).join(', ')}`);
      console.warn(`  Saving sessions: ${savingOps.map(([sid]) => sid).join(', ')}`);
    }
    
    // Detect operations waiting too long
    const oldOperations = queueStatus.queueStats.pendingOperations.filter(op => (Date.now() - op.addedAt) > 15000);
    if (oldOperations.length > 0) {
      console.warn(`⚠️ OPERATIONS WAITING TOO LONG: ${oldOperations.length} operations waiting >15s`);
      oldOperations.slice(0, 3).forEach(op => {
        const waitTime = Math.floor((Date.now() - op.addedAt) / 1000);
        console.warn(`  - ${op.type} for session ${op.sessionId || 'new'} waiting for ${waitTime}s (priority: ${op.priority})`);
      });
      if (oldOperations.length > 3) {
        console.warn(`  - ... and ${oldOperations.length - 3} more operations waiting too long`);
      }
    }
    
    return summary;
  } catch (error) {
    console.error('[SessionDebug] ❌ Error generating debug info:', error);
    return {
      error: String(error),
      timestamp: debugTimestamp
    };
  } finally {
    console.groupEnd();
  }
}

/**
 * Create a session transition monitor to detect session ID changes
 * and identify anomalies like jumping back to previous sessions
 */
export function createSessionMonitor() {
  let sessionHistory: Array<{id: string | null, timestamp: number}> = [];
  let isMonitoring = false;
  
  return {
    /**
     * Start monitoring session transitions
     */
    startMonitoring: () => {
      sessionHistory = [];
      isMonitoring = true;
      console.log('[SessionMonitor] Started monitoring session transitions');
    },
    
    /**
     * Record a session transition
     */
    recordSession: (sessionId: string | null) => {
      if (!isMonitoring) return;
      
      const now = Date.now();
      const lastEntry = sessionHistory.length > 0 ? sessionHistory[sessionHistory.length - 1] : null;
      
      // Only add if it's a different session than the last one
      if (!lastEntry || lastEntry.id !== sessionId) {
        // Check for potential jumping back
        const previousOccurrence = sessionHistory.findIndex(entry => entry.id === sessionId);
        
        if (previousOccurrence >= 0 && previousOccurrence < sessionHistory.length - 1) {
          // This session was seen before but not the most recent one - might be jumping back
          const timeSincePrevious = now - sessionHistory[previousOccurrence].timestamp;
          const secondsAgo = Math.floor(timeSincePrevious / 1000);
          
          console.warn(`[SessionMonitor] ANOMALY DETECTED: Session ${sessionId || 'null'} has reappeared after ${secondsAgo}s`);
          console.warn(`[SessionMonitor] Session history:`, sessionHistory.map(e => e.id));
          
          // Perform session state check automatically
          debugSessionState(sessionId);
        }
        
        sessionHistory.push({id: sessionId, timestamp: now});
        console.log(`[SessionMonitor] Recorded transition to session: ${sessionId || 'null'}`);
        
        // Keep history at a reasonable size
        if (sessionHistory.length > 10) {
          sessionHistory.shift();
        }
      }
    },
    
    /**
     * Stop monitoring and return results
     */
    stopMonitoring: () => {
      isMonitoring = false;
      console.log('[SessionMonitor] Stopped monitoring. Session transition history:', 
        sessionHistory.map(entry => `${entry.id || 'null'} at ${new Date(entry.timestamp).toISOString()}`));
      return [...sessionHistory];
    }
  };
}

/**
 * Global functions for debugging from browser console
 */
if (typeof window !== 'undefined') {
  // Add the session debug function
  (window as any).debugSession = (sessionId?: string) => {
    return debugSessionState(sessionId || null);
  };
  
  // Add the session monitor
  const monitor = createSessionMonitor();
  (window as any).sessionMonitor = {
    start: monitor.startMonitoring,
    record: monitor.recordSession,
    stop: monitor.stopMonitoring
  };
  
  // Add function to clear stuck sessions
  (window as any).clearStuckSession = (sessionId?: string) => {
    if (!sessionId) {
      console.error('Session ID is required');
      return {
        success: false,
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      };
    }
    console.log(`Clearing potentially stuck session: ${sessionId}`);
    sessionSyncService.clearStuckSession(sessionId);
    return {
      success: true,
      message: `Attempted to clear stuck session: ${sessionId}`,
      timestamp: new Date().toISOString()
    };
  };
  
  // Add an improved force continue function
  (window as any).forceContinueSession = async (sessionId?: string) => {
    if (!sessionId) {
      console.error('Session ID is required');
      return {
        success: false,
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      };
    }
    
    console.log(`Force continuing session: ${sessionId}`);
    try {
      // First clear any stuck operations
      sessionSyncService.clearStuckSession(sessionId);
      
      // Wait a moment for clearing to take effect
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Then force load the session
      const session = await sessionSyncService.forceLoadSession(sessionId);
      
      if (!session) {
        console.error(`Failed to force load session: ${sessionId}`);
        return {
          success: false,
          error: 'Failed to load session',
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('Session loaded successfully:', session);
      return {
        success: true,
        message: `Successfully loaded session: ${sessionId}`,
        sessionId: session.id,
        sessionName: session.name,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('Error forcing session continuation:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  };
  
  // Add a function to get the queue status
  (window as any).getQueueStatus = () => {
    const status = sessionSyncService.getQueueStatus();
    console.log('[SessionDebug] Queue Status:', status);
    return {
      ...status,
      timestamp: new Date().toISOString()
    };
  };
  
  // Add a function to attempt database recovery
  (window as any).fixDatabase = async () => {
    console.log('Attempting database recovery...');
    try {
      const response = await fetch('/api/database-maintenance/fix-permissions', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = `API returned error: ${response.status} ${response.statusText}`;
        console.error(error);
        return {
          success: false,
          error,
          timestamp: new Date().toISOString()
        };
      }
      
      const result = await response.json();
      console.log('Database recovery result:', result);
      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('Error during database recovery:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  };
  
  // Add a function to reset service state
  (window as any).resetServiceState = () => {
    console.log('Resetting session sync service state...');
    try {
      sessionSyncService.clearAllSessions();
      console.log('Service state reset successfully');
      return {
        success: true,
        message: 'Service state reset successfully',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('Error resetting service state:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  };
  
  // Add a function to run a health check
  (window as any).runHealthCheck = async () => {
    console.log('Running session service health check...');
    try {
      const result = await sessionSyncService.performHealthCheck();
      console.log('Health check result:', result);
      return {
        ...(result || {}),
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('Error running health check:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  };
}

// Named object for default export
const sessionDebugUtils = {
  debugSessionState,
  createSessionMonitor
};

export default sessionDebugUtils; 