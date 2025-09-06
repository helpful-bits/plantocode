import { invoke } from "@tauri-apps/api/core";
import { ActionState } from "../../types/action-types";
import { handleActionError } from "../../utils/action-utils";

export async function getExternalFoldersAction(projectDirectory: string): Promise<ActionState<string[]>> {
  try {
    const data = await invoke<string[]>("get_external_folders_command", { projectDirectory });
    return { isSuccess: true, data };
  } catch (e) {
    return handleActionError(e) as ActionState<string[]>;
  }
}

export async function setExternalFoldersAction(projectDirectory: string, folders: string[]): Promise<ActionState<void>> {
  try {
    await invoke<void>("set_external_folders_command", { projectDirectory, folders });
    return { isSuccess: true };
  } catch (e) {
    return handleActionError(e) as ActionState<void>;
  }
}

/**
 * Fetch available root directories from completed file finder workflows in a session
 */
export async function getFileFinderRootsForSession(
  sessionId: string
): Promise<string[] | null> {
  try {
    const roots = await invoke<string[] | null>("get_file_finder_roots_for_session", {
      sessionId,
    });
    return roots;
  } catch (error) {
    console.error("Failed to fetch file finder roots:", error);
    return null;
  }
}