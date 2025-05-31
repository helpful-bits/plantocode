/**
 * Checks if a buffer likely represents a binary file.
 * It looks for null bytes or a high percentage of non-printable ASCII characters.
 */
export function isBinaryFile(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return false; // Empty file is not binary

  // Combine null byte check and non-printable character count in a single loop
  let nonPrintableCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    
    // If a null byte is found, return true immediately
    if (byte === 0) return true;
    
    // Count non-printable characters (excluding tab, LF, CR)
    if (
      (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) ||
      byte >= 127
    ) {
      nonPrintableCount++;
    }
  }

  const ratio = nonPrintableCount / buffer.length;

  // If more than 10% are non-printable, assume binary
  return ratio > 0.1;
}

/**
 * Converts a File or Blob to a base64 string.
 * Used for sending binary data over JSON APIs.
 */
export async function convertFileToBase64(file: File | Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        // Remove the data URL prefix (e.g., "data:audio/wav;base64,")
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("FileReader result is not a string"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file as ArrayBuffer"));
  });
}

export const BINARY_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".ico",
  ".webp", // Images
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".mov",
  ".avi", // Audio/Video
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx", // Documents
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar", // Archives
  ".jar",
  ".war",
  ".ear", // Java Archives
  ".ttf",
  ".woff",
  ".woff2",
  ".otf",
  ".eot", // Fonts
  ".map", // Source maps
  ".exe",
  ".dll",
  ".so",
  ".dylib", // Executables/Libraries
  ".db",
  ".sqlite",
  ".sqlite3", // Databases
  ".wasm", // WebAssembly
  ".pyc", // Python compiled
  ".lockb", // pnpm lockfile binary variant
]);
