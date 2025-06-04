import { type ApiType, type JobMetadata } from "@/types/session-types";
import { type TaskType, TaskTypeDetails } from "@/types/task-type-defs";
import { formatTimeAgo as formatTimeAgoUtil } from "@/utils/date-utils";

/**
 * Helper function to safely parse job metadata
 * Handles only the modern JobWorkerMetadata structure
 * Ensures all UI components consistently use the standardized JobMetadata interface
 */
export const getParsedMetadata = (
  metadataInput: JobMetadata | string | null | undefined
): JobMetadata | null => {
  if (!metadataInput) return null;
  
  // If already an object, check if it's the modern JobWorkerMetadata structure
  if (typeof metadataInput === 'object' && metadataInput !== null) {
    const metadata = metadataInput as any;
    
    // Only accept the modern JobWorkerMetadata structure
    if (metadata.jobTypeForWorker && metadata.jobPayloadForWorker && metadata.jobPriorityForWorker !== undefined) {
      // Convert JobWorkerMetadata to JobMetadata format for UI consumption
      return convertJobWorkerMetadataToJobMetadata(metadata);
    }
    
    // Invalid or outdated metadata format
    console.warn("Invalid metadata format - only modern JobWorkerMetadata structure is supported:", metadata);
    return null;
  }
  
  // If string, attempt to parse as JSON (must be JobWorkerMetadata format)
  if (typeof metadataInput === 'string') {
    // Handle empty strings gracefully
    if (metadataInput.trim() === '') {
      return null;
    }
    
    // Check if string looks like JSON (starts with { or [)
    const trimmed = metadataInput.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      console.warn("Metadata string is not JSON format:", metadataInput.substring(0, 100));
      return null;
    }
    
    try {
      const parsed = JSON.parse(metadataInput);
      
      // Validate that parsed result is an object and not null
      if (!parsed || typeof parsed !== 'object') {
        console.warn("Parsed metadata is not a valid object:", parsed);
        return null;
      }
      
      // Only accept the modern JobWorkerMetadata structure
      if (parsed.jobTypeForWorker && parsed.jobPayloadForWorker && parsed.jobPriorityForWorker !== undefined) {
        return convertJobWorkerMetadataToJobMetadata(parsed);
      }
      
      // Invalid or outdated metadata format
      console.warn("Invalid metadata format - only modern JobWorkerMetadata structure is supported:", parsed);
      return null;
    } catch (e) {
      console.warn("Failed to parse job metadata JSON string:", e instanceof Error ? e.message : String(e), "String preview:", metadataInput.substring(0, 100));
      return null;
    }
  }
  
  return null;
};

/**
 * Convert JobWorkerMetadata structure to JobMetadata for UI consumption
 * Handles only the modern JobWorkerMetadata structure from the backend
 * Maps backend snake_case fields (additional_params) to frontend camelCase (additionalParams)
 */
function convertJobWorkerMetadataToJobMetadata(workerMetadata: any): JobMetadata {
  let result: JobMetadata = {};

  // Set root fields from JobWorkerMetadata
  if (workerMetadata.jobTypeForWorker) result.jobTypeForWorker = workerMetadata.jobTypeForWorker;
  if (typeof workerMetadata.jobPriorityForWorker === 'number') result.jobPriorityForWorker = workerMetadata.jobPriorityForWorker;
  if (workerMetadata.workflowId) result.workflowId = workerMetadata.workflowId;
  if (workerMetadata.workflowStage) result.workflowStage = workerMetadata.workflowStage;

  // Handle additionalParams from either snake_case (backend) or camelCase (already converted) field names
  // The backend sends 'additional_params' but Tauri might convert it to 'additionalParams'
  const additionalParams = workerMetadata.additionalParams || workerMetadata.additional_params;
  if (additionalParams && typeof additionalParams === 'object') {
    result.additionalParams = additionalParams as Record<string, any>;
  } else {
    result.additionalParams = {} as Record<string, any>;
  }

  // Store the full nested payload structure for advanced access
  result.jobPayloadForWorker = workerMetadata.jobPayloadForWorker;
  if (workerMetadata.jobPayloadForWorker) {
    if (typeof workerMetadata.jobPayloadForWorker === 'string') {
      try {
        result.parsedJobPayload = JSON.parse(workerMetadata.jobPayloadForWorker);
      } catch (e) {
        console.warn("Failed to parse jobPayloadForWorker:", e);
        result.parsedJobPayload = workerMetadata.jobPayloadForWorker;
      }
    } else {
      result.parsedJobPayload = workerMetadata.jobPayloadForWorker;
    }
  }

  // Extract commonly used fields from jobPayloadForWorker.data for UI convenience
  if (result.parsedJobPayload && result.parsedJobPayload.data) {
    const data = result.parsedJobPayload.data as any;
    if (data.backgroundJobId) result.backgroundJobId = data.backgroundJobId;
    if (data.sessionId) result.sessionId = data.sessionId;
    if (data.taskDescription) result.taskDescription = data.taskDescription;
    if (data.projectDirectory) result.projectDirectory = data.projectDirectory;
  }

  return result;
}

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
    case "gemini":
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
    case "groq":
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
 */
export function formatTaskType(taskType: TaskType): string {
  // If taskType is undefined or null, return 'Unknown Task'
  if (!taskType) return "Unknown Task";

  // Use the displayName from TaskTypeDetails if available
  const taskDetails = TaskTypeDetails[taskType];
  if (taskDetails?.displayName) {
    return taskDetails.displayName;
  }

  // All task types should be defined in TaskTypeDetails
  throw new Error(`Task type '${taskType}' not found in TaskTypeDetails - add it to the enum`);
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
 * Used for progress bars to show consistent progress across components
 * Robustly accesses fields from the standardized JobMetadata structure
 */
export function getStreamingProgressValue(
  metadataInput: JobMetadata | string | null | undefined,
  startTime?: number | null,
  jobMaxOutputTokens?: number | null
): number | undefined {
  // Parse metadata to ensure consistent structure
  const parsedMetadata = getParsedMetadata(metadataInput);
  
  // Ensure additionalParams exists and is an object
  const additionalParams = parsedMetadata?.additionalParams;
  if (!additionalParams || typeof additionalParams !== 'object') {
    // Try time-based fallback if we have no metadata but have startTime
    return getTimeBasedFallbackProgress(startTime);
  }
  
  // Priority 1: Use explicit streamProgress if available and valid
  const streamProgress = additionalParams.streamProgress;
  if (
    typeof streamProgress === "number" &&
    !isNaN(streamProgress) &&
    streamProgress >= 0 &&
    streamProgress <= 100
  ) {
    // Cap at 99% to avoid showing 100% before job completion
    return Math.min(streamProgress, 99);
  }

  // Priority 2: Calculate based on responseLength and estimatedTotalLength from additionalParams
  const responseLength = additionalParams.responseLength;
  const estimatedTotalLength = additionalParams.estimatedTotalLength;
  
  if (
    typeof responseLength === "number" &&
    typeof estimatedTotalLength === "number" &&
    estimatedTotalLength > 0 &&
    responseLength >= 0 &&
    !isNaN(responseLength) &&
    !isNaN(estimatedTotalLength)
  ) {
    const calculatedProgress = (responseLength / estimatedTotalLength) * 100;
    // Ensure the calculated progress is reasonable (allow up to 200% for overruns)
    if (calculatedProgress >= 0 && calculatedProgress <= 200 && !isNaN(calculatedProgress)) {
      // Cap at 99% for running jobs to avoid premature 100%
      return Math.min(calculatedProgress, 99);
    }
  }

  // Priority 3: Calculate based on responseLength and jobMaxOutputTokens with chars-per-token heuristic
  if (
    typeof responseLength === "number" &&
    typeof jobMaxOutputTokens === "number" &&
    jobMaxOutputTokens > 0 &&
    responseLength >= 0 &&
    !isNaN(responseLength) &&
    !isNaN(jobMaxOutputTokens)
  ) {
    // Use 3.5 chars per token as a reasonable heuristic for most models
    const estimatedTotalLengthFromTokens = jobMaxOutputTokens * 3.5;
    const calculatedProgress = (responseLength / estimatedTotalLengthFromTokens) * 100;
    if (calculatedProgress >= 0 && calculatedProgress <= 200 && !isNaN(calculatedProgress)) {
      // Cap at 99% for running jobs to avoid premature 100%
      return Math.min(calculatedProgress, 99);
    }
  }

  // Priority 4: Time-based fallback for initial animation
  return getTimeBasedFallbackProgress(startTime);
}

/**
 * Helper function for time-based progress fallback
 * Extracted for reusability and cleaner code
 */
function getTimeBasedFallbackProgress(startTime?: number | null): number | undefined {
  if (typeof startTime === "number" && startTime > 0 && !isNaN(startTime)) {
    const elapsedMs = Date.now() - startTime;
    // Show very small, slow-growing progress to indicate minimal activity
    if (elapsedMs > 0) {
      const timeBasedProgress = (elapsedMs / 1000) * 0.1;
      return Math.min(timeBasedProgress, 5);
    }
  }
  
  // No valid progress data available - return undefined to let components handle fallback
  return undefined;
}

/**
 * Get streaming status from metadata
 * Checks if a job is currently streaming based on metadata flags
 */
export function getStreamingStatus(metadataInput: JobMetadata | string | null | undefined): boolean {
  const parsedMetadata = getParsedMetadata(metadataInput);
  const additionalParams = parsedMetadata?.additionalParams;
  
  if (!additionalParams || typeof additionalParams !== 'object') {
    return false;
  }
  
  const isStreaming = additionalParams.isStreaming;
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
  const additionalParams = parsedMetadata?.additionalParams;
  
  if (!additionalParams || typeof additionalParams !== 'object') {
    return {};
  }
  
  const result: { streamStartTime?: number; lastStreamUpdateTime?: number } = {};
  
  const streamStartTime = additionalParams.streamStartTime;
  if (typeof streamStartTime === 'number' && !isNaN(streamStartTime) && streamStartTime > 0) {
    result.streamStartTime = streamStartTime;
  }
  
  const lastStreamUpdateTime = additionalParams.lastStreamUpdateTime;
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
  const additionalParams = parsedMetadata?.additionalParams;
  
  if (!additionalParams || typeof additionalParams !== 'object') {
    return undefined;
  }
  
  const estimatedRemainingMs = additionalParams.estimatedRemainingMs;
  if (typeof estimatedRemainingMs === 'number' && !isNaN(estimatedRemainingMs) && estimatedRemainingMs >= 0) {
    return estimatedRemainingMs;
  }
  
  return undefined;
}
