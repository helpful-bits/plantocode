import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { db, connectionPool } from '@core/lib/db';
import { resetDatabase } from '@core/lib/db/setup'; // Keep resetDatabase import
import { hashString } from '@core/lib/hash';
// GET /api/debug/database?action=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  
  // Check database tables
  if (action === 'check') {
    try {
      const tables = await connectionPool.withConnection((db: Database.Database) => {
        return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      }, true); // Read-only operation

      return NextResponse.json({ 
        success: true, 
        tables: tables.map((t) => t.name),
        message: `Found ${tables.length} tables`
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, // Keep success status false on error
        error: `Failed to check database: ${error}` 
      }, { status: 500 });
    }
  }
  
  // Reset database (DANGEROUS - requires confirmation)
  if (action === 'reset') {
    const confirmed = searchParams.get('confirmed') === 'true';
    
    if (!confirmed) {
      return NextResponse.json({ 
        success: false, 
        error: 'Reset requires confirmation. Use ?action=reset&confirmed=true' 
      }, { status: 400 });
    }
    
    try {
      await resetDatabase();
      return NextResponse.json({ 
        success: true, 
        message: 'Database has been reset and reinitialized' 
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, 
        error: `Failed to reset database: ${error}` 
      }, { status: 500 });
    }
  }
  
  // Get all cached state entries
  if (action === 'cached-state') {
    try {
      const projectHash = searchParams.get('project_hash');
      let query = "SELECT * FROM cached_state";
      let params: any[] = [];
      
      if (projectHash) {
        query += " WHERE project_hash = ?";
        params.push(projectHash);
      }
      
      query += " ORDER BY project_hash, key";
      
      const entries = await connectionPool.withConnection((db: Database.Database) => {
        return db.prepare(query).all(...params);
      }, true); // Read-only operation
      
      return NextResponse.json({ 
        success: true, 
        entries,
        count: entries.length
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, 
        error: `Failed to retrieve cached state: ${error}` 
      }, { status: 500 });
    }
  }
  
  // Clear cached state entries
  if (action === 'clear-cache') {
    const confirmed = searchParams.get('confirmed') === 'true';
    const projectHash = searchParams.get('project_hash');
    
    if (!confirmed) {
      return NextResponse.json({ 
        success: false, 
        error: 'Clearing cache requires confirmation. Use ?action=clear-cache&confirmed=true' 
      }, { status: 400 });
    }
    
    try {
      let query = "DELETE FROM cached_state";
      let params: any[] = [];
      
      if (projectHash) {
        query += " WHERE project_hash = ?";
        params.push(projectHash);
      }
      
      const result = await connectionPool.withConnection((db: Database.Database) => {
        const result = db.prepare(query).run(...params);
        return { changes: result.changes };
      }, false); // Writable operation
      
      const rowsAffected = result.changes;
      const targetDescription = projectHash ? `for project hash ${projectHash}` : 'for all projects';
      
      return NextResponse.json({ 
        success: true, 
        message: `Cleared ${rowsAffected} cached state entries ${targetDescription}` 
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, 
        error: `Failed to clear cached state: ${error}` 
      }, { status: 500 });
    }
  }
  
  // Test database read/write operations
  if (action === 'test-db') {
    try {
      // Generate a unique test value
      const testValue = `test-value-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const testKey = 'test-key';
      const testProject = 'test-project';
      const testProjectHash = hashString(testProject); // Hash the project dir
      
      // First, attempt to write a test value
      await connectionPool.withConnection((db: Database.Database) => {
        db.prepare(`
          INSERT OR REPLACE INTO cached_state
          (project_hash, key, value, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(testProjectHash, testKey, testValue, Date.now());
      }, false); // Writable operation
      
      // Then, try to read it back
      const readValue = await connectionPool.withConnection((db: Database.Database) => {
        const row = db.prepare(`
          SELECT value FROM cached_state
          WHERE project_hash = ? AND key = ?
        `).get(testProjectHash, testKey);
        
        return row ? (row as { value: string | null }).value : null;
      }, true); // Read-only operation
      
      // Check if the read value matches what we wrote
      const readMatchesWrite = readValue === testValue;
      
      // Clean up the test data
      await connectionPool.withConnection((db: Database.Database) => {
        db.prepare(`
          DELETE FROM cached_state
          WHERE project_hash = ? AND key = ?
        `).run(testProjectHash, testKey);
      }, false); // Writable operation
      
      return NextResponse.json({
        success: true,
        testPassed: readMatchesWrite,
        testValue,
        readValue,
        message: readMatchesWrite 
          ? "Database read/write test passed!"
          : "Database read/write test FAILED: written value doesn't match read value"
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({
        success: false,
        error: `Database test failed: ${error}`,
        testPassed: false
      }, { status: 500 });
    }
  }
  
  // Check task description state
  if (action === 'task-state') {
    const projectDirectory = searchParams.get('project');
    
    if (!projectDirectory) {
      return NextResponse.json({ 
        success: false, 
        error: 'Must provide project parameter' 
      }, { status: 400 });
    }
    
    try {
      // Calculate the project hash the same way as the repository does
      const projectHash = hashString(projectDirectory);
      
      // Get task description entries across all formats
      const taskEntries = await connectionPool.withConnection((db: Database.Database) => {
        return db.prepare(`
          SELECT * FROM cached_state 
          WHERE project_hash = ? AND key = 'task-description'
        `).all(projectHash);
      }, true); // Read-only operation
      
      // Get all entries for this project
      const allEntries = await connectionPool.withConnection((db: Database.Database) => {
        return db.prepare(`
          SELECT * FROM cached_state 
          WHERE project_hash = ?
          ORDER BY key
        `).all(projectHash);
      }, true); // Read-only operation
      
      return NextResponse.json({ 
        success: true, 
        projectDirectory,
        projectHash,
        taskEntries,
        allEntries,
        keyCount: allEntries.length,
        message: `Found ${taskEntries.length} task description entries and ${allEntries.length} total entries for project` 
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, 
        error: `Failed to check task state: ${error}` 
      }, { status: 500 });
    }
  }
  
  // Get info about a specific database table
  if (action === 'table-info') {
    const tableName = searchParams.get('table');
    
    if (!tableName) {
      return NextResponse.json({ 
        success: false, 
        error: 'Must provide table parameter' 
      }, { status: 400 });
    }
    
    try {
      // Get table schema
      const schema = await connectionPool.withConnection((db: Database.Database) => {
        return db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{name: string, type: string, notnull: number, dflt_value: string|null, pk: number}>;
      }, true); // Read-only operation
      
      // Get row count
      const countResult = await connectionPool.withConnection((db: Database.Database) => {
        return db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
      }, true); // Read-only operation
      
      const rowCount = countResult ? (countResult as { count: number }).count : 0;
      
      // Get sample rows if the table has data
      let sampleRows: unknown[] = [];
      if (rowCount > 0) {
        sampleRows = await connectionPool.withConnection((db: Database.Database) => {
          return db.prepare(`SELECT * FROM ${tableName} LIMIT 5`).all();
        }, true); // Read-only operation
      }
      
      return NextResponse.json({ 
        success: true, 
        table: tableName,
        schema,
        rowCount,
        sampleRows,
        message: `Table ${tableName} has ${schema.length} columns and ${rowCount} rows` 
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, 
        error: `Failed to get table info: ${error}` 
      }, { status: 500 });
    }
  }
  
  // Unknown action
  return NextResponse.json({ 
    success: false, 
    error: `Unknown action: ${action}` 
  }, { status: 400 });
}
