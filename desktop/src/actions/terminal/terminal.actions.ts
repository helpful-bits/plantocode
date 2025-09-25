import { invoke } from "@/utils/tauri-invoke-wrapper";
import { Channel } from "@tauri-apps/api/core";

export async function startTerminalSession(
  jobId: string,
  options: {
    workingDirectory?: string;
    environment?: Record<string, string>;
    rows?: number;
    cols?: number;
  },
  channel?: Channel<Uint8Array>
): Promise<void> {
  return invoke("start_terminal_session_command", {
    jobId,
    options,
    output: channel,
  });
}

export async function attachTerminalOutput(
  jobId: string,
  channel: Channel<Uint8Array>
): Promise<void> {
  return invoke("attach_terminal_output_command", {
    jobId,
    output: channel,
  });
}

export async function writeTerminalInput(
  jobId: string,
  bytes: Uint8Array
): Promise<void> {
  return invoke("write_terminal_input_command", {
    jobId,
    input: Array.from(bytes),
  });
}

export async function resizeTerminal(
  jobId: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("resize_terminal_session_command", {
    jobId,
    cols,
    rows,
  });
}

export async function killTerminal(jobId: string): Promise<void> {
  return invoke("kill_terminal_session_command", {
    jobId,
  });
}

export async function readTerminalLogTail(
  jobId: string,
  maxBytes?: number
): Promise<string> {
  return invoke("read_terminal_log_tail_command", {
    jobId,
    maxBytes,
  });
}

export async function readTerminalLogLen(jobId: string): Promise<number> {
  return invoke("read_terminal_log_len_command", {
    jobId,
  });
}

export async function readTerminalLogSince(
  jobId: string,
  fromOffset: number,
  maxBytes?: number
): Promise<{ chunk: string; totalLen: number }> {
  return invoke("read_terminal_log_since_command", {
    jobId,
    fromOffset,
    maxBytes,
  });
}