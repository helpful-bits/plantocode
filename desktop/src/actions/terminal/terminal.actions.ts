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

export async function getTerminalStatus(sessionId: string): Promise<{ status: string; exitCode: number | null }> {
  return invoke("get_terminal_session_status_command", { sessionId }) as Promise<{ status: string; exitCode: number | null }>;
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

export async function gracefulExitTerminal(sessionId: string) {
  const FINISH_TIMEOUT_MS = 2000;
  const isFinished = (s?: string) => s === 'completed' || s === 'failed' || s === 'stopped';

  // Try graceful exit first
  await invoke("graceful_exit_terminal_command", { sessionId });

  // Wait up to 2 seconds for the terminal to exit gracefully
  const started = Date.now();

  while (Date.now() - started < FINISH_TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const status: any = await getTerminalStatus(sessionId);
      // If status is completed, failed, or stopped, terminal has exited
      if (isFinished(status?.status)) {
        return { ok: true, status: status?.status, exitCode: status?.exitCode ?? null };
      }
    } catch {
      // Session might be gone already, which is fine
      return { ok: true, status: 'completed', exitCode: null };
    }
  }

  // Terminal didn't exit gracefully within 2 seconds - force kill it
  try {
    await invoke("kill_terminal_session_command", { sessionId });
    return { ok: true, status: 'failed', exitCode: null };
  } catch (e) {
    console.warn('Failed to force-kill terminal after graceful exit timeout:', e);
    return { ok: false, status: 'unknown', exitCode: null };
  }
}