import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index'; // Keep db import
import { hashString } from '@/lib/hash';
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { runMigrations } from '@/lib/db/migrations';

setupDatabase(); // Ensure DB setup runs


export async function GET(request: NextRequest) {
  try { // Use try/catch block
    // 1. Run migrations first to make sure the schema is updated
    await runMigrations();
    
    // 2. Update all sessions with project_hash
    const sessionResults = await new Promise<any[]>((resolve) => { // Fetch existing sessions
      db.all("SELECT id, project_directory FROM sessions", (err, rows) => {
        if (err) {
          console.error("Error fetching sessions:", err);
          resolve([]);
          return;
        }
        resolve(rows || []);
      });
    });
    
    console.log(`Found ${sessionResults.length} sessions to update`);
    
    // Update all sessions with proper hash values
    const updatePromises = sessionResults.map(async (session) => {
      if (!session.project_directory) { // Check if project directory exists
        console.log(`Skipping session ${session.id} with empty project_directory`);
        return;
      }
      
      const projectHash = hashString(session.project_directory);
      return new Promise<void>((resolve) => {
        db.run( // Use db instance directly
          "UPDATE sessions SET project_hash = ? WHERE id = ?",
          [projectHash, session.id],
          (err) => {
            if (err) {
              console.error(`Error updating session ${session.id}:`, err);
            } else {
              console.log(`Updated session ${session.id} with hash ${projectHash}`);
            }
            resolve();
          }
        );
      });
    });
    
    await Promise.all(updatePromises); // Wait for all updates to finish
      const sessionUpdateCount = sessionResults.length;

    // 3. Migrate project settings to use project_hash
    const projectSettingsResults = await new Promise<any[]>((resolve) => {
      db.all("SELECT * FROM project_settings_old", (err, rows) => {
        if (err) {
          // Table might not exist
          console.log("No old project settings table, skipping migration");
          resolve([]);
          return;
        }
        resolve(rows || []);
      });
    });
    
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
        return new Promise<void>((resolve) => {
          db.run(
            "INSERT OR REPLACE INTO project_settings (project_hash, output_format, active_session_id, updated_at) VALUES (?, ?, ?, ?)",
            [projectHash, setting.output_format, setting.active_session_id, setting.updated_at || Date.now()],
            (err) => {
              if (err) {
                console.error("Error migrating project setting:", err);
              } else {
                console.log(`Migrated project setting for ${setting.project_directory} to hash ${projectHash}`);
                migratedSettingsCount++;
              }
              resolve();
            }
          );
        });
      });
      
      await Promise.all(migratePromises);
      
      // Drop old settings table if it exists
      db.run("DROP TABLE IF EXISTS project_settings_old", (err) => {
        if (err) {
          console.error("Error dropping old project settings table:", err);
        } else {
          console.log("Dropped old project settings table");
        }
      });
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
