import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase } from '@/lib/db';
import { sessionRepository } from '@/lib/db/repositories';

/**
 * GET /api/session/check
 * Checks for problematic sessions like duplicate task descriptions or other issues
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[API session/check] Checking for session issues');
    
    // Ensure database is initialized
    await setupDatabase();
    
    // Get all sessions 
    const allSessions = await sessionRepository.getAllSessions();
    
    if (!allSessions || allSessions.length === 0) {
      console.log('[API session/check] No sessions found');
      return NextResponse.json({
        message: 'No sessions found',
        sessionCount: 0
      });
    }
    
    console.log(`[API session/check] Analyzing ${allSessions.length} sessions for issues`);
    
    // Group sessions by project directory
    const sessionsByProject: Record<string, typeof allSessions> = {};
    
    for (const session of allSessions) {
      // Validate session.id is a proper string
      if (typeof session.id !== 'string' || !session.id.trim()) {
        console.error(`[API session/check] Found session with invalid ID:`, {
          id: session.id,
          type: typeof session.id,
          name: session.name || 'Unnamed'
        });
        continue; // Skip this session in the analysis
      }
      
      // Normalize project directory
      const projectDir = session.projectDirectory || 'unknown';
      
      if (!sessionsByProject[projectDir]) {
        sessionsByProject[projectDir] = [];
      }
      
      sessionsByProject[projectDir].push(session);
    }
    
    const results = {
      projectCount: Object.keys(sessionsByProject).length,
      sessionCount: allSessions.length,
      projectSummary: [] as Array<{
        projectDirectory: string;
        sessionCount: number;
        duplicateTaskDescriptions: boolean;
        sessionDetails: Array<{
          id: string;
          name: string;
          taskDescriptionLength: number;
          taskPreview: string;
          hasSameTaskAs: string[];
        }>;
      }>
    };
    
    // Check each project for duplicate task descriptions
    for (const [projectDir, sessions] of Object.entries(sessionsByProject)) {
      // Skip projects with only one session
      if (sessions.length <= 1) {
        results.projectSummary.push({
          projectDirectory: projectDir,
          sessionCount: sessions.length,
          duplicateTaskDescriptions: false,
          sessionDetails: sessions.map(s => ({
            id: s.id,
            name: s.name || 'Unnamed',
            taskDescriptionLength: s.taskDescription?.length || 0,
            taskPreview: s.taskDescription ? `${s.taskDescription.substring(0, 40)}...` : 'none',
            hasSameTaskAs: []
          }))
        });
        continue;
      }
      
      // Analyze sessions by task description
      const taskMap: Record<string, string[]> = {}; // taskDescription -> sessionIds
      let hasDuplicates = false;
      
      for (const session of sessions) {
        // Skip if session ID isn't valid (double-check)
        if (typeof session.id !== 'string' || !session.id.trim()) {
          console.error(`[API session/check] Skipping session with invalid ID in duplicate detection:`, {
            id: session.id,
            type: typeof session.id
          });
          continue;
        }
        
        const taskDesc = session.taskDescription || '';
        if (!taskMap[taskDesc]) {
          taskMap[taskDesc] = [];
        }
        taskMap[taskDesc].push(session.id);
        
        if (taskMap[taskDesc].length > 1) {
          hasDuplicates = true;
        }
      }
      
      // Prepare session details with duplicate information
      const sessionDetails = sessions.map(s => {
        const taskDesc = s.taskDescription || '';
        const hasSameTaskAs = taskMap[taskDesc].filter(id => id !== s.id);
        
        return {
          id: s.id,
          name: s.name || 'Unnamed',
          taskDescriptionLength: taskDesc.length,
          taskPreview: taskDesc ? `${taskDesc.substring(0, 40)}...` : 'none',
          hasSameTaskAs
        };
      });
      
      results.projectSummary.push({
        projectDirectory: projectDir,
        sessionCount: sessions.length,
        duplicateTaskDescriptions: hasDuplicates,
        sessionDetails
      });
    }
    
    console.log(`[API session/check] Found ${results.projectSummary.filter(p => p.duplicateTaskDescriptions).length} projects with duplicate task descriptions`);
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('[API session/check] Error checking sessions:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 