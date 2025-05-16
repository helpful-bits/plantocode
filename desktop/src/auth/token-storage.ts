/**
 * Token Storage for Desktop App
 * 
 * Provides functions for storing and retrieving authentication tokens
 * using Tauri's Stronghold plugin through Rust commands.
 */

import { invoke } from '@tauri-apps/api/tauri';
import { Client, Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

// Constants
const TOKEN_KEY = 'auth_token';
const CLIENT_NAME = 'auth_client';
const VAULT_PASSWORD = 'vibe-manager-secure-vault'; // NOTE: In production, use a secure password strategy

/**
 * Initialize Stronghold vault
 * This is still needed to ensure the Stronghold vault is properly set up
 * before we use the Rust commands to access it.
 */
export async function initStronghold(): Promise<void> {
  try {
    console.log('[Desktop] Initializing Stronghold vault...');
    
    // Get app data directory for vault path
    const vaultPath = `${await appDataDir()}/vault.hold`;
    
    try {
      // Try to load existing vault
      const stronghold = await Stronghold.load(vaultPath, VAULT_PASSWORD);
      
      try {
        // Try to load existing client
        await stronghold.loadClient(CLIENT_NAME);
      } catch (error) {
        console.log('[Desktop] Client not found, creating new one...');
        // Create new client if it doesn't exist
        await stronghold.createClient(CLIENT_NAME);
      }
    } catch (error) {
      console.log('[Desktop] Vault not found, creating new one...');
      // Create new vault if it doesn't exist
      const stronghold = await Stronghold.create(vaultPath, VAULT_PASSWORD);
      await stronghold.createClient(CLIENT_NAME);
    }
    
    console.log('[Desktop] Stronghold vault initialized successfully');
  } catch (error) {
    console.error('[Desktop] Failed to initialize Stronghold vault:', error);
    throw error;
  }
}

/**
 * Store a token securely using Rust command
 */
export async function storeToken(token: string): Promise<void> {
  try {
    // Use the Rust command to store token in Stronghold
    await invoke('store_token', { token });
    console.log('[Desktop] Token stored successfully via Rust command');
  } catch (error) {
    console.error('[Desktop] Failed to store token:', error);
    throw error;
  }
}

/**
 * Get the stored token using Rust command
 */
export async function getToken(): Promise<string | null> {
  try {
    // Use the Rust command to retrieve token from Stronghold
    const token = await invoke<string | null>('get_stored_token');
    return token;
  } catch (error) {
    console.error('[Desktop] Failed to get token:', error);
    return null;
  }
}

/**
 * Clear the stored token using Rust command
 */
export async function clearToken(): Promise<void> {
  try {
    // Use the Rust command to clear token from Stronghold
    await invoke('clear_stored_token');
    console.log('[Desktop] Token cleared successfully via Rust command');
  } catch (error) {
    console.error('[Desktop] Failed to clear token:', error);
    throw error;
  }
}