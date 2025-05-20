/**
 * Streaming Request Pool
 *
 * This is a placeholder module for managing streaming requests.
 * In the Tauri architecture, most streaming is handled by the Rust backend,
 * but this provides compatibility for components that expect to cancel streams.
 */

const streamingRequestPool = {
  /**
   * Cancels a request with the given ID
   */
  cancelRequest: (jobId: string, reason: string) => {
    console.warn(
      `[streamingRequestPool] Cancelling ${jobId} - ${reason} (placeholder - stream management is handled by Tauri backend)`
    );
  },
};

export default streamingRequestPool;
