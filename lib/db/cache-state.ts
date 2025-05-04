import connectionPool from './connection-pool';
import crypto from 'crypto';
import Database from 'better-sqlite3';

/**
 * Get cached state value from the database
 */
export async function getCachedState(projectDirectory: string | null, key: string): Promise<string | null> {
  try {
    if (!key) {
      console.error("[DB] Cannot get cached state with empty key");
      return null;
    }
    
    // Hash project directory if provided, otherwise use null
    let projectHash = null;
    if (projectDirectory) {
      projectDirectory = projectDirectory.trim();
      projectHash = crypto.createHash('md5').update(projectDirectory).digest('hex');
    }
    
    return await connectionPool.withConnection((db: Database.Database) => {
      let query, params;
      
      if (projectHash) {
        query = 'SELECT value FROM cached_state WHERE project_hash = ? AND key = ? LIMIT 1';
        params = [projectHash, key];
      } else {
        query = 'SELECT value FROM cached_state WHERE project_hash IS NULL AND key = ? LIMIT 1';
        params = [key];
      }
      
      const row = db.prepare(query).get(...params) as { value: string | null } | undefined;
      return row && row.value ? row.value : null;
    }, true); // Use readonly connection
  } catch (error) {
    console.error(`[DB] Error in getCachedState for key "${key}" (project: ${projectDirectory || 'global'}):`, error);
    return null;
  }
}

/**
 * Save cached state value to the database
 */
export async function saveCachedState(projectDirectory: string | null, key: string, value: string): Promise<void> {
  try {
    if (!key) {
      console.error("[DB] Cannot save cached state with empty key");
      return;
    }
    
    // Hash project directory if provided, otherwise use null
    let projectHash = null;
    if (projectDirectory) {
      projectDirectory = projectDirectory.trim();
      projectHash = crypto.createHash('md5').update(projectDirectory).digest('hex');
    }
    
    await connectionPool.withConnection((db: Database.Database) => {
      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      
      // Ensure table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cached_state'").get();
      
      if (!tableExists) {
        db.prepare(`
          CREATE TABLE cached_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_hash TEXT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(project_hash, key)
          )
        `).run();
      }
      
      // Use REPLACE to handle both insert and update cases
      const query = `
        REPLACE INTO cached_state (project_hash, key, value, updated_at)
        VALUES (?, ?, ?, ?)
      `;
      
      db.prepare(query).run(projectHash, key, value, now);
    }, false); // Use writable connection
  } catch (error) {
    console.error(`[DB] Error in saveCachedState for key "${key}" (project: ${projectDirectory || 'global'}):`, error);
    throw error;
  }
} 