"use server";

import { ActionState } from "@/types";
import claudeClient from "@/lib/api/claude-client";
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '@/lib/jobs/job-helpers';
import { ApiType } from "@/types";
import { backgroundJobRepository } from "@/lib/db/repositories";

/**
 * Action to improve and correct transcribed text using Claude.
 * 
 * This action updates the existing transcription job instead of creating a new one.
 * It may delegate to another Claude job if the client returns a background job ID.
 */
export async function correctTextAction(
  text: string,
  language: string = "en",
  sessionId: string | null,
  transcriptionJobId: string | null
): Promise<ActionState<string>> {
  try {
    // Validate inputs
    if (!text || !text.trim()) {
      return { 
        isSuccess: false, 
        message: "No text provided for correction.",
        data: text // Return original text on error
      };
    }
    
    if (!transcriptionJobId) {
      console.warn("[TextCorrection] No transcription job ID provided for correction, proceeding with original text");
      return {
        isSuccess: true,
        message: "No transcription job ID provided, returning original text.",
        data: text
      };
    }

    // Add strict session ID validation
    // Use a default session ID if none provided since the DB requires a non-null value
    const effectiveSessionId = sessionId || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    if (typeof effectiveSessionId !== 'string' || !effectiveSessionId.trim()) {
      return { 
        isSuccess: false, 
        message: "Invalid session ID for background job processing.",
        data: text // Return original text on error
      };
    }
    
    // Update the existing transcription job to indicate correction is starting
    if (transcriptionJobId) {
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId: transcriptionJobId,
        status: 'running',
        statusMessage: 'Correcting transcribed text...'
      });
    }
    
    console.log(`[TextCorrection] Updating existing job: ${transcriptionJobId} for correction`);

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
        // Update the original job with reference to the Claude job
        if (transcriptionJobId) {
          await backgroundJobRepository.updateBackgroundJobStatus({
            jobId: transcriptionJobId,
            status: 'running',
            statusMessage: `Waiting for Claude correction job: ${result.metadata.jobId}`
          });
        }
        
        return {
          isSuccess: true,
          message: "Text correction is being processed in the background.",
          data: text, // Return original text while waiting
          metadata: { 
            isBackgroundJob: true, 
            jobId: transcriptionJobId,
            claudeJobId: result.metadata.jobId
          }
        };
      }
      
      // Handle background job response from data (alternate format)
      if (result.isSuccess && typeof result.data === 'object' && result.data && 'isBackgroundJob' in result.data && 'jobId' in result.data) {
        // Update the original job with reference to the Claude job
        if (transcriptionJobId) {
          await backgroundJobRepository.updateBackgroundJobStatus({
            jobId: transcriptionJobId,
            status: 'running',
            statusMessage: `Waiting for Claude correction job: ${result.data.jobId}`
          });
        }
        
        return {
          isSuccess: true,
          message: "Text correction is being processed in the background.",
          data: text, // Return original text while waiting
          metadata: { 
            isBackgroundJob: true, 
            jobId: transcriptionJobId,
            claudeJobId: result.data.jobId
          }
        };
      }
      
      // If we got an immediate response
      if (result.isSuccess && result.data && typeof result.data === 'string') {
        // Update the original job to completed with the corrected text
        if (transcriptionJobId) {
          await backgroundJobRepository.updateBackgroundJobStatus({
            jobId: transcriptionJobId,
            status: 'completed',
            response: result.data,
            statusMessage: 'Transcription and correction completed',
            endTime: Date.now()
          });
        }
        
        return {
          isSuccess: true,
          message: "Text correction completed.",
          data: result.data,
          metadata: { 
            ...result.metadata || {},
            jobId: transcriptionJobId
          }
        };
      }
      
      // Handle error cases
      if (!result.isSuccess) {
        if (transcriptionJobId) {
          await updateJobToFailed(
            transcriptionJobId, 
            result.message || "Correction failed: Unknown Claude API error"
          );
        }
        
        return {
          isSuccess: false,
          message: result.message || "Failed to correct text",
          data: text, // Return original text on error
          metadata: {
            jobId: transcriptionJobId
          }
        };
      }
      
      // Return any other type of result with the original job ID attached
      return {
        ...result,
        data: typeof result.data === 'string' ? result.data : text,
        metadata: {
          ...result.metadata || {},
          jobId: transcriptionJobId
        }
      };
    } catch (claudeError) {
      // Handle Claude client errors
      console.error("[TextCorrection] Claude client error:", claudeError);
      
      // Update job to failed
      if (transcriptionJobId) {
        await updateJobToFailed(
          transcriptionJobId, 
          claudeError instanceof Error ? claudeError.message : "Correction failed: Claude client error"
        );
      }
      
      return {
        isSuccess: false,
        message: claudeError instanceof Error ? claudeError.message : "Error calling Claude API",
        data: text, // Return original text on error
        metadata: {
          jobId: transcriptionJobId
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