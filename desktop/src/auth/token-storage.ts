/**
 * Token Storage for Desktop App
 * 
 * Provides functions for storing and retrieving authentication tokens
 * using Tauri's Stronghold plugin.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Store a token securely
 */
export async function storeToken(token: string): Promise<void> {
  try {
    await invoke('store_token', { token });
    console.log('[Desktop] Token stored successfully');
  } catch (error) {
    console.error('[Desktop] Failed to store token:', error);
    throw error;
  }
}

/**
 * Get the stored token
 */
export async function getToken(): Promise<string | null> {
  try {
    const token = await invoke<string | null>('get_stored_token');
    return token;
  } catch (error) {
    console.error('[Desktop] Failed to get token:', error);
    return null;
  }
}

/**
 * Clear the stored token
 */
export async function clearToken(): Promise<void> {
  try {
    await invoke('clear_stored_token');
    console.log('[Desktop] Token cleared successfully');
  } catch (error) {
    console.error('[Desktop] Failed to clear token:', error);
    throw error;
  }
}