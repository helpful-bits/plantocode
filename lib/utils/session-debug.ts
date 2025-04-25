/**
 * Session Debug Utilities
 * 
 * Helper functions for debugging session synchronization issues
 */

import { sessionSyncService } from '@/lib/services/session-sync-service';

/**
 * Logs detailed information about the current session state
 * @param sessionId The session ID to check, or null for global state
 */
export function debugSessionState(sessionId: string | null = null): void {
  console.group(`[SessionDebug] Session State Check${sessionId ? ` for ${sessionId}` : ' (global)'}`);
  
  try {
    const queueStatus = sessionSyncService.getQueueStatus();
    
    // 1. Check active operations
    console.log('Active Operations:');
    if (queueStatus.activeOperations.length === 0) {
      console.log('  None');
    } else {
      queueStatus.activeOperations.forEach(([sid, state]) => {
        const isRelevant = !sessionId || sid === sessionId;
        console.log(`  ${sid}: ${state}${isRelevant ? ' (RELEVANT)' : ''}`);
      });
    }
    
    // 2. Check pending operations
    console.log('\nPending Operations:');
    if (queueStatus.pendingOperations.length === 0) {
      console.log('  None');
    } else {
      queueStatus.pendingOperations.forEach(op => {
        const isRelevant = !sessionId || op.sessionId === sessionId;
        console.log(`  ${op.id}: ${op.operation} for ${op.sessionId || 'global'}, priority ${op.priority}, waiting for ${Math.floor(op.age / 1000)}s${isRelevant ? ' (RELEVANT)' : ''}`);
      });
    }
    
    // 3. Check cooldowns
    console.log('\nCooldowns:');
    if (queueStatus.cooldowns.length === 0) {
      console.log('  None');
    } else {
      queueStatus.cooldowns.forEach(cooldown => {
        const isRelevant = !sessionId || cooldown.sessionId === sessionId;
        console.log(`  ${cooldown.sessionId}: ${cooldown.operation} for ${Math.floor(cooldown.remainingMs / 1000)}s remaining${isRelevant ? ' (RELEVANT)' : ''}`);
      });
    }
    
    // 4. Current session state
    if (sessionId) {
      const state = sessionSyncService.getSessionState(sessionId);
      const isBusy = sessionSyncService.isSessionBusy(sessionId);
      console.log(`\nSession ${sessionId} state: ${state} (busy: ${isBusy})`);
    }
    
    console.log('\nDebug complete.');
  } catch (error) {
    console.error('[SessionDebug] Error generating debug info:', error);
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
    debugSessionState(sessionId || null);
  };
  
  // Add the session monitor
  const monitor = createSessionMonitor();
  (window as any).sessionMonitor = {
    start: monitor.startMonitoring,
    record: monitor.recordSession,
    stop: monitor.stopMonitoring
  };
}

export default {
  debugSessionState,
  createSessionMonitor
}; 