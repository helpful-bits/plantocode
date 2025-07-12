import { type BackgroundJob } from "@/types/session-types";
import { getParsedMetadata } from "../utils";

/**
 * Get session name for displaying in job UI components
 * Centralizes the logic for deriving sessionName from BackgroundJob metadata
 * with a prioritized fallback chain that matches backend expectations
 */
export function getJobDisplaySessionName(job: BackgroundJob): string {
  const parsedMeta = getParsedMetadata(job.metadata);

  // Priority 1: Use displayName from metadata (set explicitly for each job)
  if (parsedMeta?.displayName && typeof parsedMeta.displayName === 'string' && parsedMeta.displayName.trim()) {
    return parsedMeta.displayName.trim();
  }

  // Priority 2: Use sessionName from taskData (backend sets this via prompt_utils::get_session_name)
  if (parsedMeta?.taskData?.sessionName && typeof parsedMeta.taskData.sessionName === 'string' && parsedMeta.taskData.sessionName.trim()) {
    return parsedMeta.taskData.sessionName.trim();
  }

  // Priority 3: Use sessionName from root metadata
  if (parsedMeta?.sessionName && typeof parsedMeta.sessionName === 'string' && parsedMeta.sessionName.trim()) {
    return parsedMeta.sessionName.trim();
  }
  
  // Priority 4: Use planTitle from metadata if available (specific to implementation plans)
  if (parsedMeta?.planTitle && typeof parsedMeta.planTitle === 'string' && parsedMeta.planTitle.trim()) {
    return parsedMeta.planTitle.trim();
  }

  // Priority 5: Use planTitle from taskData
  if (parsedMeta?.taskData?.planTitle && typeof parsedMeta.taskData.planTitle === 'string' && parsedMeta.taskData.planTitle.trim()) {
    return parsedMeta.taskData.planTitle.trim();
  }
  
  // Priority 6: Use taskDescription from metadata if available
  if (parsedMeta?.taskDescription && typeof parsedMeta.taskDescription === 'string' && parsedMeta.taskDescription.trim()) {
    const taskDesc = parsedMeta.taskDescription.trim();
    return taskDesc.length > 60 ? taskDesc.substring(0, 60) + '...' : taskDesc;
  }
  
  // Priority 7: Extract meaningful content from the first line of the prompt
  if (job.prompt && typeof job.prompt === 'string' && job.prompt.trim()) {
    const firstLine = job.prompt.trim().split('\n')[0].trim();
    if (firstLine.length > 0) {
      return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
    }
  }
  
  // No fallback - return empty string if no session name found
  return "";
}