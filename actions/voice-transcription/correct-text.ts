"use server";

import { ActionState } from "@/types";
import claudeClient from "@/lib/api/claude-client";
import { createBackgroundJob, updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '@/lib/jobs/job-helpers';
import { ApiType, TaskType } from "@/types";

/**
 * Action to improve and correct transcribed text using Claude.
 */
export async function correctTextAction(
  text: string,
  language: string = "en",
  sessionId: string | null = null
): Promise<ActionState<string | { isBackgroundJob: true; jobId: string; }>> {
  try {
    // Validate inputs
    if (!text || !text.trim()) {
      return { 
        isSuccess: false, 
        message: "No text provided for correction.",
        data: text // Return original text on error
      };
    }

    // Add strict session ID validation for background job creation
    // Use a default session ID if none provided since the DB requires a non-null value
    const effectiveSessionId = sessionId || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    if (typeof effectiveSessionId !== 'string' || !effectiveSessionId.trim()) {
      return { 
        isSuccess: false, 
        message: "Invalid session ID for background job creation.",
        data: text // Return original text on error
      };
    }
    
    // Create a background job for tracking
    const runningJob = await createBackgroundJob(
      effectiveSessionId,
      {
        apiType: "claude" as ApiType,
        taskType: "voice_correction" as TaskType,
        model: "claude-3-sonnet-20240229",
        rawInput: text.substring(0, 200) + (text.length > 200 ? '...' : ''), // Store preview of input
        includeSyntax: false
      }
    );
    
    console.log(`[TextCorrection] Created background job: ${runningJob.id} for session: ${effectiveSessionId}`);
    
    // Update job to running
    await updateJobToRunning(runningJob.id, "claude" as ApiType);

    // Use Claude client to correct and improve the transcribed text
    try {
      const result = await claudeClient.correctTaskDescription(
        text,
        {
          sessionId: sessionId || undefined,
          language,
          max_tokens: 2048
        }
      );
      
      // Check if Claude client returned its own background job
      if (result.isSuccess && result.metadata?.isBackgroundJob && result.metadata?.jobId) {
        // Link the Claude's job ID to our job for tracking
        await updateJobToRunning(runningJob.id, "claude" as ApiType, `Delegated to Claude job: ${result.metadata.jobId}`);
        
        return {
          isSuccess: true,
          message: "Text correction is being processed in the background.",
          data: { isBackgroundJob: true, jobId: runningJob.id },
          metadata: { 
            isBackgroundJob: true, 
            jobId: runningJob.id,
            claudeJobId: result.metadata.jobId
          }
        };
      }
      
      // Handle background job response from data (alternate format)
      if (result.isSuccess && typeof result.data === 'object' && result.data && 'isBackgroundJob' in result.data && 'jobId' in result.data) {
        // Link the Claude's job ID to our job for tracking
        await updateJobToRunning(runningJob.id, "claude" as ApiType, `Delegated to Claude job: ${result.data.jobId}`);
        
        return {
          isSuccess: true,
          message: "Text correction is being processed in the background.",
          data: { isBackgroundJob: true, jobId: runningJob.id },
          metadata: { 
            isBackgroundJob: true, 
            jobId: runningJob.id,
            claudeJobId: result.data.jobId
          }
        };
      }
      
      // Return the immediate result for synchronous response
      if (result.isSuccess && result.data && typeof result.data === 'string') {
        // Update our job to completed with the corrected text
        await updateJobToCompleted(runningJob.id, result.data);
        
        return {
          isSuccess: true,
          message: "Text correction completed.",
          data: result.data,
          metadata: { 
            ...result.metadata || {},
            jobId: runningJob.id
          }
        };
      }
      
      // Handle error cases
      if (!result.isSuccess) {
        await updateJobToFailed(runningJob.id, result.message || "Unknown Claude API error");
        
        return {
          isSuccess: false,
          message: result.message || "Failed to correct text",
          data: text, // Return original text on error
          metadata: {
            jobId: runningJob.id
          }
        };
      }
      
      // Return any other type of result with our job ID attached
      return {
        ...result,
        metadata: {
          ...result.metadata || {},
          jobId: runningJob.id
        }
      };
    } catch (claudeError) {
      // Handle Claude client errors
      console.error("[TextCorrection] Claude client error:", claudeError);
      
      // Update job to failed
      await updateJobToFailed(
        runningJob.id, 
        claudeError instanceof Error ? claudeError.message : "Claude client error"
      );
      
      return {
        isSuccess: false,
        message: claudeError instanceof Error ? claudeError.message : "Error calling Claude API",
        data: text, // Return original text on error
        metadata: {
          jobId: runningJob.id
        }
      };
    }
  } catch (error) {
    console.error("[TextCorrection] Error correcting text:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to correct text",
      data: text // Return original text on error
    };
  }
} 