import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

import * as tauriFs from "../../utils/tauri-fs";

/**
 * Get the user's home directory
 */
export async function getHomeDirectoryAction(): Promise<ActionState<string>> {
  try {
    // Use tauriFs to get the home directory
    const homeDir = await tauriFs.getHomeDirectory();

    // Ensure we have a non-empty string
    if (!homeDir || homeDir.trim() === "") {
      console.error(`[getHomeDirectoryAction] Received empty home directory path from Tauri.`);
      return {
        isSuccess: false,
        message: "Failed to retrieve a valid home directory path.",
        data: undefined,
      };
    }

    return {
      isSuccess: true,
      message: "Home directory retrieved",
      data: homeDir,
    };
  } catch (error) {
    console.error("Error getting home directory:", error);
    return handleActionError(error) as ActionState<string>;
  }
}



