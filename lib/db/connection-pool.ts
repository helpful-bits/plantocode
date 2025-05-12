import Database from 'better-sqlite3';
import crypto from 'crypto';
import { ensureDbPermissionsSync, handleReadonlyDatabaseSync, handleReadonlyDatabase } from './connection-manager';
import fs from 'fs';
import path from 'path';
import { APP_DATA_DIR, DB_FILE } from './constants';
import { DatabaseError, DatabaseErrorCategory, DatabaseErrorSeverity, dispatchDatabaseErrorEvent, DatabaseErrorMessages } from './database-errors';
import { checkConnectionHealth, ConnectionHealthStatus, isConnectionStalled, attemptConnectionRecovery } from './connection-health';

// Connection pool settings
// Increased from 3 to 7 to accommodate worker concurrency (5) plus buffer
const POOL_SIZE = process.env.CONNECTION_POOL_SIZE ? parseInt(process.env.CONNECTION_POOL_SIZE, 10) : 7;
const MAX_CONNECTION_AGE_MS = 300000; // 5 minutes
const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds busy timeout
const MAX_RETRIES = 3; // Maximum retries for locked database
const RETRY_DELAY_BASE_MS = 200; // Base delay for exponential backoff
const HEALTH_CHECK_INTERVAL_MS = 60000; // Check connection health every minute
const STALLED_CONNECTION_THRESHOLD_MS = 10000; // Consider connection stalled after 10 seconds of inactivity
const IDLE_CONNECTION_HEALTH_CHECK = false; // Whether to periodically health check idle connections

// Connection performance metrics
interface ConnectionMetrics {
  operationCount: number;
  successCount: number;
  failureCount: number;
  totalOperationTimeMs: number;
  lastOperationTimeMs: number;
  avgOperationTimeMs: number;
  healthCheckCount: number;
  lastHealthCheck?: ConnectionHealthStatus;
  lastHealthCheckTime?: number;
}

// Add debug logging control
const isDebugEnabled = () => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.CONNECTION_POOL_DEBUG === 'true';
  }
  return false;
};

// Wrapper for debug logs
const debugLog = (message: string, ...args: any[]) => {
  if (isDebugEnabled()) {
    console.debug(`[ConnectionPool] ${message}`, ...args);
  }
};

// Wrapper for fallback warning logs - set to false to disable these specific warnings
// This can be enabled with CONNECTION_POOL_FALLBACK_WARN=true env var
const logFallbackWarning = (message: string, ...args: any[]) => {
  if (process.env.CONNECTION_POOL_FALLBACK_WARN === 'true') {
    console.warn(`[ConnectionPool] ${message}`, ...args);
  } else {
    // Still log at debug level if debug mode is enabled
    debugLog(message, ...args);
  }
};

export interface DbConnection {
  id: string;
  db: Database.Database;
  inUse: boolean;
  lastUsed: number;
  isReadOnly: boolean;
  operationCount: number; // Track how many operations this connection has performed
  createdAt: number; // When this connection was created
  metrics: ConnectionMetrics; // Performance metrics for this connection
}

/**
 * Create a database instance with custom method bindings
 * Ensures proper function context and avoids promisify issues with webpack/browser
 */
function createDatabaseInstance(filename: string, options: Database.Options): Database.Database {
  try {
    // Create the database instance
    const db = new Database(filename, options);
    
    // Replace backup with a custom implementation that doesn't use promisify
    const originalBackup = db.backup;
    db.backup = function customBackup(destination, options) {
      if (typeof originalBackup === 'function') {
        return originalBackup.call(db, destination, options);
      } else {
        throw new DatabaseError('Original backup method is not a function', {
          category: DatabaseErrorCategory.OTHER,
          severity: DatabaseErrorSeverity.WARNING
        });
      }
    };
    
    return db;
  } catch (error) {
    // Convert to our standard DatabaseError format
    const dbError = DatabaseError.fromError(error, {
      context: { filename, options }
    });
    
    // Report critical connection errors to UI
    if (dbError.severity === DatabaseErrorSeverity.CRITICAL || 
        dbError.severity === DatabaseErrorSeverity.FATAL) {
      dispatchDatabaseErrorEvent(dbError);
    }
    
    // Rethrow with our enhanced error
    throw dbError;
  }
}

class ConnectionPool {
  private pool: DbConnection[] = [];
  private maxSize: number;
  private lastMaintenanceTime: number = 0;
  private readonly MAINTENANCE_INTERVAL_MS = 60000; // Run maintenance every minute
  private poolMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalRetries: 0,
    connectionCreationCount: 0,
    stalledConnectionsRecovered: 0,
    healthIssuesDetected: 0,
    readonlyFallbacks: 0,
    peakConnectionCount: 0
  };
  
  constructor(size: number = POOL_SIZE) {
    this.maxSize = size;
    this.initialize();
  }
  
  private initialize() {
    try {
      // Ensure the app directory exists and has correct permissions
      ensureDbPermissionsSync();
      
      // Create initial connections - always create a write connection first
      this.createConnection(false);
      
      // Create an initial read-only connection if the pool size allows for it
      if (this.maxSize >= 2) {
        this.createConnection(true);
        debugLog(`Created initial read-only connection alongside write connection`);
      }
      
      // Set up maintenance interval - Run less frequently
      setInterval(() => this.maintainPool(), this.MAINTENANCE_INTERVAL_MS);
      
      // Update peak connection count
      this.poolMetrics.peakConnectionCount = Math.max(this.poolMetrics.peakConnectionCount, this.pool.length);
    } catch (error) {
      const dbError = DatabaseError.fromError(error, {
        severity: DatabaseErrorSeverity.CRITICAL,
        category: DatabaseErrorCategory.CONNECTION,
        context: { maxSize: this.maxSize },
        reportToUser: true
      });
      
      console.error(`ConnectionPool initialization failed: ${dbError.toString()}`);
      dispatchDatabaseErrorEvent(dbError);
      
      // Still try to set up maintenance
      setInterval(() => this.maintainPool(), this.MAINTENANCE_INTERVAL_MS);
      
      // Rethrow so callers know initialization failed
      throw dbError;
    }
  }
  
  private createConnection(readOnly: boolean = false): DbConnection {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    try {
      // Fix permissions only before opening a write connection
      if (!readOnly) {
        ensureDbPermissionsSync();
      }
      
      const options: Database.Options = {
        readonly: readOnly,
        fileMustExist: false,
        timeout: CONNECTION_TIMEOUT_MS
      };
      
      // Use the custom database creation function that handles browser issues
      const db = createDatabaseInstance(DB_FILE, options);
      
      try {
        // Configure connection using pragmas
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 5000');
        
        // Permissions are generally already set by now, so we can skip this call
        // unless we're creating a new write connection that might need write access to the DB
        if (!readOnly && !fs.existsSync(DB_FILE)) {
          ensureDbPermissionsSync();
        }
      } catch (pragmaError) {
        // If pragmas fail, close the connection and throw
        try { db.close(); } catch (e) { /* ignore close error */ }
        
        throw DatabaseError.fromError(pragmaError, {
          severity: DatabaseErrorSeverity.CRITICAL,
          category: DatabaseErrorCategory.CONNECTION,
          context: { readOnly, connectionId: id },
          reportToUser: false
        });
      }
      
      // Create connection object with metrics
      const conn: DbConnection = {
        id,
        db,
        inUse: false,
        lastUsed: now,
        isReadOnly: readOnly,
        operationCount: 0,
        createdAt: now,
        metrics: {
          operationCount: 0,
          successCount: 0,
          failureCount: 0,
          totalOperationTimeMs: 0,
          lastOperationTimeMs: 0,
          avgOperationTimeMs: 0,
          healthCheckCount: 0
        }
      };
      
      // Update pool metrics
      this.poolMetrics.connectionCreationCount++;
      
      // Add to pool
      this.pool.push(conn);
      
      // Run health check on new connection
      try {
        const healthStatus = checkConnectionHealth(conn);
        conn.metrics.lastHealthCheck = healthStatus;
        conn.metrics.lastHealthCheckTime = now;
        conn.metrics.healthCheckCount++;
        
        if (!healthStatus.isHealthy) {
          // Log warning but keep the connection if it's just a non-critical health check failure
          console.warn(`[ConnectionPool] New connection ${conn.id} health check warning: ${healthStatus.failedCheck}`);
          this.poolMetrics.healthIssuesDetected++;
        }
      } catch (healthError) {
        // Just log health check errors for new connections, don't block creation
        console.error(`[ConnectionPool] Health check error for new connection ${conn.id}:`, healthError);
      }
      
      // Update peak connection count
      this.poolMetrics.peakConnectionCount = Math.max(this.poolMetrics.peakConnectionCount, this.pool.length);
      
      debugLog(`Created new ${readOnly ? 'readonly' : 'write'} connection ${id}`);
      return conn;
    } catch (error) {
      // Handle connection creation failure
      const dbError = (error instanceof DatabaseError)
        ? error
        : DatabaseError.fromError(error, {
            severity: DatabaseErrorSeverity.CRITICAL,
            category: DatabaseErrorCategory.CONNECTION,
            context: { readOnly, connectionId: id }
          });
      
      console.error(`Error creating database connection: ${dbError.toString()}`);
      
      // Dispatch database error event for UI to handle
      dispatchDatabaseErrorEvent(dbError);
      
      // Fallback to readonly if we get a permission error on a write connection
      if (!readOnly && dbError.category === DatabaseErrorCategory.PERMISSION) {
        // Try to fix the readonly database
        if (handleReadonlyDatabaseSync()) {
          // Retry creating a writable connection since we fixed the issue
          try {
            // Use the custom database creation function
            const db = createDatabaseInstance(DB_FILE, {
              readonly: false,
              fileMustExist: false,
              timeout: CONNECTION_TIMEOUT_MS
            });
            
            // Configure connection using pragmas
            db.pragma('journal_mode = WAL');
            db.pragma('foreign_keys = ON');
            db.pragma('busy_timeout = 5000');
            
            const conn: DbConnection = {
              id,
              db,
              inUse: false,
              lastUsed: now,
              isReadOnly: false,
              operationCount: 0,
              createdAt: now,
              metrics: {
                operationCount: 0,
                successCount: 0,
                failureCount: 0,
                totalOperationTimeMs: 0,
                lastOperationTimeMs: 0,
                avgOperationTimeMs: 0,
                healthCheckCount: 0
              }
            };
            
            debugLog(`Successfully fixed readonly database issue`);
            this.pool.push(conn);
            return conn;
          } catch (retryErr) {
            console.error(`Still failed to create writable connection after fix:`, retryErr);
          }
        }
        
        console.warn(`Falling back to readonly mode`);
        this.poolMetrics.readonlyFallbacks++;
        return this.createConnection(true); // Retry with readonly flag
      }
      
      throw dbError;
    }
  }
  
  getConnection(readOnly: boolean = false): DbConnection {
    // Check if maintenance is needed before getting a connection
    this.checkAndRunMaintenance();
    
    // When readOnly is false, prioritize finding a write connection
    let conn: DbConnection | undefined;
    
    if (readOnly) {
      // For read operations, we can use either readonly or write connections
      // First try to find an unused read-only connection
      conn = this.pool.find(c => !c.inUse && c.isReadOnly);
      
      // If no read-only found and pool has space, create one
      if (!conn && this.pool.length < this.maxSize) {
        const newConn = this.createConnection(true); // Force read-only creation
        newConn.inUse = true;
        newConn.operationCount = 1;
        debugLog(`Created new readonly connection ${newConn.id} for read operation`);
        return newConn;
      }
      
      // If no readonly connection found and can't create new one, look for a write connection that's free
      if (!conn) {
        conn = this.pool.find(c => !c.inUse && !c.isReadOnly);
      }
      
      if (conn) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        conn.operationCount++;
        if (conn.isReadOnly) {
          debugLog(`Reusing existing readonly connection ${conn.id} for read operation`);
        } else {
          // Using logFallbackWarning instead of console.trace to avoid stack traces in the logs
          logFallbackWarning(`Fallback: Reusing existing write connection ${conn.id} for read operation (Pool possibly full or only write connections available)`);
        }
        return conn;
      }
    } else {
      // For write operations, we need a write connection
      // First try to find an unused write connection
      conn = this.pool.find(c => !c.inUse && !c.isReadOnly);
      
      // If no write connection found and pool has space, create a new write connection
      if (!conn && this.pool.length < this.maxSize) {
        const newConn = this.createConnection(false);
        newConn.inUse = true;
        newConn.operationCount = 1;
        debugLog(`Created new write connection ${newConn.id} for write operation`);
        return newConn;
      }
      
      // Reuse an existing write connection
      if (conn) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        conn.operationCount++;
        debugLog(`Reusing existing write connection ${conn.id} for write operation`);
        return conn;
      }
      
      // Find a connection that's not currently in use
      const availableConnection = this.pool.find(c => !c.inUse);
      const writeConnection = this.pool.find(c => !c.inUse && !c.isReadOnly);
      const readonlyConnection = this.pool.find(c => !c.inUse && c.isReadOnly);
      
      // Create a new connection if we have space
      if (!availableConnection && this.pool.length < this.maxSize) {
        const newConn = this.createConnection(readOnly);
        newConn.inUse = true;
        newConn.lastUsed = Date.now();
        newConn.operationCount = 1;
        debugLog(`Created new ${newConn.isReadOnly ? 'readonly' : 'write'} connection ${newConn.id}`);
        return newConn;
      }
      
      // If we're looking for a write connection but only have readonly, close one and create a write
      if (!readOnly && writeConnection === undefined && readonlyConnection !== undefined) {
        const readonlyConn = readonlyConnection;
        
        this.pool = this.pool.filter(c => c.id !== readonlyConn.id);
        
        debugLog(`Closing unused readonly connection ${readonlyConn.id} to create a write connection`);
        
        try {
          readonlyConn.db.close();
        } catch (err) {
          // Ignore errors on close
        }
        
        const newConn = this.createConnection(false);
        newConn.inUse = true;
        newConn.operationCount = 1;
        
        debugLog(`Created new write connection ${newConn.id} after closing readonly connection`);
        return newConn;
      }
    }
    
    // No available connections, check for stalled connections and recovery options
    if (this.pool.filter(c => !c.inUse).length === 0) {
      console.warn(`All connections in use, checking for stalled connections...`);
      
      // Get the oldest in-use connection that's been locked for more than 10 seconds
      const now = Date.now();
      const stalledConnections = this.pool
        .filter(c => c.inUse && isConnectionStalled(c, STALLED_CONNECTION_THRESHOLD_MS))
        .sort((a, b) => a.lastUsed - b.lastUsed);
      
      if (stalledConnections.length > 0) {
        const oldestInUseConnection = stalledConnections[0];
        const stalledTime = now - oldestInUseConnection.lastUsed;
        
        console.warn(`Forcibly releasing connection ${oldestInUseConnection.id} that's been in use for ${stalledTime}ms`);
        
        // Reset its state
        oldestInUseConnection.inUse = false;
        oldestInUseConnection.lastUsed = now;
        
        // Try recovery on the stalled connection
        try {
          const recovered = attemptConnectionRecovery(oldestInUseConnection.db);
          if (recovered) {
            console.log(`Successfully recovered stalled connection ${oldestInUseConnection.id}`);
            this.poolMetrics.stalledConnectionsRecovered++;
            
            // Use the recovered connection
            oldestInUseConnection.inUse = true;
            oldestInUseConnection.lastUsed = now;
            oldestInUseConnection.operationCount++;
            
            // Run a health check on the recovered connection
            try {
              const healthStatus = checkConnectionHealth(oldestInUseConnection);
              oldestInUseConnection.metrics.lastHealthCheck = healthStatus;
              oldestInUseConnection.metrics.lastHealthCheckTime = now;
              oldestInUseConnection.metrics.healthCheckCount++;
              
              if (!healthStatus.isHealthy) {
                console.warn(`Recovered connection ${oldestInUseConnection.id} has health issues: ${healthStatus.failedCheck}`);
                this.poolMetrics.healthIssuesDetected++;
              }
            } catch (healthError) {
              console.error(`Health check error on recovered connection:`, healthError);
            }
            
            return oldestInUseConnection;
          }
        } catch (recoveryErr) {
          console.error(`Error attempting recovery on stalled connection ${oldestInUseConnection.id}:`, recoveryErr);
        }
        
        // If recovery failed or wasn't attempted, try to create a new connection
        try {
          // Attempt to recreate this connection with the same read/write mode
          const freshConn = this.createConnection(oldestInUseConnection.isReadOnly);
          freshConn.inUse = true;
          freshConn.operationCount = 1;
          debugLog(`Created fresh ${freshConn.isReadOnly ? 'readonly' : 'write'} connection ${freshConn.id} to replace stalled connection`);
          return freshConn;
        } catch (err) {
          console.error(`Error recreating stalled connection:`, err);
          
          // As a last resort, try to reuse the stalled connection
          console.warn(`Reusing potentially stalled connection ${oldestInUseConnection.id} as last resort`);
          return oldestInUseConnection;
        }
      }
    }
    
    // If we still don't have a connection, throw an error
    throw new DatabaseError(
      `No database connections available. Pool size: ${this.pool.length}, max size: ${this.maxSize}`,
      {
        severity: DatabaseErrorSeverity.CRITICAL,
        category: DatabaseErrorCategory.CONNECTION,
        context: {
          poolSize: this.pool.length,
          maxSize: this.maxSize,
          readOnly: readOnly,
          activeConnections: this.getActiveCount(),
        },
        reportToUser: true
      }
    );
  }
  
  releaseConnection(conn: DbConnection) {
    if (!conn) {
      console.warn(`Attempted to release null or undefined connection`);
      return;
    }
    
    debugLog(`Releasing connection ${conn.id} (${conn.isReadOnly ? 'readonly' : 'write'}) back to pool`);
    
    if (!this.pool.find(c => c.id === conn.id)) {
      console.warn(`Attempted to release connection ${conn.id} that is not in the pool. This may indicate a resource leak.`);
      return;
    }
    
    // Mark connection as no longer in use
    const connectionIndex = this.pool.findIndex(c => c.id === conn.id);
    if (connectionIndex !== -1) {
      this.pool[connectionIndex].inUse = false;
      this.pool[connectionIndex].lastUsed = Date.now();
      
      // Optionally check connection health when released back to pool
      if (IDLE_CONNECTION_HEALTH_CHECK) {
        try {
          const healthStatus = checkConnectionHealth(this.pool[connectionIndex]);
          this.pool[connectionIndex].metrics.lastHealthCheck = healthStatus;
          this.pool[connectionIndex].metrics.lastHealthCheckTime = Date.now();
          this.pool[connectionIndex].metrics.healthCheckCount++;
          
          if (!healthStatus.isHealthy) {
            console.warn(`Released connection ${conn.id} has health issues: ${healthStatus.failedCheck}`);
            this.poolMetrics.healthIssuesDetected++;
            
            // For severe health issues, close and remove the connection
            if (healthStatus.error && 
               (healthStatus.error.severity === DatabaseErrorSeverity.CRITICAL || 
                healthStatus.error.severity === DatabaseErrorSeverity.FATAL)) {
              console.error(`Closing unhealthy connection ${conn.id} due to critical health issues`);
              
              try {
                this.pool[connectionIndex].db.close();
              } catch (err) {
                // Ignore close errors
              }
              
              // Remove from pool
              this.pool = this.pool.filter(c => c.id !== conn.id);
              return;
            }
          }
        } catch (healthError) {
          console.error(`Health check error on released connection:`, healthError);
        }
      }
      
      debugLog(`Connection ${conn.id} is now available in the pool`);
    } else {
      console.error(`Failed to find connection ${conn.id} in pool during release`);
    }
  }
  
  private checkAndRunMaintenance() {
    const now = Date.now();
    if (now - this.lastMaintenanceTime > this.MAINTENANCE_INTERVAL_MS) {
      this.maintainPool();
      this.lastMaintenanceTime = now;
    }
  }
  
  private maintainPool() {
    const now = Date.now();
    this.lastMaintenanceTime = now;
    
    // Get all connections that haven't been used recently and are not in use
    const oldConnections = this.pool.filter(
      conn => !conn.inUse && (now - conn.lastUsed > MAX_CONNECTION_AGE_MS)
    );
    
    // Calculate current connection type counts
    let readOnlyCount = this.pool.filter(conn => conn.isReadOnly).length;
    let writeCount = this.pool.length - readOnlyCount;

    // Get connections to close
    const connectionsToClose: DbConnection[] = [];

    // Check for unhealthy connections first
    if (IDLE_CONNECTION_HEALTH_CHECK) {
      const idleConnections = this.pool.filter(conn => !conn.inUse);

      for (const conn of idleConnections) {
        // Skip if already marked for closing
        if (connectionsToClose.includes(conn)) continue;

        // Skip recent health checks to avoid excessive checking
        if (conn.metrics.lastHealthCheckTime &&
            now - conn.metrics.lastHealthCheckTime < HEALTH_CHECK_INTERVAL_MS) {
          continue;
        }

        try {
          const healthStatus = checkConnectionHealth(conn);
          conn.metrics.lastHealthCheck = healthStatus;
          conn.metrics.lastHealthCheckTime = now;
          conn.metrics.healthCheckCount++;

          if (!healthStatus.isHealthy) {
            console.warn(`Idle connection ${conn.id} has health issues: ${healthStatus.failedCheck}`);
            this.poolMetrics.healthIssuesDetected++;

            // Only close unhealthy connections if they're not the last of their type
            if ((conn.isReadOnly && readOnlyCount > 1) ||
                (!conn.isReadOnly && writeCount > 1)) {
              connectionsToClose.push(conn);

              // Update counts for connections being closed
              if (conn.isReadOnly) {
                readOnlyCount--;
              } else {
                writeCount--;
              }
            }
          }
        } catch (err) {
          console.error(`Error checking health of connection ${conn.id}:`, err);
        }
      }
    }
    
    // Close old connections that exceed our age limit
    for (const conn of oldConnections) {
      // Skip if already marked for closing
      if (connectionsToClose.includes(conn)) continue;

      // Always ensure we keep at least one write connection if possible
      if (conn.isReadOnly || (writeCount > 1)) {
        connectionsToClose.push(conn);

        // If this is a write connection, decrement our count for tracking
        if (!conn.isReadOnly) {
          writeCount--;
        }
      }
    }
    
    // Close the identified connections
    if (connectionsToClose.length > 0) {
      debugLog(`Maintenance: Closing ${connectionsToClose.length} old/excess connections`);
      
      for (const conn of connectionsToClose) {
        // Remove from the pool
        this.pool = this.pool.filter(c => c.id !== conn.id);
        
        // Close the connection
        try {
          conn.db.close();
          debugLog(`Closed connection ${conn.id} (${conn.isReadOnly ? 'readonly' : 'write'}) after ${Math.floor((now - conn.lastUsed) / 1000)}s idle`);
        } catch (err) {
          console.error(`Error closing connection ${conn.id}:`, err);
        }
      }
    }
    
    // Log pool stats for monitoring
    const readOnlyAvailable = this.pool.filter(conn => conn.isReadOnly && !conn.inUse).length;
    const writeAvailable = this.pool.filter(conn => !conn.isReadOnly && !conn.inUse).length;
    const totalReadOnly = this.pool.filter(conn => conn.isReadOnly).length;
    const totalWrite = this.pool.length - totalReadOnly;
    
    debugLog(`Pool stats: ReadOnly ${readOnlyAvailable}/${totalReadOnly} available, Write ${writeAvailable}/${totalWrite} available`);
    
    // Log global pool metrics periodically
    debugLog(`Pool metrics: operations=${this.poolMetrics.totalOperations}, success=${this.poolMetrics.successfulOperations}, failures=${this.poolMetrics.failedOperations}, retries=${this.poolMetrics.totalRetries}, recoveries=${this.poolMetrics.stalledConnectionsRecovered}, health issues=${this.poolMetrics.healthIssuesDetected}`);
  }
  
  /**
   * Execute a database operation
   */
  public async withConnection<T>(operation: (db: Database.Database) => T, readOnly: boolean = false): Promise<T> {
    const operationId = crypto.randomUUID().substring(0, 8);
    let conn: DbConnection | undefined;
    let result: T;
    let retries = 0;
    const startTime = Date.now();
    
    // Update pool metrics
    this.poolMetrics.totalOperations++;
    
    while (true) {
      try {
        // Get a connection from the pool
        if (!conn) {
          try {
            conn = this.getConnection(readOnly);
          } catch (connError) {
            // Convert to DatabaseError if needed
            const dbError = connError instanceof DatabaseError
              ? connError
              : DatabaseError.fromError(connError, {
                  severity: DatabaseErrorSeverity.CRITICAL,
                  category: DatabaseErrorCategory.CONNECTION,
                  context: { operationId, readOnly }
                });
            
            console.error(`[ConnectionPool:${operationId}] Failed to get connection: ${dbError.toString()}`);
            
            // Dispatch UI error if critical
            if (dbError.severity === DatabaseErrorSeverity.CRITICAL || 
                dbError.severity === DatabaseErrorSeverity.FATAL) {
              dispatchDatabaseErrorEvent(dbError);
            }
            
            // Update metrics
            this.poolMetrics.failedOperations++;
            
            throw dbError;
          }
        }
        
        // Execute the operation
        try {
          result = operation(conn.db);
          
          // Update connection metrics
          conn.metrics.operationCount++;
          conn.metrics.successCount++;
          const operationTime = Date.now() - startTime;
          conn.metrics.lastOperationTimeMs = operationTime;
          conn.metrics.totalOperationTimeMs += operationTime;
          conn.metrics.avgOperationTimeMs = conn.metrics.totalOperationTimeMs / conn.metrics.operationCount;
          
          // Update pool metrics
          this.poolMetrics.successfulOperations++;
          
          break; // Success, exit the loop
        } catch (opError) {
          // Convert to DatabaseError for better categorization
          const dbError = opError instanceof DatabaseError
            ? opError
            : DatabaseError.fromError(opError, {
                context: { 
                  operationId,
                  connectionId: conn.id, 
                  isReadOnly: conn.isReadOnly,
                  operationCount: conn.operationCount,
                  retryCount: retries
                }
              });
          
          // Check for database locks or busy errors
          if (dbError.category === DatabaseErrorCategory.LOCK) {
            // Log detailed information about the lock situation
            const activeCount = this.getActiveCount();
            console.error(`[ConnectionPool:${operationId}] Database lock detected: "${dbError.message}"`);
            console.error(`[ConnectionPool:${operationId}] Lock details: active connections=${activeCount}, max=${this.maxSize}, retry=${retries}`);
            
            // Pool info with detailed connection states
            const lockedConns = this.pool.filter(c => c.inUse).length;
            const readonlyConns = this.pool.filter(c => c.isReadOnly).length;
            const writeConns = this.pool.filter(c => !c.isReadOnly).length;
            const activeReadOnly = this.pool.filter(c => c.inUse && c.isReadOnly).length;
            const activeWrite = this.pool.filter(c => c.inUse && !c.isReadOnly).length;
            
            console.error(`[ConnectionPool:${operationId}] Pool state: total=${this.pool.length}, in-use=${lockedConns}, readonly=${readonlyConns}, write=${writeConns}`);
            console.error(`[ConnectionPool:${operationId}] Active connections: readonly=${activeReadOnly}, write=${activeWrite}`);
            
            // Log active connection IDs to help trace potential deadlocks
            const activeConnIds = this.pool.filter(c => c.inUse).map(c => `${c.id}:${c.isReadOnly ? 'r' : 'w'}`);
            console.error(`[ConnectionPool:${operationId}] Active connection IDs: ${activeConnIds.join(', ')}`);
            
            // Check if retry is possible
            if (retries < MAX_RETRIES) {
              retries++;
              this.poolMetrics.totalRetries++;
              
              // Update connection metrics
              conn.metrics.operationCount++;
              conn.metrics.failureCount++;
              
              // Release the current connection
              this.releaseConnection(conn);
              conn = undefined;
              
              // Calculate backoff with jitter
              const delay = RETRY_DELAY_BASE_MS * Math.pow(2, retries - 1) * (0.5 + Math.random());
              
              console.debug(`[ConnectionPool:${operationId}] Retrying database operation after ${delay}ms (attempt ${retries}/${MAX_RETRIES})`);
              
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          // For other errors or if max retries exceeded
          console.error(`[ConnectionPool:${operationId}] Operation failed after ${Date.now() - startTime}ms:`, dbError.toString());
          
          // Update connection metrics
          conn.metrics.operationCount++;
          conn.metrics.failureCount++;
          
          // Update pool metrics
          this.poolMetrics.failedOperations++;
          
          // Dispatch database error event for critical operation failures
          if (dbError.severity === DatabaseErrorSeverity.CRITICAL || 
              dbError.severity === DatabaseErrorSeverity.FATAL) {
            dispatchDatabaseErrorEvent(dbError);
          }
          
          throw dbError;
        }
      } finally {
        // Always release the connection back to the pool if we have one
        if (conn) {
          this.releaseConnection(conn);
        }
      }
    }
    
    // Log slow operations
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.warn(`[ConnectionPool:${operationId}] Slow database operation: ${duration}ms (with ${retries} retries)`);
    } else if (retries > 0) {
      // Always log operations that needed retries, even if they weren't slow
      console.warn(`[ConnectionPool:${operationId}] Operation needed ${retries} retries`);
    }
    
    return result;
  }
  
  async withTransaction<T>(callback: (db: Database.Database) => T): Promise<T> {
    const transactionId = crypto.randomUUID().substring(0, 8);
    const startTime = Date.now();
    debugLog(`[${transactionId}] Starting transaction`);
    
    return this.withConnection((db) => {
      try {
        if (isDebugEnabled()) {
          console.time(`[ConnectionPool:${transactionId}] transaction`);
          console.time(`[ConnectionPool:${transactionId}] transaction:begin`);
        }
        
        db.prepare('BEGIN').run();
        
        if (isDebugEnabled()) {
          console.timeEnd(`[ConnectionPool:${transactionId}] transaction:begin`);
          console.time(`[ConnectionPool:${transactionId}] transaction:callback`);
        }
        
        const result = callback(db);
        
        if (isDebugEnabled()) {
          console.timeEnd(`[ConnectionPool:${transactionId}] transaction:callback`);
          console.time(`[ConnectionPool:${transactionId}] transaction:commit`);
        }
        
        db.prepare('COMMIT').run();
        
        if (isDebugEnabled()) {
          console.timeEnd(`[ConnectionPool:${transactionId}] transaction:commit`);
          console.timeEnd(`[ConnectionPool:${transactionId}] transaction`);
        }
        
        const duration = Date.now() - startTime;
        if (duration > 1000) {
          console.warn(`[ConnectionPool:${transactionId}] Slow transaction: ${duration}ms`);
        }
        
        return result;
      } catch (error) {
        // Roll back the transaction on error
        console.error(`[ConnectionPool:${transactionId}] Transaction failed after ${Date.now() - startTime}ms:`, error);
        
        try {
          if (isDebugEnabled()) {
            console.time(`[ConnectionPool:${transactionId}] transaction:rollback`);
          }
          
          db.prepare('ROLLBACK').run();
          
          if (isDebugEnabled()) {
            console.timeEnd(`[ConnectionPool:${transactionId}] transaction:rollback`);
          }
        } catch (rollbackError) {
          console.error(`[ConnectionPool:${transactionId}] Error rolling back transaction:`, rollbackError);
        }
        
        // Convert to DatabaseError if needed
        if (!(error instanceof DatabaseError)) {
          throw DatabaseError.fromError(error, {
            severity: DatabaseErrorSeverity.CRITICAL,
            category: DatabaseErrorCategory.OTHER,
            context: { transactionId },
            reportToUser: true
          });
        }
        
        throw error;
      }
    }, false); // Transactions always need write access
  }
  
  /**
   * Close all database connections
   */
  async closeAll(): Promise<void> {
    debugLog(`Closing all ${this.pool.length} connections`);
    
    // Close each connection
    for (const conn of this.pool) {
      try {
        // Only log if debug enabled to reduce noise
        debugLog(`Closing connection ${conn.id} (${conn.isReadOnly ? 'readonly' : 'write'})`);
        conn.db.close();
      } catch (err) {
        console.error(`Error closing connection ${conn.id}:`, err);
      }
    }
    
    // Clear the pool
    this.pool = [];
    
    debugLog(`All connections closed`);
  }
  
  /**
   * Get the count of active connections
   */
  public getActiveCount(): number {
    return this.pool.filter(conn => conn.inUse).length;
  }
  
  /**
   * Get detailed pool statistics
   */
  public getPoolStats() {
    const now = Date.now();
    return {
      poolSize: this.pool.length,
      maxPoolSize: this.maxSize,
      activeConnections: this.getActiveCount(),
      readOnlyConnections: this.pool.filter(c => c.isReadOnly).length,
      writeConnections: this.pool.filter(c => !c.isReadOnly).length,
      metrics: { ...this.poolMetrics },
      connections: this.pool.map(c => ({
        id: c.id.substring(0, 8),
        type: c.isReadOnly ? 'readonly' : 'write',
        inUse: c.inUse,
        age: now - c.createdAt,
        idleTime: c.inUse ? 0 : now - c.lastUsed,
        operationCount: c.operationCount,
        metrics: {
          successRate: c.metrics.operationCount > 0 
            ? (c.metrics.successCount / c.metrics.operationCount) * 100 
            : 100,
          avgOperationTime: c.metrics.avgOperationTimeMs,
          lastHealthCheck: c.metrics.lastHealthCheck 
            ? {
                isHealthy: c.metrics.lastHealthCheck.isHealthy,
                failedCheck: c.metrics.lastHealthCheck.failedCheck,
                checkDuration: c.metrics.lastHealthCheck.checkDuration
              } 
            : null,
          timeSinceHealthCheck: c.metrics.lastHealthCheckTime 
            ? now - c.metrics.lastHealthCheckTime 
            : null
        }
      }))
    };
  }
}

// Create the singleton instance
const connectionPool = new ConnectionPool();

// Export both the class and the instance
export { ConnectionPool, connectionPool };
export default connectionPool;