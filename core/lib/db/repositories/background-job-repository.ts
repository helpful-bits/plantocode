import { BackgroundJob, ApiType, TaskType, JobStatus, Session, JOB_STATUSES } from '@core/types';
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
        // Create table if it doesn't exist with support for all valid job statuses
        db.prepare(`
          CREATE TABLE IF NOT EXISTS background_jobs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            prompt TEXT NOT NULL,
            status TEXT DEFAULT 'idle' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker', 'preparing_input', 'generating_stream', 'processing_stream', 'completed_by_tag')),
            start_time INTEGER,
            end_time INTEGER,
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
            project_directory TEXT,
            visible BOOLEAN DEFAULT 1,
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
            status_message, last_update, model_used, max_output_tokens,
            project_directory
          )
          VALUES (
            @id, @session_id, @api_type, @task_type, @status, @tokens_sent, @tokens_received,
            @chars_received, @prompt, @response, @error_message, @metadata, @created_at,
            @updated_at, @cleared, @start_time, @end_time,
            @status_message, @last_update, @model_used, @max_output_tokens,
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
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        // Log performance  
        const endTime = performance.now();
        console.debug(`[Repo] Retrieved ${jobs.length} of ${totalJobCount} non-cleared jobs in ${Math.round(endTime - startTime)}ms`);
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting all visible background jobs:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Get background jobs for a specific session
   */
  async getSessionBackgroundJobs(sessionId: string, options: {
    includeClearedJobs?: boolean,
    limit?: number,
    includeResponses?: boolean,
  } = {}): Promise<Partial<BackgroundJob>[]> {
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for background job retrieval');
    }
    
    const { includeClearedJobs = false, limit = 50, includeResponses = false } = options;
    
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
        
        // Build query - conditionally include cleared jobs, include/exclude response field
        const baseColumns = [
          'id', 
          'session_id',
          'api_type',
          'task_type',
          'status',
          'tokens_sent',
          'tokens_received', 
          'chars_received',
          'prompt',
          'error_message',
          'metadata',
          'created_at',
          'updated_at',
          'cleared',
          'start_time',
          'end_time',
          'status_message',
          'last_update',
          'model_used',
          'max_output_tokens',
          'project_directory'
        ];
        
        // Only include response if specifically requested to minimize memory usage
        if (includeResponses) {
          baseColumns.push('response');
        } else {
          baseColumns.push("'' as response"); // Empty response to maintain schema
        }
        
        // Construct the main query
        let query = `
          SELECT ${baseColumns.join(', ')}
          FROM background_jobs
          WHERE session_id = ?
        `;
        
        // Add filter for cleared jobs if needed
        if (!includeClearedJobs) {
          query += ' AND cleared = 0';
        }
        
        // Add sorting and limit
        query += `
          ORDER BY 
            -- Active jobs first
            CASE 
              WHEN status IN ('running', 'preparing', 'queued', 'created', 'idle') THEN 0
              ELSE 1
            END ASC,
            -- Then by updated_at (most recent first)
            updated_at DESC
            ${limit ? `LIMIT ${limit}` : ''}
        `;
        
        // Prepare and execute the query
        const rows = db.prepare(query).all(sessionId);
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => {
          // Skip full mapping for performance if responses are excluded
          if (!includeResponses) {
            // Create a simplified job object with minimal properties
            const typedRow = row as Record<string, any>;
            return {
              id: typedRow.id,
              sessionId: typedRow.session_id,
              apiType: typedRow.api_type as ApiType,
              taskType: typedRow.task_type as TaskType,
              status: typedRow.status as JobStatus,
              response: '', // Empty response as we didn't request it
              createdAt: typedRow.created_at ? typedRow.created_at * 1000 : 0, // Convert to JS timestamps
              updatedAt: typedRow.updated_at ? typedRow.updated_at * 1000 : 0,
              startTime: typedRow.start_time ? typedRow.start_time * 1000 : null,
              endTime: typedRow.end_time ? typedRow.end_time * 1000 : null,
              lastUpdate: typedRow.last_update ? typedRow.last_update * 1000 : null,
              statusMessage: typedRow.status_message,
              errorMessage: typedRow.error_message,
              cleared: Boolean(typedRow.cleared),
              projectDirectory: typedRow.project_directory
            } as Partial<BackgroundJob>;
          }
          
          // Use full mapping if responses are included
          return rowToBackgroundJob(row);
        }).filter(Boolean) as Partial<BackgroundJob>[];
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting session background jobs for ${sessionId}:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Get background jobs by task type
   */
  async getBackgroundJobsByTaskType(
    taskType: TaskType,
    options: {
      limit?: number,
      includeClearedJobs?: boolean
    } = {}
  ): Promise<Partial<BackgroundJob>[]> {
    const { limit = 50, includeClearedJobs = false } = options;
    
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
        
        // Build query
        let query = `
          SELECT *
          FROM background_jobs
          WHERE task_type = ?
        `;
        
        // Add filter for cleared jobs if needed
        if (!includeClearedJobs) {
          query += ' AND cleared = 0';
        }
        
        // Add sorting and limit
        query += `
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        
        // Prepare and execute the query
        const rows = db.prepare(query).all(taskType);
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting background jobs by task type ${taskType}:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Find active background jobs by task type
   * 
   * @param taskType The type of task to filter by
   * @param options Additional options for filtering
   * @returns An array of active background jobs matching the task type
   */
  async findActiveBackgroundJobsByType(
    taskType: TaskType,
    options: {
      limit?: number,
      includeClearedJobs?: boolean
    } = {}
  ): Promise<Partial<BackgroundJob>[]> {
    const { limit = 50, includeClearedJobs = false } = options;
    
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
        
        // Active statuses: idle, created, queued, preparing, running
        const activeStatuses = JOB_STATUSES.ACTIVE;
        const placeholders = activeStatuses.map(() => '?').join(',');
        
        // Build query
        let sql = `
          SELECT *
          FROM background_jobs
          WHERE task_type = ?
            AND status IN (${placeholders})
        `;
        
        // Add filter for cleared jobs if needed
        if (!includeClearedJobs) {
          sql += ' AND cleared = 0';
        }
        
        // Add sorting and limit
        sql += `
          ORDER BY updated_at DESC
          LIMIT ${limit}
        `;
        
        // Parameters for the SQL query (note: order matters!)
        const params = [taskType, ...activeStatuses];
        
        // Prepare and execute the query
        const rows = db.prepare(sql).all(...params);
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error finding active background jobs by type ${taskType}:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Get and acknowledge queued jobs ready for processing
   * 
   * This method fetches jobs in the 'queued' status and updates them to 'acknowledged_by_worker'.
   * It's used by the worker system to claim jobs for processing.
   * 
   * @param limit Maximum number of jobs to fetch
   * @param jobTypes Optional array of job types to filter by
   * @returns Array of jobs that have been acknowledged for processing
   */
  async getAndAcknowledgeQueuedJobs(
    limit: number = 10,
    jobTypes?: TaskType[]
  ): Promise<BackgroundJob[]> {
    // Use transaction to ensure no race conditions
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Check if the table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          console.debug(`[Repo] background_jobs table does not exist, returning empty array`);
          return [];
        }
        
        // Build the query with job type filtering if provided
        let filterClause = '';
        const params: any[] = [];
        
        if (jobTypes && jobTypes.length > 0) {
          const placeholders = jobTypes.map(() => '?').join(',');
          filterClause = ` AND task_type IN (${placeholders})`;
          params.push(...jobTypes);
        }
        
        // Get the job IDs to acknowledge in a separate query
        const selectQuery = `
          SELECT id
          FROM background_jobs
          WHERE status = 'queued'
            AND cleared = 0
            ${filterClause}
          ORDER BY 
            -- Use metadata.jobPriorityForWorker if available for sorting
            CASE 
              WHEN json_extract(metadata, '$.jobPriorityForWorker') IS NOT NULL 
              THEN json_extract(metadata, '$.jobPriorityForWorker') 
              ELSE 1 
            END DESC,
            created_at ASC
          LIMIT ?
        `;
        
        // Add limit as the last parameter
        params.push(limit);
        
        // Execute the select query to get job IDs
        const jobRows = db.prepare(selectQuery).all(...params);
        
        if (!jobRows || jobRows.length === 0) {
          return [];
        }
        
        // Extract the job IDs
        const jobIds = jobRows.map((row: any) => row.id);
        
        // Generate placeholders for the update query
        const idPlaceholders = jobIds.map(() => '?').join(',');
        
        // Update all selected jobs to 'acknowledged_by_worker' status
        const now = Math.floor(Date.now() / 1000);
        const updateQuery = `
          UPDATE background_jobs
          SET 
            status = 'acknowledged_by_worker',
            status_message = 'Acknowledged by worker',
            updated_at = ?,
            last_update = ?
          WHERE id IN (${idPlaceholders})
        `;
        
        // Execute the update
        db.prepare(updateQuery).run(now, now, ...jobIds);
        
        // Now fetch the full job objects for the updated jobs
        const fetchJobsQuery = `
          SELECT *
          FROM background_jobs
          WHERE id IN (${idPlaceholders})
        `;
        
        const updatedJobRows = db.prepare(fetchJobsQuery).all(...jobIds);
        
        // Map to BackgroundJob objects
        const jobs = updatedJobRows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        return jobs;
      } catch (error) {
        console.error('[Repo] Error acknowledging queued jobs:', error);
        throw error;
      }
    });
  }
  
  /**
   * Reset stale acknowledged jobs back to 'queued' status
   * 
   * This is used by the job scheduler to reclaim jobs that were acknowledged
   * but never processed, likely due to a worker crash or other issue.
   * 
   * @param staleThresholdMs Time in milliseconds after which a job is considered stale
   * @returns Number of jobs that were reset
   */
  async resetStaleAcknowledgedJobs(staleThresholdMs: number = 5 * 60 * 1000): Promise<number> {
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Check if the table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          return 0;
        }
        
        // Calculate the cutoff timestamp (in seconds for SQLite)
        const now = Math.floor(Date.now() / 1000);
        const cutoffTime = now - Math.floor(staleThresholdMs / 1000);
        
        // Update stale acknowledged jobs back to 'queued'
        const result = db.prepare(`
          UPDATE background_jobs
          SET 
            status = 'queued',
            status_message = 'Re-queued after worker timeout',
            updated_at = ?
          WHERE 
            status = 'acknowledged_by_worker'
            AND updated_at < ?
        `).run(now, cutoffTime);
        
        return result.changes;
      } catch (error) {
        console.error('[Repo] Error resetting stale acknowledged jobs:', error);
        throw error;
      }
    });
  }
  
  /**
   * Append text to a background job's response with streaming updates
   * 
   * This is used to provide incremental updates for streaming responses without
   * loading the entire response into memory each time.
   * 
   * @param jobId The ID of the job to update
   * @param chunk The new text to append to the response
   * @param tokensReceived The number of tokens received in this chunk
   * @param charsReceived The number of characters received so far
   * @returns True if the update was successful
   */
  async appendToJobResponse(
    jobId: string,
    chunk: string,
    tokensReceived: number = 0,
    charsReceived: number = 0
  ): Promise<boolean> {
    // Validate job ID
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for appendToJobResponse');
    }
    
    if (!chunk) return false; // No chunk to append
    
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        const now = Math.floor(Date.now() / 1000);
        
        // First, check if the job exists and get its current tokens_received count
        const currentJob = db.prepare(`
          SELECT tokens_received FROM background_jobs WHERE id = ?
        `).get(jobId);
        
        if (!currentJob) {
          console.warn(`[Repo] Cannot append to non-existent job ${jobId}`);
          return false;
        }
        
        // Append to the existing response using SQLite's || concatenation operator
        // and update the tokens_received count
        const typedCurrentJob = currentJob as Record<string, any>;
        const currentTokens = typedCurrentJob.tokens_received || 0;
        const updatedTokens = currentTokens + tokensReceived;
        
        const result = db.prepare(`
          UPDATE background_jobs
          SET 
            response = response || ?,
            tokens_received = ?,
            chars_received = ?,
            status = 'running',
            updated_at = ?,
            last_update = ?
          WHERE id = ?
        `).run(
          chunk,
          updatedTokens,
          charsReceived,
          now,
          now,
          jobId
        );
        
        return result.changes > 0;
      } catch (error) {
        console.error(`[Repo] Error appending to job ${jobId} response:`, error);
        return false;
      }
    });
  }
  
  /**
   * Completely replaces a background job's response with new content
   * 
   * This can be used when you need to replace the entire response rather than
   * appending to it, such as after validating or transforming streamed content.
   * 
   * @param jobId The ID of the job to update
   * @param newResponse The new response content to set
   * @returns True if the update was successful
   */
  async updateBackgroundJobResponse(
    jobId: string,
    newResponse: string
  ): Promise<boolean> {
    // Validate job ID
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for updateBackgroundJobResponse');
    }
    
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        const now = Math.floor(Date.now() / 1000);
        
        // First, check if the job exists
        const jobExists = db.prepare(`
          SELECT 1 FROM background_jobs WHERE id = ?
        `).get(jobId);
        
        if (!jobExists) {
          console.warn(`[Repo] Cannot update response for non-existent job ${jobId}`);
          return false;
        }
        
        // Replace the entire response
        const result = db.prepare(`
          UPDATE background_jobs
          SET 
            response = ?,
            updated_at = ?,
            last_update = ?
          WHERE id = ?
        `).run(
          newResponse,
          now,
          now,
          jobId
        );
        
        return result.changes > 0;
      } catch (error) {
        console.error(`[Repo] Error updating job ${jobId} response:`, error);
        return false;
      }
    });
  }
  
  /**
   * Get all active background jobs (those in a non-terminal state)
   */
  async getActiveBackgroundJobs(): Promise<BackgroundJob[]> {
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
        
        // Active statuses: idle, created, queued, preparing, running
        const activeStatuses = JOB_STATUSES.ACTIVE;
        
        // Use the SQLite IN operator with a prepared statement
        const placeholders = activeStatuses.map(() => '?').join(',');
        
        const query = `
          SELECT *
          FROM background_jobs
          WHERE status IN (${placeholders})
          ORDER BY created_at ASC
        `;
        
        // Execute the query with the active statuses as parameters
        const rows = db.prepare(query).all(activeStatuses);
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting active background jobs:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Clear background job history
   * 
   * @param daysToKeep Controls the clearing behavior:
   *   - When daysToKeep is -1: Permanently delete all completed/failed/canceled jobs
   *   - When daysToKeep is 0 or undefined: Only permanently delete very old jobs (90+ days)
   *   - When daysToKeep > 0: Mark jobs older than daysToKeep days as cleared (hidden from UI)
   */
  async clearBackgroundJobHistory(daysToKeep: number = 0): Promise<number> {
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Check if the table exists before performing operations
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          console.debug(`[Repo] background_jobs table does not exist, no jobs to clear`);
          return 0;
        }
        
        const now = Math.floor(Date.now() / 1000);
        
        // Case 1: Permanently delete all completed/failed/canceled jobs
        if (daysToKeep === -1) {
          const result = db.prepare(`
            DELETE FROM background_jobs
            WHERE status IN ('completed', 'failed', 'canceled')
          `).run();
          
          console.log(`[Repo] Permanently deleted ${result.changes} completed/failed/canceled jobs`);
          return result.changes;
        }
        
        // Case 2: Delete very old jobs (90+ days) AND mark jobs as cleared based on daysToKeep
        let totalChanges = 0;
        
        // Delete very old jobs (90+ days old)
        const veryOldTimestamp = now - (90 * 24 * 60 * 60); // 90 days in seconds
        const deleteResult = db.prepare(`
          DELETE FROM background_jobs
          WHERE updated_at < ?
        `).run(veryOldTimestamp);
        
        totalChanges += deleteResult.changes;
        console.log(`[Repo] Permanently deleted ${deleteResult.changes} jobs older than 90 days`);
        
        // If daysToKeep > 0, mark jobs older than daysToKeep days as cleared
        if (daysToKeep > 0) {
          const clearTimestamp = now - (daysToKeep * 24 * 60 * 60); // daysToKeep in seconds
          const markResult = db.prepare(`
            UPDATE background_jobs
            SET cleared = 1, updated_at = ?
            WHERE updated_at < ?
              AND cleared = 0
              AND status IN ('completed', 'failed', 'canceled')
          `).run(now, clearTimestamp);
          
          totalChanges += markResult.changes;
          console.log(`[Repo] Marked ${markResult.changes} jobs older than ${daysToKeep} days as cleared`);
        }
        
        return totalChanges;
      } catch (error) {
        console.error(`[Repo] Error clearing background job history:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Cancel all active background jobs for a session
   * 
   * @param sessionId The session ID to cancel jobs for
   * @param excludeImplementationPlans Whether to exclude implementation plan jobs from cancellation
   * @returns The number of jobs updated to the 'canceled' status
   */
  async cancelAllSessionBackgroundJobs(
    sessionId: string,
    excludeImplementationPlans: boolean = false
  ): Promise<number> {
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for job cancellation');
    }
    
    // Use connectionPool.withTransaction for write operations
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Check if the table exists before performing operations
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
        `).get();
        
        if (!tableExists) {
          console.debug(`[Repo] background_jobs table does not exist, no jobs to cancel`);
          return 0;
        }
        
        const now = Math.floor(Date.now() / 1000);
        const activeStatuses = JOB_STATUSES.ACTIVE;
        const statusPlaceholders = activeStatuses.map(() => '?').join(',');
        
        // Build the base SQL query
        let sql = `
          UPDATE background_jobs
          SET 
            status = 'canceled',
            updated_at = ?,
            end_time = ?,
            status_message = 'Canceled due to session action'
          WHERE 
            session_id = ?
            AND status IN (${statusPlaceholders})
        `;
        
        // If we're excluding implementation plans, add that condition
        if (excludeImplementationPlans) {
          sql += ` AND task_type != 'implementation_plan'`;
        }
        
        // Parameters for the SQL query (note: order matters!)
        const params = [now, now, sessionId, ...activeStatuses];
        
        // Execute the update
        const result = db.prepare(sql).run(...params);
        
        // Log the number of jobs canceled
        console.log(`[Repo] Canceled ${result.changes} active jobs for session ${sessionId}${excludeImplementationPlans ? ' (excluding implementation plans)' : ''}`);
        
        return result.changes;
      } catch (error) {
        console.error(`[Repo] Error canceling session jobs for ${sessionId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Update a background job's status and other related fields
   */
  async updateBackgroundJobStatus(
    params: {
      jobId: string;
      status: JobStatus;
      responseText?: string;
      errorMessage?: string;
      statusMessage?: string;
      metadata?: { [key: string]: any };
      tokensReceived?: number;
      tokensSent?: number;
      totalTokens?: number;
      charsReceived?: number;
      endTime?: number | null;
      startTime?: number | null;
      lastUpdate?: number;
    }
  ): Promise<void> {
    // Add validation for jobId
    if (!params.jobId || typeof params.jobId !== 'string' || !params.jobId.trim()) {
      throw new Error('Invalid job ID provided for background job update');
    }
    
    // Ensure status is a valid JobStatus (e.g., 'running', 'completed', etc.)
    const status = params.status;
    if (!status || !JOB_STATUSES.ALL.includes(status)) {
      throw new Error(`Invalid status '${status}' provided for background job update`);
    }
    
    const {
      jobId,
      responseText,
      errorMessage,
      statusMessage,
      tokensReceived,
      tokensSent,
      totalTokens,
      charsReceived,
      endTime,
      startTime,
      lastUpdate = Math.floor(Date.now() / 1000),
      metadata
    } = params;
    
    // Use connectionPool.withTransaction for better lock handling in write operations
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // First, get the current job data to merge with updates
        const currentJobStmt = db.prepare(`
          SELECT metadata FROM background_jobs WHERE id = ?
        `);
        
        const currentJob = currentJobStmt.get(jobId);
        if (!currentJob) {
          throw new Error(`Job ${jobId} not found for status update`);
        }
        
        // Parse existing metadata
        let existingMetadata = {};
        const typedCurrentJob = currentJob as Record<string, any>;
        if (typedCurrentJob.metadata) {
          try {
            if (typeof typedCurrentJob.metadata === 'string') {
              existingMetadata = JSON.parse(typedCurrentJob.metadata);
            } else if (typeof typedCurrentJob.metadata === 'object') {
              existingMetadata = typedCurrentJob.metadata;
            }
          } catch (e) {
            console.warn(`[Repo] Could not parse metadata for job ${jobId}:`, e);
            // Continue with empty metadata rather than failing
            existingMetadata = {};
          }
        }
        
        // Merge with new metadata
        const mergedMetadata = {
          ...existingMetadata,
          ...metadata
        };
        
        // Convert object to JSON string
        const metadataJson = metadata ? JSON.stringify(mergedMetadata) : undefined;
        
        // Prepare the SQL query with only the fields that are provided
        // This avoids overwriting fields with NULL when they're not included
        let sql = 'UPDATE background_jobs SET status = ?, last_update = ?';
        const sqlParams: any[] = [status, lastUpdate];
        
        // Only include fields that are explicitly provided
        if (responseText !== undefined) {
          sql += ', response = ?';
          sqlParams.push(responseText);
        }
        
        if (errorMessage !== undefined) {
          sql += ', error_message = ?';
          sqlParams.push(errorMessage);
        }
        
        if (statusMessage !== undefined) {
          sql += ', status_message = ?';
          sqlParams.push(statusMessage);
        }
        
        if (tokensReceived !== undefined) {
          sql += ', tokens_received = ?';
          sqlParams.push(tokensReceived);
        }
        
        if (tokensSent !== undefined) {
          sql += ', tokens_sent = ?';
          sqlParams.push(tokensSent);
        }
        
        if (totalTokens !== undefined) {
          sql += ', total_tokens = ?';
          sqlParams.push(totalTokens);
        }
        
        if (charsReceived !== undefined) {
          sql += ', chars_received = ?';
          sqlParams.push(charsReceived);
        }
        
        if (metadataJson !== undefined) {
          sql += ', metadata = ?';
          sqlParams.push(metadataJson);
        }
        
        // Set start_time for running jobs if not already set
        if (startTime !== undefined) {
          sql += ', start_time = ?';
          sqlParams.push(startTime);
        } else if (status === 'running') {
          sql += ', start_time = COALESCE(start_time, ?)';
          sqlParams.push(Math.floor(Date.now() / 1000));
        }
        
        // Set end_time for completed/failed/canceled jobs
        if (endTime !== undefined) {
          sql += ', end_time = ?';
          sqlParams.push(endTime);
        } else if (['completed', 'failed', 'canceled'].includes(status)) {
          sql += ', end_time = ?';
          sqlParams.push(Math.floor(Date.now() / 1000));
        }
        
        // Add the updated_at field
        sql += ', updated_at = ?';
        sqlParams.push(Math.floor(Date.now() / 1000));
        
        // Complete the SQL query with the WHERE clause
        sql += ' WHERE id = ?';
        sqlParams.push(jobId);
        
        // Execute the update
        const result = db.prepare(sql).run(...sqlParams);
        
        // Verify that the update was successful
        if (result.changes === 0) {
          throw new Error(`Job ${jobId} not found or not updated`);
        }
        
        return;
      } catch (error) {
        console.error(`[Repo] Error updating background job status for ${jobId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Delete a background job
   */
  async deleteBackgroundJob(jobId: string): Promise<void> {
    // Add validation for jobId
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for background job deletion');
    }
    
    // Use connectionPool.withTransaction for write operations
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        const result = db.prepare('DELETE FROM background_jobs WHERE id = ?').run(jobId);
        
        // Check if deletion was successful
        if (result.changes === 0) {
          throw new Error(`Job ${jobId} not found or could not be deleted`);
        }
        
        return;
      } catch (error) {
        console.error(`[Repo] Error deleting background job ${jobId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Update background job cleared status
   */
  async updateBackgroundJobClearedStatus(
    jobId: string,
    cleared: boolean
  ): Promise<void> {
    // Add validation for jobId
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new Error('Invalid job ID provided for background job cleared status update');
    }
    
    // Use connectionPool.withTransaction for write operations
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        const result = db.prepare(
          'UPDATE background_jobs SET cleared = ?, updated_at = ? WHERE id = ?'
        ).run(
          cleared ? 1 : 0, 
          Math.floor(Date.now() / 1000),
          jobId
        );
        
        // Check if update was successful
        if (result.changes === 0) {
          throw new Error(`Job ${jobId} not found or cleared status could not be updated`);
        }
        
        return;
      } catch (error) {
        console.error(`[Repo] Error updating background job cleared status for ${jobId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Get background jobs by project directory
   */
  async getBackgroundJobsByProjectDirectory(
    projectDirectory: string,
    options: {
      limit?: number,
      includeClearedJobs?: boolean,
      taskTypes?: TaskType[]
    } = {}
  ): Promise<Partial<BackgroundJob>[]> {
    const { 
      limit = 50, 
      includeClearedJobs = false,
      taskTypes = []
    } = options;
    
    // Validate projectDirectory
    if (!projectDirectory || typeof projectDirectory !== 'string') {
      throw new Error('Invalid project directory provided for background job retrieval');
    }
    
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
        
        // Build the base query
        let query = `
          SELECT *
          FROM background_jobs
          WHERE project_directory = ?
        `;
        
        const queryParams: any[] = [projectDirectory];
        
        // Add filter for cleared jobs if needed
        if (!includeClearedJobs) {
          query += ' AND cleared = 0';
        }
        
        // Add filter for task types if provided
        if (taskTypes.length > 0) {
          const placeholders = taskTypes.map(() => '?').join(',');
          query += ` AND task_type IN (${placeholders})`;
          queryParams.push(...taskTypes);
        }
        
        // Add sorting and limit
        query += `
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        
        // Prepare and execute the query
        const rows = db.prepare(query).all(...queryParams);
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting background jobs by project directory ${projectDirectory}:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Get all background jobs that are active or have been recently completed
   */
  async getRecentAndActiveJobs(limitPerStatus = 20): Promise<BackgroundJob[]> {
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
        
        // Use a UNION query to get both active and recent jobs
        const query = `
          -- Active jobs
          SELECT * FROM background_jobs
          WHERE status IN ('idle', 'running', 'preparing', 'created', 'queued')
          AND cleared = 0
          ORDER BY created_at DESC
          LIMIT ${limitPerStatus}
          
          UNION ALL
          
          -- Recently completed jobs
          SELECT * FROM background_jobs
          WHERE status IN ('completed', 'failed', 'canceled')
          AND cleared = 0
          ORDER BY updated_at DESC
          LIMIT ${limitPerStatus}
        `;
        
        // Execute the query
        const rows = db.prepare(query).all();
        
        // Map database rows to BackgroundJobs
        const jobs = rows.map(row => rowToBackgroundJob(row))
          .filter(Boolean) as BackgroundJob[];
        
        return jobs;
      } catch (error) {
        console.error(`[Repo] Error getting recent and active jobs:`, error);
        throw error;
      }
    }, true);  // Use readonly mode
  }
  
  /**
   * Clear all completed jobs
   */
  async clearAllCompletedJobs(): Promise<number> {
    // Use connectionPool.withTransaction for write operations
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Update all completed/failed/canceled jobs to cleared
        const result = db.prepare(`
          UPDATE background_jobs 
          SET cleared = 1, updated_at = ?
          WHERE status IN ('completed', 'failed', 'canceled')
            AND cleared = 0
        `).run(Math.floor(Date.now() / 1000));
        
        // Return the number of jobs cleared
        return result.changes;
      } catch (error) {
        console.error(`[Repo] Error clearing all completed jobs:`, error);
        throw error;
      }
    });
  }
}