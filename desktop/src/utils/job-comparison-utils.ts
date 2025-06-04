"use client";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { createLogger } from "@/utils/logger";
import { safeStringCompare } from "@/utils/string-utils";
import { getParsedMetadata } from "@/app/components/background-jobs-sidebar/utils";

const logger = createLogger({ namespace: "JobComparison" });

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

  // Parse metadata once for both jobs
  const metaA = getParsedMetadata(jobA.metadata);
  const metaB = getParsedMetadata(jobB.metadata);

  // Fast path 2: Check status first - if different, jobs are definitely not equal
  if (jobA.status !== jobB.status) {
    logger.debug(
      `Jobs differ for ${jobA.id}: status changed from ${jobA.status} to ${jobB.status}`
    );
    return false;
  }

  // Fast path 3: Check updatedAt timestamp - if unchanged, do quick status-based check
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
    const jobAIsStreaming = metaA?.additionalParams?.isStreaming === true;
    const jobBIsStreaming = metaB?.additionalParams?.isStreaming === true;

    // If streaming status changed, jobs are different
    if (jobAIsStreaming !== jobBIsStreaming) {
        logger.debug(
        `Streaming status changed for job ${jobA.id}`
      );
      return false;
    }

    // Special check for implementation plan jobs - these need to be checked more carefully
    if (jobA.taskType === "implementation_plan") {
      // Always check these critical fields for implementation plans - use additionalParams for consistency
      const streamProgressA = metaA?.additionalParams?.streamProgress;
      const streamProgressB = metaB?.additionalParams?.streamProgress;

      if (streamProgressA !== streamProgressB) {
        logger.debug(
          `Implementation plan streaming progress changed: ${streamProgressA} → ${streamProgressB}`
        );
        return false;
      }

      // Check response length for implementation plans specifically
      const responseLengthA = metaA?.additionalParams?.responseLength;
      const responseLengthB = metaB?.additionalParams?.responseLength;

      if (responseLengthA !== responseLengthB) {
        logger.debug(
          `Implementation plan response length changed: ${responseLengthA} → ${responseLengthB}`
        );
        return false;
      }

      // Special handling for when we have response content that has been updated
      if (jobA.response !== jobB.response) {
        const lengthA = jobA.response?.length || 0;
        const lengthB = jobB.response?.length || 0;

        if (lengthA !== lengthB) {
          logger.debug(
            `Implementation plan response content length changed: ${lengthA} → ${lengthB}`
          );
          return false;
        }
      }
    }

    // For streaming jobs, check crucial streaming indicators
    if (jobAIsStreaming && jobBIsStreaming) {
      // Check streaming progress indicators - prioritize additionalParams for consistency
      const streamTimeA = metaA?.additionalParams?.lastStreamUpdateTime || metaA?.lastStreamUpdateTime;
      const streamTimeB = metaB?.additionalParams?.lastStreamUpdateTime || metaB?.lastStreamUpdateTime;
      const charsA = jobA.charsReceived;
      const charsB = jobB.charsReceived;
      const tokensA = jobA.tokensReceived;
      const tokensB = jobB.tokensReceived;

      // Enhanced check for streaming metrics - all from additionalParams for consistency
      const responseLengthA = metaA?.additionalParams?.responseLength;
      const responseLengthB = metaB?.additionalParams?.responseLength;
      const streamProgressA = metaA?.additionalParams?.streamProgress;
      const streamProgressB = metaB?.additionalParams?.streamProgress;
      const estimatedTotalLengthA = metaA?.additionalParams?.estimatedTotalLength;
      const estimatedTotalLengthB = metaB?.additionalParams?.estimatedTotalLength;

      // If any streaming metric changed, jobs are different - this triggers UI updates
      if (
        streamTimeA !== streamTimeB ||
        charsA !== charsB ||
        tokensA !== tokensB ||
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
            charsChange:
              charsA !== charsB ? `${charsA} → ${charsB}` : "unchanged",
            tokensChange:
              tokensA !== tokensB ? `${tokensA} → ${tokensB}` : "unchanged",
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

      // Enhanced response content comparison for streaming jobs
      if (
        typeof jobA.response === "string" &&
        typeof jobB.response === "string"
      ) {
        // Length comparison is faster than content comparison
        if (jobA.response.length !== jobB.response.length) {
          logger.debug(
            `Response length changed for job ${jobA.id}: ${jobA.response.length} → ${jobB.response.length}`
          );
          return false;
        }

        // For relatively short responses, compare content directly
        // This catches character changes even when length is identical
        if (jobA.response.length < 5000 && jobA.response !== jobB.response) {
          logger.debug(
            `Response content changed for streaming job ${jobA.id} despite same length`
          );
          return false;
        }
      }
    }
  }

  // Efficient status message comparison
  if (!safeStringCompare(jobA.statusMessage, jobB.statusMessage)) {
    logger.debug(
      `Status message changed for job ${jobA.id}`
    );
    return false;
  }


  // For failed/canceled jobs, check error message
  if (jobA.status === "failed" || jobA.status === "canceled") {
    if (!safeStringCompare(jobA.errorMessage, jobB.errorMessage)) {
      logger.debug(
        `Error message changed for job ${jobA.id}`
      );
      return false;
    }
  }

  // Task-specific checks
  // For path finder jobs, check pathCount in metadata
  if (jobA.taskType === "path_finder" && jobA.status === "completed") {
    // Compare metadata using parsed objects
    if (metaA?.additionalParams?.pathCount !== metaB?.additionalParams?.pathCount) {
      logger.debug(`Path count changed for job ${jobA.id}`);
      return false;
    }
  }

  // Check if metadata has changed in a way that affects the UI
  if (hasMetadataChanged(jobA, jobB)) {
    logger.debug(`Metadata changed for job ${jobA.id}`);
    return false;
  }

  // Response content comparison for all job types
  if (!safeStringCompare(jobA.response, jobB.response)) {
    logger.debug(
      `Response content changed for job ${jobA.id}`
    );

    // Additional debugging: detect file reference vs content changes
    const aHasFileRef =
      jobA.response?.includes("Content stored in file:") ||
      jobA.response?.includes("available in file:");
    const bHasFileRef =
      jobB.response?.includes("Content stored in file:") ||
      jobB.response?.includes("available in file:");

    if (aHasFileRef !== bHasFileRef) {
      logger.debug(
        `File reference changed in response: ${aHasFileRef} → ${bHasFileRef}`
      );
    }
    
    return false;
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
  const metaA = getParsedMetadata(jobA.metadata);
  const metaB = getParsedMetadata(jobB.metadata);

  // Check for regex patterns in completed jobs (especially for regex generation tasks)
  if (jobA.status === "completed") {
    // Check if parsedJsonData exists in only one of the jobs
    const hasRegexPatternsA = metaA?.additionalParams?.parsedJsonData !== undefined;
    const hasRegexPatternsB = metaB?.additionalParams?.parsedJsonData !== undefined;

    if (hasRegexPatternsA !== hasRegexPatternsB) {
      logger.debug(
        `Metadata differs: regexPatterns presence mismatch for job ${jobA.id}`
      );
      return true;
    }

    // If both have regexPatterns, compare the references
    if (
      hasRegexPatternsA &&
      hasRegexPatternsB &&
      metaA?.additionalParams?.parsedJsonData !== metaB?.additionalParams?.parsedJsonData
    ) {
      logger.debug(
        `Metadata differs: regexPatterns changed for job ${jobA.id}`
      );
      return true;
    }
  }

  // For pathfinder jobs, check pathData and pathCount first
  if (jobA.taskType === "path_finder") {
    // For completed path finder jobs, check pathCount
    if (jobA.status === "completed") {
      if (metaA?.additionalParams?.pathCount !== metaB?.additionalParams?.pathCount) {
        logger.debug(
          `Path finder job metadata differs: pathCount ${metaA?.additionalParams?.pathCount} !== ${metaB?.additionalParams?.pathCount}`
        );
        return true;
      }

      // If pathData is present in only one, they differ
      const hasPathDataA = metaA?.additionalParams?.pathData !== undefined;
      const hasPathDataB = metaB?.additionalParams?.pathData !== undefined;

      if (hasPathDataA !== hasPathDataB) {
        logger.debug(
          `Path finder job metadata differs: pathData presence mismatch`
        );
        return true;
      }

      // If both have pathData, compare the structures (but not deeply, just check if they're equal references)
      if (
        hasPathDataA &&
        hasPathDataB &&
        metaA?.additionalParams?.pathData !== metaB?.additionalParams?.pathData
      ) {
        logger.debug(
          `Path finder job metadata differs: pathData reference changes`
        );
        return true;
      }
    }
  }

  // For streaming jobs, check streaming indicators first
  if (jobA.status === "running") {
    // Check isStreaming flag
    const jobAIsStreaming = metaA?.additionalParams?.isStreaming === true;
    const jobBIsStreaming = metaB?.additionalParams?.isStreaming === true;

    if (jobAIsStreaming !== jobBIsStreaming) {
      logger.debug(`Streaming status differs in metadata`);
      return true;
    }

    // Special handling for implementation plan jobs
    if (jobA.taskType === "implementation_plan") {
      // Check all relevant streaming fields for implementation plans specifically
      // These are all critical for proper UI updates - use additionalParams for consistency

      // Check streamProgress
      if (metaA?.additionalParams?.streamProgress !== metaB?.additionalParams?.streamProgress) {
        logger.debug(
          `Implementation plan stream progress differs: ${metaA?.additionalParams?.streamProgress} !== ${metaB?.additionalParams?.streamProgress}`
        );
        return true;
      }

      // Check response length (critically important for UI updates)
      if (metaA?.additionalParams?.responseLength !== metaB?.additionalParams?.responseLength) {
        logger.debug(
          `Implementation plan response length differs: ${metaA?.additionalParams?.responseLength} !== ${metaB?.additionalParams?.responseLength}`
        );
        return true;
      }

      // Check session name for implementation plans (used for display)
      if (metaA?.additionalParams?.sessionName !== metaB?.additionalParams?.sessionName) {
        logger.debug(
          `Implementation plan session name differs`
        );
        return true;
      }
    }

    // For active streaming jobs, check critical streaming indicators
    if (jobAIsStreaming) {
      // Check stream update timestamp - this may be in additionalParams or at root level
      const streamTimeA = metaA?.additionalParams?.lastStreamUpdateTime || metaA?.lastStreamUpdateTime;
      const streamTimeB = metaB?.additionalParams?.lastStreamUpdateTime || metaB?.lastStreamUpdateTime;
      
      if (streamTimeA !== streamTimeB) {
        logger.debug(
          `Stream update time differs: ${streamTimeA} !== ${streamTimeB}`
        );
        return true;
      }

      // Check streamProgress for all streaming jobs - use additionalParams for consistency
      if (metaA?.additionalParams?.streamProgress !== metaB?.additionalParams?.streamProgress) {
        logger.debug(
          `Stream progress differs: ${metaA?.additionalParams?.streamProgress} !== ${metaB?.additionalParams?.streamProgress}`
        );
        return true;
      }

      // Check response length tracking - use additionalParams for consistency
      if (metaA?.additionalParams?.responseLength !== metaB?.additionalParams?.responseLength) {
        logger.debug(
          `Response length differs in metadata: ${metaA?.additionalParams?.responseLength} !== ${metaB?.additionalParams?.responseLength}`
        );
        return true;
      }

      // Check estimated total length - use additionalParams for consistency
      if (metaA?.additionalParams?.estimatedTotalLength !== metaB?.additionalParams?.estimatedTotalLength) {
        logger.debug(
          `Estimated total length differs: ${metaA?.additionalParams?.estimatedTotalLength} !== ${metaB?.additionalParams?.estimatedTotalLength}`
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
    "charsReceived", // Character counts for display
  ];

  // Define complex object fields that need reference comparison (not deep comparison)
  const complexObjectFields = [
    "parsedJsonData", // Regex patterns and other parsed JSON - reference comparison only
    "pathData", // Path finder results data - reference comparison only
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

  // Check streaming-related fields in additionalParams for running jobs
  if (jobA.status === "running" || metaA?.additionalParams?.isStreaming || metaB?.additionalParams?.isStreaming) {
    for (const field of streamingFields) {
      const valueA = metaA?.additionalParams ? (metaA.additionalParams as any)[field] : undefined;
      const valueB = metaB?.additionalParams ? (metaB.additionalParams as any)[field] : undefined;

      if (valueA !== undefined || valueB !== undefined) {
        if (valueA !== valueB) {
          logger.debug(
            `Metadata differs for additionalParams.${field}: ${String(valueA)} !== ${String(valueB)}`
          );
          return true;
        }
      }
    }
  }

  // Check complex object fields in additionalParams with efficient reference comparison
  for (const field of complexObjectFields) {
    const valueA = metaA?.additionalParams ? (metaA.additionalParams as any)[field] : undefined;
    const valueB = metaB?.additionalParams ? (metaB.additionalParams as any)[field] : undefined;
    
    // Reference comparison only - these objects should be treated as immutable
    if (valueA !== valueB) {
      logger.debug(
        `Metadata differs for additionalParams.${field}: reference changed`
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
