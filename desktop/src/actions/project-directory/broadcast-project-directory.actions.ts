import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

export async function broadcastProjectDirectoryChangedAction(
  projectDirectory: string
): Promise<ActionState<void>> {
  try {
    await invoke("broadcast_project_directory_changed_command", {
      projectDirectory,
    });

    return {
      isSuccess: true,
      message: "Project directory change broadcast successfully",
    };
  } catch (error) {
    console.error(`[broadcastProjectDirectoryChangedAction] Error:`, error);
    return handleActionError(error) as ActionState<void>;
  }
}
