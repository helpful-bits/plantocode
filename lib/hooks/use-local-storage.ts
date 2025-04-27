"use client";

import { useState, useEffect } from 'react';

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
  
  // Return a wrapped version of useState's setter function that 
  // persists the new value to localStorage.
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      // Save state
      setStoredValue(valueToStore);
      // Save to local storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
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