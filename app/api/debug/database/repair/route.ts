import { NextRequest, NextResponse } from 'next/server';
import { db, connectionPool } from '@/lib/db';
import { hashString } from '@/lib/hash';
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { runMigrations } from '@/lib/db/setup/migrations'; // Import from setup/migrations instead

setupDatabase(); // Ensure DB setup runs


export async function GET(request: NextRequest) {
  try { // Use try/catch block
    // 1. Run migrations first to make sure the schema is updated
    await runMigrations();
    
    // 2. Update all sessions with project_hash
    const sessionResults = await connectionPool.withConnection((db) => {
      return db.prepare("SELECT id, project_directory FROM sessions").all() as Array<{ id: string; project_directory: string }>;
    }, true); // Read-only operation
    
    console.log(`Found ${sessionResults.length} sessions to update`);
    
    // Update all sessions with proper hash values
    const updatePromises = sessionResults.map(async (session) => {
      if (!session.project_directory) { // Check if project directory exists
        console.log(`Skipping session ${session.id} with empty project_directory`);
        return;
      }
      
      const projectHash = hashString(session.project_directory);
      return connectionPool.withConnection((db) => {
        db.prepare(
          "UPDATE sessions SET project_hash = ? WHERE id = ?"
        ).run(projectHash, session.id);
        
        console.log(`Updated session ${session.id} with hash ${projectHash}`);
      }, false); // Writable operation
    });
    
    await Promise.all(updatePromises); // Wait for all updates to finish
    const sessionUpdateCount = sessionResults.length;

    // 3. Migrate project settings to use project_hash
    const projectSettingsResults = await connectionPool.withConnection((db) => {
      return db.prepare("SELECT * FROM project_settings_old").all() as Array<{ project_directory: string; active_session_id: string | null; updated_at: number | null }>;
    }, true); // Read-only operation
    
    // Insert any old settings into the new table with hashed project directories
    let migratedSettingsCount = 0;
    if (projectSettingsResults.length > 0) {
      console.log(`Found ${projectSettingsResults.length} project settings to migrate`);
      
      const migratePromises = projectSettingsResults.map(async (setting) => {
        if (!setting.project_directory) {
          console.log("Skipping project setting with empty project_directory");
          return;
        }
        
        const projectHash = hashString(setting.project_directory);
        return connectionPool.withConnection((db) => {
          db.prepare(
            "INSERT OR REPLACE INTO project_settings (project_hash, active_session_id, updated_at) VALUES (?, ?, ?)"
          ).run(projectHash, setting.active_session_id, setting.updated_at || Date.now());
          
          console.log(`Migrated project setting for ${setting.project_directory} to hash ${projectHash}`);
          migratedSettingsCount++;
        }, false); // Writable operation
      });
      
      await Promise.all(migratePromises);
      
      // Drop old settings table if it exists
      await connectionPool.withConnection((db) => {
        db.prepare("DROP TABLE IF EXISTS project_settings_old").run();
        console.log("Dropped old project settings table");
      }, false); // Writable operation
    }

    // Return summary
    return NextResponse.json({
        success: true,
        sessions_updated: sessionUpdateCount,
        project_settings_migrated: migratedSettingsCount,
        message: `Updated ${sessionUpdateCount} sessions and migrated ${migratedSettingsCount} project settings`
    });
  } catch (error: unknown) {
    console.error("Database repair error:", error);
    return NextResponse.json({ 
      success: false,
      error: `Failed to repair database: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}
