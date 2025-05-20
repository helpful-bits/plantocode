/**
 * Application logger utility that can be configured to disable console output in production
 */

// Set to false to disable all console logs in production
const isLoggingEnabled = import.meta.env.DEV;

// Define log levels for type safety
export type LogLevel = "debug" | "info" | "log" | "warn" | "error";

interface LoggerOptions {
  namespace: string;
}

/**
 * Creates a namespaced logger that prefixes all messages
 */
export function createLogger(options: LoggerOptions) {
  const { namespace } = options;
  const prefix = `[${namespace}]`;

  return {
    debug: (...args: unknown[]) => {
      if (isLoggingEnabled) {
        console.debug(prefix, ...args);
      }
    },
    log: (...args: unknown[]) => {
      if (isLoggingEnabled) {
        // eslint-disable-next-line no-console
        console.log(prefix, ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (isLoggingEnabled) {
        console.info(prefix, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (isLoggingEnabled) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args: unknown[]) => {
      if (isLoggingEnabled) {
        console.error(prefix, ...args);
      }
    },
  };
}