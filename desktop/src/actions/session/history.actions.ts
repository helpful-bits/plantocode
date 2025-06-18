import { invoke } from "@tauri-apps/api/core";
import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

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

export async function addTaskDescriptionHistoryEntryAction(sessionId: string, description: string): Promise<ActionState<void>> {
  try {
    await invoke("add_task_description_history_entry_command", { sessionId, description });
    return {
      isSuccess: true,
      data: undefined,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<void>;
  }
}