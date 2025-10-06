import { invoke } from "@tauri-apps/api/core";

export async function startTerminalSession(sessionId: string, options?: { workingDirectory?: string; cols?: number; rows?: number }, output?: any) {
  return invoke("start_terminal_session_command", { sessionId, options, output });
}

export async function attachTerminalOutput(sessionId: string, output: any) {
  return invoke("attach_terminal_output_command", { sessionId, output });
}

export async function writeTerminalInput(sessionId: string, data: Uint8Array | number[] | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return invoke("write_terminal_input_command", { sessionId, data: Array.from(bytes as Uint8Array) });
}

export async function resizeTerminal(sessionId: string, cols: number, rows: number) {
  return invoke("resize_terminal_session_command", { sessionId, cols, rows });
}

export async function killTerminal(sessionId: string) {
  return invoke("kill_terminal_session_command", { sessionId });
}

export async function getTerminalStatus(sessionId: string) {
  return invoke("get_terminal_session_status_command", { sessionId });
}

export async function listTerminalSessions(): Promise<string[]> {
  return invoke("list_terminal_sessions_command");
}

export async function restoreTerminalSessions(): Promise<string[]> {
  return invoke("restore_terminal_sessions_command");
}

export async function getActiveTerminalSessions(): Promise<string[]> {
  return invoke("get_active_terminal_sessions_command");
}

export async function reconnectTerminalSession(sessionId: string, output: any): Promise<boolean> {
  return invoke("reconnect_terminal_session_command", { sessionId, output });
}