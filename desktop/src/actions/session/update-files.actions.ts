import { invoke } from "@tauri-apps/api/core";

export interface UpdateSessionFilesOptions {
  addIncluded?: string[];
  removeIncluded?: string[];
  addExcluded?: string[];
  removeExcluded?: string[];
}

export async function updateSessionFilesAction(
  sessionId: string,
  opts: UpdateSessionFilesOptions
): Promise<{ ok: boolean; error?: string }> {
  try {
    await invoke("update_session_files_command", {
      sessionId,
      filesToAdd: opts.addIncluded ?? [],
      filesToRemove: opts.removeIncluded ?? [],
      excludedToAdd: opts.addExcluded ?? [],
      excludedToRemove: opts.removeExcluded ?? [],
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}
