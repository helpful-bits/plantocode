import * as sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

// Connection pool settings
const POOL_SIZE = 10;
const MAX_CONNECTION_AGE_MS = 60000; // 1 minute
const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds busy timeout

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
    // Ensure directory exists
    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    
    // Create initial connections
    for (let i = 0; i < Math.ceil(this.maxSize / 2); i++) {
      this.createConnection(i % 2 === 0); // Alternate read/write
    }
    
    // Set up maintenance interval
    setInterval(() => this.maintainPool(), 30000);
  }
  
  private createConnection(readOnly: boolean = false): DbConnection {
    const id = crypto.randomUUID();
    const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
    
    const db = new sqlite3.Database(DB_FILE, mode);
    
    // Configure connection
    db.run('PRAGMA journal_mode = WAL;'); // Write-ahead logging for better concurrency
    db.run(`PRAGMA busy_timeout = ${CONNECTION_TIMEOUT_MS};`); // Timeout for busy waits
    
    if (!readOnly) {
      db.run('PRAGMA foreign_keys = ON;');
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
  
  async getConnection(readOnly: boolean = false, timeoutMs: number = 10000): Promise<DbConnection> {
    // First try to find an available connection of the right type
    const conn = this.pool.find(c => !c.inUse && c.isReadOnly === readOnly);
    
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
      w => w.readOnly === poolConn.isReadOnly
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
    
    // Ensure minimum pool size
    const minSize = Math.ceil(this.maxSize / 2);
    if (this.pool.length < minSize) {
      const numToCreate = minSize - this.pool.length;
      for (let i = 0; i < numToCreate; i++) {
        this.createConnection(i % 2 === 0); // Alternate read/write
      }
    }
  }
  
  async withConnection<T>(callback: (db: sqlite3.Database) => Promise<T>, readOnly: boolean = false): Promise<T> {
    const conn = await this.getConnection(readOnly);
    try {
      return await callback(conn.db);
    } finally {
      this.releaseConnection(conn);
    }
  }
  
  // Run transaction with automatic rollback on error
  async withTransaction<T>(callback: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    return this.withConnection(async (db) => {
      return new Promise<T>((resolve, reject) => {
        db.run('BEGIN TRANSACTION', async (beginErr) => {
          if (beginErr) return reject(beginErr);
          
          try {
            const result = await callback(db);
            
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                db.run('ROLLBACK', () => reject(commitErr));
              } else {
                resolve(result);
              }
            });
          } catch (error) {
            db.run('ROLLBACK', () => reject(error));
          }
        });
      });
    }, false); // Write connection needed for transaction
  }
  
  closeAll() {
    for (const conn of this.pool) {
      try {
        conn.db.close();
      } catch (error) {
        console.error('Error closing database connection:', error);
      }
    }
    this.pool = [];
    
    // Reject any waiting promises
    for (const waiting of this.waitingForConnection) {
      clearTimeout(waiting.timeoutId);
      waiting.reject(new Error('Connection pool is being closed'));
    }
    this.waitingForConnection = [];
  }
}

// Export singleton instance
const connectionPool = new ConnectionPool();
export default connectionPool; 