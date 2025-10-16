"use server";

import { invoke } from "@/utils/tauri-invoke-wrapper";

export async function startTaskEdit(sessionId: string): Promise<void> {
  if (!sessionId) {
    throw new Error("Session ID is required for startTaskEdit");
  }
  await invoke("queue_start_task_edit_command", { sessionId });
}

export async function endTaskEdit(sessionId: string): Promise<void> {
  if (!sessionId) {
    throw new Error("Session ID is required for endTaskEdit");
  }
  await invoke("queue_end_task_edit_command", { sessionId });
}

export async function queueTaskDescriptionUpdate(
  sessionId: string,
  content: string
): Promise<void> {
  if (!sessionId) {
    throw new Error("Session ID is required for queueTaskDescriptionUpdate");
  }

  await invoke("queue_task_description_update_command", {
    sessionId,
    content,
    source: "desktop_user",
  });
}

export async function applyExternalTaskDescription(
  sessionId: string,
  content: string
): Promise<void> {
  if (!sessionId) {
    throw new Error("Session ID is required for applyExternalTaskDescription");
  }

  await invoke("queue_external_task_description_update_command", {
    sessionId,
    content,
    source: "remote",
  });
}

export async function queueMergeInstructionsUpdate(
  sessionId: string,
  content: string
): Promise<void> {
  if (!sessionId) {
    throw new Error("Session ID is required for queueMergeInstructionsUpdate");
  }

  await invoke("queue_merge_instructions_update_command", {
    sessionId,
    content,
  });
}

export function createDebouncer<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delayMs);
  };
}
