/**
 * Session Sync Service Types
 * 
 * Common types used across the session sync service modules.
 */

import { Session } from '@/types';

/**
 * Operation states for tracking session operations
 */
export type OperationState = 'idle' | 'loading' | 'saving' | 'deleting';

/**
 * Type definition for callback functions used in queue operations
 */
export type SessionCallback = () => Promise<any>;

/**
 * Type definition for session operations in the queue
 */
export interface SessionOperation {
  id: string;
  type: 'load' | 'save' | 'delete' | 'setActive';
  sessionId: string | null;
  callback: SessionCallback;
  priority: number;
  addedAt: number;
  timeoutMs?: number;
}

/**
 * Result of a health check operation
 */
export interface HealthCheckResult {
  isHealthy: boolean;
  stuckSessions: string[];
  stalledSessions: string[];
  needsReset: boolean;
  detailedLogging: boolean;
}

/**
 * Custom error for session errors
 */
export class SessionOperationError extends Error {
  originalError?: Error;
  
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'SessionOperationError';
    this.originalError = originalError;
  }
}

/**
 * Error thrown when an operation times out
 */
export class OperationTimeoutError extends Error {
  operationType: 'load' | 'save' | 'delete' | 'setActive';
  sessionId: string | null;

  constructor(
    message: string,
    operationType: 'load' | 'save' | 'delete' | 'setActive',
    sessionId: string | null
  ) {
    super(message);
    this.name = 'OperationTimeoutError';
    this.operationType = operationType;
    this.sessionId = sessionId;
  }
}

/**
 * Interface for operations that are queue-based
 */
export interface QueuedOperation {
  operation: 'load' | 'save' | 'delete' | 'setActive';
  sessionId: string | null;
  callback: SessionCallback;
  priority?: number;
  timeoutMs?: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  totalOperations: number;
  pendingOperations: number;
  processingOperations: number;
  operationsByType: {
    load: number;
    save: number;
    delete: number;
    setActive: number;
  };
  operationsByStatus: {
    pending: number;
    processing: number;
  };
}

/**
 * Session data response from the API
 */
export interface SessionApiResponse {
  session: Session | null;
  error?: string;
}

/**
 * Status of the operation queue
 */
export interface QueueStatus {
  activeOperations: [string, OperationState][];
  pendingOperations: Array<{
    id: string;
    operation: string;
    sessionId: string | null;
    priority: number;
    age: number;
  }>;
  cooldowns: Array<{
    sessionId: string;
    operation: string;
    remainingMs: number;
  }>;
  consecutiveErrors: number;
}

/**
 * API handler options
 */
export interface ApiHandlerOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
  rateLimitRequests?: number;
  rateLimitWindowSeconds?: number;
}

/**
 * State info for session operations
 */
export interface OperationStateInfo {
  state: OperationState;
  lastOperationId?: string;
  lastOperationDuration?: number;
  lastError?: Error;
  lastComplete: number;
  lastStartTime?: number;
  lastOperationType?: 'load' | 'save' | 'delete' | 'setActive';
} 