import { promises as fs, existsSync, createWriteStream, WriteStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getAppPatchesDirectory, getProjectPatchesDirectory } from '@/lib/path-utils';

// File operation lock map
interface FileLock {
  id: string;
  path: string;
  operation: 'read' | 'write';
  acquiredAt: number;
  releaseTimeout: NodeJS.Timeout;
}

// File stream tracking
interface ActiveFileStream {
  id: string;
  path: string;
  stream: WriteStream;
  createdAt: number;
  lastActivity: number;
}

export class FileSystemManager {
  // Maps file paths to active locks
  private fileLocks: Map<string, FileLock> = new Map();
  
  // Maps IDs to active streams
  private activeStreams: Map<string, ActiveFileStream> = new Map();
  
  // Lock timeout in ms (auto-release locks after this time)
  private lockTimeoutMs: number = 60000; // 1 minute
  
  // Stream inactivity timeout in ms
  private streamTimeoutMs: number = 300000; // 5 minutes
  
  constructor() {
    // Run cleanup job every minute
    setInterval(() => this.runCleanup(), 60000);
  }
  
  /**
   * Creates a unique file path for an output file
   */
  async createUniqueFilePath(
    requestId: string,
    sessionName: string,
    projectDir?: string,
    extension: string = 'patch'
  ): Promise<string> {
    const timestamp = new Date().toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '')
      .replace('T', '_');
    
    // Sanitize session name
    const safeSessionName = this.sanitizeFilename(sessionName);
    
    // Use part of request ID to keep filename reasonable length
    const requestIdShort = requestId.substring(0, 8);
    
    // Create filename with timestamp, session name and request ID
    const filename = `${timestamp}_${safeSessionName}_${requestIdShort}.${extension}`;
    
    let baseDir: string;
    
    if (projectDir) {
      // Try to use project patches directory
      try {
        baseDir = getProjectPatchesDirectory(projectDir);
        await fs.mkdir(baseDir, { recursive: true });
      } catch (error) {
        console.warn(`Cannot use project patches directory, falling back to app directory: ${error}`);
        baseDir = getAppPatchesDirectory();
        await fs.mkdir(baseDir, { recursive: true });
      }
    } else {
      // Use app patches directory
      baseDir = getAppPatchesDirectory();
      await fs.mkdir(baseDir, { recursive: true });
    }
    
    const filePath = path.join(baseDir, filename);
    
    // Check if file exists (shouldn't happen, but just in case)
    if (existsSync(filePath)) {
      // Add random suffix if file already exists
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const newFilename = `${timestamp}_${safeSessionName}_${requestIdShort}_${randomSuffix}.${extension}`;
      return path.join(baseDir, newFilename);
    }
    
    return filePath;
  }
  
  /**
   * Sanitizes a filename to remove invalid characters
   */
  sanitizeFilename(name: string): string {
    if (!name) return 'untitled';
    return name.replace(/[^a-z0-9_\-\.]/gi, '_').substring(0, 60);
  }
  
  /**
   * Creates a write stream for a file with proper locking
   */
  async createWriteStream(
    filePath: string,
    options?: { autoClose?: boolean; encoding?: BufferEncoding }
  ): Promise<{ stream: WriteStream; releaseStream: () => Promise<void> }> {
    // Acquire lock for the file
    const lockId = await this.acquireLock(filePath, 'write');
    
    // Create parent directory if it doesn't exist
    const parentDir = path.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });
    
    // Create the stream
    const streamId = crypto.randomUUID();
    const stream = createWriteStream(filePath, options);
    
    // Track the stream
    this.activeStreams.set(streamId, {
      id: streamId,
      path: filePath,
      stream,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    
    // Function to release the stream and lock
    const releaseStream = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          // Get active stream info
          const streamInfo = this.activeStreams.get(streamId);
          if (!streamInfo) {
            this.releaseLock(lockId);
            return resolve();
          }
          
          // Close the stream properly
          stream.end(() => {
            this.activeStreams.delete(streamId);
            this.releaseLock(lockId);
            resolve();
          });
        } catch (error) {
          // Still try to release the lock on error
          this.releaseLock(lockId);
          reject(error);
        }
      });
    };
    
    // Return the stream and release function
    return { stream, releaseStream };
  }
  
  /**
   * Opens a file for reading with proper locking
   */
  async openFile(filePath: string, flags: string = 'r'): Promise<{
    fileHandle: fs.FileHandle;
    releaseFile: () => Promise<void>;
  }> {
    // Acquire lock for the file
    const lockId = await this.acquireLock(filePath, flags.includes('w') ? 'write' : 'read');
    
    try {
      // Open the file
      const fileHandle = await fs.open(filePath, flags);
      
      // Function to release the file handle and lock
      const releaseFile = async (): Promise<void> => {
        try {
          await fileHandle.close();
        } finally {
          this.releaseLock(lockId);
        }
      };
      
      return { fileHandle, releaseFile };
    } catch (error) {
      // Release lock if file open fails
      this.releaseLock(lockId);
      throw error;
    }
  }
  
  /**
   * Read a file's content with proper locking
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const lockId = await this.acquireLock(filePath, 'read');
    
    try {
      const content = await fs.readFile(filePath, { encoding });
      return content;
    } finally {
      this.releaseLock(lockId);
    }
  }
  
  /**
   * Write to a file with proper locking
   */
  async writeFile(filePath: string, data: string | Buffer): Promise<void> {
    const lockId = await this.acquireLock(filePath, 'write');
    
    try {
      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(filePath);
      await fs.mkdir(parentDir, { recursive: true });
      
      // Write the file
      await fs.writeFile(filePath, data);
    } finally {
      this.releaseLock(lockId);
    }
  }
  
  /**
   * Acquire a lock on a file
   */
  private async acquireLock(filePath: string, operation: 'read' | 'write'): Promise<string> {
    const normalizedPath = path.normalize(filePath);
    
    // Read locks can be shared, write locks must be exclusive
    if (operation === 'write') {
      // Need to wait for any existing lock
      while (this.fileLocks.has(normalizedPath)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      // For read locks, wait only if there's a write lock
      while (this.fileLocks.has(normalizedPath) && 
             this.fileLocks.get(normalizedPath)!.operation === 'write') {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Create a new lock
    const lockId = crypto.randomUUID();
    
    // Set up automatic lock release timeout
    const releaseTimeout = setTimeout(() => {
      console.warn(`Auto-releasing lock ${lockId} for ${normalizedPath} after timeout`);
      this.releaseLock(lockId);
    }, this.lockTimeoutMs);
    
    // Store the lock
    this.fileLocks.set(normalizedPath, {
      id: lockId,
      path: normalizedPath,
      operation,
      acquiredAt: Date.now(),
      releaseTimeout
    });
    
    return lockId;
  }
  
  /**
   * Release a previously acquired lock
   */
  private releaseLock(lockId: string): boolean {
    // Find the lock by ID
    for (const [filePath, lock] of this.fileLocks.entries()) {
      if (lock.id === lockId) {
        // Clear the timeout
        clearTimeout(lock.releaseTimeout);
        
        // Remove the lock
        this.fileLocks.delete(filePath);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Clean up stale locks and inactive streams
   */
  private runCleanup() {
    const now = Date.now();
    
    // Check for expired locks
    for (const [filePath, lock] of this.fileLocks.entries()) {
      if ((now - lock.acquiredAt) > this.lockTimeoutMs) {
        console.warn(`Cleaning up expired lock for ${filePath}`);
        clearTimeout(lock.releaseTimeout);
        this.fileLocks.delete(filePath);
      }
    }
    
    // Check for inactive streams
    for (const [streamId, streamInfo] of this.activeStreams.entries()) {
      if ((now - streamInfo.lastActivity) > this.streamTimeoutMs) {
        console.warn(`Cleaning up inactive stream for ${streamInfo.path}`);
        try {
          streamInfo.stream.end();
        } catch (error) {
          console.error(`Error closing inactive stream: ${error}`);
        }
        this.activeStreams.delete(streamId);
      }
    }
  }
  
  /**
   * Get information about current locks and streams
   */
  getStatus() {
    return {
      locks: Array.from(this.fileLocks.values()).map(lock => ({
        path: lock.path,
        operation: lock.operation,
        acquiredAt: lock.acquiredAt,
        ageMs: Date.now() - lock.acquiredAt
      })),
      activeStreams: Array.from(this.activeStreams.values()).map(stream => ({
        path: stream.path,
        createdAt: stream.createdAt,
        lastActivity: stream.lastActivity,
        ageMs: Date.now() - stream.createdAt,
        idleMs: Date.now() - stream.lastActivity
      }))
    };
  }
}

// Export singleton instance
const fsManager = new FileSystemManager();
export default fsManager; 