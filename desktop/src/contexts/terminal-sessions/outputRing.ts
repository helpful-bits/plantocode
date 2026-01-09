/**
 * Constants for terminal output buffering
 */
export const DESKTOP_TERMINAL_RING_MAX_BYTES = 8 * 1024 * 1024; // 8MB total buffer
export const DESKTOP_TERMINAL_SNAPSHOT_MAX_BYTES = 256 * 1024; // 256KB snapshot for hydration

/**
 * A bounded circular buffer for terminal output.
 * Uses a chunk-based approach to avoid copying on every append.
 */
export class ByteRing {
  private chunks: Uint8Array[] = [];
  private totalBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  /**
   * Adds data to the ring, evicting oldest chunks when full.
   */
  append(chunk: Uint8Array): void {
    if (chunk.length === 0) {
      return;
    }

    // If the chunk itself is larger than maxBytes, only keep the last maxBytes
    if (chunk.length >= this.maxBytes) {
      this.chunks = [chunk.slice(chunk.length - this.maxBytes)];
      this.totalBytes = this.chunks[0].length;
      return;
    }

    // Add the new chunk
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;

    // Evict oldest chunks until we're within the limit
    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const oldest = this.chunks[0];
      const excess = this.totalBytes - this.maxBytes;

      if (oldest.length <= excess) {
        // Remove the entire oldest chunk
        this.chunks.shift();
        this.totalBytes -= oldest.length;
      } else {
        // Partial eviction: trim the oldest chunk
        this.chunks[0] = oldest.slice(excess);
        this.totalBytes -= excess;
      }
    }
  }

  /**
   * Returns the last N bytes from the buffer.
   * @param maxBytes Maximum bytes to return (defaults to all buffered data)
   */
  snapshot(maxBytes?: number): Uint8Array {
    if (this.totalBytes === 0) {
      return new Uint8Array(0);
    }

    const requestedBytes = maxBytes !== undefined ? Math.min(maxBytes, this.totalBytes) : this.totalBytes;

    if (requestedBytes <= 0) {
      return new Uint8Array(0);
    }

    // If requesting all bytes, concatenate all chunks
    if (requestedBytes >= this.totalBytes) {
      const result = new Uint8Array(this.totalBytes);
      let offset = 0;
      for (const chunk of this.chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    }

    // Need to return only the last requestedBytes
    const result = new Uint8Array(requestedBytes);
    let remaining = requestedBytes;
    let resultOffset = requestedBytes;

    // Iterate from the end, copying chunks into result
    for (let i = this.chunks.length - 1; i >= 0 && remaining > 0; i--) {
      const chunk = this.chunks[i];
      const bytesToCopy = Math.min(chunk.length, remaining);
      const sourceOffset = chunk.length - bytesToCopy;

      resultOffset -= bytesToCopy;
      result.set(chunk.subarray(sourceOffset), resultOffset);
      remaining -= bytesToCopy;
    }

    return result;
  }

  /**
   * Returns the current number of bytes stored in the buffer.
   */
  get size(): number {
    return this.totalBytes;
  }

  /**
   * Clears all data from the buffer.
   */
  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }
}
