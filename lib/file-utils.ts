/**
 * Checks if a buffer likely represents a binary file.
 * It looks for null bytes or a high percentage of non-printable ASCII characters.
 */
export async function isBinaryFile(buffer: Buffer): Promise<boolean> {
  if (buffer.length === 0) return false; // Empty file is not binary

  // Check for null byte, a strong indicator of binary content
  const hasNullByte = buffer.includes(0);
  if (hasNullByte) return true;

  // Check ratio of non-printable characters (excluding tab, LF, CR)
  const nonPrintable = buffer.filter(byte => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127);
  const ratio = nonPrintable.length / buffer.length;

  // If more than 10% are non-printable, assume binary
  return ratio > 0.1;
}

export const BINARY_EXTENSIONS = new Set([ // Changed variable name to uppercase
  '.jpg', '.jpeg', '.png', '.gif', '.ico', '.webp', // Images
  '.mp3', '.mp4', '.wav', '.ogg', '.mov', '.avi', // Audio/Video
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', // Documents
  '.zip', '.tar', '.gz', '.7z', '.rar', // Archives
  '.jar', '.war', '.ear', // Java Archives
  '.ttf', '.woff', '.woff2', '.otf', '.eot', // Fonts
  '.map', // Source maps
  '.exe', '.dll', '.so', '.dylib', // Executables/Libraries
  '.db', '.sqlite', '.sqlite3', // Databases
  '.wasm', // WebAssembly
  '.pyc', // Python compiled
  '.lockb', // pnpm lockfile binary variant
]);
