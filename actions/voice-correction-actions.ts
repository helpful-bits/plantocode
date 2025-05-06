"use server";

import claudeClient from "@/lib/api/claude-client";
import { ActionState } from "@/types";
import { JOB_STATUSES } from "@/types/session-types";
import { setupDatabase } from "@/lib/db";
import { sessionRepository, backgroundJobRepository } from "@/lib/db/repositories";

// Keep track of active correction jobs to prevent duplicates
const activeCorrections = new Map<string, Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>>>();

export async function correctTaskDescriptionAction(
  rawText: string,
  language: string = "en",
  sessionId?: string
): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>> {
  try {
    if (!rawText || !rawText.trim()) {
      return { isSuccess: false, message: "No text provided for correction." };
    }
    
    // Validate sessionId if provided
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId.trim())) {
      return { isSuccess: false, message: "Invalid session ID provided for voice correction" };
    }
    
    // Generate a unique key for this correction request
    const correctionKey = sessionId 
      ? `${sessionId}-${rawText.substring(0, 50)}` 
      : `anon-${rawText.substring(0, 50)}`;
    
    // Check if this correction is already in progress
    if (activeCorrections.has(correctionKey)) {
      console.log(`Correction already in progress for ${correctionKey}, reusing existing promise`);
      return activeCorrections.get(correctionKey) as Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>>;
    }
    
    // If we have a session ID, check for existing running voice_correction jobs
    if (sessionId) {
      try {
        // Setup needed to use repository
        await setupDatabase();
        
        // Find any active voice_correction jobs
        const activeJobs = await backgroundJobRepository.findActiveBackgroundJobsByType(
          'voice_correction',
          null,
          100
        );
        
        // Filter by session ID manually
        const sessionActiveJobs = activeJobs.filter(job => job.sessionId === sessionId);
        
        if (sessionActiveJobs.length > 0) {
          console.log(`Found ${sessionActiveJobs.length} active voice correction jobs, skipping duplicate request`);
          
          // Find the most recent active job (running, preparing, queued, created, or idle)
          const activeJob = sessionActiveJobs.find(job => 
            job.status && JOB_STATUSES.ACTIVE.includes(job.status)
          );
          
          if (activeJob) {
            // Return the existing job ID instead of creating a new one
            return { 
              isSuccess: true, 
              message: "Another correction is already in progress",
              data: { isBackgroundJob: true as const, jobId: activeJob.id || "" },
              metadata: { 
                operationId: activeJob.id || "",
                status: "pending"
              }
            };
          }
          
          // Add extra check for any jobs created in the last 5 seconds with the same input
          // This prevents race conditions if multiple requests come in very quickly
          const recentTime = Date.now() - 5000; // 5 seconds ago
          const recentJob = sessionActiveJobs.find(job => 
            job.createdAt && (job.createdAt > recentTime) && 
            job.prompt && 
            job.prompt.substring(0, 50) === rawText.substring(0, 50)
          );
          
          if (recentJob) {
            console.log(`Found recent voice correction job with similar input, using job ${recentJob.id}`);
            return { 
              isSuccess: true, 
              message: "Similar correction request already in progress",
              data: { isBackgroundJob: true as const, jobId: recentJob.id || "" },
              metadata: { 
                operationId: recentJob.id || "",
                status: "pending"
              }
            };
          }
        }
      } catch (err) {
        console.warn("Error checking for active correction jobs:", err);
        // Continue with new correction if there was an error checking existing jobs
      }
    }
    
    // Get projectDirectory from session if sessionId is provided
    let projectDirectory = undefined;
    if (sessionId) {
      try {
        const session = await sessionRepository.getSession(sessionId);
        projectDirectory = session?.projectDirectory;
      } catch (error) {
        console.warn("Error getting session for voice correction:", error);
      }
    }
    
    // Create a promise for this correction
    const correctionPromise = claudeClient.correctTaskDescription(
      rawText,
      { sessionId, language, projectDirectory }
    ).then(result => {
      // If this is a background job
      if (result.isSuccess && 
          typeof result.data === 'object' && 
          result.data && 
          'isBackgroundJob' in result.data) {
        console.log(`Correction started as background job`);
        return {
          isSuccess: true,
          message: "Voice correction is processing in background",
          data: { isBackgroundJob: true as const, jobId: result.data.jobId },
          metadata: { 
            operationId: result.data.jobId,
            status: "pending"
          }
        };
      }
      
      // Otherwise, return the result directly (should have actual correction text)
      return result as ActionState<string>;
    });
    
    // Store the promise in the active corrections map
    activeCorrections.set(correctionKey, correctionPromise);
    
    // Clean up the map entry after the promise resolves or rejects
    correctionPromise
      .finally(() => {
        // Remove from map after a short delay to handle quick successive calls
        setTimeout(() => {
          activeCorrections.delete(correctionKey);
        }, 2000);
      });
    
    return correctionPromise;
  } catch (error) {
    console.error("Error correcting text with Claude:", error);
    return {
      isSuccess: false,
      message: "Failed to correct text",
    };
  }
}
