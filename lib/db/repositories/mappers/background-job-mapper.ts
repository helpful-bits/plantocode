import { BackgroundJob, JobStatus, ApiType, TaskType, JOB_STATUSES } from '@/types';

/**
 * Helper to convert SQLite timestamps (seconds) to JS timestamps (milliseconds)
 * @param timestamp SQLite timestamp in seconds
 * @returns JavaScript timestamp in milliseconds or null
 */
function convertTimestamp(timestamp: number | null | undefined): number | null {
  if (timestamp === null || timestamp === undefined) return null;
  // SQLite timestamps are stored as seconds - convert to milliseconds
  return timestamp * 1000;
}

/**
 * Maps a database row to a BackgroundJob object
 * @param row The database row containing background job data
 * @returns A structured BackgroundJob object or null if row is invalid
 */
export function rowToBackgroundJob(row: any): BackgroundJob | null {
  if (!row) return null;
  
  const jobId = row.id;
  
  // Parse metadata if available
  let metadataObj = {};
  try {
    if (row.metadata) {
      metadataObj = JSON.parse(row.metadata);
    }
  } catch (e) {
    console.warn(`[Repo] Could not parse metadata for job ${jobId}:`, e);
    // Continue with empty metadata rather than failing
  }
  
  // Extract projectDirectory from metadata if available
  const projectDirectory = (metadataObj as any)?.projectDirectory || null;
  
  // Convert timestamps using helper function
  const createdAt = convertTimestamp(row.created_at) || 0;
  const updatedAt = convertTimestamp(row.updated_at) || 0;
  const startTime = convertTimestamp(row.start_time);
  const endTime = convertTimestamp(row.end_time);
  const lastUpdate = convertTimestamp(row.last_update);
  
  // Special handling for status field - ensure valid JobStatus
  // This helps prevent UI issues from invalid status values
  const statusValue = row.status ?? 'unknown';
  let status = statusValue as JobStatus;
  
  // Validate status is a valid JobStatus enum value using the constants
  const validStatuses = JOB_STATUSES.ALL;
  if (!validStatuses.includes(status)) {
    console.warn(`[Repo] Invalid status '${status}' for job ${jobId}, defaulting to 'idle'`);
    status = 'idle';
  }
  
  // Handle response and error fields based on status
  let responseText = '';
  let errorMessageText = '';
  
  // First, extract the raw values from the database
  const rawResponse = row.response;
  const rawErrorMessage = row.error_message;
  
  // Normalize response field - We want consistent string values, never null/undefined
  if (typeof rawResponse === 'string') {
    responseText = rawResponse;
  } else if (rawResponse) {
    // If it's not a string but has a truthy value, convert to string
    try {
      responseText = String(rawResponse);
    } catch (e) {
      responseText = '';
      console.warn(`[Repo] Could not convert response to string for job ${jobId}`);
    }
  }
  
  // Normalize error message field - We want consistent string values, never null/undefined
  if (typeof rawErrorMessage === 'string') {
    errorMessageText = rawErrorMessage;
  } else if (rawErrorMessage) {
    // If it's not a string but has a truthy value, convert to string
    try {
      errorMessageText = String(rawErrorMessage);
    } catch (e) {
      errorMessageText = '';
      console.warn(`[Repo] Could not convert error_message to string for job ${jobId}`);
    }
  }
  
  // Detect and correct potentially stuck jobs - if a job is marked as running but has an end_time, 
  // it should actually be in a terminal state - likely 'completed' if there's a response
  if (status === 'running' && row.end_time) {
    if (responseText) {
      console.warn(`[Repo] Found stuck running job ${jobId} with response and end_time (${row.end_time}), correcting to 'completed'`);
      status = 'completed';
    } else if (errorMessageText) {
      console.warn(`[Repo] Found stuck running job ${jobId} with error and end_time (${row.end_time}), correcting to 'failed'`);
      status = 'failed';
    } else {
      // If there's an end_time but no response or error, set to failed with a generic message
      console.warn(`[Repo] Found stuck running job ${jobId} with end_time (${row.end_time}) but no response or error, correcting to 'failed'`);
      status = 'failed';
      errorMessageText = 'Job failed (recovered from inconsistent state)';
    }
  }
  
  // Ensure terminal states have appropriate content
  if (JOB_STATUSES.TERMINAL.includes(status)) {
    // For completed jobs, we respect empty string responses as valid
    // Only add placeholder for failed or canceled jobs without error messages
    if ((status === 'failed' || status === 'canceled') && !errorMessageText) {
      errorMessageText = status === 'failed' 
        ? 'Job failed with no error message' 
        : 'Job canceled with no reason provided';
      console.warn(`[Repo] ${status.charAt(0).toUpperCase() + status.slice(1)} job ${jobId} has no error message, adding placeholder`);
    }
  }
  
  // Map DB row to BackgroundJob object with consistent field mapping
  // This follows the structure defined in the BackgroundJob type
  const job: BackgroundJob = {
    // Core identifying fields
    id: jobId,
    sessionId: row.session_id,
    apiType: row.api_type as ApiType,
    taskType: row.task_type as TaskType,
    status: status,
    
    // Timestamps with proper conversion and validation
    createdAt: createdAt,
    updatedAt: updatedAt,
    startTime: startTime,
    endTime: endTime,
    lastUpdate: lastUpdate,
    
    // Input content with validation
    prompt: row.prompt || '',
    // Output content - always use the normalized values
    response: responseText,
    
    // Token and performance tracking with validation
    tokensSent: typeof row.tokens_sent === 'number' ? row.tokens_sent : 0,
    tokensReceived: typeof row.tokens_received === 'number' ? row.tokens_received : 0,
    charsReceived: typeof row.chars_received === 'number' ? row.chars_received : 0,
    
    
    // Derived total tokens (sum of tokens sent and received)
    totalTokens: (typeof row.tokens_sent === 'number' ? row.tokens_sent : 0) + 
                 (typeof row.tokens_received === 'number' ? row.tokens_received : 0),
    
    // Status and error information
    statusMessage: row.status_message || null,
    errorMessage: errorMessageText,
    
    // Model configuration
    modelUsed: row.model_used || null,
    maxOutputTokens: row.max_output_tokens || null,
    
    // Extract configuration from metadata with defaults
    includeSyntax: (metadataObj as any)?.includeSyntax ?? false,
    temperature: (metadataObj as any)?.temperature ?? 0.7,
    
    // Output file paths
    outputFilePath: row.output_file_path || null,
    
    // Project directory (important for filtering jobs by project)
    projectDirectory: projectDirectory,
    
    // Visibility/management flags
    cleared: Boolean(row.cleared),
    visible: true, // All database records are visible by default
    
    // Store the full metadata object for access by other components
    metadata: metadataObj
  };
  
  // Final validation - ensure timestamps are consistent with status
  if (JOB_STATUSES.TERMINAL.includes(job.status) && !job.endTime) {
    // Terminal status without endTime - set to the most recent timestamp
    const latestTimestamp = Math.max(
      job.updatedAt || 0, 
      job.lastUpdate || 0,
      job.createdAt || 0
    );
    job.endTime = latestTimestamp || Date.now();
    console.warn(`[Repo] Terminal job ${jobId} with status '${job.status}' is missing endTime, setting to ${job.endTime}`);
  }
  
  if (JOB_STATUSES.ACTIVE.includes(job.status) && !job.startTime) {
    // Running status without startTime - set to the earliest relevant timestamp
    const earliestTimestamp = Math.min(
      job.updatedAt || Number.MAX_SAFE_INTEGER, 
      job.lastUpdate || Number.MAX_SAFE_INTEGER,
      job.createdAt || Number.MAX_SAFE_INTEGER
    );
    job.startTime = earliestTimestamp === Number.MAX_SAFE_INTEGER ? Date.now() : earliestTimestamp;
    console.warn(`[Repo] Running job ${jobId} is missing startTime, setting to ${job.startTime}`);
  }
  
  // Check for additional inconsistent states and correct them
  if (JOB_STATUSES.ACTIVE.includes(job.status) && job.endTime !== null) {
    // Active job should not have an endTime set
    console.warn(`[Repo] Found active job ${jobId} with status '${job.status}' but endTime is set (${job.endTime}), clearing endTime`);
    job.endTime = null;
  }
  
  // Ensure failed/canceled jobs have errorMessage
  // For completed jobs, we respect empty string responses as valid
  if ((job.status === 'failed' || job.status === 'canceled') && !job.errorMessage) {
    job.errorMessage = job.status === 'failed' 
      ? 'Job failed with no error message' 
      : 'Job canceled with no reason provided';
    console.warn(`[Repo] ${job.status.charAt(0).toUpperCase() + job.status.slice(1)} job ${jobId} has no error message after mapping, adding placeholder`);
  }
  
  return job;
}