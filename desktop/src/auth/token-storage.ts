/**
 * Token Storage for Desktop App
 * 
 * Provides functions for storing and retrieving authentication tokens
 * using Tauri's Stronghold plugin.
 */

import { invoke } from '@tauri-apps/api/core';
import { Client, Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

// Constants
const TOKEN_KEY = 'auth_token';
const CLIENT_NAME = 'auth_client';
const VAULT_PASSWORD = 'vibe-manager-secure-vault'; // NOTE: In production, use a secure password strategy

// Cache for Stronghold instances
let strongholdInstance: Stronghold | null = null;
let clientInstance: Client | null = null;

/**
 * Initialize Stronghold vault
 * Creates and loads the vault if it doesn't exist
 */
export async function initStronghold(): Promise<{ stronghold: Stronghold, client: Client }> {
  try {
    // Return cached instances if available
    if (strongholdInstance && clientInstance) {
      return {
        stronghold: strongholdInstance,
        client: clientInstance,
      };
    }

    console.log('[Desktop] Initializing Stronghold vault...');
    
    // Get app data directory for vault path
    const vaultPath = `${await appDataDir()}/vault.hold`;
    
    try {
      // Try to load existing vault
      strongholdInstance = await Stronghold.load(vaultPath, VAULT_PASSWORD);
    } catch (error) {
      console.log('[Desktop] Vault not found, creating new one...');
      // Create new vault if it doesn't exist
      strongholdInstance = await Stronghold.create(vaultPath, VAULT_PASSWORD);
    }
    
    try {
      // Try to load existing client
      clientInstance = await strongholdInstance.loadClient(CLIENT_NAME);
    } catch (error) {
      console.log('[Desktop] Client not found, creating new one...');
      // Create new client if it doesn't exist
      clientInstance = await strongholdInstance.createClient(CLIENT_NAME);
    }
    
    console.log('[Desktop] Stronghold vault initialized successfully');
    
    return {
      stronghold: strongholdInstance,
      client: clientInstance,
    };
  } catch (error) {
    console.error('[Desktop] Failed to initialize Stronghold vault:', error);
    throw error;
  }
}

/**
 * Insert a record into Stronghold
 */
export async function insertRecord(key: string, value: string): Promise<void> {
  try {
    // Initialize Stronghold and get client
    const { client } = await initStronghold();
    
    // Get the store and insert value
    const store = client.getStore();
    const data = Array.from(new TextEncoder().encode(value));
    await store.insert(key, data);
    
    // Save changes to stronghold
    await (await initStronghold()).stronghold.save();
    
    console.log(`[Desktop] Record stored in Stronghold: ${key}`);
  } catch (error) {
    console.error(`[Desktop] Failed to store record in Stronghold: ${key}`, error);
    throw error;
  }
}

/**
 * Get a record from Stronghold
 */
export async function getRecord(key: string): Promise<string | null> {
  try {
    // Initialize Stronghold and get client
    const { client } = await initStronghold();
    
    // Get the store and retrieve value
    const store = client.getStore();
    try {
      const data = await store.get(key);
      return new TextDecoder().decode(new Uint8Array(data));
    } catch (error) {
      // Key not found
      return null;
    }
  } catch (error) {
    console.error(`[Desktop] Failed to retrieve record from Stronghold: ${key}`, error);
    return null;
  }
}

/**
 * Delete a record from Stronghold
 */
export async function deleteRecord(key: string): Promise<void> {
  try {
    // Initialize Stronghold and get client
    const { client } = await initStronghold();
    
    // Get the store and delete value
    const store = client.getStore();
    await store.remove(key);
    
    // Save changes to stronghold
    await (await initStronghold()).stronghold.save();
    
    console.log(`[Desktop] Record deleted from Stronghold: ${key}`);
  } catch (error) {
    console.error(`[Desktop] Failed to delete record from Stronghold: ${key}`, error);
    throw error;
  }
}

/**
 * Store a token securely
 */
export async function storeToken(token: string): Promise<void> {
  try {
    // Store using Stronghold
    await insertRecord(TOKEN_KEY, token);
    
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
    // Get token from Stronghold
    const token = await getRecord(TOKEN_KEY);
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
    // Delete from Stronghold
    await deleteRecord(TOKEN_KEY);
    
    console.log('[Desktop] Token cleared successfully');
  } catch (error) {
    console.error('[Desktop] Failed to clear token:', error);
    throw error;
  }
}