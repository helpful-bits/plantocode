/**
 * A simple fallback storage mechanism using browser's localStorage
 * when Stronghold is not available.
 */

// No need for a constant here as we use the key provided by token-storage.ts

/**
 * Store class to mimic the Stronghold API
 */
class LocalStore {
  /**
   * Insert a record in localStorage
   */
  async insert(key: string, data: number[]): Promise<void> {
    try {
      // Convert array of numbers back to string
      const value = new TextDecoder().decode(new Uint8Array(data));
      localStorage.setItem(key, value);
      console.log(`[LocalStore] Stored data for key: ${key}`);
    } catch (error) {
      console.error(`[LocalStore] Error storing data for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a record from localStorage
   */
  async get(key: string): Promise<number[] | undefined> {
    try {
      const value = localStorage.getItem(key);
      if (value === null) {
        return undefined;
      }
      // Convert string to array of bytes
      return Array.from(new TextEncoder().encode(value));
    } catch (error) {
      console.error(`[LocalStore] Error getting data for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Remove a record from localStorage
   */
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
      console.log(`[LocalStore] Removed data for key: ${key}`);
    } catch (error) {
      console.error(`[LocalStore] Error removing data for key ${key}:`, error);
      throw error;
    }
  }
}

/**
 * Client class to mimic the Stronghold API
 */
class LocalClient {
  private store: LocalStore;

  constructor() {
    this.store = new LocalStore();
  }

  /**
   * Get the store instance
   */
  getStore(): LocalStore {
    return this.store;
  }
}

/**
 * Stronghold class to mimic the Stronghold API
 */
class LocalStronghold {
  private client: LocalClient;

  constructor() {
    this.client = new LocalClient();
  }

  /**
   * Load a client or create one if it doesn't exist
   */
  async loadClient(_clientName: string): Promise<LocalClient> {
    return this.client;
  }

  /**
   * Create a new client
   */
  async createClient(_clientName: string): Promise<LocalClient> {
    return this.client;
  }

  /**
   * Save the stronghold state - no-op in localStorage implementation
   */
  async save(): Promise<void> {
    // No-op in localStorage
    console.log('[LocalStronghold] State saved (simulated)');
  }

  /**
   * Static method to load or create a new Stronghold instance
   */
  static async load(_vaultPath: string, _password: string): Promise<LocalStronghold> {
    return new LocalStronghold();
  }
}

export { LocalStronghold as Stronghold, LocalClient as Client, LocalStore as Store };