import { type ActionState } from "@/types";
import { createLogger } from "@/utils/logger";
import { handleActionError } from "@/utils/action-utils";

import * as tauriFs from "../../utils/tauri-fs";

const logger = createLogger({ namespace: "FileSystemRead" });

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
    logger.debug(`Reading file: ${filePath}`);

    const content = await tauriFs.readFileContent(filePath, undefined, "utf8");

    const fileInfo: { [key: string]: string } = {};
    fileInfo[filePath] = content;

    return {
      isSuccess: true,
      data: fileInfo,
      message: `Successfully read file: ${filePath}`,
    };
  } catch (error: unknown) {
    return handleActionError(error) as ActionState<{ [key: string]: string }>;
  }
}
