/**
 * Session Repository Adapter for Tauri
 * 
 * This adapter implements the same interface as the core SessionRepository
 * but uses Tauri's SQLite database instead of better-sqlite3.
 */

import { executeQuery, selectQuery, executeTransaction } from './db-adapter';
import { Session } from '@core/types';
import { normalizePath } from '@core/lib/path-utils';
import { hashString } from '@core/lib/hash';
import { GEMINI_FLASH_MODEL } from '@core/lib/constants';

/**
 * SessionRepositoryAdapter
 * Implements the same interface as the core SessionRepository
 */
export class SessionRepositoryAdapter {
  /**
   * Save a session to the database
   */
  async saveSession(session: Session): Promise<Session> {
    console.log(`[Desktop] Saving session ${session.id}`);
    
    // Validate session data
    if (!session.id) throw new Error('Invalid session ID');
    if (!session.projectDirectory) throw new Error('Invalid project directory');
    
    try {
      // Generate a hash for the project directory
      const projectHash = hashString(session.projectDirectory);
      
      // Create operations for transaction
      const operations = [
        {
          sql: `
            INSERT OR REPLACE INTO sessions
            (id, name, project_directory, project_hash, task_description, search_term,
            title_regex, content_regex, negative_title_regex, negative_content_regex, 
            is_regex_active, codebase_structure, created_at, updated_at, 
            search_selected_files_only, model_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            session.id,
            session.name,
            session.projectDirectory,
            projectHash,
            session.taskDescription || '',
            session.searchTerm || '',
            session.titleRegex || '',
            session.contentRegex || '',
            session.negativeTitleRegex || '',
            session.negativeContentRegex || '',
            session.isRegexActive ? 1 : 0,
            session.codebaseStructure || "",
            session.createdAt || Date.now(),
            Date.now(),
            session.searchSelectedFilesOnly ? 1 : 0,
            session.modelUsed || GEMINI_FLASH_MODEL
          ]
        },
        { sql: `DELETE FROM included_files WHERE session_id = ?`, params: [session.id] },
        { sql: `DELETE FROM excluded_files WHERE session_id = ?`, params: [session.id] }
      ];
      
      // Add included files operations
      if (Array.isArray(session.includedFiles)) {
        for (const filePath of session.includedFiles) {
          operations.push({
            sql: `INSERT INTO included_files (session_id, path) VALUES (?, ?)`,
            params: [session.id, normalizePath(filePath)]
          });
        }
      }
      
      // Add excluded files operations
      if (Array.isArray(session.forceExcludedFiles)) {
        for (const filePath of session.forceExcludedFiles) {
          operations.push({
            sql: `INSERT INTO excluded_files (session_id, path) VALUES (?, ?)`,
            params: [session.id, normalizePath(filePath)]
          });
        }
      }
      
      // Execute all operations in a transaction
      await executeTransaction(operations);
      
      // Return the updated session
      return {
        ...session,
        projectHash,
        updatedAt: Date.now()
      };
    } catch (error) {
      console.error("[Desktop] Error in saveSession:", error);
      throw error;
    }
  }
  
  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    console.log(`[Desktop] Getting session: ${sessionId}`);
    
    if (!sessionId) {
      console.error(`[Desktop] Invalid session ID provided`);
      return null;
    }
    
    try {
      // Get session data
      const rows = await selectQuery<any>(
        `SELECT * FROM sessions WHERE id = ?`,
        [sessionId]
      );
      
      if (rows.length === 0) {
        console.log(`[Desktop] Session not found: ${sessionId}`);
        return null;
      }
      
      const row = rows[0];
      
      // Get included files
      const includedFilesRows = await selectQuery<{path: string}>(
        `SELECT path FROM included_files WHERE session_id = ?`,
        [sessionId]
      );
      
      const includedFiles = includedFilesRows.map(r => normalizePath(r.path));
      
      // Get excluded files
      const excludedFilesRows = await selectQuery<{path: string}>(
        `SELECT path FROM excluded_files WHERE session_id = ?`,
        [sessionId]
      );
      
      const excludedFiles = excludedFilesRows.map(r => normalizePath(r.path));
      
      // Map DB row to Session object
      const session: Session = {
        id: row.id,
        name: row.name || 'Unnamed Session',
        projectDirectory: row.project_directory,
        projectHash: row.project_hash,
        taskDescription: row.task_description || '',
        searchTerm: row.search_term || '',
        titleRegex: row.title_regex || '',
        contentRegex: row.content_regex || '',
        negativeTitleRegex: row.negative_title_regex || '',
        negativeContentRegex: row.negative_content_regex || '',
        isRegexActive: row.is_regex_active === 1,
        codebaseStructure: row.codebase_structure || '',
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        includedFiles: includedFiles || [],
        forceExcludedFiles: excludedFiles || [],
        searchSelectedFilesOnly: row.search_selected_files_only === 1,
        modelUsed: row.model_used || GEMINI_FLASH_MODEL
      };
      
      return session;
      
    } catch (error) {
      console.error(`[Desktop] Error getting session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all sessions for a project
   */
  async getSessionsForProject(projectDirectory: string): Promise<Session[]> {
    console.log(`[Desktop] Getting sessions for project: ${projectDirectory}`);
    
    if (!projectDirectory) {
      console.error(`[Desktop] Invalid project directory provided`);
      return [];
    }
    
    try {
      // Generate project hash
      const projectHash = hashString(projectDirectory);
      
      // Get sessions
      const rows = await selectQuery<any>(
        `SELECT * FROM sessions WHERE project_hash = ? ORDER BY name ASC, created_at ASC`,
        [projectHash]
      );
      
      if (rows.length === 0) {
        return [];
      }
      
      // Process each session
      const sessions = await Promise.all(rows.map(async (row) => {
        // Get included files for this session
        const includedFilesRows = await selectQuery<{path: string}>(
          `SELECT path FROM included_files WHERE session_id = ?`,
          [row.id]
        );
        
        const includedFiles = includedFilesRows.map(r => normalizePath(r.path));
        
        // Get excluded files for this session
        const excludedFilesRows = await selectQuery<{path: string}>(
          `SELECT path FROM excluded_files WHERE session_id = ?`,
          [row.id]
        );
        
        const excludedFiles = excludedFilesRows.map(r => normalizePath(r.path));
        
        // Map DB row to Session object
        const session: Session = {
          id: row.id,
          name: row.name || 'Unnamed Session',
          projectDirectory: row.project_directory,
          projectHash: row.project_hash,
          taskDescription: row.task_description || '',
          searchTerm: row.search_term || '',
          titleRegex: row.title_regex || '',
          contentRegex: row.content_regex || '',
          negativeTitleRegex: row.negative_title_regex || '',
          negativeContentRegex: row.negative_content_regex || '',
          isRegexActive: row.is_regex_active === 1,
          codebaseStructure: row.codebase_structure || '',
          updatedAt: row.updated_at || Date.now(),
          createdAt: row.created_at || row.updated_at || Date.now(),
          includedFiles,
          forceExcludedFiles: excludedFiles,
          searchSelectedFilesOnly: row.search_selected_files_only === 1,
          modelUsed: row.model_used || GEMINI_FLASH_MODEL
        };
        
        return session;
      }));
      
      return sessions;
    } catch (error) {
      console.error(`[Desktop] Error in getSessionsForProject:`, error);
      return [];
    }
  }
  
  /**
   * Set the active session for a project
   */
  async setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
    if (!projectDirectory) {
      throw new Error('Project directory is required');
    }
    
    // Generate a key for the project
    const projectKey = `activeSession:${hashString(projectDirectory)}`;
    
    try {
      if (sessionId === null) {
        // Delete the entry
        await executeQuery(`DELETE FROM key_value_store WHERE key = ?`, [projectKey]);
      } else {
        // Insert or replace the entry
        await executeQuery(
          `INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)`,
          [projectKey, sessionId, Date.now()]
        );
      }
    } catch (error) {
      console.error(`[Desktop] Error setting active session:`, error);
      throw error;
    }
  }
  
  /**
   * Get the active session for a project
   */
  async getActiveSessionId(projectDirectory: string): Promise<string | null> {
    if (!projectDirectory) {
      return null;
    }
    
    // Generate a key for the project
    const projectKey = `activeSession:${hashString(projectDirectory)}`;
    
    try {
      const rows = await selectQuery<{value: string}>(
        `SELECT value FROM key_value_store WHERE key = ?`,
        [projectKey]
      );
      
      return rows.length > 0 ? rows[0].value : null;
    } catch (error) {
      console.error(`[Desktop] Error getting active session:`, error);
      throw error;
    }
  }
  
  // Additional methods would be implemented here
  // This is a partial implementation focused on key functionality
}