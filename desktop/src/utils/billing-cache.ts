/**
 * Simple caching system for billing data
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class BillingDataCache {
  private cache = new Map<string, CacheEntry<any>>();

  // Cache TTL settings (in milliseconds)
  private readonly ttlSettings: Record<string, number> = {
    subscriptionDetails: 5 * 60 * 1000, // 5 minutes
    paymentMethods: 10 * 60 * 1000, // 10 minutes
    creditBalance: 2 * 60 * 1000, // 2 minutes
    billingDetails: 15 * 60 * 1000, // 15 minutes
    invoices: 30 * 60 * 1000, // 30 minutes
    spendingAnalytics: 5 * 60 * 1000, // 5 minutes
    spendingForecast: 10 * 60 * 1000, // 10 minutes
    creditPacks: 60 * 60 * 1000, // 1 hour
    subscriptionPlans: 60 * 60 * 1000, // 1 hour
  };

  /**
   * Get cached data or fetch if not available/expired
   */
  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry && (now - entry.timestamp) < entry.ttl) {
      return entry.data;
    }

    try {
      const data = await fetcher();
      const ttl = this.ttlSettings[key] || 5 * 60 * 1000; // Default 5 minutes
      
      this.cache.set(key, {
        data,
        timestamp: now,
        ttl
      });

      return data;
    } catch (error) {
      // If we have stale data, return it
      if (entry) {
        return entry.data;
      }
      throw error;
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
}

export const billingCache = new BillingDataCache();

// Simple cache invalidation event dispatcher
const cacheInvalidationListeners = new Set<(event: string) => void>();

export function dispatchCacheInvalidation(event: string): void {
  cacheInvalidationListeners.forEach(listener => listener(event));
  
  // Handle specific cache invalidation events
  switch (event) {
    case 'CREDITS_UPDATED':
      billingCache.invalidatePattern(/^(spendingStatus|creditBalance)$/);
      break;
    case 'PAYMENT_METHODS_UPDATED':
      billingCache.invalidatePattern(/^(paymentMethods|billingDetails)$/);
      break;
    case 'SUBSCRIPTION_UPDATED':
      billingCache.invalidatePattern(/^(subscriptionDetails|billingDetails)$/);
      break;
    case 'SPENDING_UPDATED':
      billingCache.invalidatePattern(/^(spendingStatus|spendingAnalytics|spendingForecast)$/);
      break;
  }
}

export function onCacheInvalidation(listener: (event: string) => void): () => void {
  cacheInvalidationListeners.add(listener);
  return () => cacheInvalidationListeners.delete(listener);
}