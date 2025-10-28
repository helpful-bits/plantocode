import { invoke } from "@tauri-apps/api/core";

// NOTE: Legacy FileSelectionHistoryEntry types removed - use HistoryState instead

// New HistoryState types - matches documented schema
export interface HistoryEntry {
  value: string;
  timestampMs: number;
  deviceId: string;
  opType: string;
  sequenceNumber: number;
  version: number;
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  version: number;
  checksum: string;
}

// NOTE: Legacy actions removed - use getHistoryStateAction/syncHistoryStateAction instead

// New HistoryState RPC actions
export async function getHistoryStateAction(
  sessionId: string,
  kind: 'task' | 'files'
): Promise<HistoryState> {
  const result = await invoke<any>('get_history_state_command', {
    sessionId,
    kind,
  });

  // For files, backend returns JSON strings that need to be parsed to arrays
  if (kind === 'files' && result.entries) {
    return {
      ...result,
      entries: result.entries.map((e: any) => ({
        ...e,
        includedFiles: typeof e.includedFiles === 'string' ? JSON.parse(e.includedFiles) : e.includedFiles,
        forceExcludedFiles: typeof e.forceExcludedFiles === 'string' ? JSON.parse(e.forceExcludedFiles) : e.forceExcludedFiles,
      })),
    };
  }

  return result;
}

export async function syncHistoryStateAction(
  sessionId: string,
  kind: 'task' | 'files',
  state: HistoryState,
  expectedVersion: number
): Promise<HistoryState> {
  return await invoke<HistoryState>('sync_history_state_command', {
    sessionId,
    kind,
    state,
    expectedVersion,
  });
}

export async function mergeHistoryStateAction(
  sessionId: string,
  kind: 'task' | 'files',
  remoteState: HistoryState
): Promise<HistoryState> {
  return await invoke<HistoryState>('merge_history_state_command', {
    sessionId,
    kind,
    remoteState,
  });
}

export async function getDeviceIdAction(): Promise<string> {
  return await invoke<string>('get_device_id_command');
}