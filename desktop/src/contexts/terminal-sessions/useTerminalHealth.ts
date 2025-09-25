import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@/utils/tauri-invoke-wrapper';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// Health status types matching Rust enums
export type HealthStatus =
  | { type: 'healthy' }
  | { type: 'noOutput'; durationSecs: number }
  | { type: 'processDead'; exitCode?: number }
  | { type: 'agentRequiresAttention'; lastOutputSecs: number }
  | { type: 'disconnected' }
  | { type: 'persistenceLag'; pendingBytes: number };

export type HealthSeverity = 'good' | 'warning' | 'critical';

export type RecoveryAction = 'sendPrompt' | 'interrupt' | 'restart' | 'reattach' | 'flushPersistence' | 'none';

export interface HealthCheckResult {
  jobId: string;
  status: HealthStatus;
  lastCheck: number;
  recoveryAttempts: number;
  lastRecoveryAttempt?: number;
  processAlive: boolean;
  lastOutputAt?: number;
  outputChannelActive: boolean;
  persistenceQueueSize: number;
}

export interface HealthHistoryEntry {
  timestamp: number;
  status: HealthStatus;
  recoveryAction?: RecoveryAction;
}

export interface HealthEvent {
  jobId: string;
  timestamp: number;
  action?: RecoveryAction;
  status?: HealthStatus;
  success?: boolean;
  error?: string;
}

export interface UseTerminalHealthResult {
  isHealthy: boolean;
  severity: HealthSeverity;
  lastCheck?: number;
  issues: HealthStatus[];
  recovering: boolean;
  recoveryAttempts: number;
  healthHistory: HealthHistoryEntry[];
  triggerHealthCheck: () => Promise<void>;
  triggerRecovery: (action: RecoveryAction) => Promise<void>;
  events: HealthEvent[];
}

// Helper functions to determine health properties
function getHealthSeverity(status: HealthStatus): HealthSeverity {
  switch (status.type) {
    case 'healthy':
      return 'good';
    case 'noOutput':
      return status.durationSecs > 30 ? 'warning' : 'good';
    case 'processDead':
      return 'critical';
    case 'agentRequiresAttention':
      return 'warning';
    case 'disconnected':
      return 'warning';
    case 'persistenceLag':
      return status.pendingBytes > 1024 * 1024 ? 'critical' : 'warning';
    default:
      return 'good';
  }
}

function isHealthy(status: HealthStatus): boolean {
  return status.type === 'healthy';
}

export function useTerminalHealth(jobId: string): UseTerminalHealthResult {
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthHistoryEntry[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [events, setEvents] = useState<HealthEvent[]>([]);

  const pollIntervalRef = useRef<number | null>(null);
  const unlistenFunctionsRef = useRef<UnlistenFn[]>([]);

  // Start health monitoring when component mounts
  useEffect(() => {
    let mounted = true;

    const startMonitoring = async () => {
      try {
        // Set up event listeners for health events
        const unlistenRegistered = await listen<HealthEvent>('terminal-health:registered', (event) => {
          if (event.payload.jobId === jobId && mounted) {
            setEvents(prev => [...prev.slice(-9), event.payload]); // Keep last 10 events
          }
        });

        const unlistenUnregistered = await listen<HealthEvent>('terminal-health:unregistered', (event) => {
          if (event.payload.jobId === jobId && mounted) {
            setEvents(prev => [...prev.slice(-9), event.payload]);
          }
        });

        const unlistenRecoveryStart = await listen<HealthEvent>('terminal-health:recovery-start', (event) => {
          if (event.payload.jobId === jobId && mounted) {
            setRecovering(true);
            setEvents(prev => [...prev.slice(-9), event.payload]);
          }
        });

        const unlistenRecoveryResult = await listen<HealthEvent>('terminal-health:recovery-result', (event) => {
          if (event.payload.jobId === jobId && mounted) {
            setRecovering(false);
            setEvents(prev => [...prev.slice(-9), event.payload]);
          }
        });

        unlistenFunctionsRef.current = [
          unlistenRegistered,
          unlistenUnregistered,
          unlistenRecoveryStart,
          unlistenRecoveryResult,
        ];

        // Register session for health monitoring
        await invoke('register_terminal_health_session', { jobId });

        // Start polling health status every 3 seconds
        const pollHealth = async () => {
          if (!mounted) return;

          try {
            const result = await invoke<HealthCheckResult>('get_terminal_health_status', { jobId });
            if (mounted) {
              setHealthResult(result);
            }
          } catch (error) {
            console.warn(`Failed to get health status for job ${jobId}:`, error);
          }
        };

        // Get initial health history
        try {
          const history = await invoke<HealthHistoryEntry[]>('get_terminal_health_history', { jobId });
          if (mounted) {
            setHealthHistory(history);
          }
        } catch (error) {
          console.warn(`Failed to get health history for job ${jobId}:`, error);
        }

        // Initial health check
        await pollHealth();

        // Set up polling interval
        pollIntervalRef.current = window.setInterval(pollHealth, 3000);

      } catch (error) {
        console.error(`Failed to start health monitoring for job ${jobId}:`, error);
      }
    };

    startMonitoring();

    return () => {
      mounted = false;

      // Clear polling interval
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      // Unlisten from events
      unlistenFunctionsRef.current.forEach(unlisten => {
        try {
          unlisten();
        } catch (error) {
          console.warn('Failed to unlisten from health event:', error);
        }
      });
      unlistenFunctionsRef.current = [];

      // Unregister session from health monitoring
      invoke('unregister_terminal_health_session', { jobId }).catch((error: unknown) => {
        console.warn(`Failed to unregister health session for job ${jobId}:`, error);
      });
    };
  }, [jobId]);

  // Manual health check trigger
  const triggerHealthCheck = useCallback(async () => {
    try {
      const result = await invoke<HealthCheckResult>('get_terminal_health_status', { jobId });
      setHealthResult(result);

      // Update health history
      const history = await invoke<HealthHistoryEntry[]>('get_terminal_health_history', { jobId });
      setHealthHistory(history);
    } catch (error) {
      console.error(`Failed to trigger health check for job ${jobId}:`, error);
      throw error;
    }
  }, [jobId]);

  // Manual recovery trigger
  const triggerRecovery = useCallback(async (action: RecoveryAction) => {
    try {
      setRecovering(true);
      await invoke('trigger_terminal_recovery', { jobId, action });

      // Wait a moment then refresh health status
      setTimeout(async () => {
        try {
          await triggerHealthCheck();
        } finally {
          setRecovering(false);
        }
      }, 2000);
    } catch (error) {
      setRecovering(false);
      console.error(`Failed to trigger recovery for job ${jobId}:`, error);
      throw error;
    }
  }, [jobId, triggerHealthCheck]);

  // Compute derived values
  const currentStatus = healthResult?.status;
  const isCurrentlyHealthy = currentStatus ? isHealthy(currentStatus) : true;
  const currentSeverity = currentStatus ? getHealthSeverity(currentStatus) : 'good';
  const issues: HealthStatus[] = currentStatus && !isHealthy(currentStatus) ? [currentStatus] : [];

  return {
    isHealthy: isCurrentlyHealthy,
    severity: currentSeverity,
    lastCheck: healthResult?.lastCheck,
    issues,
    recovering,
    recoveryAttempts: healthResult?.recoveryAttempts || 0,
    healthHistory,
    triggerHealthCheck,
    triggerRecovery,
    events,
  };
}

// Utility hook for displaying health status
export function useHealthStatusDisplay(status: HealthStatus): {
  color: string;
  icon: string;
  message: string;
  action?: RecoveryAction;
} {
  switch (status.type) {
    case 'healthy':
      return {
        color: 'green',
        icon: '●',
        message: 'Terminal is healthy',
      };

    case 'noOutput':
      return {
        color: status.durationSecs > 30 ? 'yellow' : 'green',
        icon: '●',
        message: `No output for ${status.durationSecs}s`,
        action: 'sendPrompt',
      };

    case 'processDead':
      return {
        color: 'red',
        icon: '●',
        message: status.exitCode ? `Process exited (${status.exitCode})` : 'Process died',
        action: 'restart',
      };

    case 'agentRequiresAttention':
      return {
        color: 'yellow',
        icon: '●',
        message: `Agent requires attention (${status.lastOutputSecs}s)`,
        action: 'interrupt',
      };

    case 'disconnected':
      return {
        color: 'yellow',
        icon: '●',
        message: 'Output channel disconnected',
        action: 'reattach',
      };

    case 'persistenceLag':
      return {
        color: status.pendingBytes > 1024 * 1024 ? 'red' : 'yellow',
        icon: '●',
        message: `Persistence lag (${Math.round(status.pendingBytes / 1024)}KB)`,
        action: 'flushPersistence',
      };

    default:
      return {
        color: 'gray',
        icon: '●',
        message: 'Unknown status',
      };
  }
}

// Recovery action display names
export const RECOVERY_ACTION_NAMES: Record<RecoveryAction, string> = {
  sendPrompt: 'Send Enter',
  interrupt: 'Send Ctrl+C',
  restart: 'Restart Session',
  reattach: 'Reattach Output',
  flushPersistence: 'Flush Data',
  none: 'No Action',
};