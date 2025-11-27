/**
 * Background job actions
 *
 * This module provides actions for managing background jobs directly through Tauri commands.
 * These are thin wrappers around Tauri invoke calls to the corresponding Rust command handlers.
 */

import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { type BackgroundJob } from "@/types/session-types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Cancels a background job with the specified ID
 */
export async function cancelBackgroundJobAction(
  jobId: string
): Promise<ActionState<null>> {
  try {
    await invoke("cancel_background_job_command", { jobId });
    return { isSuccess: true };
  } catch (e) {
    return handleActionError(e) as ActionState<null>;
  }
}

/**
 * Permanently deletes a background job from the database
 */
export async function deleteBackgroundJobAction(
  jobId: string
): Promise<ActionState<null>> {
  try {
    await invoke("delete_background_job_command", { jobId });
    return { isSuccess: true };
  } catch (e) {
    return handleActionError(e) as ActionState<null>;
  }
}

/**
 * Clears job history, optionally keeping jobs from a specified number of days
 */
export async function clearJobHistoryAction(
  daysToKeep?: number
): Promise<ActionState<null>> {
  try {
    await invoke("clear_job_history_command", { daysToKeep });
    return { isSuccess: true };
  } catch (e) {
    return handleActionError(e) as ActionState<null>;
  }
}


/**
 * Gets a specific background job by ID
 */
export async function getBackgroundJobAction(
  jobId: string
): Promise<ActionState<BackgroundJob>> {
  try {
    const job = await invoke("get_background_job_by_id_command", { jobId });
    return {
      isSuccess: true,
      data: job as BackgroundJob,
    };
  } catch (e) {
    return handleActionError(e) as ActionState<BackgroundJob>;
  }
}

/**
 * Gets all visible background jobs, optionally filtered by project directory and/or session
 */
export async function getAllVisibleJobsAction(
  projectDirectory?: string,
  sessionId?: string,
  bypassCache: boolean = false
): Promise<ActionState<BackgroundJob[]>> {
  try {
    const jobs = await invoke("get_all_visible_jobs_command", {
      projectDirectory: projectDirectory || null,
      sessionId: sessionId || null,
      bypassCache
    });
    return {
      isSuccess: true,
      data: jobs as BackgroundJob[],
    };
  } catch (e) {
    return handleActionError(e) as ActionState<BackgroundJob[]>;
  }
}

/**
 * Cancel a specific job (alias for cancelBackgroundJobAction)
 */
export async function cancelJobAction(jobId: string): Promise<ActionState<null>> {
  return cancelBackgroundJobAction(jobId);
}

/**
 * Delete a specific job (alias for deleteBackgroundJobAction)
 */
export async function deleteJobAction(jobId: string): Promise<ActionState<null>> {
  return deleteBackgroundJobAction(jobId);
}

/**
 * Cancel all running jobs for a session
 */
export async function cancelSessionRequestsAction(sessionId: string): Promise<ActionState<number>> {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { 
      isSuccess: false, 
      error: new Error("Invalid session ID"), 
      data: 0 
    };
  }

  try {
    const cancelledCount = await invoke<number>("cancel_session_jobs_command", {
      sessionId: sessionId,
    });

    return {
      isSuccess: true,
      data: cancelledCount,
    };
  } catch (e) {
    const errorResult = handleActionError(e) as ActionState<number>;
    return {
      ...errorResult,
      data: 0,
    };
  }
}
