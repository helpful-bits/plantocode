/**
 * Token Storage for Desktop App
 *
 * Provides functions for storing and retrieving authentication tokens
 * using Tauri's Stronghold plugin through Rust commands.
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Initialize Stronghold vault via Rust command
 * This uses the Rust-side implementation for secure storage handling
 */
export async function initStronghold(): Promise<void> {
  try {
    await invoke("initialize_secure_storage");
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to initialize secure storage via Rust command");
  }
}

/**
 * Store a token securely using Rust command
 */
export async function storeToken(token: string): Promise<void> {
  // Use the Rust command to store token in Stronghold
  await invoke("store_token", { token });
}

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
