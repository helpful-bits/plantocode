"use server";

import path from 'path';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { Session } from '@/types'; // Keep Session import

/**
 * Migration script to update patch paths in the database from 
 * the old format (.o1-pro-flow/patches/) to the new format (patches/)
 */
export async function migratePatchPaths(): Promise<{ 
  success: boolean; 
  message: string; 
  updated: number 
}> {
  try { // Keep try block
    // Ensure database is initialized
    await setupDatabase(); // Await setup
    
    // Get all sessions // Keep comment
    const allSessions = await sessionRepository.getAllSessions();
    
    // Counter for updated sessions
    let updatedCount = 0;
    
    // Iterate through sessions and update patch paths
    for (const session of allSessions) {
      if (session.geminiPatchPath && session.geminiPatchPath.includes('.o1-pro-flow/patches')) {
        // Extract just the filename from the old path
        const filename = path.basename(session.geminiPatchPath);
        
        // Create the new path using the repository's patches directory
        const newPath = path.join(process.cwd(), 'patches', filename);
        
        // Update the session record
        await sessionRepository.updateSessionGeminiStatus(
          session.id,
          session.geminiStatus || 'completed',
          session.geminiStartTime,
          session.geminiEndTime,
          newPath,
          session.geminiStatusMessage // Preserve existing status message
        ); // End updateSessionGeminiStatus call
        
        updatedCount++;
      }
    } // Close for loop
    
    return { 
      success: true, 
      message: `Successfully updated ${updatedCount} sessions with new patch paths.`,
      updated: updatedCount
    };
  } catch (error) {
    console.error('Error migrating patch paths:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error during migration',
      updated: 0
    };
  }
} 