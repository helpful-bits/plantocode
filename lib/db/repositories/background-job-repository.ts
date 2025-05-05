import { BackgroundJob, ApiType, TaskType, JobStatus, Session, JOB_STATUSES } from '@/types';
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
    visible: boolean = true,
    metadata: { [key: string]: any } = {}
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
      metadata: metadata // Use provided metadata
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
    
    const jobId = row.id;
    
    // Enable debug logging for stuck jobs
    const DEBUG_JOB_MAPPING = false;
    
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
        
        if (DEBUG_JOB_MAPPING) {
          console.debug(`[Repo] Job ${jobId}: Successfully parsed metadata:`, metadataObj);
        }
      }
    } catch (e) {
      console.warn(`[Repo] Could not parse metadata for job ${jobId}:`, e);
      // Continue with empty metadata rather than failing
    }
    
    // For debugging stuck "Processing" jobs
    if (DEBUG_JOB_MAPPING || row.status === 'running') {
      console.debug(`[Repo] Mapping job ${jobId}:`, {
        status: row.status,
        response: row.response ? `${row.response.substring(0, 20)}...` : null,
        error_message: row.error_message,
        start_time: row.start_time,
        end_time: row.end_time,
        updated_at: row.updated_at,
        tokens_received: row.tokens_received
      });
    }
    
    // Convert timestamps using helper function
    const createdAt = convertTimestamp(row.created_at) || 0;
    const updatedAt = convertTimestamp(row.updated_at) || 0;
    const startTime = convertTimestamp(row.start_time);
    const endTime = convertTimestamp(row.end_time);
    const lastUpdate = convertTimestamp(row.last_update);
    
    // Special handling for status field - ensure valid JobStatus
    // This helps prevent UI issues from invalid status values
    const statusValue = row.status ?? 'unknown';
    let status = statusValue as JobStatus;
    
    // Validate status is a valid JobStatus enum value using the constants
    const validStatuses = JOB_STATUSES.ALL;
    if (!validStatuses.includes(status)) {
      console.warn(`[Repo] Invalid status '${status}' for job ${jobId}, defaulting to 'idle'`);
      status = 'idle';
    }
    
    // Handle response and error fields based on status
    let responseText = '';
    let errorMessageText = '';
    
    // First, extract the raw values from the database
    const rawResponse = row.response;
    const rawErrorMessage = row.error_message;
    
    // Normalize response field - We want consistent string values, never null/undefined
    if (typeof rawResponse === 'string') {
      responseText = rawResponse;
    } else if (rawResponse) {
      // If it's not a string but has a truthy value, convert to string
      try {
        responseText = String(rawResponse);
      } catch (e) {
        responseText = '';
        console.warn(`[Repo] Could not convert response to string for job ${jobId}`);
      }
    }
    
    // Normalize error message field - We want consistent string values, never null/undefined
    if (typeof rawErrorMessage === 'string') {
      errorMessageText = rawErrorMessage;
    } else if (rawErrorMessage) {
      // If it's not a string but has a truthy value, convert to string
      try {
        errorMessageText = String(rawErrorMessage);
      } catch (e) {
        errorMessageText = '';
        console.warn(`[Repo] Could not convert error_message to string for job ${jobId}`);
      }
    }
    
    // Detect and correct potentially stuck jobs - if a job is marked as running but has an end_time, 
    // it should actually be in a terminal state - likely 'completed' if there's a response
    if (status === 'running' && row.end_time) {
      if (responseText) {
        console.warn(`[Repo] Found stuck running job ${jobId} with response and end_time (${row.end_time}), correcting to 'completed'`);
        status = 'completed';
      } else if (errorMessageText) {
        console.warn(`[Repo] Found stuck running job ${jobId} with error and end_time (${row.end_time}), correcting to 'failed'`);
        status = 'failed';
      } else {
        // If there's an end_time but no response or error, set to failed with a generic message
        console.warn(`[Repo] Found stuck running job ${jobId} with end_time (${row.end_time}) but no response or error, correcting to 'failed'`);
        status = 'failed';
        errorMessageText = 'Job failed (recovered from inconsistent state)';
      }
    }
    
    // Ensure terminal states have appropriate content
    if (JOB_STATUSES.TERMINAL.includes(status)) {
      if (status === 'completed' && !responseText) {
        responseText = '[Job completed with no response]';
        console.warn(`[Repo] Completed job ${jobId} has no response, adding placeholder`);
      } else if ((status === 'failed' || status === 'canceled') && !errorMessageText) {
        errorMessageText = status === 'failed' 
          ? 'Job failed with no error message' 
          : 'Job canceled with no reason provided';
        console.warn(`[Repo] ${status.charAt(0).toUpperCase() + status.slice(1)} job ${jobId} has no error message, adding placeholder`);
      }
    }
    
    // Map DB row to BackgroundJob object, with careful handling of all fields
    const job: BackgroundJob = {
      id: jobId,
      sessionId: row.session_id,
      apiType: row.api_type as ApiType,
      taskType: row.task_type as TaskType,
      status: status,
      
      // Handle token counts with fallbacks
      tokensSent: typeof row.tokens_sent === 'number' ? row.tokens_sent : 0,
      tokensReceived: typeof row.tokens_received === 'number' ? row.tokens_received : 0,
      
      // Compatibility fields - ensure consistent values
      promptTokens: typeof row.tokens_sent === 'number' ? row.tokens_sent : 0, 
      completionTokens: typeof row.tokens_received === 'number' ? row.tokens_received : 0,
      totalTokens: (typeof row.tokens_sent === 'number' ? row.tokens_sent : 0) + 
                   (typeof row.tokens_received === 'number' ? row.tokens_received : 0),
      
      // Character count with fallback
      charsReceived: typeof row.chars_received === 'number' ? row.chars_received : 0,
      
      // Input field handling
      prompt: row.prompt || '',
      rawInput: row.prompt || '',
      
      // Use our normalized strings for response and error
      response: responseText,
      modelOutput: responseText, // For backward compatibility
      errorMessage: errorMessageText,
      
      // Status message handling
      statusMessage: row.status_message || null,
      
      // Timestamps handling
      createdAt: createdAt,
      updatedAt: updatedAt,
      startTime: startTime,
      endTime: endTime,
      lastUpdate: lastUpdate,
      
      // Other fields
      xmlPath: row.xml_path || null,
      modelUsed: row.model_used || null,
      maxOutputTokens: row.max_output_tokens || null,
      cleared: Boolean(row.cleared),
      
      // Metadata derived fields with sensible defaults
      includeSyntax: (metadataObj as any)?.includeSyntax ?? false,
      temperature: (metadataObj as any)?.temperature ?? 0.7,
      visible: true,
      
      // Store the full metadata object for access by other components
      metadata: metadataObj
    };
    
    // Final validation - ensure timestamps are consistent with status
    if (JOB_STATUSES.TERMINAL.includes(job.status) && !job.endTime) {
      // Terminal status without endTime - set to the most recent timestamp
      const latestTimestamp = Math.max(
        job.updatedAt || 0, 
        job.lastUpdate || 0,
        job.createdAt || 0
      );
      job.endTime = latestTimestamp || Date.now();
      console.warn(`[Repo] Terminal job ${jobId} with status '${job.status}' is missing endTime, setting to ${job.endTime}`);
    }
    
    if (JOB_STATUSES.ACTIVE.includes(job.status) && !job.startTime) {
      // Running status without startTime - set to the earliest relevant timestamp
      const earliestTimestamp = Math.min(
        job.updatedAt || Number.MAX_SAFE_INTEGER, 
        job.lastUpdate || Number.MAX_SAFE_INTEGER,
        job.createdAt || Number.MAX_SAFE_INTEGER
      );
      job.startTime = earliestTimestamp === Number.MAX_SAFE_INTEGER ? Date.now() : earliestTimestamp;
      console.warn(`[Repo] Running job ${jobId} is missing startTime, setting to ${job.startTime}`);
    }
    
    // Check for additional inconsistent states and correct them
    if (JOB_STATUSES.ACTIVE.includes(job.status) && job.endTime !== null) {
      // Active job should not have an endTime set
      console.warn(`[Repo] Found active job ${jobId} with status '${job.status}' but endTime is set (${job.endTime}), clearing endTime`);
      job.endTime = null;
    }
    
    // Ensure completed jobs have response, failed/canceled jobs have errorMessage
    if (job.status === 'completed' && !job.response) {
      job.response = '[Job completed with no response]';
      job.modelOutput = '[Job completed with no response]';
      console.warn(`[Repo] Completed job ${jobId} has no response after mapping, adding placeholder`);
    } else if ((job.status === 'failed' || job.status === 'canceled') && !job.errorMessage) {
      job.errorMessage = job.status === 'failed' 
        ? 'Job failed with no error message' 
        : 'Job canceled with no reason provided';
      console.warn(`[Repo] ${job.status.charAt(0).toUpperCase() + job.status.slice(1)} job ${jobId} has no error message after mapping, adding placeholder`);
    }
    
    if (DEBUG_JOB_MAPPING || row.status === 'running') {
      console.debug(`[Repo] Mapped job ${jobId} to:`, {
        status: job.status,
        response: job.response ? `${job.response.substring(0, 20)}...` : null,
        errorMessage: job.errorMessage,
        startTime: job.startTime,
        endTime: job.endTime,
        updatedAt: job.updatedAt
      });
    }
    
    return job;
  }
  
  /**
   * Get all visible (non-cleared) background jobs
   */
  async getAllVisibleBackgroundJobs(): Promise<Partial<BackgroundJob>[]> {
    // Track performance for monitoring
    const startTime = performance.now();
    
    // Always use connectionPool.withConnection with readOnly=true for read operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          console.debug(`[Repo] background_jobs table does not exist, returning empty array`);
          return [];
        }
        
        // Get the count of non-cleared jobs for monitoring
        const countQuery = db.prepare(`
          SELECT COUNT(*) as count FROM background_jobs WHERE cleared = 0
        `).get();
        
        const totalJobCount = (countQuery as any)?.count || 0;
        
        // Get all non-cleared jobs with optimized query
        const query = `
          SELECT *
          FROM background_jobs
          WHERE cleared = 0
          ORDER BY 
            -- Order priority: First active jobs, then recently completed/failed
            CASE 
              -- Active jobs first, sorted by status priority
              WHEN status IN ('running', 'preparing', 'queued', 'created', 'idle') THEN 0
              -- Then completed/failed/canceled jobs
              ELSE 1
            END ASC,
            -- Within each group, sort by priority of status
            CASE status
              WHEN 'running' THEN 1  -- Running jobs first
              WHEN 'preparing' THEN 2
              WHEN 'queued' THEN 3
              WHEN 'created' THEN 4
              WHEN 'idle' THEN 5
              WHEN 'completed' THEN 6 -- Then completed jobs
              WHEN 'failed' THEN 7    -- Then failed jobs
              WHEN 'canceled' THEN 8  -- Then canceled jobs
              ELSE 9                  -- Then any other status
            END ASC,
            -- Within each status, sort by most recently updated
            updated_at DESC
          LIMIT 100 -- Limit to 100 most relevant jobs
        `;
        
        const rows = db.prepare(query).all();
        
        console.debug(`[Repo] Found ${rows.length} background jobs from ${totalJobCount} total non-cleared jobs`);
        
        // Map rows to BackgroundJob objects with timestamp conversion and integrity correction
        const jobs = rows
          .map(row => this.rowToBackgroundJob(row))
          .filter(Boolean) as Partial<BackgroundJob>[];
        
        // Log execution time for monitoring
        const duration = performance.now() - startTime;
        console.debug(`[Repo] getAllVisibleBackgroundJobs completed in ${Math.round(duration)}ms, returned ${jobs.length} jobs`);
        
        // Summarize jobs by status for debugging
        const statusSummary = jobs.reduce((acc, job) => {
          acc[job.status || 'unknown'] = (acc[job.status || 'unknown'] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        console.debug(`[Repo] Jobs by status:`, statusSummary);
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting background jobs:`, error);
        // Return empty array instead of throwing to ensure UI doesn't break
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
        
        // Build the list of active statuses as string for SQL query, using the constants
        const activeStatusesSQL = JOB_STATUSES.ACTIVE.map(status => `'${status}'`).join(', ');
        
        // Build query based on filters
        let query = `
          SELECT *
          FROM background_jobs
          WHERE cleared = 0
          AND status IN (${activeStatusesSQL})
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
        targetField?: string;
        [key: string]: any;
      } | null;
    }
  ): Promise<BackgroundJob | null> {
    const startTime = performance.now();
    
    const { 
      jobId, 
      status, 
      startTime: jobStartTime, 
      endTime: jobEndTime, 
      response, 
      statusMessage, 
      errorMessage, 
      error_message,
      metadata 
    } = params;
    
    // Debug logging for "stuck" jobs
    const DEBUG_JOB_UPDATES = false; // Set to true for extensive logging
    
    // Always log updates to terminal statuses for debugging
    const isTerminalStatusUpdate = JOB_STATUSES.TERMINAL.includes(status);
    
    if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
      console.debug(`[Repo] Updating job ${jobId} to status '${status}'`, {
        response: response ? `${response.substring(0, 30)}...` : undefined,
        errorMessage: errorMessage || error_message,
        jobStartTime,
        jobEndTime,
        metadata: metadata ? {...metadata} : undefined
      });
    }
    
    // Validate job ID
    if (!jobId) {
      throw new Error('Job ID is required for updating background job status');
    }
    
    // Get the job first
    const job = await this.getBackgroundJob(jobId);
    
    if (!job) {
      console.error(`[Repo] Cannot update job status: Job with ID ${jobId} not found`);
      throw new Error(`Cannot update job status: Job with ID ${jobId} not found`);
    }
    
    // Check for invalid transition - terminal to non-terminal
    if (job.status !== status && 
        JOB_STATUSES.TERMINAL.includes(job.status) && 
        !JOB_STATUSES.TERMINAL.includes(status)) {
      // This is an invalid transition from a terminal state to a non-terminal state
      console.warn(`[Repo] Preventing invalid status transition for job ${jobId}: ${job.status} -> ${status}`);
      
      // Return the original job without changes
      return job;
    }
    
    // Create a deep copy of the job to update
    const updatedJob: BackgroundJob = JSON.parse(JSON.stringify(job));
    
    // Set update timestamp first - critically important for UI updates
    const updateTimestamp = Date.now();
    updatedJob.updatedAt = updateTimestamp;
    updatedJob.lastUpdate = updateTimestamp;
    
    // Update status if changed
    if (status !== job.status) {
      updatedJob.status = status;
      
      // Add status transition message to help debug
      if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
        console.debug(`[Repo] Job ${jobId} status transition: ${job.status} -> ${status}`);
      }
    }
    
    // Update status message if provided
    if (statusMessage !== undefined) {
      updatedJob.statusMessage = statusMessage;
    }
    
    // Handle time tracking logic for various job states
    
    // ------------- TERMINAL STATUS HANDLING -------------
    if (JOB_STATUSES.TERMINAL.includes(status)) {
      // 1. Always ensure endTime is set for terminal statuses
      // Priority: 1) explicitly provided endTime, 2) existing endTime, 3) current timestamp
      if (jobEndTime) {
        // Use explicitly provided endTime
        updatedJob.endTime = jobEndTime;
      } 
      else if (!updatedJob.endTime) {
        // Auto-set endTime if not already set
        updatedJob.endTime = updateTimestamp;
        
        if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
          console.debug(`[Repo] Auto-setting endTime for job ${jobId} to ${new Date(updateTimestamp).toISOString()}`);
        }
      }
      
      // 2. Ensure relevant fields are set based on terminal status type
      if (status === 'completed') {
        // For completed jobs, ensure response is set
        const hasExistingResponse = Boolean(updatedJob.response && updatedJob.response.trim());
        const hasNewResponse = Boolean(response && response.trim());
        
        if (!hasExistingResponse && !hasNewResponse) {
          // Set placeholder response if no response content exists
          updatedJob.response = '[Job completed with no response]';
          updatedJob.modelOutput = '[Job completed with no response]'; // For backward compatibility
          
          console.warn(`[Repo] Job ${jobId} marked as 'completed' but has no response, adding placeholder`);
        } 
        else if (hasNewResponse) {
          // Update both response fields for consistency (if new response provided)
          updatedJob.response = response;
          updatedJob.modelOutput = response; // For backward compatibility
        }
        
        // Clear error message for completed jobs
        updatedJob.errorMessage = '';
      }
      else if (JOB_STATUSES.FAILED.includes(status)) {
        // For failed/canceled jobs, ensure errorMessage is set
        const hasExistingError = Boolean(updatedJob.errorMessage && updatedJob.errorMessage.trim());
        const hasNewError = Boolean((errorMessage || error_message) && (errorMessage || error_message || '').trim());
        
        if (!hasExistingError && !hasNewError) {
          // Set specific placeholder based on status
          const errorPlaceholder = status === 'failed' 
            ? 'Job failed with no error message' 
            : 'Job canceled with no reason provided';
          
          updatedJob.errorMessage = errorPlaceholder;
          
          console.warn(`[Repo] Job ${jobId} marked as '${status}' but has no error message, adding placeholder`);
        }
        else if (hasNewError) {
          // Update error message with the provided value
          updatedJob.errorMessage = errorMessage || error_message || '';
        }
        
        // Clear response for failed/canceled jobs
        updatedJob.response = '';
        updatedJob.modelOutput = '';
      }
    }
    // ------------- END TERMINAL STATUS HANDLING -------------
    
    // ------------- ACTIVE STATUS HANDLING -------------
    else if (JOB_STATUSES.ACTIVE.includes(status)) {
      // Set startTime if provided explicitly
      if (jobStartTime) {
        updatedJob.startTime = jobStartTime;
      } 
      // Auto-set startTime if not already set and not provided
      else if (!updatedJob.startTime) {
        updatedJob.startTime = updateTimestamp;
        
        if (DEBUG_JOB_UPDATES) {
          console.debug(`[Repo] Auto-setting startTime for job ${jobId} to ${new Date(updateTimestamp).toISOString()}`);
        }
      }
      
      // Clear endTime if it was somehow set (correcting invalid state)
      if (updatedJob.endTime !== null) {
        console.warn(`[Repo] Found '${status}' job ${jobId} with endTime set (${updatedJob.endTime}), clearing endTime`);
        updatedJob.endTime = null;
      }
    }
    // ------------- END ACTIVE STATUS HANDLING -------------
    
    // Update response if provided (now separate from terminal status handling)
    if (response !== undefined) {
      if (DEBUG_JOB_UPDATES) {
        console.debug(`[Repo] Updating response for job ${jobId}: ${response?.substring(0, 50)}...`);
      }
      
      updatedJob.response = response;
      // For backward compatibility until migration is complete
      updatedJob.modelOutput = response;
    }
    
    // Update error message if provided (now separate from terminal status handling)
    if (errorMessage !== undefined || error_message !== undefined) {
      const errorMsg = errorMessage || error_message || '';
      
      if (DEBUG_JOB_UPDATES) {
        console.debug(`[Repo] Updating error message for job ${jobId}: ${errorMsg.substring(0, 50)}...`);
      }
      
      updatedJob.errorMessage = errorMsg;
    }
    
    // Merge metadata if provided and preserve existing fields
    if (metadata) {
      // Get existing metadata object
      const existingMetadata = updatedJob.metadata || {};
      
      // Update tokens and other counts if provided
      if (metadata.tokensReceived !== undefined) {
        updatedJob.tokensReceived = metadata.tokensReceived;
        updatedJob.completionTokens = metadata.tokensReceived; // Update both for compatibility
        
        if (DEBUG_JOB_UPDATES) {
          console.debug(`[Repo] Updating tokensReceived for job ${jobId} to ${metadata.tokensReceived}`);
        }
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
      
      // Special handling for targetField in metadata (critical for form updates)
      if (metadata.targetField !== undefined) {
        if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
          console.debug(`[Repo] Job ${jobId} has targetField '${metadata.targetField}' in metadata`);
        }
      }
      
      // Merge metadata objects with new values taking precedence
      updatedJob.metadata = {
        ...existingMetadata,
        ...metadata
      };
    }
    
    // Save the updated job
    try {
      await this.saveBackgroundJob(updatedJob);
      
      const duration = performance.now() - startTime;
      
      if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
        console.debug(`[Repo] Successfully updated job ${jobId} to status '${status}' in ${Math.round(duration)}ms`);
      }
      
      return updatedJob;
    } catch (error) {
      console.error(`[Repo] Error updating job ${jobId} to status '${status}':`, error);
      throw error;
    }
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