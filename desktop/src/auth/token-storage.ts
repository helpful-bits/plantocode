/**
 * Token Storage for Desktop App
 *
 * Provides functions for retrieving and clearing authentication tokens
 * using Tauri's Stronghold plugin through Rust commands.
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Get the stored token using Rust command
 * @returns The token or null if not found or an error occurred
 */
export async function getToken(): Promise<string | null> {
  try {
    // Use the Rust command to retrieve token from Stronghold
    const token = await invoke<string | null>("get_stored_token");
    return token;
  } catch (_) {
    return null;
  }
}

/**
 * Clear the stored token using Rust command
 */
export async function clearToken(): Promise<void> {
  // Use the Rust command to clear token from Stronghold
  await invoke("clear_stored_token");
}
