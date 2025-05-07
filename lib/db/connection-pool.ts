import Database from 'better-sqlite3';
import crypto from 'crypto';
import { ensureDbPermissionsSync, handleReadonlyDatabaseSync } from './connection-manager';
import fs from 'fs';
import { fixDatabasePermissions, handleReadonlyDatabase } from './utils';
import { APP_DATA_DIR, DB_FILE } from './constants';

// Connection pool settings
// Increased from 3 to 7 to accommodate worker concurrency (5) plus buffer
const POOL_SIZE = process.env.CONNECTION_POOL_SIZE ? parseInt(process.env.CONNECTION_POOL_SIZE, 10) : 7;
const MAX_CONNECTION_AGE_MS = 300000; // 5 minutes
const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds busy timeout
const MAX_RETRIES = 3; // Maximum retries for locked database
const RETRY_DELAY_BASE_MS = 200; // Base delay for exponential backoff

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
    console.debug(message, ...args);
  }
};

// Wrapper for fallback warning logs - set to false to disable these specific warnings
// This can be enabled with CONNECTION_POOL_FALLBACK_WARN=true env var
const logFallbackWarning = (message: string, ...args: any[]) => {
  if (process.env.CONNECTION_POOL_FALLBACK_WARN === 'true') {
    console.warn(message, ...args);
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
}

/**
 * Create a database instance with custom method bindings
 * Ensures proper function context and avoids promisify issues with webpack/browser
 */
function createDatabaseInstance(filename: string, options: Database.Options): Database.Database {
  // Create the database instance
  const db = new Database(filename, options);
  
  // Replace backup with a custom implementation that doesn't use promisify
  const originalBackup = db.backup;
  db.backup = function customBackup(destination, options) {
    if (typeof originalBackup === 'function') {
      return originalBackup.call(db, destination, options);
    } else {
      throw new Error('Original backup method is not a function');
    }
  };
  
  return db;
}

class ConnectionPool {
  private pool: DbConnection[] = [];
  private maxSize: number;
  private lastMaintenanceTime: number = 0;
  private readonly MAINTENANCE_INTERVAL_MS = 60000; // Run maintenance every minute
  
  constructor(size: number = POOL_SIZE) {
    this.maxSize = size;
    this.initialize();
  }
  
  private initialize() {
    // Ensure the app directory exists and has correct permissions
    ensureDbPermissionsSync();
    
    // Create initial connections - always create a write connection first
    this.createConnection(false);
    
    // Create an initial read-only connection if the pool size allows for it
    if (this.maxSize >= 2) {
      this.createConnection(true);
      debugLog("[ConnectionPool] Created initial read-only connection alongside write connection");
    }
    
    // Set up maintenance interval - Run less frequently
    setInterval(() => this.maintainPool(), this.MAINTENANCE_INTERVAL_MS);
  }
  
  private createConnection(readOnly: boolean = false): DbConnection {
    const id = crypto.randomUUID();
    
    let db: Database.Database;
    
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
      db = createDatabaseInstance(DB_FILE, options);
      
      // Configure connection using pragmas
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
      
      // Permissions are generally already set by now, so we can skip this call
      // unless we're creating a new write connection that might need write access to the DB
      if (!readOnly && !fs.existsSync(DB_FILE)) {
        ensureDbPermissionsSync();
      }
      
    } catch (error) {
      console.error("[ConnectionPool] Error creating database connection:", error);
      
      // Fallback to readonly if we get a permission error
      if (!readOnly && error instanceof Error && 
          (error.message?.includes('SQLITE_READONLY') || error.message?.includes('readonly database'))) {
        
        // Try to fix the readonly database
        if (handleReadonlyDatabaseSync()) {
          // Retry creating a writable connection since we fixed the issue
          try {
            // Use the custom database creation function
            db = createDatabaseInstance(DB_FILE, {
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
              lastUsed: Date.now(),
              isReadOnly: false,
              operationCount: 0
            };
            
            debugLog("[ConnectionPool] Successfully fixed readonly database issue");
            this.pool.push(conn);
            return conn;
            
          } catch (retryErr) {
            console.error("[ConnectionPool] Still failed to create writable connection after fix:", retryErr);
          }
        }
        
        console.warn("[ConnectionPool] Falling back to readonly mode");
        return this.createConnection(true); // Retry with readonly flag
      }
      
      throw new Error(`Failed to create database connection: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    const conn: DbConnection = {
      id,
      db,
      inUse: false,
      lastUsed: Date.now(),
      isReadOnly: readOnly,
      operationCount: 0
    };
    
    this.pool.push(conn);
    return conn;
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
        debugLog(`[ConnectionPool] Created new readonly connection ${newConn.id} for read operation`);
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
          debugLog(`[ConnectionPool] Reusing existing readonly connection ${conn.id} for read operation`);
        } else {
          // Using logFallbackWarning instead of console.trace to avoid stack traces in the logs
          logFallbackWarning(`[ConnectionPool] Fallback: Reusing existing write connection ${conn.id} for read operation (Pool possibly full or only write connections available)`);
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
        debugLog(`[ConnectionPool] Created new write connection ${newConn.id} for write operation`);
        return newConn;
      }
      
      // Reuse an existing write connection
      if (conn) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        conn.operationCount++;
        debugLog(`[ConnectionPool] Reusing existing write connection ${conn.id} for write operation`);
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
        debugLog(`[ConnectionPool] Created new ${newConn.isReadOnly ? 'readonly' : 'write'} connection ${newConn.id}`);
        return newConn;
      }
      
      // If we're looking for a write connection but only have readonly, close one and create a write
      if (!readOnly && writeConnection === undefined && readonlyConnection !== undefined) {
        const readonlyConn = readonlyConnection;
        
        this.pool = this.pool.filter(c => c.id !== readonlyConn.id);
        
        debugLog(`[ConnectionPool] Closing unused readonly connection ${readonlyConn.id} to create a write connection`);
        
        try {
          readonlyConn.db.close();
        } catch (err) {
          // Ignore errors on close
        }
        
        const newConn = this.createConnection(false);
        newConn.inUse = true;
        newConn.operationCount = 1;
        
        debugLog(`[ConnectionPool] Created new write connection ${newConn.id} after closing readonly connection`);
        return newConn;
      }
    }

    // No available connections, wait for one or forcibly release a long-running connection
    if (this.pool.filter(c => !c.inUse).length === 0) {
      console.warn("[ConnectionPool] All connections in use, waiting for one to become available...");
      
      // Get the oldest in-use connection that's been locked for more than 10 seconds
      const now = Date.now();
      const oldestInUseConnection = this.pool
        .filter(c => c.inUse && (now - c.lastUsed > 10000))
        .sort((a, b) => a.lastUsed - b.lastUsed)[0];
      
      if (oldestInUseConnection) {
        console.warn(`[ConnectionPool] Forcibly releasing connection ${oldestInUseConnection.id} that's been in use for >10s`);
        
        // Reset its state
        oldestInUseConnection.inUse = false;
        oldestInUseConnection.lastUsed = now;
        
        // For safety, create a new connection to replace this potentially stalled one
        try {
          // Attempt to recreate this connection
          const freshConn = this.createConnection(oldestInUseConnection.isReadOnly);
          freshConn.inUse = true;
          freshConn.operationCount = 1;
          debugLog(`[ConnectionPool] Created fresh ${freshConn.isReadOnly ? 'readonly' : 'write'} connection ${freshConn.id} to replace stalled connection`);
          return freshConn;
        } catch (err) {
          console.error(`[ConnectionPool] Error recreating stalled connection:`, err);
          return oldestInUseConnection;
        }
      }
    }
    
    // If we still don't have a connection, throw an error
    throw new Error(`No database connections available. Pool size: ${this.pool.length}, max size: ${this.maxSize}`);
  }
  
  releaseConnection(conn: DbConnection) {
    if (!conn) {
      console.warn(`[ConnectionPool] Attempted to release null or undefined connection`);
      return;
    }
    
    debugLog(`[ConnectionPool] Releasing connection ${conn.id} (${conn.isReadOnly ? 'readonly' : 'write'}) back to pool`);
    
    if (!this.pool.find(c => c.id === conn.id)) {
      console.warn(`[ConnectionPool] Attempted to release connection ${conn.id} that is not in the pool. This may indicate a resource leak.`);
      return;
    }
    
    // Mark connection as no longer in use
    const connectionIndex = this.pool.findIndex(c => c.id === conn.id);
    if (connectionIndex !== -1) {
      this.pool[connectionIndex].inUse = false;
      this.pool[connectionIndex].lastUsed = Date.now();
      debugLog(`[ConnectionPool] Connection ${conn.id} is now available in the pool`);
    } else {
      console.error(`[ConnectionPool] Failed to find connection ${conn.id} in pool during release`);
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
    
    // Only keep a minimum number of connections (one write, one read)
    const readOnlyConns = this.pool.filter(conn => conn.isReadOnly).length;
    let writeConns = this.pool.length - readOnlyConns;
    
    // Get connections to close
    const connectionsToClose: DbConnection[] = [];
    
    // Close old connections that exceed our age limit
    for (const conn of oldConnections) {
      // Always ensure we keep at least one write connection if possible
      if (conn.isReadOnly || (writeConns > 1)) {
        connectionsToClose.push(conn);
        
        // If this is a write connection, decrement our count for tracking
        if (!conn.isReadOnly) {
          writeConns--;
        }
      }
    }
    
    // Close the identified connections
    if (connectionsToClose.length > 0) {
      debugLog(`[ConnectionPool] Maintenance: Closing ${connectionsToClose.length} old/excess connections`);
      
      for (const conn of connectionsToClose) {
        // Remove from the pool
        this.pool = this.pool.filter(c => c.id !== conn.id);
        
        // Close the connection
        try {
          conn.db.close();
          debugLog(`[ConnectionPool] Closed old connection ${conn.id} (${conn.isReadOnly ? 'readonly' : 'write'}) after ${Math.floor((now - conn.lastUsed) / 1000)}s idle`);
        } catch (err) {
          console.error(`[ConnectionPool] Error closing connection ${conn.id}:`, err);
        }
      }
    }
    
    // Log pool stats for monitoring
    const readOnlyAvailable = this.pool.filter(conn => conn.isReadOnly && !conn.inUse).length;
    const writeAvailable = this.pool.filter(conn => !conn.isReadOnly && !conn.inUse).length;
    const totalReadOnly = this.pool.filter(conn => conn.isReadOnly).length;
    const totalWrite = this.pool.length - totalReadOnly;
    
    debugLog(`[ConnectionPool] Pool stats: ReadOnly ${readOnlyAvailable}/${totalReadOnly} available, Write ${writeAvailable}/${totalWrite} available`);
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
    
    while (true) {
      try {
        // Get a connection from the pool
        if (!conn) {
          try {
            conn = this.getConnection(readOnly);
          } catch (connError) {
            console.error(`[ConnectionPool:${operationId}] Failed to get connection: ${connError instanceof Error ? connError.message : String(connError)}`);
            throw connError;
          }
        }
        
        // Execute the operation
        try {
          result = operation(conn.db);
          break; // Success, exit the loop
        } catch (opError) {
          const errorMessage = opError instanceof Error ? opError.message : String(opError);
          
          // Check for database locks or busy errors
          if (errorMessage.includes('SQLITE_BUSY') || 
              errorMessage.includes('database is locked') ||
              errorMessage.includes('waiting for a lock')) {
            
            // Log detailed information about the lock situation
            const activeCount = this.getActiveCount();
            console.error(`[ConnectionPool:${operationId}] Database lock detected: "${errorMessage}"`);
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
          
          // For other errors or if max retries exceeded, rethrow
          console.error(`[ConnectionPool:${operationId}] Operation failed after ${Date.now() - startTime}ms:`, opError);
          throw opError;
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
    debugLog(`[ConnectionPool:${transactionId}] Starting transaction`);
    
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
        
        throw error;
      }
    }, false); // Transactions always need write access
  }
  
  /**
   * Close all database connections
   */
  async closeAll(): Promise<void> {
    debugLog(`[ConnectionPool] Closing all ${this.pool.length} connections`);
    
    // Close each connection
    for (const conn of this.pool) {
      try {
        // Only log if debug enabled to reduce noise
        debugLog(`[ConnectionPool] Closing connection ${conn.id} (${conn.isReadOnly ? 'readonly' : 'write'})`);
        conn.db.close();
      } catch (err) {
        console.error(`[ConnectionPool] Error closing connection ${conn.id}:`, err);
      }
    }
    
    // Clear the pool
    this.pool = [];
    
    debugLog(`[ConnectionPool] All connections closed`);
  }
  
  /**
   * Get the count of active connections
   */
  public getActiveCount(): number {
    return this.pool.filter(conn => conn.inUse).length;
  }
}

// Create the singleton instance
const connectionPool = new ConnectionPool();

// Export both the class and the instance
export { ConnectionPool, connectionPool };
export default connectionPool;