import { type ActionState } from "@/types";

import * as tauriFs from "../../utils/tauri-fs";

const DEBUG_LOGS = import.meta.env.DEV; // Enable logs in development

export async function readExternalFileAction(
  filePath: string
): Promise<ActionState<{ [key: string]: string }>> {
  try {
    if (!filePath) {
      return {
        isSuccess: false,
        message: "No file path provided",
      };
    }

    // Use the tauriFs to read file content
    if (DEBUG_LOGS) {
      // Debug logging is conditional and useful for development
    }

    const content = await tauriFs.readFileContent(filePath, undefined, "utf8");

    const fileInfo: { [key: string]: string } = {};
    fileInfo[filePath] = content;

    return {
      isSuccess: true,
      data: fileInfo,
      message: `Successfully read file: ${filePath}`,
    };
  } catch (error: unknown) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read file",
    };
  }
}
