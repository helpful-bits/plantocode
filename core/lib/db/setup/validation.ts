import connectionPool from "../connection-pool";
import Database from 'better-sqlite3';

/**
 * Validates that the database connection is operational and has the expected tables
 */
export async function validateDatabaseConnection(): Promise<boolean> {
  try {
    // Try a simple query to make sure the connection works
    const result = await connectionPool.withConnection((db: Database.Database) => {
      // Check for meta table presence first
      const metaTable = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='meta'
      `).get();
      
      if (!metaTable) {
        console.log("[Validation] Meta table not found, database validation failed");
        return false;
      }
      
      // Check for sessions table presence
      const sessionsTable = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='sessions'
      `).get();
      
      if (!sessionsTable) {
        console.log("[Validation] Sessions table not found, database validation failed");
        return false;
      }
      
      // Check for migrations table presence
      const migrationsTable = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `).get();
      
      if (!migrationsTable) {
        console.log("[Validation] Migrations table not found, database validation failed");
        return false;
      }
      
      // Try to read from each critical table to validate read access
      
      // Check meta table
      try {
        db.prepare("SELECT key, value FROM meta LIMIT 1").get();
      } catch (err) {
        console.error("[Validation] Failed to read from meta table:", err);
        return false;
      }
      
      // Check sessions table
      try {
        db.prepare("SELECT id FROM sessions LIMIT 1").get();
      } catch (err) {
        console.error("[Validation] Failed to read from sessions table:", err);
        return false;
      }
      
      // Check migrations table
      try {
        db.prepare("SELECT id FROM migrations LIMIT 1").get();
      } catch (err) {
        console.error("[Validation] Failed to read from migrations table:", err);
        return false;
      }
      
      // Test write capability by updating a timestamp in meta
      try {
        const now = Date.now();
        db.prepare(`
          INSERT OR REPLACE INTO meta (key, value) 
          VALUES ('last_validation', ?)
        `).run(now.toString());
        
        // Verify the write worked
        const written = db.prepare(`
          SELECT value FROM meta WHERE key = 'last_validation'
        `).get() as { value: string } | undefined;
        
        if (!written || written.value !== now.toString()) {
          console.error("[Validation] Failed to verify write to meta table");
          return false;
        }
      } catch (err) {
        console.error("[Validation] Failed to write to meta table:", err);
        return false;
      }
      
      console.log("[Validation] Database validation successful");
      return true;
    });
    
    return result === true;
  } catch (error) {
    console.error("[Validation] Database validation error:", error);
    return false;
  }
} 