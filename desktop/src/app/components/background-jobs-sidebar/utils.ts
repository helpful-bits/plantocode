import { type ApiType, type TaskType, type JobMetadata } from "@/types/session-types";
import { formatTimeAgo as formatTimeAgoUtil } from "@/utils/date-utils";

/**
 * Helper function to safely parse job metadata
 */
export const getParsedMetadata = (
  metadata: JobMetadata | string | null | undefined
): JobMetadata | null => {
  if (!metadata) return null;

  // If metadata is already an object, return it
  if (typeof metadata === "object" && metadata !== null) {
    return metadata;
  }

  // Try to parse the string metadata
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as JobMetadata;
    } catch (e) {
      console.warn("Failed to parse job metadata:", e);
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
      return "h-3 w-3 text-green-500";
    case "failed":
      return "h-3 w-3 text-red-500";
    case "running":
    case "processing_stream":
      return "h-3 w-3 text-blue-500 animate-spin";
    case "canceled":
      return "h-3 w-3 text-amber-500";
    case "preparing":
    case "created":
    case "queued":
    case "idle":
    case "preparing_input":
    case "generating_stream":
      return "h-3 w-3 text-blue-400";
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
      color = "text-emerald-50";
      bgColor = "bg-emerald-700";
      break;
    case "claude":
      color = "text-purple-50";
      bgColor = "bg-purple-700";
      break;
    case "openai":
      color = "text-teal-50";
      bgColor = "bg-teal-700";
      break;
    case "groq":
      color = "text-amber-50";
      bgColor = "bg-amber-700";
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
 * Returns human-readable task type
 */
export function formatTaskType(taskType: TaskType): string {
  // If taskType is undefined or null, return 'Unknown Task'
  if (!taskType) return "Unknown Task";

  // Convert enum values to human readable format
  switch (taskType) {
    case "path_finder":
      return "Path Finding";
    case "transcription":
      return "Voice Transcription";
    case "regex_generation":
      return "Regex Generation";
    case "path_correction":
      return "Path Correction";
    case "text_improvement":
      return "Text Improvement";
    case "voice_correction":
      return "Voice Correction";
    case "task_enhancement":
      return "Task Enhancement";
    case "guidance_generation":
      return "Guidance Generation";
    case "implementation_plan":
      return "Implementation Plan";
    default: {
      // Return the raw value if it doesn't match any known type
      // Convert to title case for better readability
      const rawValue = taskType.toString();
      return rawValue
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }
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
 */
export function getStreamingProgressValue(
  metadata: JobMetadata | null | undefined,
  startTime?: number | null,
  jobMaxOutputTokens?: number | null
): number | undefined {
  // No progress if metadata is undefined
  if (!metadata) return undefined;

  // Priority 1: Use explicit streamProgress if available
  if (
    typeof metadata.streamProgress === "number" &&
    !isNaN(metadata.streamProgress)
  ) {
    return Math.min(metadata.streamProgress, 99);
  }

  // Priority 2: Calculate based on responseLength and estimatedTotalLength
  if (
    typeof metadata.responseLength === "number" &&
    typeof metadata.estimatedTotalLength === "number" &&
    metadata.estimatedTotalLength > 0
  ) {
    return Math.min(
      (metadata.responseLength / metadata.estimatedTotalLength) * 100,
      99
    );
  }

  // Priority 3: Calculate based on responseLength and jobMaxOutputTokens with chars-per-token heuristic
  if (
    typeof metadata.responseLength === "number" &&
    typeof jobMaxOutputTokens === "number" &&
    jobMaxOutputTokens > 0
  ) {
    const estimatedTotalLengthFromTokens = jobMaxOutputTokens * 3.5; // 3.5 chars per token heuristic
    if (estimatedTotalLengthFromTokens > 0) {
      return Math.min(
        (metadata.responseLength / estimatedTotalLengthFromTokens) * 100,
        99
      );
    }
  }

  // Priority 4: Time-based fallback for initial animation
  if (typeof startTime === "number" && startTime > 0) {
    // Show small progress (max 5%) based on elapsed time to indicate activity
    return Math.min(((Date.now() - startTime) / 1000) * 0.5, 5);
  }

  // No valid progress data available
  return undefined;
}
