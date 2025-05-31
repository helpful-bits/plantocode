import { type ApiType, type TaskType, type JobMetadata } from "@/types/session-types";
import { formatTimeAgo as formatTimeAgoUtil } from "@/utils/date-utils";

/**
 * Helper function to safely parse job metadata
 * Ensures all UI components consistently use the standardized JobMetadata interface
 * Enhanced to handle JobMetadataBuilder output from backend
 */
export const getParsedMetadata = (
  metadataInput: JobMetadata | string | null | undefined
): JobMetadata | null => {
  if (!metadataInput) return null;
  
  // If already an object, validate and return it
  if (typeof metadataInput === 'object' && metadataInput !== null) {
    // Validate it has expected JobMetadata structure
    const metadata = metadataInput as JobMetadata;
    // Return validated metadata with defensive checks for all numeric and string fields
    return {
      ...metadata,
      // Ensure numeric fields are properly typed
      streamProgress: typeof metadata.streamProgress === 'number' ? metadata.streamProgress : undefined,
      responseLength: typeof metadata.responseLength === 'number' ? metadata.responseLength : undefined,
      estimatedTotalLength: typeof metadata.estimatedTotalLength === 'number' ? metadata.estimatedTotalLength : undefined,
      lastStreamUpdateTime: typeof metadata.lastStreamUpdateTime === 'number' ? metadata.lastStreamUpdateTime : undefined,
      streamStartTime: typeof metadata.streamStartTime === 'number' ? metadata.streamStartTime : undefined,
      jobPriorityForWorker: typeof metadata.jobPriorityForWorker === 'number' ? metadata.jobPriorityForWorker : undefined,
      tokensUsed: typeof metadata.tokensUsed === 'number' ? metadata.tokensUsed : undefined,
      retryCount: typeof metadata.retryCount === 'number' ? metadata.retryCount : undefined,
      pathCount: typeof metadata.pathCount === 'number' ? metadata.pathCount : undefined,
      // Ensure boolean fields are properly typed
      isStreaming: typeof metadata.isStreaming === 'boolean' ? metadata.isStreaming : undefined,
      showPureContent: typeof metadata.showPureContent === 'boolean' ? metadata.showPureContent : undefined,
    };
  }
  
  // If string, attempt to parse as JSON (from JobMetadataBuilder)
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
      const parsed = JSON.parse(metadataInput) as JobMetadata;
      
      // Validate that parsed result is an object and not null
      if (!parsed || typeof parsed !== 'object') {
        console.warn("Parsed metadata is not a valid object:", parsed);
        return null;
      }
      
      // Apply same validation as above
      return {
        ...parsed,
        streamProgress: typeof parsed.streamProgress === 'number' ? parsed.streamProgress : undefined,
        responseLength: typeof parsed.responseLength === 'number' ? parsed.responseLength : undefined,
        estimatedTotalLength: typeof parsed.estimatedTotalLength === 'number' ? parsed.estimatedTotalLength : undefined,
        lastStreamUpdateTime: typeof parsed.lastStreamUpdateTime === 'number' ? parsed.lastStreamUpdateTime : undefined,
        streamStartTime: typeof parsed.streamStartTime === 'number' ? parsed.streamStartTime : undefined,
        jobPriorityForWorker: typeof parsed.jobPriorityForWorker === 'number' ? parsed.jobPriorityForWorker : undefined,
        tokensUsed: typeof parsed.tokensUsed === 'number' ? parsed.tokensUsed : undefined,
        retryCount: typeof parsed.retryCount === 'number' ? parsed.retryCount : undefined,
        pathCount: typeof parsed.pathCount === 'number' ? parsed.pathCount : undefined,
        isStreaming: typeof parsed.isStreaming === 'boolean' ? parsed.isStreaming : undefined,
        showPureContent: typeof parsed.showPureContent === 'boolean' ? parsed.showPureContent : undefined,
      };
    } catch (e) {
      console.warn("Failed to parse job metadata JSON string:", e instanceof Error ? e.message : String(e), "String preview:", metadataInput.substring(0, 100));
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
 * Returns human-readable task type
 * Updated to handle new workflow stage types from orchestrated workflows
 */
export function formatTaskType(taskType: TaskType): string {
  // If taskType is undefined or null, return 'Unknown Task'
  if (!taskType) return "Unknown Task";

  // Convert enum values to human readable format
  switch (taskType) {
    case "path_finder":
      return "Path Finding";
    case "voice_transcription":
      return "Voice Transcription";
    case "path_correction":
      return "Path Correction";
    case "text_improvement":
      return "Text Improvement";
    case "text_correction":
      return "Text Correction";
    case "task_enhancement":
      return "Task Enhancement";
    case "guidance_generation":
      return "Guidance Generation";
    case "implementation_plan":
      return "Implementation Plan";
    
    // New workflow stage types from orchestrated file finder workflows
    case "directory_tree_generation":
      return "Directory Tree";
    case "regex_summary_generation":
      return "Regex Summary";
    case "regex_pattern_generation":
      return "Regex Pattern";
    case "regex_generation":
      return "Regex Generation";
    case "local_file_filtering":
      return "Local Filtering";
    case "initial_path_finding":
      return "Initial Paths";
    case "extended_path_finding":
      return "Extended Paths";
    case "extended_path_correction":
      return "Path Refinement";
    case "file_finder_workflow":
      return "File Finder";
      
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
 * Robustly accesses fields from the standardized JobMetadata structure
 */
export function getStreamingProgressValue(
  metadataInput: JobMetadata | string | null | undefined,
  startTime?: number | null,
  jobMaxOutputTokens?: number | null
): number | undefined {
  // Parse metadata to ensure consistent structure
  const metadata = getParsedMetadata(metadataInput);
  if (!metadata) {
    // Fallback for time-based progress when no metadata is available
    if (typeof startTime === "number" && startTime > 0) {
      return Math.min(((Date.now() - startTime) / 1000) * 0.3, 3);
    }
    return undefined;
  }

  // Priority 1: Use explicit streamProgress if available and valid
  if (
    typeof metadata.streamProgress === "number" &&
    !isNaN(metadata.streamProgress) &&
    metadata.streamProgress >= 0 &&
    metadata.streamProgress <= 100
  ) {
    return Math.min(metadata.streamProgress, 99);
  }

  // Priority 2: Calculate based on responseLength and estimatedTotalLength
  if (
    typeof metadata.responseLength === "number" &&
    typeof metadata.estimatedTotalLength === "number" &&
    metadata.estimatedTotalLength > 0 &&
    metadata.responseLength >= 0
  ) {
    const calculatedProgress = (metadata.responseLength / metadata.estimatedTotalLength) * 100;
    // Ensure the calculated progress is reasonable
    if (calculatedProgress >= 0 && calculatedProgress <= 200) { // Allow up to 200% for overruns
      return Math.min(calculatedProgress, 99);
    }
  }

  // Priority 3: Calculate based on responseLength and jobMaxOutputTokens with chars-per-token heuristic
  if (
    typeof metadata.responseLength === "number" &&
    typeof jobMaxOutputTokens === "number" &&
    jobMaxOutputTokens > 0 &&
    metadata.responseLength >= 0
  ) {
    const estimatedTotalLengthFromTokens = jobMaxOutputTokens * 3.5; // 3.5 chars per token heuristic
    if (estimatedTotalLengthFromTokens > 0) {
      const calculatedProgress = (metadata.responseLength / estimatedTotalLengthFromTokens) * 100;
      if (calculatedProgress >= 0 && calculatedProgress <= 200) { // Allow up to 200% for overruns
        return Math.min(calculatedProgress, 99);
      }
    }
  }

  // Priority 4: Time-based fallback for initial animation
  if (typeof startTime === "number" && startTime > 0) {
    const elapsedMs = Date.now() - startTime;
    // Show small progress (max 8%) based on elapsed time to indicate activity
    // Slower progression for better UX
    if (elapsedMs > 0) {
      return Math.min((elapsedMs / 1000) * 0.4, 8);
    }
  }

  // No valid progress data available
  return undefined;
}
