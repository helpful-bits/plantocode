import { ApiType, TaskType, JOB_STATUSES } from '@/types/session-types';
import { formatTimeAgo as formatTimeAgoUtil } from '@/lib/utils/date-utils';

/**
 * Returns the icon name for a job status
 */
export function getStatusIconName(status: string): string {
  switch (status) {
    case 'completed':
      return 'check-circle';
    case 'failed':
      return 'alert-circle';
    case 'running':
      return 'loader';
    case 'canceled':
      return 'x-circle';
    case 'preparing':
    case 'created':
    case 'queued':
    case 'idle':
      return 'clock';
    default:
      return 'clock';
  }
}

/**
 * Returns the class names for status icons
 */
export function getStatusIconClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'h-3 w-3 text-green-500';
    case 'failed':
      return 'h-3 w-3 text-red-500';
    case 'running':
      return 'h-3 w-3 text-blue-500 animate-spin';
    case 'canceled':
      return 'h-3 w-3 text-amber-500';
    case 'preparing':
    case 'created':
    case 'queued':
    case 'idle':
      return 'h-3 w-3 text-blue-400';
    default:
      return 'h-3 w-3 text-muted-foreground';
  }
}

/**
 * Returns the class names for API type badges
 */
export function getApiTypeBadgeClasses(apiType: ApiType): string {
  let color = "text-primary-foreground";
  let bgColor = "bg-primary/80";
  
  switch (apiType.toLowerCase()) {
    case 'gemini':
      color = "text-emerald-50";
      bgColor = "bg-emerald-700";
      break;
    case 'claude':
      color = "text-purple-50";
      bgColor = "bg-purple-700";
      break;
    case 'openai':
      color = "text-teal-50";
      bgColor = "bg-teal-700";
      break;
    case 'groq':
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
  if (!taskType) return 'Unknown Task';
  
  // Convert enum values to human readable format
  switch (taskType) {
    case 'xml_generation':
      return 'XML Generation';
    case 'pathfinder':
      return 'Path Finding';
    case 'transcription':
      return 'Voice Transcription';
    case 'regex_generation':
      return 'Regex Generation';
    case 'path_correction':
      return 'Path Correction';
    case 'text_improvement':
      return 'Text Improvement';
    case 'voice_correction':
      return 'Voice Correction';
    case 'task_enhancement':
      return 'Task Enhancement';
    case 'guidance_generation':
      return 'Guidance Generation';
    case 'task_guidance':
      return 'Task Guidance';
    // Handle non-standard values used in the app
    case 'path_finding' as any:
      return 'Path Finding';
    case 'voice_transcription' as any:
      return 'Voice Transcription';
    case 'message' as any:
      return 'Message';
    default:
      // Return the raw value if it doesn't match any known type
      // Convert to title case for better readability
      const rawValue = taskType.toString();
      return rawValue
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
  }
}

/**
 * Format timestamp to relative time using the utility function from date-utils
 */
export function formatTimeAgo(timestamp: number): string {
  return formatTimeAgoUtil(timestamp);
}

/**
 * Format token count for display
 */
export function formatTokenCount(count?: number): string {
  if (!count) return '0';
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();
}

/**
 * Truncate text with ellipsis if it exceeds maxLength
 */
export function truncateText(text: string, maxLength = 50): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}