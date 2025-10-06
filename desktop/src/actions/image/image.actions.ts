import { invoke } from "@tauri-apps/api/core";

export async function savePastedImage(
  sessionId: string,
  data: Uint8Array | number[],
  fileName?: string,
  mimeType?: string
): Promise<string> {
  const bytes = Array.from(data as Uint8Array);
  return invoke("save_pasted_image_command", {
    sessionId,
    fileName: fileName || null,
    mimeType: mimeType || null,
    data: bytes
  });
}