import { BackgroundJob, ApiType, TaskType, JobStatus, Session } from '@/types';
import Database from 'better-sqlite3';
import connectionPool from "../connection-pool";
import crypto from 'crypto';
import { sessionRepository } from './index';
import { v4 as uuid } from 'uuid';

/**
 * Background Job Repository
 * 
 * Handles database operations for managing background jobs (like Gemini requests, 
 * voice transcriptions, path finding tasks, etc.)
 */
export class BackgroundJobRepository {
  /**
   * Create a new background job
   */
  async createBackgroundJob(
    sessionId: string,
    apiType: ApiType,
    taskType: TaskType,
    rawInput: string,
    includeSyntax: boolean = true,
    temperature: number = 1.0,
    visible: boolean = true
  ): Promise<BackgroundJob> {
    // Add strict session ID validation
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      const error = new Error('Invalid session ID provided for background job creation');
      console.error('[Repo] Creation error:', error);
      throw error;
    }
    
    // Create job ID and timestamp
    const jobId = `job_${uuid()}`;
    const now = Math.floor(Date.now() / 1000);
    
    // Create new job object
    const job: BackgroundJob = {
      id: jobId,
      sessionId,
      apiType,
      taskType,
      status: 'idle',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      tokensSent: 0,
      tokensReceived: 0,
      rawInput,
      modelOutput: '',
      errorMessage: '',
      createdAt: now * 1000, // Store as milliseconds in memory
      updatedAt: now * 1000, // Store as milliseconds in memory
      includeSyntax,
      temperature,
      visible: true,
      cleared: false,
      prompt: rawInput,
      response: '',
      startTime: null,
      endTime: null,
      xmlPath: null,
      statusMessage: null,
      charsReceived: 0,
      lastUpdate: now * 1000, // Store as milliseconds in memory
      modelUsed: null,
      maxOutputTokens: null,
      metadata: {}
    };
    
    // Save to database
    try {
      const savedJob = await this.saveBackgroundJob(job);
      return savedJob;
    } catch (error) {
      console.error(`[Repo] Failed to create background job for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Save background job to the database
   */
  async saveBackgroundJob(job: BackgroundJob): Promise<BackgroundJob> {
    // Add validation for job.sessionId
    if (!job.sessionId || typeof job.sessionId !== 'string' || !job.sessionId.trim()) {
      throw new Error('Invalid session ID provided in background job');
    }
    
    // Work with a copy of the job to prevent modifying the original
    const jobCopy = { ...job };
    
    // Normalize timestamps - ensure all timestamps are in seconds for SQLite
    const normalizeTimestamp = (timestamp: number | null | undefined): number | null => {
      if (timestamp === null || timestamp === undefined) return null;
      
      // Convert millisecond timestamps to seconds for database storage
      // Heuristic: most Unix timestamps in milliseconds are 13 digits (until year 2286)
      if (timestamp > 10000000000) { // timestamp is in milliseconds
        return Math.floor(timestamp / 1000);
      }
      return Math.floor(timestamp);
    };
    
    // Update timestamps - ensure we always have current timestamps for required fields
    jobCopy.updatedAt = normalizeTimestamp(jobCopy.updatedAt) || Math.floor(Date.now() / 1000);
    jobCopy.createdAt = normalizeTimestamp(jobCopy.createdAt) || jobCopy.createdAt || Math.floor(Date.now() / 1000);
    jobCopy.startTime = normalizeTimestamp(jobCopy.startTime);
    jobCopy.endTime = normalizeTimestamp(jobCopy.endTime);
    jobCopy.lastUpdate = normalizeTimestamp(jobCopy.lastUpdate || Date.now()); // Add lastUpdate if not set
    
    // Ensure numeric fields have default values
    jobCopy.promptTokens = jobCopy.promptTokens || jobCopy.tokensSent || 0;
    jobCopy.completionTokens = jobCopy.completionTokens || jobCopy.tokensReceived || 0;
    jobCopy.totalTokens = jobCopy.totalTokens || 0;
    jobCopy.tokensReceived = jobCopy.tokensReceived || jobCopy.completionTokens || 0;
    jobCopy.tokensSent = jobCopy.tokensSent || jobCopy.promptTokens || 0;
    jobCopy.charsReceived = jobCopy.charsReceived || 0;
    
    // Prepare metadata JSON
    const metadataObj = jobCopy.metadata || {};
    const metadataJson = JSON.stringify(metadataObj);
    
    // Use withTransaction for better lock handling
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Create table if it doesn't exist
        db.prepare(`
          CREATE TABLE IF NOT EXISTS background_jobs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            prompt TEXT NOT NULL,
            status TEXT DEFAULT 'idle' NOT NULL,
            start_time INTEGER,
            end_time INTEGER,
            xml_path TEXT,
            status_message TEXT,
            tokens_received INTEGER DEFAULT 0,
            tokens_sent INTEGER DEFAULT 0,
            chars_received INTEGER DEFAULT 0,
            last_update INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            cleared INTEGER DEFAULT 0 CHECK(cleared IN (0, 1)),
            api_type TEXT DEFAULT 'gemini' NOT NULL,
            task_type TEXT DEFAULT 'xml_generation' NOT NULL,
            model_used TEXT,
            max_output_tokens INTEGER,
            response TEXT,
            error_message TEXT,
            metadata TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        `).run();
        
        // Create indexes
        db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_cleared ON background_jobs(cleared)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_status_cleared ON background_jobs(status, cleared)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_api_type ON background_jobs(api_type)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type)").run();
        
        // Insert or update background job
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO background_jobs (
            id, session_id, api_type, task_type, status, tokens_sent, tokens_received,
            chars_received, prompt, response, error_message, metadata, created_at,
            updated_at, cleared, start_time, end_time,
            xml_path, status_message, last_update, model_used, max_output_tokens
          )
          VALUES (
            @id, @session_id, @api_type, @task_type, @status, @tokens_sent, @tokens_received,
            @chars_received, @prompt, @response, @error_message, @metadata, @created_at,
            @updated_at, @cleared, @start_time, @end_time,
            @xml_path, @status_message, @last_update, @model_used, @max_output_tokens
          )
        `);
        
        stmt.run({
          id: jobCopy.id,
          session_id: jobCopy.sessionId,
          api_type: jobCopy.apiType,
          task_type: jobCopy.taskType,
          status: jobCopy.status,
          // Use consistent token counting fields - prefer the standard fields and fall back to the legacy ones
          tokens_sent: jobCopy.tokensSent || jobCopy.promptTokens || 0,
          tokens_received: jobCopy.tokensReceived || jobCopy.completionTokens || 0,
          chars_received: jobCopy.charsReceived || 0,
          // For input field, prefer rawInput with prompt as the fallback
          prompt: jobCopy.rawInput || jobCopy.prompt || '',
          // For output field, prefer response with modelOutput as the fallback
          response: jobCopy.response || jobCopy.modelOutput || '',
          error_message: jobCopy.errorMessage || '',
          metadata: metadataJson,
          created_at: jobCopy.createdAt,
          updated_at: jobCopy.updatedAt,
          cleared: jobCopy.cleared ? 1 : 0,
          start_time: jobCopy.startTime,
          end_time: jobCopy.endTime,
          xml_path: jobCopy.xmlPath,
          status_message: jobCopy.statusMessage,
          last_update: jobCopy.lastUpdate,
          model_used: jobCopy.modelUsed,
          max_output_tokens: jobCopy.maxOutputTokens
        });
        
        return jobCopy;
      } catch (error) {
        console.error(`[Repo] Error saving background job ${jobCopy.id}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Get a background job by ID
   */
  async getBackgroundJob(jobId: string): Promise<BackgroundJob | null> {
    // Add validation for jobId
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for background job retrieval');
    }
    
    // Always use connectionPool.withConnection with readOnly=true for read operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return null;
        }
        
        // Get the job
        const stmt = db.prepare(`
          SELECT
            id, 
            session_id,
            api_type,
            task_type,
            status,
            tokens_sent,
            tokens_received,
            chars_received,
            prompt,
            response,
            error_message,
            metadata,
            created_at,
            updated_at,
            cleared,
            start_time,
            end_time,
            xml_path,
            status_message,
            last_update,
            model_used,
            max_output_tokens
          FROM background_jobs
          WHERE id = ?
        `);
        
        const row = stmt.get(jobId);
        
        if (!row) {
          return null;
        }
        
        // Convert database row to BackgroundJob using helper method
        return this.rowToBackgroundJob(row);
      } catch (error) {
        console.error(`[Repo] Error getting background job: ${jobId}`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Map a database row to a BackgroundJob object
   */
  private rowToBackgroundJob(row: any): BackgroundJob | null {
    if (!row) return null;
    
    // Helper to convert SQLite timestamps (seconds) to JS timestamps (milliseconds)
    const convertTimestamp = (timestamp: number | null | undefined): number | null => {
      if (timestamp === null || timestamp === undefined) return null;
      // SQLite timestamps are stored as seconds - convert to milliseconds
      return timestamp * 1000;
    };
    
    // Parse metadata if available
    let metadataObj = {};
    try {
      if (row.metadata) {
        metadataObj = JSON.parse(row.metadata);
      }
    } catch (e) {
      console.warn(`[Repo] Could not parse metadata for job ${row.id}`, e);
    }
    
    // Map DB row to BackgroundJob object, converting timestamps from seconds to milliseconds
    return {
      id: row.id,
      sessionId: row.session_id,
      apiType: row.api_type as ApiType,
      taskType: row.task_type as TaskType,
      status: row.status as JobStatus,
      // Standardize token handling - consistent field names
      tokensSent: row.tokens_sent || 0,
      tokensReceived: row.tokens_received || 0,
      // Keep compatibility with existing code that uses these names
      promptTokens: row.tokens_sent || 0, 
      completionTokens: row.tokens_received || 0,
      totalTokens: (row.tokens_sent || 0) + (row.tokens_received || 0),
      charsReceived: row.chars_received || 0,
      // Ensure prompt/response fields are consistently mapped
      // For input field, prefer consistency with rawInput as the original field name
      prompt: row.prompt || '',
      rawInput: row.prompt || '',
      // For output field, prioritize 'response' but maintain backward compatibility with 'modelOutput'
      response: row.response || '',
      modelOutput: row.response || '', // Backward compatibility: set modelOutput to same value as response
      // Handle error messages
      errorMessage: row.error_message || '',
      statusMessage: row.status_message || null,
      // Timestamps converted to milliseconds
      createdAt: convertTimestamp(row.created_at) || 0,
      updatedAt: convertTimestamp(row.updated_at) || 0,
      startTime: convertTimestamp(row.start_time),
      endTime: convertTimestamp(row.end_time),
      lastUpdate: convertTimestamp(row.last_update),
      // Other fields
      xmlPath: row.xml_path || null,
      modelUsed: row.model_used || null,
      maxOutputTokens: row.max_output_tokens || null,
      cleared: Boolean(row.cleared),
      includeSyntax: (metadataObj as any)?.includeSyntax ?? false,
      temperature: (metadataObj as any)?.temperature ?? 0.7,
      visible: true,  // Default to true, will be overridden by metadata if present
      metadata: metadataObj
    };
  }
  
  /**
   * Get all visible (non-cleared) background jobs
   */
  async getAllVisibleBackgroundJobs(): Promise<Partial<BackgroundJob>[]> {
    // Always use connectionPool.withConnection with readOnly=true for read operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return [];
        }
        
        // Get all non-cleared jobs
        const rows = db.prepare(`
          SELECT *
          FROM background_jobs
          WHERE cleared = 0
          ORDER BY 
            CASE status
              WHEN 'running' THEN 1
              WHEN 'preparing' THEN 2
              WHEN 'queued' THEN 3
              WHEN 'created' THEN 4
              WHEN 'idle' THEN 5
              WHEN 'completed' THEN 6
              WHEN 'failed' THEN 7
              WHEN 'canceled' THEN 8
              ELSE 9
            END ASC,
            updated_at DESC
          LIMIT 100
        `).all();
        
        // Map rows to BackgroundJob objects with timestamp conversion
        const jobs = rows.map(row => this.rowToBackgroundJob(row)).filter(Boolean) as Partial<BackgroundJob>[];
        
        return jobs;
      } catch (error) {
        console.error(`Error getting background jobs:`, error);
        return [];
      }
    }, true); // readOnly=true for better performance
  }
  
  /**
   * Find active background jobs by type
   * @param taskType Optional task type filter
   * @param apiType Optional API type filter
   * @param limit Maximum number of jobs to return
   * @returns Array of active background jobs
   */
  async findActiveBackgroundJobsByType(
    taskType: TaskType | null = null,
    apiType: ApiType | null = null,
    limit: number = 100
  ): Promise<Partial<BackgroundJob>[]> {
    // Build a description for logging
    const typeDesc = [
      taskType ? `taskType=${taskType}` : null,
      apiType ? `apiType=${apiType}` : null
    ].filter(Boolean).join(', ') || 'all types';
    
    // Always use connectionPool.withConnection with readOnly=true for read operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return [];
        }
        
        // Build query based on filters
        let query = `
          SELECT *
          FROM background_jobs
          WHERE cleared = 0
          AND (status = 'running' OR status = 'preparing' OR status = 'queued' OR status = 'created' OR status = 'idle')
        `;
        
        const params = [];
        
        if (taskType) {
          query += ' AND task_type = ?';
          params.push(taskType);
        }
        
        if (apiType) {
          query += ' AND api_type = ?';
          params.push(apiType);
        }
        
        query += ' ORDER BY updated_at DESC LIMIT ?';
        params.push(limit);
        
        // Execute query
        const rows = db.prepare(query).all(...params);
        
        // Map rows to BackgroundJob objects
        return rows.map(row => this.rowToBackgroundJob(row)).filter(Boolean) as Partial<BackgroundJob>[];
      } catch (error) {
        console.error(`Error finding active background jobs:`, error);
        return [];
      }
    }, true); // readOnly=true for better performance
  }
  
  /**
   * Normalize timestamp values for consistent database storage
   * Ensures that all timestamps are stored as Unix timestamps (seconds)
   */
  private normalizeTimestamp(timestamp: string | number | null | undefined): number | null {
    if (timestamp === null || timestamp === undefined) {
      return null;
    }
    
    try {
      // If it's already a number
      if (typeof timestamp === 'number') {
        // If timestamp appears to be in milliseconds (13 digits), convert to seconds
        if (timestamp > 10000000000) { // > 10 billion (approx year 2286 in seconds)
          return Math.floor(timestamp / 1000);
        }
        // Otherwise it's already in seconds
        return Math.floor(timestamp);
      }
      
      // If it's a string, try to convert to a number first
      const num = Number(timestamp);
      if (!isNaN(num)) {
        // Same milliseconds check
        if (num > 10000000000) {
          return Math.floor(num / 1000);
        }
        return Math.floor(num);
      }
      
      // If it's an ISO date string or other string format
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
      
      // If all parsing fails, log warning and use current time
      console.warn(`[Repo] Could not parse timestamp "${timestamp}" (${typeof timestamp}), using current time instead. This might indicate incorrect timestamp handling elsewhere in the app.`);
      return Math.floor(Date.now() / 1000);
    } catch (error) {
      console.error(`[Repo] Error normalizing timestamp (${typeof timestamp}: ${timestamp}):`, error);
      return Math.floor(Date.now() / 1000);
    }
  }
  
  /**
   * Update the status of a background job
   */
  async updateBackgroundJobStatus(
    params: {
      jobId: string | undefined;
      status: JobStatus;
      startTime?: number | null | undefined;
      endTime?: number | null | undefined;
      response?: string;
      statusMessage?: string;
      errorMessage?: string;
      error_message?: string;
      metadata?: {
        tokensReceived?: number;
        charsReceived?: number;
        tokensTotal?: number;
        tokensSent?: number;
        [key: string]: any;
      } | null;
    }
  ): Promise<BackgroundJob | null> {
    const { 
      jobId, 
      status, 
      startTime, 
      endTime, 
      response, 
      statusMessage, 
      errorMessage, 
      error_message,
      metadata 
    } = params;
    
    // Validate job ID
    if (!jobId) {
      throw new Error('Job ID is required for updating background job status');
    }
    
    // Get the job first
    const job = await this.getBackgroundJob(jobId);
    
    if (!job) {
      throw new Error(`Cannot update job status: Job with ID ${jobId} not found`);
    }
    
    // Create a copy of the job to update
    const updatedJob: BackgroundJob = { ...job };
    
    // Update fields
    updatedJob.status = status;
    updatedJob.statusMessage = statusMessage || job.statusMessage;
    updatedJob.updatedAt = Date.now();
    updatedJob.lastUpdate = Date.now();
    
    // For terminal statuses, auto-set endTime if not provided
    if (['completed', 'failed', 'canceled'].includes(status) && !endTime && !job.endTime) {
      updatedJob.endTime = updatedJob.updatedAt;
    } else if (endTime) {
      updatedJob.endTime = endTime;
    }
    
    // For starting statuses, set startTime if provided or not already set
    if (startTime || (status === 'running' && !job.startTime)) {
      updatedJob.startTime = startTime || updatedJob.updatedAt;
    }
    
    // Update response if provided
    if (response !== undefined) {
      updatedJob.response = response;
      // For backward compatibility until migration is complete
      updatedJob.modelOutput = response;
    }
    
    // Update error message if provided (handle both property names)
    if (errorMessage !== undefined || error_message !== undefined) {
      updatedJob.errorMessage = errorMessage || error_message || '';
    }
    
    // Merge metadata if provided
    if (metadata) {
      // Get existing metadata object
      const existingMetadata = updatedJob.metadata || {};
      
      // Update tokens and other counts if provided
      if (metadata.tokensReceived !== undefined) {
        updatedJob.tokensReceived = metadata.tokensReceived;
        updatedJob.completionTokens = metadata.tokensReceived; // Update both for compatibility
      }
      
      if (metadata.charsReceived !== undefined) {
        updatedJob.charsReceived = metadata.charsReceived;
      }
      
      if (metadata.tokensSent !== undefined) {
        updatedJob.tokensSent = metadata.tokensSent;
        updatedJob.promptTokens = metadata.tokensSent; // Update both for compatibility
      }
      
      if (metadata.tokensTotal !== undefined) {
        updatedJob.totalTokens = metadata.tokensTotal;
      }
      
      // Merge metadata objects
      updatedJob.metadata = {
        ...existingMetadata,
        ...metadata
      };
    }
    
    // Save the updated job
    await this.saveBackgroundJob(updatedJob);
    
    return updatedJob;
  }
  
  /**
   * Clear all background job history
   * This marks all completed/failed/canceled jobs as cleared so they no longer appear in the UI
   */
  async clearBackgroundJobHistory(): Promise<void> {
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return;
        }
        
        // Find old jobs to delete (over 30 days old, completed/failed/canceled)
        // This helps keep the database size under control
        const thirtyDaysAgo = Math.floor((Date.now() / 1000) - (30 * 24 * 60 * 60));
        const oldJobIdsResult = db.prepare(`
          SELECT id FROM background_jobs
          WHERE (status = 'completed' OR status = 'failed' OR status = 'canceled')
          AND created_at < ?
          LIMIT 1000
        `).all(thirtyDaysAgo);
        
        // Extract job IDs from result
        const oldJobIds = oldJobIdsResult.map(row => (row as any).id);
        
        if (oldJobIds.length > 0) {
          // Delete old jobs in batches to avoid potential lock issues
          const batchSize = 100;
          for (let i = 0; i < oldJobIds.length; i += batchSize) {
            const batch = oldJobIds.slice(i, i + batchSize);
            const placeholders = batch.map(() => '?').join(',');
            
            db.prepare(`
              DELETE FROM background_jobs
              WHERE id IN (${placeholders})
            `).run(...batch);
          }
        }
        
        // Mark all completed/failed/canceled jobs as cleared (so they don't show in UI)
        const result = db.prepare(`
          UPDATE background_jobs
          SET cleared = 1
          WHERE (status = 'completed' OR status = 'failed' OR status = 'canceled')
          AND cleared = 0
        `).run();
      } catch (error) {
        console.error(`Error clearing background job history:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Find background jobs for a specific session
   */
  async findBackgroundJobsBySessionId(
    sessionId: string,
    includeInvisible: boolean = false,
    includeCleared: boolean = false,
    limit: number = 100
  ): Promise<Partial<BackgroundJob>[]> {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for finding background jobs');
    }
    
    // Always use connectionPool.withConnection with readOnly=true for read operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return [];
        }
        
        // Build query based on filters
        let query = `
          SELECT *
          FROM background_jobs
          WHERE session_id = ?
        `;
        
        const params = [sessionId];
        
        // Add filter for cleared status
        if (!includeCleared) {
          query += ` AND cleared = 0`;
        }
        
        // Add ORDER BY and LIMIT clauses
        query += ` ORDER BY updated_at DESC LIMIT ?`;
        params.push(limit.toString());
        
        // Execute query
        const rows = db.prepare(query).all(...params);
        
        // Map rows to BackgroundJob objects
        return rows.map(row => this.rowToBackgroundJob(row)).filter(Boolean) as Partial<BackgroundJob>[];
      } catch (error) {
        console.error(`Error finding background jobs for session ${sessionId}:`, error);
        return [];
      }
    }, true); // readOnly=true for better performance
  }
  
  /**
   * Update the cleared status of a background job
   */
  async updateBackgroundJobClearedStatus(
    jobId: string,
    cleared: boolean
  ): Promise<void> {
    // Validate jobId
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for updating cleared status');
    }
    
    // Always use connectionPool.withTransaction for write operations
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return;
        }
        
        // Update the cleared status
        db.prepare(`
          UPDATE background_jobs
          SET cleared = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          cleared ? 1 : 0,
          Math.floor(Date.now() / 1000), // Update timestamp
          jobId
        );
      } catch (error) {
        console.error(`Error updating job cleared status (${jobId}):`, error);
        throw error;
      }
    });
  }
  
  /**
   * Cancel all active background jobs for a session
   */
  async cancelAllSessionBackgroundJobs(sessionId: string): Promise<void> {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for background job cancellation');
    }
    
    return connectionPool.withTransaction(async (db) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return;
        }
        
        // Find all active jobs for this session
        const activeJobIdsResult = db.prepare(`
          SELECT id FROM background_jobs
          WHERE session_id = ?
          AND (status = 'running' OR status = 'preparing' OR status = 'queued' OR status = 'created' OR status = 'idle')
          AND cleared = 0
        `).all(sessionId);
        
        // Extract job IDs from result
        const jobIds = activeJobIdsResult.map(row => (row as any).id);
        
        if (jobIds.length === 0) {
          return;
        }
        
        // Get current timestamp
        const now = Math.floor(Date.now() / 1000);
        
        // Update all jobs to canceled in a batch for efficiency
        const updateStmt = db.prepare(`
          UPDATE background_jobs
          SET status = 'canceled',
              updated_at = ?,
              end_time = ?,
              status_message = 'Canceled due to session action',
              last_update = ?
          WHERE id = ?
        `);
        
        // Create a transaction function
        const updateJobs = db.transaction((jobIdsToUpdate: string[]) => {
          for (const jobId of jobIdsToUpdate) {
            updateStmt.run(now, now, now, jobId);
          }
        });
        
        // Execute the transaction
        updateJobs(jobIds);
      } catch (error) {
        console.error(`Error canceling jobs for session ${sessionId}:`, error);
        throw error;
      }
    });
  }

  /**
   * Get a session by ID - delegates to SessionRepository
   */
  async getSession(sessionId: string): Promise<Session | null> {
    console.log(`[BackgroundJobRepo] Delegating getSession to SessionRepository: ${sessionId}`);
    
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for session retrieval');
    }
    
    return sessionRepository.getSession(sessionId);
  }
}

// Create and export singleton instance
export const backgroundJobRepository = new BackgroundJobRepository();