import * as sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// Define DB_FILE directly to avoid circular dependency
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

// Connection pool settings
const POOL_SIZE = 3;
const MAX_CONNECTION_AGE_MS = 30000; // 30 seconds
const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds busy timeout
const MAX_RETRIES = 3; // Maximum retries for locked database
const RETRY_DELAY_BASE_MS = 200; // Base delay for exponential backoff

export interface DbConnection {
  id: string;
  db: sqlite3.Database;
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
  
  private initialize() {
    // Create initial connections (just 1 to start, will grow as needed)
    this.createConnection(false);
    
    // Set up maintenance interval
    setInterval(() => this.maintainPool(), 30000);
  }
  
  private createConnection(readOnly: boolean = false): DbConnection {
    const id = crypto.randomUUID();
    const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
    
    let db: sqlite3.Database;
    
    try {
      db = new sqlite3.Database(DB_FILE, mode);
      
      // Configure connection
      // Use DELETE journal mode for better compatibility
      db.run('PRAGMA journal_mode = DELETE;');
      
      // Set busy timeout to 5 seconds
      db.run(`PRAGMA busy_timeout = ${CONNECTION_TIMEOUT_MS};`);
      
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON;');
      
    } catch (error) {
      console.error("Error creating database connection:", error);
      
      // Fallback to readonly if we get a permission error
      if (!readOnly && error instanceof Error && error.message?.includes('SQLITE_READONLY')) {
        console.warn("Database is readonly, falling back to readonly mode");
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
      const newConn = this.createConnection(readOnly);
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
  
  private maintainPool() {
    const now = Date.now();
    
    // Close old unused connections
    this.pool = this.pool.filter(conn => {
      if (!conn.inUse && (now - conn.lastUsed) > MAX_CONNECTION_AGE_MS) {
        conn.db.close();
        return false;
      }
      return true;
    });
  }
  
  async withConnection<T>(callback: (db: sqlite3.Database) => Promise<T>, readOnly: boolean = false): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // If not the first attempt, add a delay before retrying
        if (attempt > 0) {
          // Exponential backoff with jitter
          const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1) * (0.5 + Math.random());
          console.log(`Retry attempt ${attempt}/${MAX_RETRIES} for database operation after ${Math.round(delay)}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const conn = await this.getConnection(readOnly);
        try {
          return await callback(conn.db);
        } finally {
          this.releaseConnection(conn);
        }
      } catch (error: any) {
        lastError = error;
        
        // Only retry on database locked errors
        const isBusyError = error && (
          error.code === 'SQLITE_BUSY' || 
          error.code === 'SQLITE_LOCKED' ||
          (error.message && (
            error.message.includes('database is locked') || 
            error.message.includes('SQLITE_BUSY')
          ))
        );
        
        if (!isBusyError || attempt === MAX_RETRIES - 1) {
          // Not a busy error or last attempt, don't retry
          throw error;
        }
        
        console.warn(`Database busy or locked, will retry (attempt ${attempt + 1}/${MAX_RETRIES})`);
      }
    }
    
    // Should never reach here due to throw in the loop, but just in case
    throw lastError || new Error('Unknown database error');
  }
  
  async withTransaction<T>(callback: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    return this.withConnection(async (db) => {
      return new Promise<T>(async (resolve, reject) => {
        db.run('BEGIN TRANSACTION', async (beginError) => {
          if (beginError) {
            return reject(beginError);
          }
          
          try {
            const result = await callback(db);
            
            db.run('COMMIT', (commitError) => {
              if (commitError) {
                // Try to rollback on commit error
                db.run('ROLLBACK', () => {
                  reject(commitError);
                });
              } else {
                resolve(result);
              }
            });
          } catch (error) {
            // Rollback the transaction on error
            db.run('ROLLBACK', (rollbackError) => {
              if (rollbackError) {
                console.error("Error rolling back transaction:", rollbackError);
              }
              reject(error);
            });
          }
        });
      });
    }, false); // Always use a writeable connection for transactions
  }
  
  closeAll() {
    for (const conn of this.pool) {
      try {
        conn.db.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
    this.pool = [];
  }
}

// Create pool instance and assign to variable before export
const connectionPool = new ConnectionPool();

// Export the pool instance and DB_FILE
export default connectionPool;
export { DB_FILE }; 