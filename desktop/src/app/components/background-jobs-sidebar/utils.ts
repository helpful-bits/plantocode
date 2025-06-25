import { type ApiType, type JobMetadata } from "@/types/session-types";
import { type TaskType, TaskTypeDetails } from "@/types/task-type-defs";
import { formatTimeAgo as formatTimeAgoUtil } from "@/utils/date-utils";

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
 * Used for progress bars to show consistent progress across components
 * Robustly accesses fields from the standardized JobMetadata structure
 */
export function getStreamingProgressValue(
  metadataInput: JobMetadata | string | null | undefined,
  startTime?: number | null,
  taskType?: string
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
    // Don't cap at 99% - show actual progress for better UX
    return Math.min(streamProgress, 100);
  }

  // Priority 2: Calculate based on responseLength and estimatedTotalLength
  const responseLength = taskData?.responseLength ?? topLevel?.responseLength;
  const estimatedTotalLength = taskData?.estimatedTotalLength ?? topLevel?.estimatedTotalLength;
  
  if (
    typeof responseLength === "number" &&
    typeof estimatedTotalLength === "number" &&
    estimatedTotalLength > 0 &&
    responseLength >= 0 &&
    !isNaN(responseLength) &&
    !isNaN(estimatedTotalLength)
  ) {
    const calculatedProgress = (responseLength / estimatedTotalLength) * 100;
    if (calculatedProgress >= 0 && calculatedProgress <= 200 && !isNaN(calculatedProgress)) {
      return Math.min(calculatedProgress, 100);
    }
  }

  // Priority 3: Calculate based on tokensReceived from metadata (check both levels)
  const tokensReceived = taskData?.tokensReceived ?? topLevel?.tokensReceived;
  const maxTokens = taskData?.maxTokens ?? taskData?.maxOutputTokens ?? topLevel?.maxTokens ?? topLevel?.maxOutputTokens;
  
  if (
    typeof tokensReceived === "number" &&
    typeof maxTokens === "number" &&
    maxTokens > 0 &&
    tokensReceived >= 0 &&
    !isNaN(tokensReceived) &&
    !isNaN(maxTokens)
  ) {
    const calculatedProgress = (tokensReceived / maxTokens) * 100;
    if (calculatedProgress >= 0 && calculatedProgress <= 200 && !isNaN(calculatedProgress)) {
      return Math.min(calculatedProgress, 100);
    }
  }

  // Priority 4: For workflow jobs, check if there's a stage-based progress
  if (topLevel?.workflowId) {
    // Workflow jobs might have progress based on stage completion
    const workflowStage = topLevel.workflowStage;
    const progressPercentage = topLevel.progressPercentage;
    
    if (typeof progressPercentage === "number" && progressPercentage >= 0 && progressPercentage <= 100) {
      return progressPercentage;
    }
    
    // Estimate progress based on workflow stage
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

  // Priority 5: Enhanced time-based fallback with task-specific timing
  return getTimeBasedFallbackProgress(startTime, taskType);
}

/**
 * Helper function for time-based progress fallback
 * Uses task-specific timing estimates for more realistic progress
 */
function getTimeBasedFallbackProgress(startTime?: number | null, taskType?: string): number | undefined {
  if (typeof startTime === "number" && startTime > 0 && !isNaN(startTime)) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > 0) {
      const elapsedSeconds = elapsedMs / 1000;
      
      // Task-specific estimated durations (in seconds)
      const taskDurations: Record<string, number> = {
        "file_relevance_assessment": 15,    // 15 seconds for AI file relevance
        "regex_file_filter": 10,           // 10 seconds for regex generation
        "extended_path_finder": 20,        // 20 seconds for extended path finding
        "path_correction": 12,             // 12 seconds for path correction
        "task_refinement": 8,              // 8 seconds for task refinement
        "implementation_plan": 60,         // 60 seconds for implementation plans (increased from 25)
        "text_improvement": 12,            // 12 seconds for text improvement
        "voice_transcription": 30,         // 30 seconds for voice processing
      };
      
      const estimatedDuration = taskDurations[taskType || ""] || 15; // Default 15 seconds
      
      // Calculate progress with realistic curve - ensure continuous progression
      const progressRatio = elapsedSeconds / estimatedDuration;
      
      if (progressRatio <= 0.05) {
        // First 5% of time: 5-15% progress (quick start)
        return Math.min(5 + (progressRatio / 0.05) * 10, 15);
      } else if (progressRatio <= 0.3) {
        // Next 25% of time: 15-40% progress (early work)
        return Math.min(15 + ((progressRatio - 0.05) / 0.25) * 25, 40);
      } else if (progressRatio <= 0.7) {
        // Next 40% of time: 40-75% progress (main work)
        return Math.min(40 + ((progressRatio - 0.3) / 0.4) * 35, 75);
      } else if (progressRatio <= 1.0) {
        // Last 30% of time: 75-90% progress (finishing up)
        return Math.min(75 + ((progressRatio - 0.7) / 0.3) * 15, 90);
      } else {
        // Overtime: slowly approach 95% but never 100% until completion
        const overtime = Math.min(progressRatio - 1.0, 1.0); // Cap overtime at 1.0
        return Math.min(90 + (overtime * 5), 95);
      }
    }
  }
  
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
