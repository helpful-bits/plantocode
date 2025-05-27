import { Command, Child, EventEmitter, open } from '@tauri-apps/plugin-shell';
import type { 
  IOPayload, 
  CommandEvents, 
  TerminatedPayload, 
  OutputEvents, 
  ChildProcess, 
  SpawnOptions 
} from '@tauri-apps/plugin-shell';
import { createLogger } from '@/utils/logger';

const logger = createLogger({ namespace: "ShellUtils" });

// Define shell object with open method for compatibility
export const shell = { open };

/**
 * Executes a command and returns the output
 * @param command The command to execute
 * @param args Arguments to pass to the command
 * @returns Promise with the command output
 */
export async function executeCommand(command: string, args: string[] = []): Promise<string> {
  try {
    const cmd = Command.create(command, args);
    const result = await cmd.execute();

    if (result.code !== 0) {
      let errMsgDetails = result.stderr || result.stdout || "No specific error output";
      // If details are empty but code is non-zero, emphasize the exit code.
      if (errMsgDetails === "No specific error output" && result.code !== 0) {
        errMsgDetails = `Process exited with code ${result.code}.`;
      }
      const errorMessage = `Command "${command} ${args.join(" ")}" failed with code ${result.code}: ${errMsgDetails}`;
      logger.error(`[ShellUtils] ${errorMessage}`);
      throw new Error(errorMessage);
    }
    return result.stdout;
  } catch (error) {
    // Handle errors from Command.create or cmd.execute() itself
    let errorMessage = `Error executing command "${command} ${args.join(" ")}": `;
    if (error instanceof Error) {
      errorMessage += error.message;
    } else if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
      errorMessage += (error as any).message;
    } else if (typeof error === 'string') {
      errorMessage += error;
    } else {
      errorMessage += "An unknown error occurred during shell command execution.";
    }
    logger.error(`[ShellUtils] ${errorMessage}`, error); // Log the original error object too
    throw new Error(errorMessage);
  }
}

export { Command, Child, EventEmitter, open };
export type { 
  IOPayload, 
  CommandEvents, 
  TerminatedPayload, 
  OutputEvents, 
  ChildProcess, 
  SpawnOptions 
};