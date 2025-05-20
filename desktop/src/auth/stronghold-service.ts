import { appDataDir } from '@tauri-apps/api/path';
// Import from our fallback implementation
import { Client, Stronghold, Store } from './fallback-storage';

/**
 * A service that handles secure storage using the Stronghold plugin.
 * Follows the exact implementation pattern from the official example.
 */
class StrongholdService {
  private strongholdInstance?: Stronghold;
  private clientInstance?: Client;
  private storeInstance?: Store;
  private isServiceInitialized: boolean = false;

  /**
   * Initialize the Stronghold service with a password.
   * This will load the vault or create it if it doesn't exist.
   * @param password The password to unlock the vault
   */
  async initialize(password: string = 'default-vault-password'): Promise<void> {
    // Use a promise with timeout to prevent hanging indefinitely
    const initWithTimeout = async (timeoutMs: number = 5000): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        // Set timeout to reject if initialization takes too long
        const timeoutId = setTimeout(() => {
          reject(new Error('Stronghold initialization timed out after ' + timeoutMs + 'ms'));
        }, timeoutMs);
        
        try {
          if (this.isServiceInitialized) {
            console.log('[StrongholdService] Service is already initialized.');
            clearTimeout(timeoutId);
            return resolve();
          }
    
          console.log('[StrongholdService] Starting initialization with fallback storage');
          
          // Get the base app data directory for storing the vault
          const baseAppDataDir = await appDataDir();
          const vaultPath = `${baseAppDataDir}/vibe-manager.stronghold`;
          console.log(`[StrongholdService] Vault path: ${vaultPath}`);
    
          // Load the existing vault or create a new one if it doesn't exist
          this.strongholdInstance = await Stronghold.load(vaultPath, password);
          console.log('[StrongholdService] Stronghold instance loaded successfully');
          
          // Define a client name specific to the app
          const clientName = "vibe_manager_auth_client";
          
          try {
            // Try to load an existing client
            console.log(`[StrongholdService] Attempting to load client: ${clientName}`);
            this.clientInstance = await this.strongholdInstance.loadClient(clientName);
            console.log(`[StrongholdService] Successfully loaded client: ${clientName}`);
          } catch (error) {
            // If the client doesn't exist, create a new one
            console.log(`[StrongholdService] Client not found. Creating new client: ${clientName}`);
            this.clientInstance = await this.strongholdInstance.createClient(clientName);
            console.log(`[StrongholdService] Client created successfully: ${clientName}`);
            
            // Save the vault to persist the new client
            await this.strongholdInstance.save();
            console.log('[StrongholdService] Saved Stronghold after client creation');
          }
          
          // Get the store from the client for storing key-value pairs
          if (this.clientInstance) {
            console.log('[StrongholdService] Getting store from client');
            this.storeInstance = this.clientInstance.getStore();
            console.log('[StrongholdService] Store obtained successfully');
          } else {
            throw new Error('Client instance is undefined after initialization');
          }
          
          // Mark the service as initialized
          this.isServiceInitialized = true;
          console.log('[StrongholdService] Successfully initialized with fallback storage');
          
          clearTimeout(timeoutId);
          resolve();
        } catch (error: any) {
          console.error('[StrongholdService] Initialization failed:', error);
          // Reset state on failure
          this.resetState();
          clearTimeout(timeoutId);
          reject(new Error(`Failed to initialize Stronghold service: ${error.message}`));
        }
      });
    };
    
    try {
      await initWithTimeout();
    } catch (error: any) {
      console.error('[StrongholdService] Initialization timed out or failed:', error);
      // Revert to a functional state
      this.resetState();
      throw error;
    }
  }

  /**
   * Get an item from the store by key
   * @param key The key to retrieve
   * @returns The value as a string, or null if not found
   */
  async getItem(key: string): Promise<string | null> {
    if (!this.isServiceInitialized || !this.storeInstance) {
      throw new Error("Stronghold service is not initialized or store is unavailable.");
    }
    
    try {
      const dataArray = await this.storeInstance.get(key);
      
      if (dataArray && dataArray.length > 0) {
        return new TextDecoder().decode(new Uint8Array(dataArray));
      }
      
      return null;
    } catch (error: any) {
      console.error(`[StrongholdService] Error getting item with key '${key}':`, error);
      // If the key doesn't exist, return null instead of throwing
      if (error.message?.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Store an item in the store by key
   * @param key The key to store
   * @param value The value to store
   */
  async setItem(key: string, value: string): Promise<void> {
    if (!this.isServiceInitialized || !this.storeInstance || !this.strongholdInstance) {
      throw new Error("Stronghold service is not initialized or store/instance is unavailable.");
    }
    
    try {
      // Convert string to array of numbers (bytes)
      const encodedData = Array.from(new TextEncoder().encode(value));
      
      // Insert the data
      await this.storeInstance.insert(key, encodedData);
      
      // Save the vault to persist changes
      await this.strongholdInstance.save();
      
      console.log(`[StrongholdService] Successfully stored item with key '${key}'`);
    } catch (error: any) {
      console.error(`[StrongholdService] Error setting item with key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Remove an item from the store by key
   * @param key The key to remove
   */
  async removeItem(key: string): Promise<void> {
    if (!this.isServiceInitialized || !this.storeInstance || !this.strongholdInstance) {
      throw new Error("Stronghold service is not initialized or store/instance is unavailable.");
    }
    
    try {
      // Remove the key-value pair
      await this.storeInstance.remove(key);
      
      // Save the vault to persist changes
      await this.strongholdInstance.save();
      
      console.log(`[StrongholdService] Successfully removed item with key '${key}'`);
    } catch (error: any) {
      console.error(`[StrongholdService] Error removing item with key '${key}':`, error);
      // If the key doesn't exist, swallow the error
      if (error.message?.includes("not found")) {
        return;
      }
      throw error;
    }
  }

  /**
   * Check if the Stronghold service is initialized
   * @returns True if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.isServiceInitialized;
  }

  /**
   * Clear the Stronghold state and reset all instances
   * Note: This only clears the in-memory state, not the vault file
   */
  async clearStrongholdStateAndLogout(): Promise<void> {
    this.resetState();
    console.log('[StrongholdService] State cleared');
  }

  /**
   * Reset all internal state
   */
  private resetState(): void {
    this.isServiceInitialized = false;
    this.storeInstance = undefined;
    this.clientInstance = undefined;
    this.strongholdInstance = undefined;
  }
}

// Export a singleton instance
export const strongholdService = new StrongholdService();