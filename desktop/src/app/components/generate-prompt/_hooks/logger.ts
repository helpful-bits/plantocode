"use client";

// A simple logger that can be enabled/disabled via environment variable or flag
const DEBUG_ENABLED = false;  // Set to false to disable all debug logs in production

export const logger = {
  debug: (context: string, ...args: unknown[]) => {
    if (DEBUG_ENABLED) {
      // eslint-disable-next-line no-console
      console.log(`[${context}]`, ...args);
    }
  },
  
  error: (context: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, ...args);
  },
  
  warn: (context: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.warn(`[${context}]`, ...args);
  },
  
  info: (context: string, ...args: unknown[]) => {
    if (DEBUG_ENABLED) {
      // eslint-disable-next-line no-console
      console.info(`[${context}]`, ...args);
    }
  }
};