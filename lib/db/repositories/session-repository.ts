import connectionPool from "../connection-pool";
import Database from 'better-sqlite3';
import { Session, ApiType, TaskType, JobStatus, BackgroundJob } from '@/types';
import { hashString } from '@/lib/hash';
import { normalizePath } from '../../path-utils';

/**
 * Interface representing a row in the sessions table
 */
interface SessionRow {
  id: string;
  name: string;
  project_directory: string;
  project_hash: string;
  task_description: string;
  search_term: string;
  pasted_paths: string;
  title_regex: string;
  content_regex: string;
  negative_title_regex: string;
  negative_content_regex: string;
  is_regex_active: number; // Sqlite uses 0/1 for booleans
  diff_temperature: number;
  codebase_structure: string;
  updated_at: number;
  created_at: number;
  search_selected_files_only: number;
}

/**
 * Session Repository
 * 
 * Handles database operations for managing sessions and their associated files.
 */
class SessionRepository {
  /**
   * Save a session to the database
   */
  async saveSession(session: Session): Promise<Session> {
    console.log(`[Repo] Saving session ${session.id}`);
    const startTime = Date.now();
    
    // Add validation for session.id
    if (!session.id || typeof session.id !== 'string' || !session.id.trim()) {
      throw new Error('Invalid session ID provided for saving session');
    }
    
    // Add validation for session.projectDirectory
    if (!session.projectDirectory || typeof session.projectDirectory !== 'string') {
      throw new Error('Invalid project directory provided for saving session');
    }
    
    // Always use connectionPool.withConnection with readOnly=false for write operations
    return connectionPool.withConnection(async (db) => {
      try {
        console.time(`[Perf] Session save ${session.id}`);
        
        // Generate a hash for the project directory
        console.time(`[Perf] Project hash generation ${session.id}`);
        const projectHash = hashString(session.projectDirectory);
        console.timeEnd(`[Perf] Project hash generation ${session.id}`);
        
        // Prepare session values
        const sessionValues = {
          id: session.id,
          name: session.name,
          project_directory: session.projectDirectory,
          project_hash: projectHash,
          task_description: session.taskDescription,
          search_term: session.searchTerm,
          pasted_paths: session.pastedPaths,
          title_regex: session.titleRegex,
          content_regex: session.contentRegex,
          negative_title_regex: session.negativeTitleRegex || '',
          negative_content_regex: session.negativeContentRegex || '',
          is_regex_active: session.isRegexActive ? 1 : 0,
          diff_temperature: session.diffTemperature || 1.0,
          codebase_structure: session.codebaseStructure || "",
          updated_at: Date.now(),
          search_selected_files_only: session.searchSelectedFilesOnly ? 1 : 0
        };
        
        // Build SQL statement
        const sql = `
          INSERT OR REPLACE INTO sessions
          (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
           title_regex, content_regex, negative_title_regex, negative_content_regex, is_regex_active, 
           diff_temperature, codebase_structure, updated_at, search_selected_files_only)
          VALUES (@id, @name, @project_directory, @project_hash, @task_description, @search_term, @pasted_paths,
           @title_regex, @content_regex, @negative_title_regex, @negative_content_regex, @is_regex_active, 
           @diff_temperature, @codebase_structure, @updated_at, @search_selected_files_only)`;
        
        // Insert or replace the session
        console.time(`[Perf] Session row save ${session.id}`);
        db.prepare(sql).run(sessionValues);
        console.timeEnd(`[Perf] Session row save ${session.id}`);
        
        // Handle included files
        if (Array.isArray(session.includedFiles)) {
          console.time(`[Perf] Included files save ${session.id}`);
          console.log(`[Perf] Included files count: ${session.includedFiles.length}`);
          
          // First delete all existing included files for this session
          db.prepare(`DELETE FROM included_files WHERE session_id = ?`).run(session.id);
          
          // Then insert new files if there are any
          if (session.includedFiles.length > 0) {
            // Use a prepared statement for better performance
            const insertStmt = db.prepare(`INSERT INTO included_files (session_id, path) VALUES (?, ?)`);
            
            // Insert each included file path
            for (const filePath of session.includedFiles) {
              insertStmt.run(session.id, filePath);
            }
          }
          console.timeEnd(`[Perf] Included files save ${session.id}`);
        }
        
        // Handle excluded files
        if (Array.isArray(session.forceExcludedFiles)) {
          console.time(`[Perf] Excluded files save ${session.id}`);
          console.log(`[Perf] Excluded files count: ${session.forceExcludedFiles.length}`);
          
          // First delete all existing excluded files for this session
          db.prepare(`DELETE FROM excluded_files WHERE session_id = ?`).run(session.id);
          
          // Then insert new files if there are any
          if (session.forceExcludedFiles.length > 0) {
            // Use a prepared statement for better performance
            const insertStmt = db.prepare(`INSERT INTO excluded_files (session_id, path) VALUES (?, ?)`);
            
            // Insert each excluded file path
            for (const filePath of session.forceExcludedFiles) {
              insertStmt.run(session.id, filePath);
            }
          }
          console.timeEnd(`[Perf] Excluded files save ${session.id}`);
        }
        
        console.timeEnd(`[Perf] Session save ${session.id}`);
        console.log(`[Perf] Total session save time: ${Date.now() - startTime}ms`);
        
        // Return the updated session
        return {
          ...session,
          projectHash,
          updatedAt: Date.now()
        };
      } catch (error) {
        console.error("Error in saveSession:", error);
        console.timeEnd(`[Perf] Session save ${session.id}`);
        console.log(`[Perf] Failed session save time: ${Date.now() - startTime}ms`);
        throw error;
      }
    }, false); // Explicitly use a writable connection
  }
  
  /**
   * Get a session by ID with enhanced error handling and performance optimization for session switching
   */
  async getSession(sessionId: string, prioritized?: boolean): Promise<Session | null> {
    const startTime = Date.now();
    const timestamp = new Date(startTime).toISOString();
    
    if (!sessionId) {
      console.error(`[Repo][${timestamp}] Invalid session ID provided to getSession`);
      return null;
    }
    
    // For better diagnostics, create an operation ID
    const operationId = `get_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    console.log(`[Repo][${timestamp}][${operationId}] Getting session: ${sessionId}${prioritized ? ' (prioritized)' : ''}`);
    console.time(`[Perf] Get session ${sessionId}_${operationId}`);
    
    // Maximum retry attempts for transient errors
    const maxRetries = prioritized ? 3 : 1; // Prioritized sessions get more retries
    let attempts = 0;
    let lastError: Error | null = null;
    
    while (attempts < maxRetries) {
      attempts++;
      
      try {
        // If this is a retry, add a small delay to allow potential lock contention to resolve
        if (attempts > 1) {
          const delay = Math.min(50 * Math.pow(2, attempts - 1), 1000); // Exponential backoff
          console.log(`[Repo][${timestamp}][${operationId}] Retry attempt ${attempts} for session ${sessionId} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        return await connectionPool.withConnection(async (db) => {
          try {
            // Add a timeout to long-running queries if this is during session switching
            const timeoutPromise = prioritized ? 
              Promise.race([
                new Promise(resolve => setTimeout(() => {
                  resolve('timeout');
                }, 10000)), // 10-second timeout for prioritized sessions
                Promise.resolve('continue')
              ]) :
              Promise.resolve('continue');
            
            const timeoutResult = await timeoutPromise;
            if (timeoutResult === 'timeout') {
              console.warn(`[Repo][${timestamp}][${operationId}] Database operation timeout protection triggered for session ${sessionId}`);
              throw new Error('Database operation timed out');
            }
            
            // Perform database operations with better error handling
            try {
              // Start a transaction for consistent snapshot view
              db.prepare('BEGIN TRANSACTION').run();
              
              const sql = `SELECT * FROM sessions WHERE id = ?`;
              const queryStart = Date.now();
              const row = db.prepare(sql).get(sessionId) as SessionRow | undefined;
              const queryTime = Date.now() - queryStart;
              
              if (queryTime > 1000) {
                console.warn(`[Repo][${timestamp}][${operationId}] Slow query detected: session lookup took ${queryTime}ms`);
              }
              
              if (!row) {
                console.log(`[Repo][${timestamp}][${operationId}] Session not found: ${sessionId}`);
                console.timeEnd(`[Perf] Get session ${sessionId}_${operationId}`);
                db.prepare('ROLLBACK').run();
                return null;
              }
              
              // Fetch included files
              const includedFilesStart = Date.now();
              const includedStmt = db.prepare(`SELECT path FROM included_files WHERE session_id = ?`);
              const includedFiles = includedStmt.all(sessionId).map((r: any) => r.path);
              const includedFilesTime = Date.now() - includedFilesStart;
              
              if (includedFilesTime > 500) {
                console.warn(`[Repo][${timestamp}][${operationId}] Slow query detected: included files lookup took ${includedFilesTime}ms (${includedFiles.length} files)`);
              }
              
              // Fetch excluded files
              const excludedFilesStart = Date.now();
              const excludedStmt = db.prepare(`SELECT path FROM excluded_files WHERE session_id = ?`);
              const excludedFiles = excludedStmt.all(sessionId).map((r: any) => r.path);
              const excludedFilesTime = Date.now() - excludedFilesStart;
              
              if (excludedFilesTime > 500) {
                console.warn(`[Repo][${timestamp}][${operationId}] Slow query detected: excluded files lookup took ${excludedFilesTime}ms (${excludedFiles.length} files)`);
              }
              
              // Commit the transaction - these were all read operations
              db.prepare('COMMIT').run();
              
              // Map DB row to Session object
              const session: Session = {
                id: row.id,
                name: row.name,
                projectDirectory: row.project_directory,
                projectHash: row.project_hash,
                taskDescription: row.task_description,
                searchTerm: row.search_term,
                pastedPaths: row.pasted_paths,
                titleRegex: row.title_regex,
                contentRegex: row.content_regex,
                negativeTitleRegex: row.negative_title_regex,
                negativeContentRegex: row.negative_content_regex,
                isRegexActive: row.is_regex_active === 1,
                diffTemperature: row.diff_temperature,
                codebaseStructure: row.codebase_structure,
                updatedAt: row.updated_at,
                createdAt: row.created_at,
                includedFiles: includedFiles,
                forceExcludedFiles: excludedFiles,
                searchSelectedFilesOnly: row.search_selected_files_only === 1
              };
              
              const totalTime = Date.now() - startTime;
              console.log(`[Repo][${timestamp}][${operationId}] Session ${sessionId} retrieved successfully in ${totalTime}ms (files: ${includedFiles.length} included, ${excludedFiles.length} excluded)`);
              console.timeEnd(`[Perf] Get session ${sessionId}_${operationId}`);
              return session;
              
            } catch (dbError) {
              // Handle database errors gracefully
              console.error(`[Repo][${timestamp}][${operationId}] Database error during session fetch:`, dbError);
              
              // Make sure to roll back any transaction
              try {
                db.prepare('ROLLBACK').run();
              } catch (rollbackError) {
                console.error(`[Repo][${timestamp}][${operationId}] Error during transaction rollback:`, rollbackError);
              }
              
              // Check for specific error types that might be recoverable
              const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
              
              if (errorMessage.includes('database is locked') || 
                  errorMessage.includes('busy') ||
                  errorMessage.includes('SQLITE_BUSY')) {
                // These are likely transient locking errors that can be retried
                console.warn(`[Repo][${timestamp}][${operationId}] Encountered database lock/busy error, can retry`);
                throw dbError; // Rethrow to trigger retry logic
              }
              
              // For other database errors, provide diagnostic info and rethrow
              throw dbError;
            }
          } catch (error) {
            console.error(`[Repo][${timestamp}][${operationId}] Error getting session ${sessionId}:`, error);
            console.timeEnd(`[Perf] Get session ${sessionId}_${operationId}`);
            lastError = error instanceof Error ? error : new Error(String(error));
            throw error;
          }
        }, true); // Read-only connection is sufficient
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if we should retry
        const errorMessage = lastError.message;
        
        // Don't retry on operation aborted errors
        if (errorMessage === 'Operation aborted') {
          console.log(`[Repo][${timestamp}][${operationId}] Operation aborted, not retrying`);
          throw lastError;
        }
        
        // For retryable errors
        const isRetryable = errorMessage.includes('database is locked') || 
                            errorMessage.includes('busy') ||
                            errorMessage.includes('SQLITE_BUSY');
        
        if (isRetryable && attempts < maxRetries) {
          console.warn(`[Repo][${timestamp}][${operationId}] Retryable error encountered, attempt ${attempts}/${maxRetries}`);
          // Will retry in the next loop iteration
          continue;
        }
        
        // If we're here, we've either exhausted retries or it's not a retryable error
        break;
      }
    }
    
    // If we exhausted retries, throw the last error
    if (lastError) {
      console.error(`[Repo][${timestamp}][${operationId}] Failed to get session after ${attempts} attempts: ${lastError.message}`);
      throw lastError;
    }
    
    // Should never get here, but just in case
    return null;
  }
  
  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<Session[]> {
    console.log(`[Repo] Getting all sessions`);
    
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Get all sessions
        const stmt = db.prepare(`
          SELECT * FROM sessions
          ORDER BY updated_at DESC
        `);
        
        const rows = stmt.all() as SessionRow[];
        
        // Process each session
        const sessions: Session[] = rows.map(row => {
          // Get included files for this session
          const includedStmt = db.prepare(`SELECT path FROM included_files WHERE session_id = ?`);
          const includedFiles = includedStmt.all(row.id).map((r: any) => r.path);
          
          // Get excluded files for this session
          const excludedStmt = db.prepare(`SELECT path FROM excluded_files WHERE session_id = ?`);
          const excludedFiles = excludedStmt.all(row.id).map((r: any) => r.path);
          
          // Map DB row to Session object
          return {
            id: row.id,
            name: row.name,
            projectDirectory: row.project_directory,
            projectHash: row.project_hash,
            taskDescription: row.task_description,
            searchTerm: row.search_term,
            pastedPaths: row.pasted_paths,
            titleRegex: row.title_regex,
            contentRegex: row.content_regex,
            negativeTitleRegex: row.negative_title_regex,
            negativeContentRegex: row.negative_content_regex,
            isRegexActive: row.is_regex_active === 1,
            diffTemperature: row.diff_temperature,
            codebaseStructure: row.codebase_structure,
            updatedAt: row.updated_at,
            createdAt: row.created_at,
            includedFiles,
            forceExcludedFiles: excludedFiles
          };
        });
        
        return sessions;
      } catch (error) {
        console.error("[Repo] Error in getAllSessions:", error);
        throw error;
      }
    }, true); // true = readonly connection
  }
  
  /**
   * Get sessions for a specific project directory
   */
  async getSessionsForProject(projectDirectory: string): Promise<Session[]> {
    console.log(`[Repo] Getting sessions for project: ${projectDirectory}`);
    
    // Hash the project directory for faster lookup
    const projectHash = hashString(projectDirectory);
    
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Get all sessions for this project
        const stmt = db.prepare(`
          SELECT * FROM sessions
          WHERE project_hash = ?
          ORDER BY updated_at DESC
        `);
        
        const rows = stmt.all(projectHash) as SessionRow[];
        
        // Map rows to Session objects
        const sessions = rows.map((row) => {
          const includedStmt = db.prepare(`
            SELECT path FROM included_files 
            WHERE session_id = ?
          `);
          const includedFiles = includedStmt.all(row.id).map((value: unknown) => (value as { path: string }).path);
          
          const excludedStmt = db.prepare(`
            SELECT path FROM excluded_files 
            WHERE session_id = ?
          `);
          const excludedFiles = excludedStmt.all(row.id).map((value: unknown) => (value as { path: string }).path);
          
          return {
            id: row.id,
            name: row.name,
            projectDirectory: row.project_directory,
            projectHash: row.project_hash,
            includedFiles,
            forceExcludedFiles: excludedFiles,
            taskDescription: row.task_description,
            searchTerm: row.search_term,
            pastedPaths: row.pasted_paths,
            titleRegex: row.title_regex,
            contentRegex: row.content_regex,
            negativeTitleRegex: row.negative_title_regex,
            negativeContentRegex: row.negative_content_regex,
            isRegexActive: !!row.is_regex_active,
            diffTemperature: row.diff_temperature,
            updatedAt: row.updated_at,
            codebaseStructure: row.codebase_structure,
            createdAt: row.created_at || Date.now()
          };
        });
        
        return sessions;
      } catch (error) {
        console.error("Error in getSessionsForProject:", error);
        throw error;
      }
    }, true); // readonly connection
  }
  
  /**
   * Get a session with its associated background jobs
   */
  async getSessionWithBackgroundJobs(sessionId: string): Promise<Session | null> {
    console.log(`[Repo] Getting session with jobs: ${sessionId}`);
    
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Get session
        const sessionStmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
        const sessionRow = sessionStmt.get(sessionId) as SessionRow | undefined;
        
        if (!sessionRow) {
          return null;
        }
        
        // Get background jobs
        const jobsStmt = db.prepare(`
          SELECT * FROM background_jobs 
          WHERE session_id = ? 
          ORDER BY created_at DESC
        `);
        const jobRows = jobsStmt.all(sessionId) as any[];
        
        // Get included files
        const includedStmt = db.prepare(`
          SELECT path FROM included_files 
          WHERE session_id = ?
        `);
        const includedFiles = includedStmt.all(sessionId).map((value: unknown) => (value as { path: string }).path);
        
        // Get excluded files
        const excludedStmt = db.prepare(`
          SELECT path FROM excluded_files 
          WHERE session_id = ?
        `);
        const excludedFiles = excludedStmt.all(sessionId).map((value: unknown) => (value as { path: string }).path);
        
        // Map background jobs
        const backgroundJobs: BackgroundJob[] = jobRows.map(row => ({
          id: row.id,
          sessionId: row.session_id,
          prompt: row.prompt,
          status: row.status as JobStatus,
          startTime: row.start_time,
          endTime: row.end_time,
          outputFilePath: row.output_file_path,
          statusMessage: row.status_message,
          tokensReceived: row.tokens_received,
          tokensSent: row.tokens_sent,
          charsReceived: row.chars_received,
          totalTokens: (row.tokens_sent || 0) + (row.tokens_received || 0),
          lastUpdate: row.last_update,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          cleared: row.cleared === 1,
          apiType: row.api_type as ApiType,
          taskType: row.task_type as TaskType,
          modelUsed: row.model_used,
          maxOutputTokens: row.max_output_tokens,
          response: row.response,
          errorMessage: row.error_message,
          metadata: row.metadata ? JSON.parse(row.metadata) : null
        }));
        
        // Construct and return the session with background jobs
        const session: Session = {
          id: sessionRow.id,
          name: sessionRow.name,
          projectDirectory: sessionRow.project_directory,
          projectHash: sessionRow.project_hash,
          taskDescription: sessionRow.task_description,
          searchTerm: sessionRow.search_term,
          pastedPaths: sessionRow.pasted_paths,
          titleRegex: sessionRow.title_regex,
          contentRegex: sessionRow.content_regex,
          negativeTitleRegex: sessionRow.negative_title_regex,
          negativeContentRegex: sessionRow.negative_content_regex,
          isRegexActive: sessionRow.is_regex_active === 1,
          diffTemperature: sessionRow.diff_temperature,
          codebaseStructure: sessionRow.codebase_structure,
          updatedAt: sessionRow.updated_at,
          createdAt: sessionRow.created_at,
          includedFiles,
          forceExcludedFiles: excludedFiles,
          backgroundJobs
        };
        
        return session;
      } catch (error) {
        console.error("Error in getSessionWithBackgroundJobs:", error);
        throw error;
      }
    }, true); // readonly connection
  }
  
  /**
   * Delete a session by ID
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    console.log(`[Repo] Deleting session ${sessionId}`);
    
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for deleting session');
    }
    
    // Always use connectionPool.withConnection with readOnly=false for write operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Delete the session
        const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        
        // Delete associated included and excluded files
        db.prepare('DELETE FROM included_files WHERE session_id = ?').run(sessionId);
        db.prepare('DELETE FROM excluded_files WHERE session_id = ?').run(sessionId);
        
        return !!result && result.changes > 0;
      } catch (error) {
        console.error("Error in deleteSession:", error);
        throw error;
      }
    }, false); // Explicitly use a writable connection
  }
  
  /**
   * Delete all sessions for a project directory
   */
  async deleteAllSessions(projectDirectory: string): Promise<number> {
    console.log(`[Repo] Deleting all sessions for project: ${projectDirectory}`);
    
    // Generate hash for project directory
    const projectHash = hashString(projectDirectory);
    
    // Always use connectionPool.withConnection with readOnly=false for write operations
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // First get all session IDs for this project
        const sessionIds = db.prepare('SELECT id FROM sessions WHERE project_hash = ?')
                          .all(projectHash)
                          .map((row: any) => row.id);
        
        if (!sessionIds || sessionIds.length === 0) {
          return 0;
        }
        
        // Delete associated included and excluded files
        for (const sessionId of sessionIds) {
          db.prepare('DELETE FROM included_files WHERE session_id = ?').run(sessionId);
          db.prepare('DELETE FROM excluded_files WHERE session_id = ?').run(sessionId);
        }
        
        // Delete all sessions for this project
        const result = db.prepare('DELETE FROM sessions WHERE project_hash = ?').run(projectHash);
        
        return result.changes || 0;
      } catch (error) {
        console.error("Error in deleteAllSessions:", error);
        throw error;
      }
    }, false); // Explicitly use a writable connection
  }
  
  /**
   * Update specific fields of a session
   */
  async updateSessionFields(sessionId: string, sessionData: Partial<Session>): Promise<void> {
    console.log(`[Repo] Updating session fields for ${sessionId}`, 
      { fieldCount: Object.keys(sessionData).length, fieldNames: Object.keys(sessionData) });
    
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for updating session fields');
    }
    
    // Detailed timing logs for database operations
    const startTime = Date.now();
    let queryStartTime = 0;
    
    // OPTIMIZATION: Get the current session OUTSIDE the transaction to reduce transaction duration
    const loadSessionStartTime = Date.now();
    const currentSession = await this.getSession(sessionId);
    if (!currentSession) {
      throw new Error(`Session ${sessionId} not found`);
    }
    console.log(`[Repo] Found session to update: ${sessionId} (took ${Date.now() - loadSessionStartTime}ms)`);
    
    // Always use connectionPool.withTransaction for write operations that need to be atomic
    await connectionPool.withTransaction(async (db) => {
      try {
        // Track if any updates are needed
        let needsUpdate = false;
        const updates: string[] = [];
        const parameters: any = {
          id: sessionId,
          updated_at: Date.now()
        };
        
        // Check each possible field for updates
        
        // Simple string fields
        const stringFields = [
          { clientKey: 'name', dbKey: 'name' },
          { clientKey: 'projectDirectory', dbKey: 'project_directory' },
          { clientKey: 'taskDescription', dbKey: 'task_description' },
          { clientKey: 'searchTerm', dbKey: 'search_term' },
          { clientKey: 'pastedPaths', dbKey: 'pasted_paths' },
          { clientKey: 'titleRegex', dbKey: 'title_regex' },
          { clientKey: 'contentRegex', dbKey: 'content_regex' },
          { clientKey: 'negativeTitleRegex', dbKey: 'negative_title_regex' },
          { clientKey: 'negativeContentRegex', dbKey: 'negative_content_regex' },
          { clientKey: 'codebaseStructure', dbKey: 'codebase_structure' }
        ];
        
        // Update project hash if project directory is changing
        if (sessionData.projectDirectory !== undefined && 
            sessionData.projectDirectory !== currentSession.projectDirectory) {
          const newProjectHash = hashString(sessionData.projectDirectory);
          updates.push('project_hash = @project_hash');
          parameters.project_hash = newProjectHash;
          needsUpdate = true;
        }
        
        // Update string fields
        for (const field of stringFields) {
          if (sessionData[field.clientKey as keyof Partial<Session>] !== undefined &&
              sessionData[field.clientKey as keyof Partial<Session>] !== 
              currentSession[field.clientKey as keyof Session]) {
            updates.push(`${field.dbKey} = @${field.dbKey}`);
            parameters[field.dbKey] = sessionData[field.clientKey as keyof Partial<Session>];
            needsUpdate = true;
            
            if (field.clientKey === 'taskDescription') {
              // Log size of task description for debugging (common source of performance issues)
              const value = sessionData[field.clientKey] as string;
              console.log(`[Repo] Updating ${field.dbKey} (${value ? value.length : 0} bytes)`);
            }
          }
        }
        
        // Boolean fields need special handling
        if (sessionData.isRegexActive !== undefined && 
            sessionData.isRegexActive !== currentSession.isRegexActive) {
          updates.push('is_regex_active = @is_regex_active');
          parameters.is_regex_active = sessionData.isRegexActive ? 1 : 0;
          needsUpdate = true;
        }
        
        // Add searchSelectedFilesOnly boolean field handling
        if (sessionData.searchSelectedFilesOnly !== undefined && 
            sessionData.searchSelectedFilesOnly !== currentSession.searchSelectedFilesOnly) {
          updates.push('search_selected_files_only = @search_selected_files_only');
          parameters.search_selected_files_only = sessionData.searchSelectedFilesOnly ? 1 : 0;
          needsUpdate = true;
        }
        
        // Number fields
        if (sessionData.diffTemperature !== undefined && 
            sessionData.diffTemperature !== currentSession.diffTemperature) {
          updates.push('diff_temperature = @diff_temperature');
          parameters.diff_temperature = sessionData.diffTemperature;
          needsUpdate = true;
        }
        
        // OPTIMIZATION: Prepare both file operations in advance to minimize transaction time
        const hasIncludedFilesChanges = Array.isArray(sessionData.includedFiles);
        const hasExcludedFilesChanges = Array.isArray(sessionData.forceExcludedFiles);
        
        // Execute SQL update if needed - consolidated to a single query
        if (needsUpdate) {
          // Prepare and execute the update
          const sql = `
            UPDATE sessions
            SET ${updates.join(', ')}, updated_at = @updated_at
            WHERE id = @id
          `;
          
          // Log query start time for performance tracking
          queryStartTime = Date.now();
          console.log(`[Repo] Executing UPDATE for session ${sessionId}`);
          
          // Execute the query
          db.prepare(sql).run(parameters);
          
          console.log(`[Repo] Session ${sessionId} updated in ${Date.now() - queryStartTime}ms`);
        } else {
          console.log(`[Repo] No field updates needed for session ${sessionId}`);
        }
        
        // OPTIMIZATION: Process included files and excluded files with better performance tracking
        // Handle included files if provided
        if (hasIncludedFilesChanges) {
          queryStartTime = Date.now();
          console.log(`[Repo] Updating included files for session ${sessionId} (${sessionData.includedFiles!.length} files)`);
          
          // Delete existing included files
          const deleteStartTime = Date.now();
          db.prepare('DELETE FROM included_files WHERE session_id = ?').run(sessionId);
          console.log(`[Repo] Deleted existing included files in ${Date.now() - deleteStartTime}ms`);
          
          // Insert new included files if there are any
          if (sessionData.includedFiles!.length > 0) {
            const insertStartTime = Date.now();
            // OPTIMIZATION: Use a transaction statement for bulk insert
            const insertStmt = db.prepare('INSERT INTO included_files (session_id, path) VALUES (?, ?)');
            
            // Process each file to ensure path normalization
            for (const filePath of sessionData.includedFiles!) {
              // Normalize paths for consistent storage
              const normalizedPath = normalizePath(filePath);
              insertStmt.run(sessionId, normalizedPath);
            }
            console.log(`[Repo] Inserted ${sessionData.includedFiles!.length} included files in ${Date.now() - insertStartTime}ms`);
          }
          
          console.log(`[Repo] Included files updated in ${Date.now() - queryStartTime}ms`);
        }
        
        // Handle excluded files if provided
        if (hasExcludedFilesChanges) {
          queryStartTime = Date.now();
          console.log(`[Repo] Updating excluded files for session ${sessionId} (${sessionData.forceExcludedFiles!.length} files)`);
          
          // Delete existing excluded files
          const deleteStartTime = Date.now();
          db.prepare('DELETE FROM excluded_files WHERE session_id = ?').run(sessionId);
          console.log(`[Repo] Deleted existing excluded files in ${Date.now() - deleteStartTime}ms`);
          
          // Insert new excluded files if there are any
          if (sessionData.forceExcludedFiles!.length > 0) {
            const insertStartTime = Date.now();
            const insertStmt = db.prepare('INSERT INTO excluded_files (session_id, path) VALUES (?, ?)');
            
            // Process each file to ensure path normalization
            for (const filePath of sessionData.forceExcludedFiles!) {
              // Normalize paths for consistent storage
              const normalizedPath = normalizePath(filePath);
              insertStmt.run(sessionId, normalizedPath);
            }
            console.log(`[Repo] Inserted ${sessionData.forceExcludedFiles!.length} excluded files in ${Date.now() - insertStartTime}ms`);
          }
          
          console.log(`[Repo] Excluded files updated in ${Date.now() - queryStartTime}ms`);
        }
        
        // Log total operation time
        console.log(`[Repo] Session update completed in ${Date.now() - startTime}ms`);
      } catch (error) {
        console.error("[Repo] Error in updateSessionFields:", error);
        throw error;
      }
    });
  }
  
  /**
   * Update a session's name
   */
  async updateSessionName(sessionId: string, name: string): Promise<void> {
    console.log(`[Repo] Updating session name: ${sessionId} => "${name}"`);
    
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for updating session name');
    }
    
    await connectionPool.withConnection((db: Database.Database) => {
      const sql = `
        UPDATE sessions
        SET name = ?, updated_at = ?
        WHERE id = ?
      `;
      
      db.prepare(sql).run(name, Date.now(), sessionId);
    }, false); // Writable connection
  }
  
  /**
   * Update a session's project directory
   */
  async updateSessionProjectDirectory(sessionId: string, projectDirectory: string): Promise<void> {
    console.log(`[Repo] Updating session project directory: ${sessionId} => "${projectDirectory}"`);
    
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for updating project directory');
    }
    
    // Generate a new hash for the project directory
    const projectHash = hashString(projectDirectory);
    
    await connectionPool.withConnection((db: Database.Database) => {
      const sql = `
        UPDATE sessions
        SET project_directory = ?, project_hash = ?, updated_at = ?
        WHERE id = ?
      `;
      
      db.prepare(sql).run(projectDirectory, projectHash, Date.now(), sessionId);
    }, false); // Writable connection
  }
  
  /**
   * Update included files for a session
   */
  async updateIncludedFiles(sessionId: string, filePaths: string[]): Promise<void> {
    console.log(`[Repo] Updating included files for session ${sessionId}: ${filePaths.length} files`);
    
    // Add validation for sessionId
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid session ID provided for updating included files');
    }
    
    // Always use connectionPool.withConnection with readOnly=false for write operations
    await connectionPool.withConnection((db: Database.Database) => {
      try {
        // Begin a transaction
        db.prepare('BEGIN TRANSACTION').run();
        
        // Delete existing included files for this session
        db.prepare(`DELETE FROM included_files WHERE session_id = ?`).run(sessionId);
        
        // If there are new files to insert
        if (filePaths.length > 0) {
          // Prepare the insert statement once
          const insertStmt = db.prepare(`INSERT INTO included_files (session_id, path) VALUES (?, ?)`);
          
          // Insert each path
          for (const filePath of filePaths) {
            // Normalize path for consistent storage
            const normalizedPath = normalizePath(filePath);
            insertStmt.run(sessionId, normalizedPath);
          }
        }
        
        // Also update the session's updated_at timestamp
        db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(Date.now(), sessionId);
        
        // Commit the transaction
        db.prepare('COMMIT').run();
        
        console.log(`[Repo] Successfully updated ${filePaths.length} included files for session ${sessionId}`);
      } catch (error) {
        // Rollback on error
        try {
          db.prepare('ROLLBACK').run();
        } catch (rollbackError) {
          console.error(`[Repo] Error during rollback: ${rollbackError}`);
        }
        
        console.error(`[Repo] Error updating included files: ${error}`);
        throw error;
      }
    }, false); // Explicitly use a writable connection
  }
  
  /**
   * Get the count of sessions in the database
   */
  async getSessionCount(): Promise<number> {
    console.log(`[Repo] Getting session count`);
    
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Check if the sessions table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'
        `).get();
        
        if (!tableExists) {
          return 0;
        }
        
        // Get the count of sessions
        const result = db.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number };
        return result.count;
      } catch (error) {
        console.error("Error in getSessionCount:", error);
        throw error;
      }
    }, true); // true = readonly connection
  }
  
  /**
   * Get information about the database
   */
  async getDatabaseInfo(): Promise<{ ok: boolean; message: string; fileSize: number }> {
    console.log(`[Repo] Getting database info`);
    
    return connectionPool.withConnection((db: Database.Database) => {
      try {
        // Get info about the database file
        const dbInfo = db.pragma('database_list') as Array<{ file: string }>;
        const fileName = dbInfo[0]?.file || 'unknown';
        
        // Get table info
        const tables = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table'
        `).all() as Array<{ name: string }>;
        
        // Get the size of each table
        const tableSizes: Record<string, number> = {};
        let totalRows = 0;
        
        for (const table of tables) {
          const tableName = table.name;
          if (!tableName.startsWith('sqlite_')) {
            const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number };
            tableSizes[tableName] = countResult.count;
            totalRows += countResult.count;
          }
        }
        
        return {
          ok: true,
          message: `Database OK. Found ${tables.length} tables with ${totalRows} total rows.`,
          fileSize: -1 // File size requires fs access which we don't have here
        };
      } catch (error) {
        console.error("Error in getDatabaseInfo:", error);
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          fileSize: -1
        };
      }
    }, true); // true = readonly connection
  }
}

// Create and export the singleton instance
export const sessionRepository = new SessionRepository();

// Also export the class itself as the default export
export default SessionRepository;