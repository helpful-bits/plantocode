"use client";

import { useState, useEffect, useRef } from 'react';
import { debounce } from '@/lib/utils/debounce';

// Track localStorage setter calls to detect potential issues
const storageSetters = new Map<string, {
  calls: number,
  lastCall: number,
  lastValue: string,
  lastUpdate: number // When localStorage was actually updated (not just when setValue was called)
}>();

// Global rate limiting to prevent excessive calls
const GLOBAL_STORAGE_RATE_LIMIT = {
  lastUpdates: [] as number[],
  windowSize: 60000, // 1 minute window
  maxUpdatesPerWindow: 12 // Maximum 12 localStorage updates per minute globally across all keys (reduced from 15)
};

/**
 * Helper to check if we should rate limit localStorage updates globally
 */
function shouldRateLimitGlobal(): boolean {
  const now = Date.now();
  // Filter out updates older than our window
  GLOBAL_STORAGE_RATE_LIMIT.lastUpdates = GLOBAL_STORAGE_RATE_LIMIT.lastUpdates.filter(
    time => now - time < GLOBAL_STORAGE_RATE_LIMIT.windowSize
  );
  
  // Check if we're over the limit
  if (GLOBAL_STORAGE_RATE_LIMIT.lastUpdates.length >= GLOBAL_STORAGE_RATE_LIMIT.maxUpdatesPerWindow) {
    console.warn(`[useLocalStorage] Global rate limit reached: ${GLOBAL_STORAGE_RATE_LIMIT.lastUpdates.length} updates in the last minute`);
    return true;
  }
  
  // Not rate limited
  return false;
}

/**
 * Hook for managing state in localStorage
 * 
 * @param key The key to use for storing in localStorage
 * @param initialValue The initial value to use if no value is found in localStorage
 * @returns A tuple with the current value and a function to update it
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // Create state to hold the current value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      // Parse stored json or if none return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });
  
  // Track the last setValue call time to prevent too frequent updates
  const lastSetTimeRef = useRef<number>(0);
  const MIN_UPDATE_INTERVAL = 10000; // Increased from 8000ms to 10000ms to reduce rate limiting
  
  // Maintain a record of pending values to avoid setting the same value twice
  const pendingValueRef = useRef<string | null>(null);
  
  // Create a debounced function for updating localStorage
  // Using useRef to maintain a stable reference across renders
  const debouncedSetItem = useRef(
    debounce((key: string, value: string) => {
      try {
        if (typeof window !== 'undefined') {
          const now = Date.now();
          
          // Skip if the value is already what's in localStorage
          const currentValue = window.localStorage.getItem(key);
          if (currentValue === value) {
            console.log(`[useLocalStorage] Skipping identical value for key "${key}"`);
            pendingValueRef.current = null; // Clear the pending value
            return;
          }
          
          // Apply global rate limiting
          if (shouldRateLimitGlobal()) {
            console.log(`[useLocalStorage] Rate limiting update to "${key}" due to global limit`);
            
            // Re-queue this update after a delay if it's important
            // Only re-queue if it's a key that needs persistence like session-related keys
            if (key.includes('activeSessionId') || key === 'global-project-dir') {
              setTimeout(() => {
                if (pendingValueRef.current === value) { 
                  window.localStorage.setItem(key, value);
                  GLOBAL_STORAGE_RATE_LIMIT.lastUpdates.push(Date.now());
                  console.log(`[useLocalStorage] Delayed update for key "${key}" after rate limiting`);
                  pendingValueRef.current = null; // Clear pending value after successful update
                }
              }, 10000); // Increased delay from 8000ms to 10000ms
            }
            return;
          }
          
          // Track this update in our global rate limiting
          GLOBAL_STORAGE_RATE_LIMIT.lastUpdates.push(now);
          
          // Update the localStorage
          window.localStorage.setItem(key, value);
          
          // Track when this key was last updated in localStorage
          if (storageSetters.has(key)) {
            storageSetters.get(key)!.lastUpdate = now;
          }
          
          console.log(`[useLocalStorage] Debounced localStorage update for key "${key}" at ${new Date().toISOString()}`);
          pendingValueRef.current = null; // Clear the pending value
        }
      } catch (error) {
        console.error(`[useLocalStorage] Error setting debounced localStorage key "${key}":`, error);
      }
    }, 3000) // Increased from 2000ms to 3000ms debounce delay to further reduce updates
  ).current;
  
  // Return a wrapped version of useState's setter function that 
  // persists the new value to localStorage.
  // Now accepts a priority flag to bypass rate limiting for important operations
  const setValue = (value: T | ((val: T) => T), _option?: any, highPriority: boolean = false) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      
      // Check for deep equality with current stored value before updating state
      const areEqual = JSON.stringify(valueToStore) === JSON.stringify(storedValue);
      if (areEqual) {
        console.log(`[useLocalStorage] Skipping identical state update for key "${key}"`);
        return;
      }
      
      // Save to state
      setStoredValue(valueToStore);
      
      // Generate string value
      const valueString = JSON.stringify(valueToStore);
      
      // Check if this represents a change
      const isSameAsPending = pendingValueRef.current === valueString;
      if (isSameAsPending) {
        console.log(`[useLocalStorage] Ignoring duplicate setValue call for key "${key}"`);
        return;
      }
      
      // Update pending value
      pendingValueRef.current = valueString;
      
      // Track calls to identify potential rapid triggers
      const now = Date.now();
      if (!storageSetters.has(key)) {
        storageSetters.set(key, { 
          calls: 1, 
          lastCall: now, 
          lastValue: valueString,
          lastUpdate: 0 // Will be set when localStorage is actually updated
        });
      } else {
        const entry = storageSetters.get(key)!;
        const timeDiff = now - entry.lastCall;
        const timeSinceLastUpdate = now - entry.lastUpdate;
        
        // Check if the value is the same as the last one set
        const isSameAsPrevious = entry.lastValue === valueString;
        
        entry.calls++;
        entry.lastCall = now;
        entry.lastValue = valueString;
        
        // Log if setter is called too frequently with the same value
        if (timeDiff < 5000 && entry.calls > 3) {
          console.warn(`[useLocalStorage] Frequent setValue calls for key "${key}":
            - Calls: ${entry.calls}
            - Time since last: ${timeDiff}ms
            - Time since last actual update: ${timeSinceLastUpdate}ms
            - Same value as previous: ${isSameAsPrevious}
            - High priority: ${highPriority}
          `);
          
          // Reset counter every 30 seconds
          if (timeDiff > 30000) {
            entry.calls = 1;
          }
        }
        
        // Skip rate limiting for high priority operations (like session switching)
        if (!highPriority) {
          // Enhanced rate limiting logic
          // Don't update localStorage if:
          // 1. Value is the same as what was just set AND less than MIN_UPDATE_INTERVAL has passed
          // 2. OR we've had more than 3 calls in under 20 seconds
          // 3. OR it's been less than 5 seconds since the last update for any value
          const isRapidFireCalls = entry.calls > 3 && timeSinceLastUpdate < 20000;
          const isTooSoonAfterLastUpdate = now - lastSetTimeRef.current < 5000;
          
          if ((isSameAsPrevious && timeDiff < MIN_UPDATE_INTERVAL) || isRapidFireCalls || isTooSoonAfterLastUpdate) {
            if (isRapidFireCalls) {
              console.warn(`[useLocalStorage] Rate limiting key "${key}" due to rapid-fire calls (${entry.calls} calls in ${timeSinceLastUpdate}ms)`);
            } else if (isTooSoonAfterLastUpdate) {
              console.log(`[useLocalStorage] Throttling update for "${key}" (only ${now - lastSetTimeRef.current}ms since last update)`);
            } else {
              console.log(`[useLocalStorage] Ignoring redundant setValue for key "${key}" (${timeDiff}ms since last call)`);
            }
            return;
          }
        } else {
          console.log(`[useLocalStorage] Bypassing rate limiting for high priority operation on key "${key}"`);
        }
      }
      
      // For high priority operations, update localStorage immediately instead of debouncing
      if (highPriority) {
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, valueString);
            console.log(`[useLocalStorage] Immediate update for high priority operation on key "${key}"`);
            pendingValueRef.current = null; // Clear pending value after immediate update
            
            // Track when this key was last updated in localStorage
            if (storageSetters.has(key)) {
              storageSetters.get(key)!.lastUpdate = now;
            }
          }
        } catch (error) {
          console.error(`[useLocalStorage] Error during immediate localStorage update:`, error);
          // Fall back to debounced update if immediate update fails
          debouncedSetItem(key, valueString);
        }
      } else {
        // Use debounced localStorage update for normal priority operations
        debouncedSetItem(key, valueString);
      }
      
      // Record last set time
      lastSetTimeRef.current = now;
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };
  
  // Listen for changes to this localStorage key in other windows/tabs
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === key && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          console.error(`Error parsing localStorage change for key "${key}":`, error);
        }
      }
    }
    
    // Add event listener
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      
      // Remove event listener on cleanup
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [key]);
  
  return [storedValue, setValue] as const;
} 