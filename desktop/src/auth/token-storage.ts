/**
 * Token Storage for Desktop App using Stronghold Service
 */

import { strongholdService } from "./stronghold-service";

// Constants for token storage
const APP_JWT_KEY = "app_jwt";

/**
 * Get the token from Stronghold
 * @returns The token or null if not found
 */
export async function getToken(): Promise<string | null> {
  if (!strongholdService.isInitialized()) {
    console.warn("Attempted to get token when Stronghold is not initialized.");
    return null;
  }
  
  try {
    return await strongholdService.getItem(APP_JWT_KEY);
  } catch (e) {
    console.error("Failed to get token from Stronghold:", e);
    return null;
  }
}

/**
 * Store the token in Stronghold
 * @param token The JWT token to store
 */
export async function storeToken(token: string): Promise<void> {
  if (!strongholdService.isInitialized()) {
    throw new Error("Stronghold not initialized. Cannot store token.");
  }
  
  try {
    await strongholdService.setItem(APP_JWT_KEY, token);
  } catch (e) {
    console.error("Failed to store token in Stronghold:", e);
    throw new Error(`Failed to store authentication token securely: ${e}`);
  }
}

/**
 * Clear the token from Stronghold
 */
export async function clearToken(): Promise<void> {
  if (!strongholdService.isInitialized()) {
    console.warn("Attempted to clear token when Stronghold is not initialized.");
    return;
  }
  
  try {
    await strongholdService.removeItem(APP_JWT_KEY);
  } catch (e) {
    console.error("Failed to clear token from Stronghold:", e);
    // Non-fatal error, don't throw
  }
}