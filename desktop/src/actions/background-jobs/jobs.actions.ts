/**
 * Background job actions
 *
 * This module provides actions for managing background jobs directly through Tauri commands.
 * These are thin wrappers around Tauri invoke calls to the corresponding Rust command handlers.
 */

import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
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
 * Updates the cleared status of a background job
 */
export async function updateJobClearedStatusAction(
  jobId: string,
  cleared: boolean
): Promise<ActionState<null>> {
  try {
    await invoke("update_job_cleared_status_command", { jobId, cleared });
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
): Promise<ActionState<unknown>> {
  try {
    const job = await invoke("get_background_job_by_id_command", { jobId });
    return {
      isSuccess: true,
      data: job,
    };
  } catch (e) {
    return handleActionError(e) as ActionState<unknown>;
  }
}

/**
 * Gets all active background jobs
 */
export async function getActiveJobsAction(): Promise<ActionState<unknown>> {
  try {
    const jobs = await invoke("get_active_jobs_command");
    return {
      isSuccess: true,
      data: jobs,
    };
  } catch (e) {
    return handleActionError(e) as ActionState<unknown>;
  }
}
