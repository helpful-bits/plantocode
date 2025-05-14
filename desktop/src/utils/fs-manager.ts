/**
 * Desktop-specific implementation of the FileSystemManager
 * Uses Tauri's filesystem APIs instead of Node.js fs module
 */

import * as pathUtils from './path-utils';
import { v4 as uuidv4 } from 'uuid';

// Types for better compatibility with core lib
type BufferEncoding = 'utf8' | 'utf-8' | 'ascii' | 'base64';
interface WriteStream {
  write(data: string | Uint8Array): boolean;
  end(callback?: () => void): void;
}

// File operation lock map
interface FileLock {
  id: string;
  path: string;
  operation: 'read' | 'write';
  acquiredAt: number;
  releaseTimeout: number; // setTimeout ID
}

// File stream tracking
interface ActiveFileStream {
  id: string;
  path: string;
  stream: WriteStream;
  createdAt: number;
  lastActivity: number;
}

// FileHandle emulation for compatibility
class FileHandle {
  private path: string;
  private mode: string;
  
  constructor(path: string, mode: string) {
    this.path = path;
    this.mode = mode;
  }
  
  async close(): Promise<void> {
    // No need to do anything, Tauri handles file closing automatically
    return Promise.resolve();
  }
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
   * Get the temporary directory path, ensuring it exists
   */
  async getTempDir(): Promise<string> {
    // In a real implementation, this would use Tauri's API to get temp directory
    return '/temp';
  }
  
  /**
   * Creates a unique file path for an output file
   */
  async createUniqueFilePath(
    requestId: string,
    sessionName: string,
    projectDir?: string,
    extension: string = 'xml',
    targetDirName?: string
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
    
    // In a real implementation, we would use Tauri's file system API to create directories
    
    if (projectDir) {
      // Try to use project directory
      try {
        if (targetDirName === 'implementation_plans') {
          // Use implementation plans directory
          baseDir = pathUtils.join(projectDir, 'implementation_plans');
        } else {
          // Default to output files directory
          baseDir = pathUtils.join(projectDir, 'generated_outputs');
        }
      } catch (error) {
        console.warn(`Cannot use project directory, falling back to app directory`);
        baseDir = pathUtils.join(pathUtils.getAppDirectory(), 'generated_outputs');
      }
    } else {
      // Use app output files directory
      baseDir = pathUtils.join(pathUtils.getAppDirectory(), 'generated_outputs');
    }
    
    const filePath = pathUtils.join(baseDir, filename);
    
    // In a real app, we would check if file exists using Tauri APIs
    
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
   * In a real implementation, this would use Tauri's file APIs
   */
  async createWriteStream(
    filePath: string,
    options?: { autoClose?: boolean; encoding?: BufferEncoding }
  ): Promise<{ stream: WriteStream; releaseStream: () => Promise<void> }> {
    // Acquire lock for the file
    const lockId = await this.acquireLock(filePath, 'write');
    
    // Create minimal stream implementation
    const streamId = uuidv4();
    
    // Buffer to accumulate data since Tauri doesn't have streams
    let buffer = '';
    
    // Create a stream-like object that accumulates data to write later
    const stream: WriteStream = {
      write(data: string | Uint8Array): boolean {
        if (typeof data === 'string') {
          buffer += data;
        } else {
          buffer += new TextDecoder().decode(data);
        }
        return true;
      },
      end(callback?: () => void): void {
        if (callback) callback();
      }
    };
    
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
      try {
        // Get active stream info
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) {
          this.releaseLock(lockId);
          return;
        }
        
        // In a real implementation, we would use Tauri APIs to write the buffer to a file
        console.log(`Would write ${buffer.length} bytes to ${filePath}`);
        
        this.activeStreams.delete(streamId);
        this.releaseLock(lockId);
      } catch (error) {
        // Still try to release the lock on error
        this.releaseLock(lockId);
        throw error;
      }
    };
    
    // Return the stream and release function
    return { stream, releaseStream };
  }
  
  /**
   * Opens a file for reading with proper locking
   * In a real implementation, this would use Tauri's file APIs
   */
  async openFile(filePath: string, flags: string = 'r'): Promise<{
    fileHandle: FileHandle;
    releaseFile: () => Promise<void>;
  }> {
    // Acquire lock for the file
    const lockId = await this.acquireLock(filePath, flags.includes('w') ? 'write' : 'read');
    
    try {
      // Create a fake file handle
      const fileHandle = new FileHandle(filePath, flags);
      
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
   * In a real implementation, this would use Tauri's file APIs
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const lockId = await this.acquireLock(filePath, 'read');
    
    try {
      // In a real implementation, we would use Tauri's API to read the file
      // For now, return a placeholder that indicates we would read from this file
      return `[Content of ${filePath} would be read with Tauri's filesystem API]`;
    } finally {
      this.releaseLock(lockId);
    }
  }
  
  /**
   * Write to a file with proper locking
   * In a real implementation, this would use Tauri's file APIs
   */
  async writeFile(filePath: string, data: string | Uint8Array): Promise<void> {
    const lockId = await this.acquireLock(filePath, 'write');
    
    try {
      // In a real implementation, we would use Tauri's file system API
      console.log(`Would write to ${filePath}`);
    } finally {
      this.releaseLock(lockId);
    }
  }
  
  /**
   * Acquire a lock on a file
   */
  private async acquireLock(filePath: string, operation: 'read' | 'write'): Promise<string> {
    const normalizedPath = pathUtils.normalizePath(filePath);
    
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
    const lockId = uuidv4();
    
    // Set up automatic lock release timeout
    const releaseTimeout = window.setTimeout(() => {
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
        window.clearTimeout(lock.releaseTimeout);
        
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
        window.clearTimeout(lock.releaseTimeout);
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