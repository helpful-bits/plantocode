import { type ApiType, type JobMetadata } from "@/types/session-types";
import { type TaskType, TaskTypeDetails } from "@/types/task-type-defs";
import { formatTimeAgo as formatTimeAgoUtil } from "@/utils/date-utils";
import { validateTaskTypeWithConfiguration } from "@/utils/task-type-validation";

/**
 * Helper function to safely parse job metadata
 * Simplified to be more robust - returns any valid object or parsed JSON
 * Lets consuming components handle property presence/absence
 */
export const getParsedMetadata = (
  metadataInput: JobMetadata | string | null | undefined
): JobMetadata | null => {
  if (!metadataInput) return null;
  
  // If already an object, return it directly
  if (typeof metadataInput === 'object' && metadataInput !== null) {
    return metadataInput as JobMetadata;
  }
  
  // If string, attempt to parse as JSON
  if (typeof metadataInput === 'string') {
    // Handle empty strings gracefully
    if (metadataInput.trim() === '') {
      return null;
    }
    
    try {
      const parsed = JSON.parse(metadataInput);
      
      // Return parsed result if it's a valid object
      if (parsed && typeof parsed === 'object') {
        return parsed as JobMetadata;
      }
      
      return null;
    } catch (e) {
      console.warn("Failed to parse job metadata JSON string:", e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  
  return null;
};


/**
 * Returns the icon name for a job status
 */
export function getStatusIconName(status: string): string {
  switch (status) {
    case "completed":
    case "completed_by_tag":
      return "check-circle";
    case "failed":
      return "alert-circle";
    case "running":
    case "processing_stream":
      return "loader";
    case "canceled":
      return "x-circle";
    case "preparing":
    case "created":
    case "queued":
    case "idle":
    case "preparing_input":
    case "generating_stream":
      return "clock";
    default:
      return "clock";
  }
}

/**
 * Returns the class names for status icons
 */
export function getStatusIconClass(status: string): string {
  switch (status) {
    case "completed":
    case "completed_by_tag":
      return "h-3 w-3 text-success";
    case "failed":
      return "h-3 w-3 text-destructive";
    case "running":
    case "processing_stream":
      return "h-3 w-3 text-primary animate-spin";
    case "canceled":
      return "h-3 w-3 text-warning";
    case "preparing":
    case "created":
    case "queued":
    case "idle":
    case "preparing_input":
    case "generating_stream":
      return "h-3 w-3 text-info";
    default:
      return "h-3 w-3 text-muted-foreground";
  }
}

/**
 * Returns the class names for API type badges
 */
export function getApiTypeBadgeClasses(apiType: ApiType): string {
  let color = "text-primary-foreground";
  let bgColor = "bg-primary/80";

  switch (apiType.toLowerCase()) {
    case "google":
      color = "text-success-foreground";
      bgColor = "bg-success";
      break;
    case "claude":
      color = "text-info-foreground";
      bgColor = "bg-info";
      break;
    case "openai":
      color = "text-primary-foreground";
      bgColor = "bg-primary";
      break;
    case "replicate":
      color = "text-warning-foreground";
      bgColor = "bg-warning";
      break;
  }

  return `text-[10px] ${color} ${bgColor}`;
}

/**
 * Returns the formatted API type text
 */
export function formatApiType(apiType: ApiType): string {
  return apiType.charAt(0).toUpperCase() + apiType.slice(1).toLowerCase();
}

/**
 * Returns human-readable task type using consolidated TaskTypeDetails
 * STRICT: NO FALLBACKS - Invalid task types cause immediate failure
 */
export function formatTaskType(taskType: TaskType): string {
  // STRICT: Use comprehensive validation - NO FALLBACKS
  const validatedTaskType = validateTaskTypeWithConfiguration(taskType);
  const taskDetails = TaskTypeDetails[validatedTaskType];
  return taskDetails.displayName;
}

/**
 * Returns human-readable status text
 */
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    idle: "Idle",
    created: "Created", 
    queued: "Queued",
    acknowledgedByWorker: "Acknowledged",
    preparing: "Preparing",
    preparingInput: "Preparing Input",
    generatingStream: "Generating",
    processingStream: "Processing Stream",
    running: "Running",
    completedByTag: "Completed",
    completed: "Completed",
    failed: "Failed",
    canceled: "Canceled",
  };
  
  return statusMap[status] || status;
}

/**
 * Format timestamp to relative time using the utility function from date-utils
 */
export function formatTimeAgo(timestamp: number): string {
  return formatTimeAgoUtil(timestamp);
}

/**
 * Format token count for display with better handling of edge cases
 */
export function formatTokenCount(count?: number | null): string {
  // Handle undefined, null, NaN, or non-positive numbers
  if (count === undefined || count === null || isNaN(count) || count <= 0) {
    return "0";
  }

  // Format large numbers with K suffix
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }

  // Format small numbers as integers
  return Math.round(count).toString();
}

/**
 * Truncate text with ellipsis if it exceeds maxLength
 */
export function truncateText(text: string, maxLength = 50): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Calculate streaming progress value based on available metadata
 * Simplified to rely primarily on streamProgress from job metadata
 * Shows indeterminate progress if unavailable
 */
export function getStreamingProgressValue(
  metadataInput: JobMetadata | string | null | undefined
): number | undefined {
  // Parse metadata to ensure consistent structure
  const parsedMetadata = getParsedMetadata(metadataInput);
  
  // Check both taskData and top-level metadata for progress fields
  const taskData = parsedMetadata?.taskData;
  const topLevel = parsedMetadata;
  
  // Priority 1: Use explicit streamProgress if available and valid
  const streamProgress = taskData?.streamProgress ?? topLevel?.streamProgress;
  if (
    typeof streamProgress === "number" &&
    !isNaN(streamProgress) &&
    streamProgress >= 0 &&
    streamProgress <= 100
  ) {
    return Math.min(streamProgress, 100);
  }

  // Priority 2: For workflow jobs, check if there's a stage-based progress
  if (topLevel?.workflowId) {
    const progressPercentage = topLevel.progressPercentage;
    
    if (typeof progressPercentage === "number" && progressPercentage >= 0 && progressPercentage <= 100) {
      return progressPercentage;
    }
    
    // Estimate progress based on workflow stage
    const workflowStage = topLevel.workflowStage;
    if (typeof workflowStage === "string") {
      const stageProgressMap: Record<string, number> = {
        "REGEX_FILE_FILTER": 25,
        "FILE_RELEVANCE_ASSESSMENT": 50,
        "EXTENDED_PATH_FINDER": 75,
        "PATH_CORRECTION": 90
      };
      return stageProgressMap[workflowStage] ?? 10;
    }
  }

  // Return undefined to show indeterminate progress if no progress data available
  return undefined;
}


/**
 * Get streaming status from metadata
 * Checks if a job is currently streaming based on metadata flags
 */
export function getStreamingStatus(metadataInput: JobMetadata | string | null | undefined): boolean {
  const parsedMetadata = getParsedMetadata(metadataInput);
  const taskData = parsedMetadata?.taskData;
  
  if (!taskData || typeof taskData !== 'object') {
    return false;
  }
  
  const isStreaming = taskData.isStreaming;
  return typeof isStreaming === 'boolean' ? isStreaming : false;
}

/**
 * Get stream timing information from metadata
 * Returns stream start time and last update time if available
 */
export function getStreamTiming(metadataInput: JobMetadata | string | null | undefined): {
  streamStartTime?: number;
  lastStreamUpdateTime?: number;
} {
  const parsedMetadata = getParsedMetadata(metadataInput);
  const taskData = parsedMetadata?.taskData;
  
  if (!taskData || typeof taskData !== 'object') {
    return {};
  }
  
  const result: { streamStartTime?: number; lastStreamUpdateTime?: number } = {};
  
  const streamStartTime = taskData.streamStartTime;
  if (typeof streamStartTime === 'number' && !isNaN(streamStartTime) && streamStartTime > 0) {
    result.streamStartTime = streamStartTime;
  }
  
  const lastStreamUpdateTime = taskData.lastStreamUpdateTime;
  if (typeof lastStreamUpdateTime === 'number' && !isNaN(lastStreamUpdateTime) && lastStreamUpdateTime > 0) {
    result.lastStreamUpdateTime = lastStreamUpdateTime;
  }
  
  return result;
}

/**
 * Get estimated remaining time from metadata
 * Returns estimated remaining milliseconds if available
 */
export function getEstimatedRemainingTime(metadataInput: JobMetadata | string | null | undefined): number | undefined {
  const parsedMetadata = getParsedMetadata(metadataInput);
  const taskData = parsedMetadata?.taskData;
  
  if (!taskData || typeof taskData !== 'object') {
    return undefined;
  }
  
  const estimatedRemainingMs = taskData.estimatedRemainingMs;
  if (typeof estimatedRemainingMs === 'number' && !isNaN(estimatedRemainingMs) && estimatedRemainingMs >= 0) {
    return estimatedRemainingMs;
  }
  
  return undefined;
}

/**
 * Extract original text from text improvement task metadata
 * Used for displaying transcribed text in text improvement job cards
 */
export function getTextImprovementOriginalText(metadataInput: JobMetadata | string | null | undefined): string | null {
  const parsedMetadata = getParsedMetadata(metadataInput);
  
  if (!parsedMetadata) return null;
  
  try {
    // Navigate to jobPayloadForWorker
    const jobPayloadForWorker = parsedMetadata.jobPayloadForWorker;
    if (!jobPayloadForWorker || typeof jobPayloadForWorker !== 'object') {
      return null;
    }

    // Check for TextImprovement (exact case)
    let textImprovement = jobPayloadForWorker.TextImprovement;
    
    // If not found, check for textImprovement (camelCase variant)
    if (!textImprovement) {
      textImprovement = jobPayloadForWorker.textImprovement;
    }

    if (!textImprovement || typeof textImprovement !== 'object') {
      return null;
    }

    // Extract text_to_improve
    const textToImprove = textImprovement.text_to_improve;
    
    // Validate that the text is a string and not empty
    if (typeof textToImprove !== 'string') {
      return null;
    }

    // Return trimmed text or null if empty/whitespace
    const trimmedText = textToImprove.trim();
    return trimmedText.length > 0 ? trimmedText : null;
  } catch (error) {
    // Handle any unexpected errors gracefully
    console.warn('Error extracting text improvement original text:', error);
    return null;
  }
}
