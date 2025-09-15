/**
 * Platform and environment detection utilities for conditional rendering and behavior
 *
 * These utilities help determine the environment in which the application
 * is running, allowing for platform-specific adjustments.
 */

/**
 * Checks if code is running within a Tauri application
 */
export const isTauriEnvironment = (): boolean => {
  return typeof window !== "undefined" && 
         typeof (window as any).__TAURI_IPC__ === 'function' && // Check for the IPC function
         typeof (window as any).__TAURI_INTERNALS__ === "object" && 
         (window as any).__TAURI_INTERNALS__ !== null;
};


/**
 * Checks if code is running on server (versus browser)
 */
export const isServer = (): boolean => {
  return typeof window === "undefined";
};

/**
 * Checks if code is running in browser (versus server)
 */
export const isBrowser = (): boolean => {
  return !isServer();
};

/**
 * Checks if code is running in a development environment
 */
export const isDevelopmentEnvironment = (): boolean => {
  return import.meta.env.DEV;
};

/**
 * Checks if running in a development environment
 * Alternative name for isDevelopmentEnvironment
 */
export const isDevelopment = (): boolean => {
  return import.meta.env.DEV;
};

/**
 * Checks if running in a production environment
 */
export const isProduction = (): boolean => {
  return import.meta.env.PROD;
};

/**
 * Checks if running in a test environment
 */
export const isTest = (): boolean => {
  return import.meta.env.MODE === "test";
};

/**
 * Checks if running on a mobile platform (iOS or Android)
 */
export const isMobilePlatform = async (): Promise<boolean> => {
  if (isTauriEnvironment()) {
    try {
      const osModule = await import("@tauri-apps/plugin-os");
      const osType = osModule.type();
      return osType === "ios" || osType === "android";
    } catch (e) {
      console.error("Failed to get OS info from Tauri:", e);
      return false;
    }
  }
  
  // In browser, check user agent
  if (isBrowser()) {
    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android/i.test(userAgent);
  }
  
  return false;
};

/**
 * Gets the operating system information
 */
export const getOSInfo = async (): Promise<{
  os: string;
  arch: string;
} | null> => {
  // If in Tauri environment, use Tauri's OS info
  if (isTauriEnvironment()) {
    try {
      const osModule = await import("@tauri-apps/plugin-os");
      const osType = osModule.type();
      const osArch = osModule.arch();
      return { os: osType, arch: osArch };
    } catch (e) {
      console.error("Failed to get OS info from Tauri:", e);
      return null;
    }
  }

  // In browser, make a best guess based on navigator
  if (isBrowser()) {
    const userAgent = navigator.userAgent.toLowerCase();
    let os = "unknown";
    let arch = "unknown";

    if (userAgent.indexOf("win") !== -1) os = "windows";
    else if (userAgent.indexOf("mac") !== -1) os = "macos";
    else if (userAgent.indexOf("linux") !== -1) os = "linux";

    if (
      userAgent.indexOf("arm") !== -1 ||
      userAgent.indexOf("aarch64") !== -1
    ) {
      arch = "arm64";
    } else {
      // Most likely x86_64, but we can't be sure from userAgent alone
      arch = "x86_64";
    }

    return { os, arch };
  }

  return null;
};