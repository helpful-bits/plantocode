import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { resetDatabase } from '@/lib/db/setup';
import { hashString } from '@/lib/hash';

// GET /api/debug/database
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  
  // Check database tables
  if (action === 'check') {
    try {
      const tables = await new Promise<any[]>((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
          if (err) reject(err);
          else resolve(tables);
        });
      });
      
      return NextResponse.json({ 
        success: true, 
        tables: tables.map(t => t.name),
        message: `Found ${tables.length} tables`
      });
    } catch (error: unknown) { // Use unknown type for catch block variable
      return NextResponse.json({ 
        success: false, 
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
      
      query += " ORDER BY project_hash, output_format, key";
      
      const entries = await new Promise<any[]>((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
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
      
      const result = await new Promise<{changes: number}>((resolve, reject) => {
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve({changes: this.changes});
        });
      });
      
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
      const testFormat = 'test-format';
      
      // First, attempt to write a test value
      await new Promise<void>((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO cached_state
          (project_hash, output_format, key, value, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `, [testProject, testFormat, testKey, testValue, Date.now()], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Then, try to read it back
      const readValue = await new Promise<string | null>((resolve, reject) => {
        db.get(`
          SELECT value FROM cached_state
          WHERE project_hash = ? AND output_format = ? AND key = ?
        `, [testProject, testFormat, testKey], (err, row: any) => { // Added type annotation
          if (err) reject(err);
          else resolve(row ? row.value : null);
        });
      });
      
      // Check if the read value matches what we wrote
      const readMatchesWrite = readValue === testValue;
      
      // Clean up the test data
      await new Promise<void>((resolve, reject) => {
        db.run(`
          DELETE FROM cached_state
          WHERE project_hash = ? AND output_format = ? AND key = ?
        `, [testProject, testFormat, testKey], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
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
      const taskEntries = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT * FROM cached_state 
          WHERE project_hash = ? AND key = 'task-description'
        `, [projectHash], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      // Get all entries for this project
      const allEntries = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT * FROM cached_state 
          WHERE project_hash = ?
          ORDER BY key, output_format
        `, [projectHash], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
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
  
  // If no recognized action was provided
  return NextResponse.json({ 
    success: false, 
    error: 'Invalid or missing action parameter. Supported actions: check, reset, cached-state, clear-cache, test-db, task-state' 
  }, { status: 400 });
}
