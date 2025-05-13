/**
 * Database connection health utilities
 * Provides tools for checking database connection health and recovery
 */

import Database from 'better-sqlite3';
import { DbConnection } from './connection-pool';
import { DatabaseError, DatabaseErrorCategory, DatabaseErrorSeverity } from './database-errors';

/**
 * Health check result indicating the status of a connection
 */
export interface ConnectionHealthStatus {
  /** Whether the connection is healthy */
  isHealthy: boolean;
  
  /** The specific health check that failed, if any */
  failedCheck?: string;
  
  /** Error details if the health check failed */
  error?: DatabaseError;
  
  /** The time it took to run the health check in milliseconds */
  checkDuration: number;
  
  /** Metrics gathered during the health check */
  metrics: {
    /** Time it took to execute a simple query in milliseconds */
    queryTime?: number;
    
    /** Time it took to execute a write operation in milliseconds */
    writeTime?: number;
    
    /** Time it took to execute a pragma in milliseconds */
    pragmaTime?: number;
  };
}

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Whether to perform a write test (requires write access) */
  testWrite?: boolean;
  
  /** Whether to perform a pragma check */
  testPragma?: boolean;
  
  /** Whether to check for database corruption */
  testIntegrity?: boolean;
  
  /** Maximum time in milliseconds for a health check before considering it failed */
  timeout?: number;
}

/**
 * Default health check options
 */
const DEFAULT_HEALTH_CHECK_OPTIONS: HealthCheckOptions = {
  testWrite: false,
  testPragma: true,
  testIntegrity: false,
  timeout: 1000,
};

/**
 * Run a basic health check on a database connection
 * @param connection The database connection to check
 * @param options Health check options
 * @returns The health check result
 */
export function checkConnectionHealth(
  connection: DbConnection,
  options: HealthCheckOptions = DEFAULT_HEALTH_CHECK_OPTIONS
): ConnectionHealthStatus {
  const startTime = Date.now();
  const healthStatus: ConnectionHealthStatus = {
    isHealthy: false,
    checkDuration: 0,
    metrics: {},
  };
  
  try {
    // Only test what's appropriate for the connection type
    const opts = {
      ...DEFAULT_HEALTH_CHECK_OPTIONS,
      ...options,
      // If it's a read-only connection, don't test writes
      testWrite: options.testWrite && !connection.isReadOnly,
    };
    
    // 1. Simple read test - this will catch most common issues
    try {
      const readStart = Date.now();
      const result = connection.db.prepare('SELECT 1 AS test').get() as { test?: number };
      const readEnd = Date.now();
      
      healthStatus.metrics.queryTime = readEnd - readStart;
      
      if (!result || result.test !== 1) {
        healthStatus.failedCheck = 'simpleRead';
        throw new DatabaseError('Failed simple read test', {
          category: DatabaseErrorCategory.CONNECTION,
          severity: DatabaseErrorSeverity.CRITICAL,
        });
      }
    } catch (err) {
      healthStatus.failedCheck = 'simpleRead';
      healthStatus.error = DatabaseError.fromError(err, {
        context: { connectionId: connection.id, isReadOnly: connection.isReadOnly },
      });
      return finishHealthCheck(healthStatus, startTime);
    }
    
    // 2. Pragma check if requested
    if (opts.testPragma) {
      try {
        const pragmaStart = Date.now();
        const journalMode = connection.db.pragma('journal_mode');
        const pragmaEnd = Date.now();
        
        healthStatus.metrics.pragmaTime = pragmaEnd - pragmaStart;
        
        if (!journalMode) {
          healthStatus.failedCheck = 'pragmaCheck';
          throw new DatabaseError('Failed journal_mode pragma check', {
            category: DatabaseErrorCategory.CONNECTION,
            severity: DatabaseErrorSeverity.WARNING,
          });
        }
      } catch (err) {
        healthStatus.failedCheck = 'pragmaCheck';
        healthStatus.error = DatabaseError.fromError(err, {
          context: { connectionId: connection.id, isReadOnly: connection.isReadOnly },
        });
        return finishHealthCheck(healthStatus, startTime);
      }
    }
    
    // 3. Write test if requested and not a readonly connection
    if (opts.testWrite && !connection.isReadOnly) {
      try {
        const writeStart = Date.now();
        // Use a temporary table for the test to avoid affecting actual data
        connection.db.prepare('CREATE TEMPORARY TABLE IF NOT EXISTS _health_check (id INTEGER PRIMARY KEY, value TEXT)').run();
        connection.db.prepare('INSERT INTO _health_check (value) VALUES (?)').run(`test-${Date.now()}`);
        connection.db.prepare('DELETE FROM _health_check').run();
        const writeEnd = Date.now();
        
        healthStatus.metrics.writeTime = writeEnd - writeStart;
      } catch (err) {
        healthStatus.failedCheck = 'writeCheck';
        healthStatus.error = DatabaseError.fromError(err, {
          context: { connectionId: connection.id, isReadOnly: connection.isReadOnly },
        });
        return finishHealthCheck(healthStatus, startTime);
      }
    }
    
    // 4. Quick integrity check if requested
    if (opts.testIntegrity) {
      try {
        const result = connection.db.pragma('quick_check');
        
        if (Array.isArray(result)) {
          const hasOk = result.some((row: any) => 
            (row.quick_check && row.quick_check === 'ok') || 
            (typeof row === 'string' && row === 'ok')
          );
          
          if (!hasOk) {
            healthStatus.failedCheck = 'integrityCheck';
            throw new DatabaseError('Database integrity check failed', {
              category: DatabaseErrorCategory.INTEGRITY,
              severity: DatabaseErrorSeverity.CRITICAL,
              context: { integrityResult: result },
              reportToUser: true,
            });
          }
        }
      } catch (err) {
        healthStatus.failedCheck = 'integrityCheck';
        healthStatus.error = DatabaseError.fromError(err, {
          context: { connectionId: connection.id, isReadOnly: connection.isReadOnly },
        });
        return finishHealthCheck(healthStatus, startTime);
      }
    }
    
    // If we've reached here, all checks have passed
    healthStatus.isHealthy = true;
    return finishHealthCheck(healthStatus, startTime);
  } catch (unexpectedError) {
    // Catch any other unexpected errors
    healthStatus.failedCheck = 'unexpected';
    healthStatus.error = DatabaseError.fromError(unexpectedError, {
      context: { connectionId: connection.id, isReadOnly: connection.isReadOnly },
    });
    return finishHealthCheck(healthStatus, startTime);
  }
}

/**
 * Finishes a health check by calculating duration and returning the result
 */
function finishHealthCheck(
  status: ConnectionHealthStatus,
  startTime: number
): ConnectionHealthStatus {
  status.checkDuration = Date.now() - startTime;
  return status;
}

/**
 * Checks if a connection is stalled (locked in operation for too long)
 */
export function isConnectionStalled(
  connection: DbConnection, 
  thresholdMs: number = 10000
): boolean {
  if (!connection.inUse) {
    return false;
  }
  
  const now = Date.now();
  const timeSinceLastUse = now - connection.lastUsed;
  
  return timeSinceLastUse > thresholdMs;
}

/**
 * Attempts to recover a unhealthy connection
 * @param db The database instance
 * @returns true if recovery was successful, false otherwise
 */
export function attemptConnectionRecovery(db: Database.Database): boolean {
  try {
    // Try basic recovery techniques
    
    // 1. Reset busy timeout pragma
    db.pragma('busy_timeout = 5000');
    
    // 2. Check if connection can execute a simple query
    const result = db.prepare('SELECT 1 AS test').get() as { test?: number };
    
    // If the query succeeds, the connection is probably recovered
    return result !== undefined && result.test === 1;
  } catch (err) {
    console.error('Connection recovery failed:', err);
    return false;
  }
}