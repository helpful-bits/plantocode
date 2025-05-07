"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

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
  
  // Debounce delay for localStorage writes
  const DEBOUNCE_DELAY = 1000;
  
  // Timeout reference for debouncing
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Function to write to localStorage
  const writeToLocalStorage = useCallback((value: T) => {
    if (typeof window === 'undefined') return;
    
    try {
      const serializedValue = JSON.stringify(value);
      
      // Check if the value is already what's in localStorage
      const currentValue = window.localStorage.getItem(key);
      if (currentValue === serializedValue) {
        return;
      }
      
      // Update localStorage
      window.localStorage.setItem(key, serializedValue);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);
  
  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage
  const setValue = useCallback((value: T | ((val: T) => T), highPriority: boolean = false) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Skip update if the value hasn't changed and it's not high priority
      if (!highPriority && JSON.stringify(valueToStore) === JSON.stringify(storedValue)) {
        return;
      }
      
      // Save to state
      setStoredValue(valueToStore);
      
      // Clear any pending debounced write
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Handle localStorage update based on priority
      if (highPriority) {
        // Write immediately for high priority updates
        writeToLocalStorage(valueToStore);
      } else {
        // Debounce localStorage writes for normal priority updates
        timeoutRef.current = setTimeout(() => {
          writeToLocalStorage(valueToStore);
        }, DEBOUNCE_DELAY);
      }
    } catch (error) {
      console.error(`Error in setValue for localStorage key "${key}":`, error);
    }
  }, [storedValue, key, writeToLocalStorage]);
  
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
  
  // Clean up the timeout when the component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return [storedValue, setValue] as const;
}