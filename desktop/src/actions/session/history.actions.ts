import { invoke } from "@tauri-apps/api/core";
import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

// File selection history types
export interface FileSelectionHistoryEntry {
  includedFiles: string[];
  forceExcludedFiles: string[];
}

export interface FileSelectionHistoryEntryWithTimestamp {
  includedFiles: string[];
  forceExcludedFiles: string[];
  createdAt: number;
}

export async function getTaskDescriptionHistoryAction(sessionId: string): Promise<ActionState<string[]>> {
  try {
    const history = await invoke<string[]>("get_task_description_history_command", { sessionId });
    return {
      isSuccess: true,
      data: history,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<string[]>;
  }
}

export async function syncTaskDescriptionHistoryAction(sessionId: string, history: string[]): Promise<ActionState<void>> {
  try {
    await invoke("sync_task_description_history_command", { sessionId, history });
    return {
      isSuccess: true,
      data: undefined,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<void>;
  }
}

export async function getFileSelectionHistoryAction(sessionId: string): Promise<ActionState<FileSelectionHistoryEntryWithTimestamp[]>> {
  try {
    const history = await invoke<FileSelectionHistoryEntryWithTimestamp[]>("get_file_selection_history_command", { sessionId });
    return {
      isSuccess: true,
      data: history,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<FileSelectionHistoryEntryWithTimestamp[]>;
  }
}

export async function syncFileSelectionHistoryAction(sessionId: string, history: FileSelectionHistoryEntry[]): Promise<ActionState<void>> {
  try {
    await invoke("sync_file_selection_history_command", { sessionId, history });
    return {
      isSuccess: true,
      data: undefined,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<void>;
  }
}