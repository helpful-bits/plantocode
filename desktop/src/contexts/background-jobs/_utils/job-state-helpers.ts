"use client";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { createLogger } from "@/utils/logger";
import { safeStringCompare } from "@/utils/string-utils";
import { getParsedMetadata } from "@/app/components/background-jobs-sidebar/utils";
import { normalizeJobResponse, safeResponseIncludes } from '@/utils/response-utils';

const logger = createLogger({ namespace: "JobComparison" });

// Parse metadata without caching to ensure cost updates are always reflected
function parseMetadata(metadata: any): any {
  if (!metadata) return null;
  return getParsedMetadata(metadata);
}

/**
 * Compares two background jobs to determine if they are functionally equal
 * Uses specialized logic based on job status and type to optimize comparison
 */
export function areJobsEqual(
  jobA: BackgroundJob,
  jobB: BackgroundJob
): boolean {
  // Fast path 1: Reference equality (same object)
  if (jobA === jobB) return true;

  // Basic validation - both jobs must exist and have the same ID
  if (!jobA || !jobB) return false;
  if (jobA.id !== jobB.id) return false;

  // Finalization status change always triggers update
  if (jobA.isFinalized !== jobB.isFinalized) {
    return false;
  }

  // Parse metadata once for both jobs
  const metaA = parseMetadata(jobA.metadata);
  const metaB = parseMetadata(jobB.metadata);

  // Check status first - if different, jobs are definitely not equal
  if (jobA.status !== jobB.status) {
    logger.debug(
      `Jobs differ for ${jobA.id}: status changed from ${jobA.status} to ${jobB.status}`
    );
    return false;
  }

  // Check updatedAt timestamp - if unchanged, do quick status-based check
  if (jobA.updatedAt === jobB.updatedAt) {
    // For terminal jobs with identical updatedAt, assume content is stable
    if (JOB_STATUSES.TERMINAL.includes(jobA.status)) {
      logger.debug(
        `Fast equality check for terminal job ${jobA.id} with matching updatedAt`
      );
      return true;
    }

    // For non-running/non-streaming jobs, updatedAt is usually sufficient
    if (jobA.status !== "running") {
      logger.debug(
        `Fast equality check for non-running job ${jobA.id} with matching updatedAt`
      );
      return true;
    }
  }

  // For running jobs, especially streaming ones, check streaming indicators
  if (jobA.status === "running") {
    // Use parsed metadata for type safety
    const jobAIsStreaming = metaA?.taskData?.isStreaming === true;
    const jobBIsStreaming = metaB?.taskData?.isStreaming === true;

    // If streaming status changed, jobs are different
    if (jobAIsStreaming !== jobBIsStreaming) {
        logger.debug(
        `Streaming status changed for job ${jobA.id}`
      );
      return false;
    }

    // Check streaming metrics for all running jobs
    if (metaA?.taskData?.streamProgress !== metaB?.taskData?.streamProgress) {
      logger.debug(
        `Stream progress changed for job ${jobA.id}: ${metaA?.taskData?.streamProgress} → ${metaB?.taskData?.streamProgress}`
      );
      return false;
    }

    if (metaA?.taskData?.responseLength !== metaB?.taskData?.responseLength) {
      logger.debug(
        `Response length changed for job ${jobA.id}: ${metaA?.taskData?.responseLength} → ${metaB?.taskData?.responseLength}`
      );
      return false;
    }


    // For streaming jobs, check crucial streaming indicators
    if (jobAIsStreaming && jobBIsStreaming) {
      // Check streaming progress indicators - prioritize taskData for consistency
      const streamTimeA = metaA?.taskData?.lastStreamUpdateTime || metaA?.lastStreamUpdateTime;
      const streamTimeB = metaB?.taskData?.lastStreamUpdateTime || metaB?.lastStreamUpdateTime;
      // Enhanced check for streaming metrics - all from taskData for consistency
      const responseLengthA = metaA?.taskData?.responseLength;
      const responseLengthB = metaB?.taskData?.responseLength;
      const streamProgressA = metaA?.taskData?.streamProgress;
      const streamProgressB = metaB?.taskData?.streamProgress;
      const estimatedTotalLengthA = metaA?.taskData?.estimatedTotalLength;
      const estimatedTotalLengthB = metaB?.taskData?.estimatedTotalLength;

      // If any streaming metric changed, jobs are different - this triggers UI updates
      if (
        streamTimeA !== streamTimeB ||
        responseLengthA !== responseLengthB ||
        streamProgressA !== streamProgressB ||
        estimatedTotalLengthA !== estimatedTotalLengthB
      ) {
        logger.debug(
          `Streaming metrics changed for job ${jobA.id}:`,
          {
            timeChange:
              streamTimeA !== streamTimeB
                ? `${streamTimeA} → ${streamTimeB}`
                : "unchanged",
            responseLengthChange:
              responseLengthA !== responseLengthB
                ? `${responseLengthA} → ${responseLengthB}`
                : "unchanged",
            streamProgressChange:
              streamProgressA !== streamProgressB
                ? `${streamProgressA} → ${streamProgressB}`
                : "unchanged",
            estimatedTotalLengthChange:
              estimatedTotalLengthA !== estimatedTotalLengthB
                ? `${estimatedTotalLengthA} → ${estimatedTotalLengthB}`
                : "unchanged",
          }
        );
        return false;
      }

      // Skip expensive response comparisons during streaming
      // We rely on metadata (responseLength, streamProgress, lastStreamUpdateTime, estimatedTotalLength)
      // which are already checked above for detecting stream changes.
      // This dramatically reduces CPU usage during rapid streaming updates.
      logger.debug(
        `Skipping response content comparison for streaming job ${jobA.id} - relying on metadata`
      );
    }
  }

  // statusMessage field was removed from backend model


  // For failed/canceled jobs, check error message
  if (jobA.status === "failed" || jobA.status === "canceled") {
    if (!safeStringCompare(jobA.errorMessage, jobB.errorMessage)) {
      logger.debug(
        `Error message changed for job ${jobA.id}`
      );
      return false;
    }
  }

  // Check cost and token fields for all jobs (these can update during streaming)
  if (jobA.actualCost !== jobB.actualCost) {
    logger.debug(
      `Actual cost changed for job ${jobA.id}: ${jobA.actualCost} → ${jobB.actualCost}`
    );
    return false;
  }

  if (jobA.tokensSent !== jobB.tokensSent) {
    logger.debug(
      `Tokens sent changed for job ${jobA.id}: ${jobA.tokensSent} → ${jobB.tokensSent}`
    );
    return false;
  }

  if (jobA.tokensReceived !== jobB.tokensReceived) {
    logger.debug(
      `Tokens received changed for job ${jobA.id}: ${jobA.tokensReceived} → ${jobB.tokensReceived}`
    );
    return false;
  }

  if (jobA.cacheWriteTokens !== jobB.cacheWriteTokens) {
    logger.debug(
      `Cache write tokens changed for job ${jobA.id}: ${jobA.cacheWriteTokens} → ${jobB.cacheWriteTokens}`
    );
    return false;
  }

  if (jobA.cacheReadTokens !== jobB.cacheReadTokens) {
    logger.debug(
      `Cache read tokens changed for job ${jobA.id}: ${jobA.cacheReadTokens} → ${jobB.cacheReadTokens}`
    );
    return false;
  }




  if (jobA.createdAt !== jobB.createdAt) {
    logger.debug(
      `Created at changed for job ${jobA.id}: ${jobA.createdAt} → ${jobB.createdAt}`
    );
    return false;
  }

  if (jobA.startTime !== jobB.startTime) {
    logger.debug(
      `Start time changed for job ${jobA.id}: ${jobA.startTime} → ${jobB.startTime}`
    );
    return false;
  }

  if (jobA.endTime !== jobB.endTime) {
    logger.debug(
      `End time changed for job ${jobA.id}: ${jobA.endTime} → ${jobB.endTime}`
    );
    return false;
  }

  // Task-specific checks
  // For path finder jobs, check pathCount in metadata
  if (jobA.taskType === "extended_path_finder" && jobA.status === "completed") {
    // Compare metadata using parsed objects
    if (metaA?.taskData?.pathCount !== metaB?.taskData?.pathCount) {
      logger.debug(`Path count changed for job ${jobA.id}`);
      return false;
    }
  }

  // Check if metadata has changed in a way that affects the UI
  if (hasMetadataChanged(jobA, jobB)) {
    logger.debug(`Metadata changed for job ${jobA.id}`);
    return false;
  }

  // Skip response content comparison for streaming jobs to improve performance
  const isJobStreaming = jobA.status === "running" && 
    metaA?.taskData?.isStreaming === true;
  
  if (!isJobStreaming) {
    // Response content comparison for non-streaming job types
    if (!safeStringCompare(normalizeJobResponse(jobA.response).content, normalizeJobResponse(jobB.response).content)) {
      logger.debug(
        `Response content changed for job ${jobA.id}`
      );

      // Additional debugging: detect file reference vs content changes
      const aHasFileRef =
        safeResponseIncludes(jobA.response, "Content stored in file:") ||
        safeResponseIncludes(jobA.response, "available in file:");
      const bHasFileRef =
        safeResponseIncludes(jobB.response, "Content stored in file:") ||
        safeResponseIncludes(jobB.response, "available in file:");

      if (aHasFileRef !== bHasFileRef) {
        logger.debug(
          `File reference changed in response: ${aHasFileRef} → ${bHasFileRef}`
        );
      }
      
      return false;
    }

    // Check response field explicitly
    if (!safeStringCompare(jobA.response, jobB.response)) {
      logger.debug(
        `Response content field changed for job ${jobA.id}`
      );
      return false;
    }
  }

  // For debugging, log that jobs are considered equal
  logger.debug(`Jobs considered equal for ${jobA.id}`);

  // All checks passed, jobs are equal
  return true;
}

/**
 * Checks if job metadata has changed in a way that affects UI rendering
 * Focuses on high-priority fields that impact display
 */
export function hasMetadataChanged(
  jobA: BackgroundJob,
  jobB: BackgroundJob
): boolean {
  // Fast path 1: Reference equality check
  if (jobA.metadata === jobB.metadata) return false;

  // Fast path 2: If neither job has metadata, they're equal in this respect
  if (!jobA.metadata && !jobB.metadata) return false;

  // Fast path 3: If one has metadata and the other doesn't, they definitely differ
  if (!jobA.metadata || !jobB.metadata) return true;

  // Parse metadata once for both jobs
  const metaA = parseMetadata(jobA.metadata);
  const metaB = parseMetadata(jobB.metadata);

  // For pathfinder jobs, check pathCount first
  if (jobA.taskType === "extended_path_finder") {
    // For completed path finder jobs, check pathCount
    if (jobA.status === "completed") {
      if (metaA?.taskData?.pathCount !== metaB?.taskData?.pathCount) {
        logger.debug(
          `Path finder job metadata differs: pathCount ${metaA?.taskData?.pathCount} !== ${metaB?.taskData?.pathCount}`
        );
        return true;
      }
    }
  }

  // For streaming jobs, check streaming indicators first
  if (jobA.status === "running") {
    // Check isStreaming flag
    const jobAIsStreaming = metaA?.taskData?.isStreaming === true;
    const jobBIsStreaming = metaB?.taskData?.isStreaming === true;

    if (jobAIsStreaming !== jobBIsStreaming) {
      logger.debug(`Streaming status differs in metadata`);
      return true;
    }

    // Check streaming metrics for all running jobs
    if (metaA?.taskData?.streamProgress !== metaB?.taskData?.streamProgress) {
      logger.debug(
        `Stream progress differs in metadata: ${metaA?.taskData?.streamProgress} !== ${metaB?.taskData?.streamProgress}`
      );
      return true;
    }

    if (metaA?.taskData?.responseLength !== metaB?.taskData?.responseLength) {
      logger.debug(
        `Response length differs in metadata: ${metaA?.taskData?.responseLength} !== ${metaB?.taskData?.responseLength}`
      );
      return true;
    }


    // For active streaming jobs, check critical streaming indicators
    if (jobAIsStreaming) {
      // Check stream update timestamp - this may be in taskData or at root level
      const streamTimeA = metaA?.taskData?.lastStreamUpdateTime || metaA?.lastStreamUpdateTime;
      const streamTimeB = metaB?.taskData?.lastStreamUpdateTime || metaB?.lastStreamUpdateTime;
      
      if (streamTimeA !== streamTimeB) {
        logger.debug(
          `Stream update time differs: ${streamTimeA} !== ${streamTimeB}`
        );
        return true;
      }

      // Check streamProgress for all streaming jobs - use taskData for consistency
      if (metaA?.taskData?.streamProgress !== metaB?.taskData?.streamProgress) {
        logger.debug(
          `Stream progress differs: ${metaA?.taskData?.streamProgress} !== ${metaB?.taskData?.streamProgress}`
        );
        return true;
      }

      // Check response length tracking - use taskData for consistency
      if (metaA?.taskData?.responseLength !== metaB?.taskData?.responseLength) {
        logger.debug(
          `Response length differs in metadata: ${metaA?.taskData?.responseLength} !== ${metaB?.taskData?.responseLength}`
        );
        return true;
      }

      // Check estimated total length - use taskData for consistency
      if (metaA?.taskData?.estimatedTotalLength !== metaB?.taskData?.estimatedTotalLength) {
        logger.debug(
          `Estimated total length differs: ${metaA?.taskData?.estimatedTotalLength} !== ${metaB?.taskData?.estimatedTotalLength}`
        );
        return true;
      }
    }
  }

  // Define fields that are important for UI updates, in priority order
  // These should match what's actually displayed in JobDetails components and JobCard
  const importantFields = [
    // Root-level fields from JobMetadata - core display fields
    "workflowId", // Workflow identifier for workflow jobs
    "workflowStage", // Current stage in workflow
    "sessionId", // Session identifier
    "taskDescription", // Task description
    "projectDirectory", // Project directory path
    "modelUsed", // Model name to display
    "tokensUsed", // Total tokens used
    "actualCost", // Cost information
    "tokensSent", // Input tokens
    "tokensReceived", // Output tokens
    "cacheWriteTokens", // Cache write tokens
    "cacheReadTokens", // Cache read tokens
    
    // Important nested payload fields (from parsedJobPayload)
    "pathCount", // Number of paths found (for path finder)
    "outputPath", // Output file path for workflow results
    "targetField", // Determines which form field gets updated
    "responseFormat", // How response is formatted
    "contentType", // Content type for response display
    "showPureContent", // Flag for content view mode
  ];

  // Define additionalParams fields that are critical for streaming UI updates
  const streamingFields = [
    "isStreaming", // Streaming status flag
    "streamProgress", // Streaming progress percentage - critical for progress bars
    "responseLength", // Current response length for streaming jobs - critical for UI updates
    "estimatedTotalLength", // Estimated total length for progress calculation
    "lastStreamUpdateTime", // Last streaming update timestamp - triggers UI refreshes
    "sessionName", // Session name for display
    "tokensReceived", // Token counts shown in UI
    "tokensSent", // Token counts shown in UI
  ];

  // Define complex object fields that need reference comparison (not deep comparison)
  const complexObjectFields = [
    "planData", // Implementation plan data - reference comparison only
  ];

  // Check each important root-level field efficiently with early returns
  for (const field of importantFields) {
    const valueA = metaA ? (metaA as any)[field] : undefined;
    const valueB = metaB ? (metaB as any)[field] : undefined;

    // Only compare fields that exist in at least one object
    if (valueA !== undefined || valueB !== undefined) {
      // If values differ, metadata has changed
      if (valueA !== valueB) {
        logger.debug(
          `Metadata differs for ${field}: ${String(valueA)} !== ${String(valueB)}`
        );
        return true;
      }
    }
  }

  // Check streaming-related fields in taskData for running jobs
  if (jobA.status === "running" || metaA?.taskData?.isStreaming || metaB?.taskData?.isStreaming) {
    for (const field of streamingFields) {
      const valueA = metaA?.taskData ? (metaA.taskData as any)[field] : undefined;
      const valueB = metaB?.taskData ? (metaB.taskData as any)[field] : undefined;

      if (valueA !== undefined || valueB !== undefined) {
        if (valueA !== valueB) {
          logger.debug(
            `Metadata differs for taskData.${field}: ${String(valueA)} !== ${String(valueB)}`
          );
          return true;
        }
      }
    }
  }

  // Check complex object fields in taskData with efficient reference comparison
  for (const field of complexObjectFields) {
    const valueA = metaA?.taskData ? (metaA.taskData as any)[field] : undefined;
    const valueB = metaB?.taskData ? (metaB.taskData as any)[field] : undefined;
    
    // Reference comparison only - these objects should be treated as immutable
    if (valueA !== valueB) {
      logger.debug(
        `Metadata differs for taskData.${field}: reference changed`
      );
      return true;
    }
  }

  // All checks passed, metadata is considered unchanged for UI purposes
  return false;
}

/**
 * Compares two arrays of background jobs for equality
 * Uses optimized strategies based on array size
 */
export function areJobArraysEqual(
  arrA: BackgroundJob[],
  arrB: BackgroundJob[]
): boolean {
  // Compare lengths first for a quick check
  if (arrA.length !== arrB.length) {
    logger.debug(
      `Job arrays differ in length: ${arrA.length} vs ${arrB.length}`
    );
    return false;
  }

  // Empty arrays are equal
  if (arrA.length === 0) return true;

  // Fast path: Direct reference equality check
  if (arrA === arrB) return true;

  // For very small arrays (1-2 items), a linear search is faster than Map creation
  if (arrA.length <= 2) {
    // Check if all jobs match by ID and content
    for (const jobA of arrA) {
      const jobB = arrB.find((job) => job.id === jobA.id);

      if (!jobB || !areJobsEqual(jobA, jobB)) {
        logger.debug(
          `Small array mismatch for job ${jobA.id}`
        );
        return false;
      }
    }
    return true;
  }

  // Create maps of jobs by ID for efficient lookup and comparison
  const jobsMapA = new Map(arrA.map((job) => [job.id, job]));
  const jobsMapB = new Map(arrB.map((job) => [job.id, job]));

  // Check for job IDs differences (missing in either array)
  if (jobsMapA.size !== jobsMapB.size) return false;

  // First check if the set of IDs is the same (without recursion)
  const jobIdsA = new Set(jobsMapA.keys());
  const jobIdsB = new Set(jobsMapB.keys());

  // Quick check if sets have different sizes
  if (jobIdsA.size !== jobIdsB.size) return false;

  // Check if all IDs in A exist in B
  for (const jobId of jobIdsA) {
    if (!jobIdsB.has(jobId)) {
      logger.debug(
        `Job ${jobId} exists in array A but not in array B`
      );
      return false;
    }
  }

  // At this point, both arrays have the same job IDs
  // Look for active jobs first - they're most likely to change during polling
  const activeJobs = arrA.filter((job) =>
    JOB_STATUSES.ACTIVE.includes(job.status)
  );

  // If there are active jobs, check them first for early exit
  for (const jobA of activeJobs) {
    const jobB = jobsMapB.get(jobA.id);
    // We know jobB exists because we checked the IDs above
    if (!areJobsEqual(jobA, jobB!)) {
      logger.debug(`Active job differs: ${jobA.id}`);
      return false;
    }
  }

  // Then check the remaining jobs (completed/failed/canceled)
  const terminalJobs = arrA.filter(
    (job) => !JOB_STATUSES.ACTIVE.includes(job.status)
  );

  for (const jobA of terminalJobs) {
    const jobB = jobsMapB.get(jobA.id);
    // We know jobB exists because we checked the IDs above
    if (!areJobsEqual(jobA, jobB!)) {
      logger.debug(`Terminal job differs: ${jobA.id}`);
      return false;
    }
  }

  // All jobs are equal
  return true;
}

// Job termination status check is now in job-status-utils.ts