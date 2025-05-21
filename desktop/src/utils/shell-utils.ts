import { Command, Child, EventEmitter, open } from '@tauri-apps/plugin-shell';
import type { 
  IOPayload, 
  CommandEvents, 
  TerminatedPayload, 
  OutputEvents, 
  ChildProcess, 
  SpawnOptions 
} from '@tauri-apps/plugin-shell';

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
    const output = await Command.create(command, args).execute();
    return output.stdout;
  } catch (error) {
    console.error(`Error executing command ${command}:`, error);
    throw error;
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