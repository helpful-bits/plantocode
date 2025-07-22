import { Command } from "@tauri-apps/plugin-shell";

export async function createClaudeCommand(): Promise<Command<string>> {
  // For interactive mode, we'll start Claude without initial prompt
  // and then send the prompt via stdin after it starts
  const command = Command.create('claude-cmd', []);
  return command;
}