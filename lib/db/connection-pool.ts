import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fixDatabasePermissions, handleReadonlyDatabase } from './utils';

// Define DB_FILE directly to avoid circular dependency
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

// Export DB_FILE location for other modules
export { DB_FILE };

// Connection pool settings
const POOL_SIZE = 3;
const MAX_CONNECTION_AGE_MS = 30000; // 30 seconds
const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds busy timeout
const MAX_RETRIES = 3; // Maximum retries for locked database
const RETRY_DELAY_BASE_MS = 200; // Base delay for exponential backoff

export interface DbConnection {
  id: string;
  db: Database.Database;
  inUse: boolean;
  lastUsed: number;
  isReadOnly: boolean;
}

class ConnectionPool {
  private pool: DbConnection[] = [];
  private maxSize: number;
  private waitingForConnection: Array<{
    readOnly: boolean;
    resolve: (conn: DbConnection) => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  
  constructor(size: number = POOL_SIZE) {
    this.maxSize = size;
    this.initialize();
  }
  
  private async initialize() {
    // Ensure the app directory exists
    if (!fs.existsSync(APP_DATA_DIR)) {
      try {
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
      } catch (err) {
        console.error("[ConnectionPool] Failed to create app data directory:", err);
      }
    }
    
    // Fix permissions on startup
    await fixDatabasePermissions();
    
    // Create initial connections (just 1 to start, will grow as needed)
    await this.createConnection(false);
    
    // Set up maintenance interval
    setInterval(() => this.maintainPool(), 30000);
  }
  
  private async createConnection(readOnly: boolean = false): Promise<DbConnection> {
    const id = crypto.randomUUID();
    
    let db: Database.Database;
    
    try {
      // Fix permissions before opening
      await fixDatabasePermissions();
      
      const options: Database.Options = {
        readonly: readOnly,
        fileMustExist: false,
        timeout: CONNECTION_TIMEOUT_MS
      };
      
      db = new Database(DB_FILE, options);
      
      // Configure connection using pragmas
      db.pragma('journal_mode = DELETE');
      db.pragma('foreign_keys = ON');
      
      // Fix permissions after creating/opening the database
      await fixDatabasePermissions();
      
    } catch (error) {
      console.error("[ConnectionPool] Error creating database connection:", error);
      
      // Fallback to readonly if we get a permission error
      if (!readOnly && error instanceof Error && 
          (error.message?.includes('SQLITE_READONLY') || error.message?.includes('readonly database'))) {
        
        // Try to fix the readonly database
        if (await handleReadonlyDatabase()) {
          // Retry creating a writable connection since we fixed the issue
          try {
            db = new Database(DB_FILE, {
              readonly: false,
              fileMustExist: false,
              timeout: CONNECTION_TIMEOUT_MS
            });
            
            // Configure connection using pragmas
            db.pragma('journal_mode = DELETE');
            db.pragma('foreign_keys = ON');
            
            const conn: DbConnection = {
              id,
              db,
              inUse: false,
              lastUsed: Date.now(),
              isReadOnly: false
            };
            
            console.log("[ConnectionPool] Successfully fixed readonly database issue");
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
      isReadOnly: readOnly
    };
    
    this.pool.push(conn);
    return conn;
  }
  
  async getConnection(readOnly: boolean = false, timeoutMs: number = 5000): Promise<DbConnection> {
    // First try to find an available connection of the right type
    const conn = this.pool.find(c => !c.inUse && (c.isReadOnly === readOnly || c.isReadOnly));
    
    if (conn) {
      conn.inUse = true;
      conn.lastUsed = Date.now();
      return conn;
    }
    
    // If pool is not at max size, create a new connection
    if (this.pool.length < this.maxSize) {
      const newConn = await this.createConnection(readOnly);
      newConn.inUse = true;
      return newConn;
    }
    
    // Pool is full, wait for an available connection with timeout
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from waiting queue
        this.waitingForConnection = this.waitingForConnection.filter(
          w => w.resolve !== resolve
        );
        reject(new Error(`Timed out waiting for database connection after ${timeoutMs}ms`));
      }, timeoutMs);
      
      this.waitingForConnection.push({
        readOnly,
        resolve: (conn) => {
          clearTimeout(timeoutId);
          resolve(conn);
        },
        reject,
        timeoutId
      });
    });
  }
  
  releaseConnection(conn: DbConnection) {
    const poolConn = this.pool.find(c => c.id === conn.id);
    if (!poolConn) return;
    
    poolConn.inUse = false;
    poolConn.lastUsed = Date.now();
    
    // Check if anyone is waiting for a connection
    const waitingIndex = this.waitingForConnection.findIndex(
      w => w.readOnly === poolConn.isReadOnly || poolConn.isReadOnly
    );
    
    if (waitingIndex >= 0) {
      const waiting = this.waitingForConnection[waitingIndex];
      this.waitingForConnection.splice(waitingIndex, 1);
      
      poolConn.inUse = true;
      waiting.resolve(poolConn);
    }
  }
  
  private async maintainPool() {
    const now = Date.now();
    
    // Close old unused connections
    this.pool = this.pool.filter(conn => {
      if (!conn.inUse && (now - conn.lastUsed) > MAX_CONNECTION_AGE_MS) {
        conn.db.close();
        return false;
      }
      return true;
    });
    
    // Periodically check and fix database file permissions
    await fixDatabasePermissions();
  }
  
  async withConnection<T>(callback: (db: Database.Database) => Promise<T> | T, readOnly: boolean = false): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // If not the first attempt, add a delay before retrying
        if (attempt > 0) {
          // Exponential backoff with jitter
          const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1) * (0.5 + Math.random());
          console.log(`Retry attempt ${attempt}/${MAX_RETRIES} for database operation after ${Math.round(delay)}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Check and fix permissions before retry
          await fixDatabasePermissions();
        }
        
        const conn = await this.getConnection(readOnly);
        
        try {
          // Call the callback with the database connection
          // The callback can return either a Promise<T> or T directly
          const result = callback(conn.db);
          
          // Handle both synchronous and asynchronous results
          const finalResult = result instanceof Promise ? await result : result;
          
          // Release the connection back to the pool
          this.releaseConnection(conn);
          
          // Return the result
          return finalResult;
        } catch (error: any) {
          // Check for readonly errors directly in the callback
          if (error && (
            error.code === 'SQLITE_READONLY' || 
            (error.message && (error.message.includes('SQLITE_READONLY') || error.message.includes('readonly database')))
          )) {
            console.error("Read-only database error detected during operation:", error);
            
            // Release this connection before attempting fix
            this.releaseConnection(conn);
            
            // Attempt to fix readonly database issue
            if (await handleReadonlyDatabase()) {
              console.log("Successfully fixed readonly database issue, retrying operation");
              lastError = error;
              continue; // Retry the operation
            }
          }
          
          // Release the connection back to the pool
          this.releaseConnection(conn);
          
          throw error; // Re-throw the error
        }
      } catch (error: any) {
        lastError = error;
        
        // Only retry on certain errors
        if (error && (
          error.code === 'SQLITE_BUSY' || 
          error.code === 'SQLITE_LOCKED' ||
          (error.message && (
            error.message.includes('SQLITE_BUSY') || 
            error.message.includes('database is locked') ||
            error.message.includes('SQLITE_LOCKED')
          ))
        )) {
          console.warn(`Database locked or busy, attempt ${attempt + 1}/${MAX_RETRIES}:`, error);
          continue; // Retry on lock or busy errors
        }
        
        throw error; // Rethrow other errors immediately
      }
    }
    
    throw lastError || new Error('Failed to execute database operation after multiple retries');
  }
  
  async withTransaction<T>(callback: (db: Database.Database) => Promise<T> | T): Promise<T> {
    return this.withConnection(async (db) => {
      // Create a function that executes the transaction synchronously
      const transaction = db.transaction((txDb: Database.Database) => {
        // For better-sqlite3, the transaction callback must be synchronous
        // But our callback might be async, so we need to handle it differently
        // We'll use a placeholder to indicate that we need to get the actual result from the
        // promise resolution outside the transaction
        return 'TRANSACTION_COMMIT_MARKER';
      });
      
      try {
        // Start the transaction
        db.prepare('BEGIN').run();
        
        // Run the user callback
        const result = await callback(db);
        
        // Commit the transaction
        db.prepare('COMMIT').run();
        
        return result;
      } catch (error) {
        // Roll back the transaction on error
        try {
          db.prepare('ROLLBACK').run();
        } catch (rollbackError) {
          console.error("Error rolling back transaction:", rollbackError);
        }
        
        throw error;
      }
    }, false); // Transactions always need write access
  }
  
  closeAll() {
    this.pool.forEach(conn => {
      try {
        conn.db.close();
      } catch (error) {
        console.error(`Error closing connection ${conn.id}:`, error);
      }
    });
    this.pool = [];
  }
}

// Create and export a singleton instance
export const connectionPool = new ConnectionPool(); 