import { BackgroundJob, ApiType, TaskType, JobStatus, Session, JOB_STATUSES } from '@/types';
import Database from 'better-sqlite3';
import connectionPool from "../connection-pool";
import crypto from 'crypto';
import { sessionRepository } from './index';
import { v4 as uuid } from 'uuid';
import { rowToBackgroundJob } from './mappers/background-job-mapper';

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
    metadata: { [key: string]: any } = {},
    projectDirectory?: string,
    initialStatus: JobStatus = 'idle'
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

    // Extract projectDirectory from metadata if provided explicitly and not in parameters
    const effectiveProjectDirectory = projectDirectory || metadata.projectDirectory || null;

    // Create new job object with defaults based on BackgroundJob type
    const job: BackgroundJob = {
      // Core identifying fields
      id: jobId,
      sessionId,
      apiType,
      taskType,
      status: initialStatus, // Use the provided initial status

      // Timestamps
      createdAt: now * 1000, // Store as milliseconds in memory
      updatedAt: now * 1000, // Store as milliseconds in memory
      startTime: null,
      endTime: null,
      lastUpdate: now * 1000, // Store as milliseconds in memory

      // Input content
      prompt: rawInput,

      // Output content
      response: '',

      // Token and performance tracking
      tokensSent: 0,
      tokensReceived: 0,
      totalTokens: 0,
      charsReceived: 0,

      // Status and error information
      statusMessage: initialStatus === 'queued' ? 'Queued for processing' : null,
      errorMessage: '',

      // Model configuration
      modelUsed: null,
      maxOutputTokens: null,
      temperature,
      includeSyntax,

      // Output file paths
      outputFilePath: null,

      // Project directory
      projectDirectory: effectiveProjectDirectory,

      // Visibility/management flags
      cleared: false,
      visible: true,

      // Structured metadata
      metadata: metadata || {}
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
    jobCopy.tokensSent = jobCopy.tokensSent || 0;
    jobCopy.tokensReceived = jobCopy.tokensReceived || 0;
    jobCopy.totalTokens = jobCopy.totalTokens || 0;
    jobCopy.charsReceived = jobCopy.charsReceived || 0;
    
    // Prepare metadata JSON - ensure critical fields like temperature are persisted in metadata
    const effectiveMetadata = jobCopy.metadata || {};
    
    // Ensure temperature from the job object (top-level field) is also stored in metadata
    if (jobCopy.temperature !== undefined && jobCopy.temperature !== null) {
      effectiveMetadata.temperature = jobCopy.temperature;
    }
    
    // Similarly, ensure modelUsed is in metadata if it exists at the top level
    if (jobCopy.modelUsed) {
      effectiveMetadata.modelUsed = jobCopy.modelUsed;
    }
    
    // Stringify the enhanced metadata
    const metadataJson = JSON.stringify(effectiveMetadata);
    
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
            output_file_path TEXT,
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
            output_file_path, status_message, last_update, model_used, max_output_tokens,
            project_directory
          )
          VALUES (
            @id, @session_id, @api_type, @task_type, @status, @tokens_sent, @tokens_received,
            @chars_received, @prompt, @response, @error_message, @metadata, @created_at,
            @updated_at, @cleared, @start_time, @end_time,
            @output_file_path, @status_message, @last_update, @model_used, @max_output_tokens,
            @project_directory
          )
        `);
        
        // Create a modified parameter object for the SQL statement with consistent field mapping
        const sqlParams = {
          id: jobCopy.id,
          session_id: jobCopy.sessionId,
          api_type: jobCopy.apiType,
          task_type: jobCopy.taskType,
          status: jobCopy.status,
          
          // Token counts
          tokens_sent: typeof jobCopy.tokensSent === 'number' ? jobCopy.tokensSent : 0,
          tokens_received: typeof jobCopy.tokensReceived === 'number' ? jobCopy.tokensReceived : 0,
                          
          chars_received: typeof jobCopy.charsReceived === 'number' ? jobCopy.charsReceived : 0,
          
          // Input field
          prompt: jobCopy.prompt || '',
          
          // Output field - preserve null/undefined values as null for database storage
          response: jobCopy.response ?? null,
          
          // For error messages, preserve null/undefined values as null for database storage
          error_message: jobCopy.errorMessage ?? null,
          
          // Metadata and timestamps
          metadata: metadataJson,
          created_at: jobCopy.createdAt,
          updated_at: jobCopy.updatedAt,
          cleared: jobCopy.cleared ? 1 : 0,
          start_time: jobCopy.startTime,
          end_time: jobCopy.endTime,
          output_file_path: jobCopy.outputFilePath,
          status_message: jobCopy.statusMessage,
          last_update: jobCopy.lastUpdate,
          
          // Project directory
          project_directory: jobCopy.projectDirectory || null,
          
          // Model configuration
          model_used: jobCopy.modelUsed,
          max_output_tokens: jobCopy.maxOutputTokens
        };
        
        // Diagnostic log for implementation plan jobs
        if (jobCopy.taskType === 'implementation_plan' && jobCopy.status === 'completed') {
          console.log(`[BackgroundJobRepo] Saving completed implementation plan job ${jobCopy.id}. Response length: ${jobCopy.response?.length || 0}. Snippet: ${jobCopy.response?.substring(0, 100) || 'N/A'}`);
        }
        
        stmt.run(sqlParams);
        
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
            output_file_path,
            status_message,
            last_update,
            model_used,
            max_output_tokens,
            project_directory
          FROM background_jobs
          WHERE id = ?
        `);
        
        const row = stmt.get(jobId);
        
        if (!row) {
          return null;
        }
        
        // Convert database row to BackgroundJob using helper method
        return rowToBackgroundJob(row);
      } catch (error) {
        console.error(`[Repo] Error getting background job: ${jobId}`, error);
        throw error;
      }
    }, true);  // Use readonly mode
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
          .map(row => rowToBackgroundJob(row))
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
        return rows.map(row => rowToBackgroundJob(row)).filter(Boolean) as Partial<BackgroundJob>[];
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
   * Update the status and related fields of a background job
   * 
   * This method ensures consistent handling of job status changes, including:
   * - Setting appropriate timestamps based on the status
   * - Properly handling terminal statuses (completed, failed, canceled)
   * - Ensuring that completed jobs have a response and failed/canceled jobs have an errorMessage
   * - Merging metadata values with existing metadata
   * 
   * @param params Object containing the job fields to update
   * @returns The updated BackgroundJob object or null if the job was not found
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
      error_message?: string; // Legacy parameter name (alias for errorMessage)
      metadata?: {
        tokensReceived?: number;
        charsReceived?: number;
        tokensTotal?: number;
        tokensSent?: number;
        targetField?: string;
        modelUsed?: string;       // The model actually used for the request
        maxOutputTokens?: number; // The max tokens setting used
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
      // Use errorMessage with error_message as fallback for backwards compatibility
      errorMessage: rawErrorMessage, 
      error_message: legacyErrorMessage,
      metadata 
    } = params;
    
    // Normalize error message (handle both parameter names)
    const errorMessage = rawErrorMessage || legacyErrorMessage;
    
    // Debug logging for "stuck" jobs
    const DEBUG_JOB_UPDATES = false; // Set to true for extensive logging
    
    // Always log updates to terminal statuses for debugging
    const isTerminalStatusUpdate = JOB_STATUSES.TERMINAL.includes(status);
    
    if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
      console.debug(`[Repo] Updating job ${jobId} to status '${status}'`, {
        response: response ? `${response.substring(0, 30)}...` : undefined,
        errorMessage: errorMessage,
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
    // Always set the current time to ensure UI updates detect the change
    const updateTimestamp = Date.now();
    updatedJob.updatedAt = updateTimestamp;
    updatedJob.lastUpdate = updateTimestamp;

    // Log timestamp update for debugging
    if (DEBUG_JOB_UPDATES) {
      console.debug(`[Repo] Setting updatedAt and lastUpdate for job ${jobId} to ${new Date(updateTimestamp).toISOString()}`);
    }
    
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
        // For completed jobs, simply use the response value provided
        if (response !== undefined) {
          // Update response field - preserve null if null was explicitly passed
          updatedJob.response = response;
        }
        
        // Clear error message for completed jobs
        updatedJob.errorMessage = '';
      }
      else if (JOB_STATUSES.FAILED.includes(status)) {
        // For failed/canceled jobs, use the errorMessage value provided
        if (errorMessage !== undefined) {
          // Update error message with the provided value - preserve null if null was explicitly passed
          updatedJob.errorMessage = errorMessage;
        }
        
        // Clear response for failed/canceled jobs if no explicit response is provided
        if (response === undefined) {
          updatedJob.response = '';
        } else {
          // Use the provided response value (could be partial content)
          updatedJob.response = response;
        }
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
      
      // Use the response value as is, preserving null if provided
      updatedJob.response = response;
    }
    
    // Update error message if provided (now separate from terminal status handling)
    if (errorMessage !== undefined) {
      if (DEBUG_JOB_UPDATES) {
        console.debug(`[Repo] Updating error message for job ${jobId}: ${errorMessage?.substring(0, 50)}...`);
      }
      
      // Use the error message value as is, preserving null if provided
      updatedJob.errorMessage = errorMessage;
    }
    
    // Merge metadata if provided and preserve existing fields
    if (metadata) {
      // Get existing metadata object
      const existingMetadata = updatedJob.metadata || {};

      // Update tokens and other counts if provided
      if (metadata.tokensReceived !== undefined) {
        updatedJob.tokensReceived = metadata.tokensReceived;

        if (DEBUG_JOB_UPDATES) {
          console.debug(`[Repo] Updating tokensReceived for job ${jobId} to ${metadata.tokensReceived}`);
        }
      }

      if (metadata.charsReceived !== undefined) {
        updatedJob.charsReceived = metadata.charsReceived;
      }

      if (metadata.tokensSent !== undefined) {
        updatedJob.tokensSent = metadata.tokensSent;
      }

      if (metadata.tokensTotal !== undefined) {
        updatedJob.totalTokens = metadata.tokensTotal;
      }

      // Update top-level modelUsed if provided in metadata
      if (typeof metadata.modelUsed === 'string' && metadata.modelUsed.trim() !== '') {
        updatedJob.modelUsed = metadata.modelUsed;
        if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
          console.debug(`[Repo] Setting job ${jobId} modelUsed to '${metadata.modelUsed}' from metadata`);
        }
      }

      // Update top-level maxOutputTokens if provided in metadata
      if (typeof metadata.maxOutputTokens === 'number') {
        updatedJob.maxOutputTokens = metadata.maxOutputTokens;
      }

      // Update top-level temperature if provided in metadata
      if (typeof metadata.temperature === 'number') {
        updatedJob.temperature = metadata.temperature;
      }

      // Special handling for outputFilePath in metadata
      if (metadata.outputFilePath !== undefined) {
        // Set outputFilePath directly on the job object
        updatedJob.outputFilePath = metadata.outputFilePath;

        if (DEBUG_JOB_UPDATES || isTerminalStatusUpdate) {
          console.debug(`[Repo] Setting job ${jobId} outputFilePath to '${metadata.outputFilePath}'`);
        }
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
    
    // Ensure isStreaming is set to false when job reaches a terminal state
    if (JOB_STATUSES.TERMINAL.includes(updatedJob.status) && updatedJob.metadata) {
      updatedJob.metadata.isStreaming = false;
      
      // Update modelUsed if provided in metadata
      if (params.metadata?.modelUsed && typeof params.metadata.modelUsed === 'string') {
        updatedJob.modelUsed = params.metadata.modelUsed;
      }
      
      // Update maxOutputTokens if provided in metadata
      if (params.metadata?.maxOutputTokens && typeof params.metadata.maxOutputTokens === 'number') {
        updatedJob.maxOutputTokens = params.metadata.maxOutputTokens;
      }
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
   * Clear old background job history
   * This function has three modes:
   * 1. When daysToKeep is -1, it deletes ALL completed, failed, and canceled jobs
   * 2. When daysToKeep is 0, it ONLY performs hard deletion of very old jobs (90+ days) to maintain database size
   * 3. When daysToKeep > 0, it will ALSO mark completed jobs older than daysToKeep as cleared
   *
   * @param daysToKeep Number of days to keep completed jobs visible (0 = keep all visible, -1 = delete all completed/failed/canceled)
   */
  async clearBackgroundJobHistory(daysToKeep: number = 0): Promise<void> {
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        console.log(`[BackgroundJobRepo] Running clearBackgroundJobHistory with daysToKeep=${daysToKeep}`);

        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();

        if (!tableExists) {
          return;
        }

        // SPECIAL CASE: Delete ALL completed/failed/canceled jobs when daysToKeep is -1
        if (daysToKeep === -1) {
          // Count how many jobs will be deleted
          const countResult = db.prepare(`
            SELECT COUNT(*) as count FROM background_jobs
            WHERE (status = 'completed' OR status = 'failed' OR status = 'canceled')
          `).get();

          const jobCount = (countResult as any)?.count || 0;

          if (jobCount > 0) {
            console.log(`[BackgroundJobRepo] Deleting all ${jobCount} completed/failed/canceled jobs`);

            // Delete jobs matching the terminal statuses
            const result = db.prepare(`
              DELETE FROM background_jobs
              WHERE (status = 'completed' OR status = 'failed' OR status = 'canceled')
            `).run();

            const deletedCount = result?.changes || 0;
            console.log(`[BackgroundJobRepo] Deleted ${deletedCount} jobs`);
          }

          return;
        }

        // PART 1: Always delete very old jobs (90+ days) regardless of daysToKeep value
        const ninetyDaysAgo = Math.floor((Date.now() / 1000) - (90 * 24 * 60 * 60));
        const oldJobIdsResult = db.prepare(`
          SELECT id FROM background_jobs
          WHERE (status = 'completed' OR status = 'failed' OR status = 'canceled')
          AND created_at < ?
          LIMIT 1000
        `).all(ninetyDaysAgo);

        // Extract job IDs from result
        const oldJobIds = oldJobIdsResult.map(row => (row as any).id);

        if (oldJobIds.length > 0) {
          console.log(`[BackgroundJobRepo] Deleting ${oldJobIds.length} jobs older than 90 days`);

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

        // PART 2: Only mark completed/failed/canceled jobs as cleared if daysToKeep > 0
        // This allows users to control how far back they want to see completed jobs
        if (daysToKeep > 0) {
          const daysAgoTimestamp = Math.floor((Date.now() / 1000) - (daysToKeep * 24 * 60 * 60));

          // Mark jobs older than daysToKeep as cleared
          const result = db.prepare(`
            UPDATE background_jobs
            SET cleared = 1
            WHERE (status = 'completed' OR status = 'failed' OR status = 'canceled')
            AND cleared = 0
            AND created_at < ?
          `).run(daysAgoTimestamp);

          const clearedCount = result?.changes || 0;
          if (clearedCount > 0) {
            console.log(`[BackgroundJobRepo] Marked ${clearedCount} jobs older than ${daysToKeep} days as cleared`);
          }
        } else {
          console.log(`[BackgroundJobRepo] Not clearing any recent jobs as daysToKeep=0 (keep all visible)`);
        }
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
        return rows.map(row => rowToBackgroundJob(row)).filter(Boolean) as Partial<BackgroundJob>[];
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
   * Append content to a job's response without changing its status
   *
   * This method is used for streaming updates, where we want to incrementally
   * update the job's response and token counts while keeping it in 'running' status.
   *
   * @param jobId The job ID
   * @param chunk The text chunk to append to the response
   * @param newTokensReceived Number of tokens in this chunk
   * @param currentTotalResponseLength Current length of the total response (chars)
   * @returns Promise that resolves when the update is complete
   */
  async appendToJobResponse(
    jobId: string,
    chunk: string,
    newTokensReceived: number,
    currentTotalResponseLength: number
  ): Promise<void> {
    // Validate jobId
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for appending to response');
    }

    // First, get the current job to ensure it exists and is in 'running' state
    const job = await this.getBackgroundJob(jobId);

    if (!job) {
      throw new Error(`Cannot append to job response: Job with ID ${jobId} not found`);
    }

    // Temporary diagnostic logging for implementation plan jobs
    if (job.taskType === 'implementation_plan') {
      console.log(`[TEMP_DEBUG_IMPL_PLAN] Appending to job ${jobId}, chunk length: ${chunk.length}, newTokens: ${newTokensReceived}, currentLength: ${currentTotalResponseLength}`);
    }

    // Only append to jobs in 'running' status
    if (job.status !== 'running') {
      console.warn(`[Repo] Cannot append to job ${jobId} with status '${job.status}', job must be in 'running' status`);
      return;
    }

    // Calculate updated token counts
    const updatedTokensReceived = (job.tokensReceived || 0) + newTokensReceived;
    const updatedTotalTokens = (job.tokensSent || 0) + updatedTokensReceived;

    // Update the job with the new chunk and token counts
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Get current timestamp at millisecond precision
        const nowMs = Date.now();
        const nowSec = Math.floor(nowMs / 1000);

        // Get current response - special handling for null response
        const currentResponse = job.response === null ? '' : job.response;

        // Append chunk to the current response
        const updatedResponse = currentResponse + chunk;

        // Update the job, preserving its 'running' status - ALWAYS update both updatedAt and lastUpdate
        // This ensures the client's areJobsEqual optimization can detect changes
        const stmt = db.prepare(`
          UPDATE background_jobs
          SET response = ?,
              tokens_received = ?,
              chars_received = ?,
              updated_at = ?,
              last_update = ?,
              metadata = json_set(
                metadata,
                '$.lastStreamUpdateTime', ?,
                '$.responseLength', ?,
                '$.totalTokens', ?
              )
          WHERE id = ? AND status = 'running'
        `);

        const result = stmt.run(
          updatedResponse,
          updatedTokensReceived,
          currentTotalResponseLength,
          nowSec,
          nowSec,
          nowMs, // millisecond precision for stream updates
          currentTotalResponseLength,
          updatedTotalTokens,
          jobId
        );

        // Temporary logging for implementation plan jobs
        if (job.taskType === 'implementation_plan') {
          console.log(`[TEMP_DEBUG_IMPL_PLAN] Update result for ${jobId}: changes=${result?.changes || 0}, new response length=${updatedResponse.length}`);
        }

        // Check if the update succeeded (should affect one row)
        if (!result || result.changes !== 1) {
          console.warn(`[Repo] Failed to append to job ${jobId}, no rows updated. Job may no longer be in 'running' status.`);
        }
      } catch (error) {
        console.error(`[Repo] Error appending to job ${jobId}:`, error);
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
  
  /**
   * Get and acknowledge queued jobs for worker processing
   * 
   * This method retrieves up to 'limit' jobs with status 'queued',
   * updates their status to 'acknowledged_by_worker', and returns
   * the list of jobs that were successfully updated.
   * 
   * @param limit Maximum number of jobs to fetch
   * @returns Array of jobs that were acknowledged by the worker
   */
  async getAndAcknowledgeQueuedJobs(limit: number): Promise<BackgroundJob[]> {
    // Use withTransaction for atomicity
    return connectionPool.withTransaction(async (db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return [];
        }
        
        // Get jobs with 'queued' status, ordered by priority and creation time
        const getQueuedJobs = db.prepare(`
          SELECT * FROM background_jobs 
          WHERE status = 'queued' 
          ORDER BY 
            COALESCE(
              json_extract(metadata, '$.jobPriorityForWorker'), 
              json_extract(metadata, '$.priority'),
              1
            ) DESC, 
            created_at ASC 
          LIMIT ?
        `);
        
        const queuedJobs = getQueuedJobs.all(limit);
        
        if (!queuedJobs || queuedJobs.length === 0) {
          return [];
        }
        
        // Map DB rows to BackgroundJob objects
        const jobs: BackgroundJob[] = [];
        
        for (const row of queuedJobs) {
          const job = rowToBackgroundJob(row);
          if (!job) continue;
          
          // Attempt to atomically update the job status to 'acknowledged_by_worker'
          const updated = await this.atomicallySetJobStatus(
            job.id, 
            'queued', 
            'acknowledged_by_worker'
          );
          
          if (updated) {
            // If the job was successfully updated, add it to the result
            // Fetch the updated job to ensure we have the latest data
            const updatedJob = await this.getBackgroundJob(job.id);
            if (updatedJob) {
              jobs.push(updatedJob);
            }
          }
        }
        
        console.log(`[Repo] Acknowledged ${jobs.length} queued jobs for worker processing`);
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting and acknowledging queued jobs:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Atomically set a job's status from an expected old status to a new status
   * 
   * @param jobId The job ID
   * @param expectedOldStatus The expected current status
   * @param newStatus The new status to set
   * @returns true if the job was updated, false if the job was not found or didn't have the expected status
   */
  async atomicallySetJobStatus(
    jobId: string, 
    expectedOldStatus: JobStatus, 
    newStatus: JobStatus
  ): Promise<boolean> {
    return connectionPool.withTransaction(async (db: Database.Database) => {
      try {
        // Update the job status only if it has the expected status
        const now = Math.floor(Date.now() / 1000);
        
        const result = db.prepare(`
          UPDATE background_jobs
          SET status = ?, updated_at = ?
          WHERE id = ? AND status = ?
        `).run(newStatus, now, jobId, expectedOldStatus);
        
        // Return true if a row was affected
        return (result?.changes || 0) > 0;
      } catch (error) {
        console.error(`[Repo] Error atomically setting job status:`, error);
        return false;
      }
    });
  }
  
  /**
   * Reset stale acknowledged jobs back to 'queued' status
   * This helps recover from situations where a worker crashes after
   * acknowledging a job but before completing it.
   * 
   * @param timeoutThresholdSeconds How many seconds a job can be in 'acknowledged_by_worker' state before being reset
   * @returns Number of jobs that were reset
   */
  async resetStaleAcknowledgedJobs(timeoutThresholdSeconds: number): Promise<number> {
    return connectionPool.withTransaction(async (db: Database.Database) => {
      try {
        // Check if the 'background_jobs' table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return 0;
        }
        
        const now = Math.floor(Date.now() / 1000);
        
        // Find and update jobs that have been stuck in 'acknowledged_by_worker' state
        const result = db.prepare(`
          UPDATE background_jobs
          SET status = 'queued', updated_at = ?
          WHERE status = 'acknowledged_by_worker'
          AND (? - updated_at) > ?
        `).run(now, now, timeoutThresholdSeconds);
        
        const count = result?.changes || 0;
        
        if (count > 0) {
          console.log(`[Repo] Reset ${count} stale acknowledged jobs back to 'queued' status`);
        }
        
        return count;
      } catch (error) {
        console.error(`[Repo] Error resetting stale acknowledged jobs:`, error);
        return 0;
      }
    });
  }
}

// Create and export singleton instance
export const backgroundJobRepository = new BackgroundJobRepository();