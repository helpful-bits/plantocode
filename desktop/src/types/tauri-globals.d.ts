/**
 * Global TypeScript declarations for Tauri
 *
 * This file provides type definitions for the Tauri global objects and APIs
 * that may be referenced in TypeScript code without explicit imports.
 */

// Make sure TypeScript sees this as a module
export {};

declare global {
  /**
   * Tauri's __TAURI__ global object containing various API hooks
   */
  interface Window {
    __TAURI_EVENT_PLUGIN_INTERNALS__?: {
      unregisterListener: (listenerId: number) => void;
    };
    __TAURI__: {
      /**
       * Tauri's invoke function to call Rust commands
       * Note: For strongly typed invocations, use the typed version from @tauri-apps/api
       */
      invoke: <T = unknown>(
        command: string,
        args?: Record<string, unknown>
      ) => Promise<T>;

      /**
       * Tauri's core API
       */
      core: {
        /**
         * Listen to events
         */
        listen: <T>(
          event: string,
          handler: (event: { payload: T }) => void
        ) => Promise<() => void>;

        /**
         * Emit events
         */
        emit: (event: string, payload?: unknown) => Promise<void>;

        /**
         * Convert a Tauri protocol path to a platform-specific path
         */
        convertFileSrc: (filePath: string, protocol?: string) => string;

        /**
         * Platform information
         */
        platform: {
          /**
           * The platform type: 'darwin', 'win32', 'linux', etc.
           */
          type: string;

          /**
           * The platform architecture: 'x86_64', 'aarch64', etc.
           */
          arch: string;

          /**
           * The platform version
           */
          version: string;
        };
      };

      /**
       * Tauri's path API
       */
      path: {
        /**
         * Get app's application directory
         */
        appDir: () => Promise<string>;

        /**
         * Get app's data directory
         */
        appDataDir: () => Promise<string>;

        /**
         * Get app's local data directory
         */
        appLocalDataDir: () => Promise<string>;

        /**
         * Get app's cache directory
         */
        appCacheDir: () => Promise<string>;

        /**
         * Get current working directory
         */
        currentDir: () => Promise<string>;

        /**
         * Join paths
         */
        join: (...paths: string[]) => Promise<string>;

        /**
         * Resolve paths
         */
        resolve: (...paths: string[]) => Promise<string>;

        /**
         * Get path dirname
         */
        dirname: (path: string) => Promise<string>;

        /**
         * Get path basename
         */
        basename: (path: string) => Promise<string>;

        /**
         * Get path extension
         */
        extname: (path: string) => Promise<string>;
      };

      /**
       * Tauri's notification API
       */
      notification: {
        /**
         * Send a notification
         */
        sendNotification: (options: {
          title?: string;
          body?: string;
          icon?: string;
        }) => Promise<void>;
      };

      /**
       * Tauri's event API
       */
      event: {
        /**
         * Listen to system events
         */
        listen: <T>(
          event: string,
          handler: (event: { payload: T }) => void
        ) => Promise<() => void>;

        /**
         * Emit system events
         */
        emit: (event: string, payload?: unknown) => Promise<void>;
      };

      /**
       * Tauri's dialog API
       */
      dialog: {
        /**
         * Open a file dialog
         */
        open: (options?: {
          multiple?: boolean;
          title?: string;
          filters?: { name: string; extensions: string[] }[];
          defaultPath?: string;
        }) => Promise<string | string[] | null>;

        /**
         * Open a save dialog
         */
        save: (options?: {
          title?: string;
          filters?: { name: string; extensions: string[] }[];
          defaultPath?: string;
        }) => Promise<string | null>;

        /**
         * Open a directory dialog
         */
        selectFolder: (options?: {
          title?: string;
          defaultPath?: string;
          multiple?: boolean;
        }) => Promise<string | string[] | null>;

        /**
         * Show a message dialog
         */
        message: (options: {
          title: string;
          message: string;
          type?: "info" | "warning" | "error";
          buttons?: string[];
        }) => Promise<number>;

        /**
         * Show a confirmation dialog
         */
        confirm: (options: {
          title: string;
          message: string;
          type?: "info" | "warning" | "error";
          buttons?: string[];
        }) => Promise<boolean>;
      };

      /**
       * Tauri's shell API
       */
      shell: {
        /**
         * Open a URL with the default browser
         */
        open: (target: string) => Promise<void>;
      };

      /**
       * Tauri's window API
       */
      window: {
        /**
         * Get current window
         */
        getCurrent: () => {
          /**
           * Get window label
           */
          label: string;

          /**
           * Set window title
           */
          setTitle: (title: string) => Promise<void>;

          /**
           * Set window size
           */
          setSize: (size: { width: number; height: number }) => Promise<void>;

          /**
           * Set window position
           */
          setPosition: (position: { x: number; y: number }) => Promise<void>;

          /**
           * Set window focus
           */
          setFocus: () => Promise<void>;

          /**
           * Minimize window
           */
          minimize: () => Promise<void>;

          /**
           * Maximize window
           */
          maximize: () => Promise<void>;

          /**
           * Unmaximize window
           */
          unmaximize: () => Promise<void>;

          /**
           * Close window
           */
          close: () => Promise<void>;

          /**
           * Show window
           */
          show: () => Promise<void>;

          /**
           * Hide window
           */
          hide: () => Promise<void>;

          /**
           * Check if window is focused
           */
          isFocused: () => Promise<boolean>;

          /**
           * Check if window is maximized
           */
          isMaximized: () => Promise<boolean>;

          /**
           * Check if window is minimized
           */
          isMinimized: () => Promise<boolean>;

          /**
           * Check if window is visible
           */
          isVisible: () => Promise<boolean>;

          /**
           * Listen to window events
           */
          listen: <T>(
            event: string,
            handler: (event: { payload: T }) => void
          ) => Promise<() => void>;
        };
      };

      /**
       * Tauri's file system API
       */
      fs: {
        /**
         * Read a file as text
         */
        readTextFile: (path: string) => Promise<string>;

        /**
         * Read a file as binary
         */
        readBinaryFile: (path: string) => Promise<Uint8Array>;

        /**
         * Write a text file
         */
        writeTextFile: (path: string, contents: string) => Promise<void>;

        /**
         * Write a binary file
         */
        writeBinaryFile: (
          path: string,
          contents: Uint8Array | number[]
        ) => Promise<void>;

        /**
         * Create a directory
         */
        createDir: (
          path: string,
          options?: { recursive?: boolean }
        ) => Promise<void>;

        /**
         * Remove a file
         */
        removeFile: (path: string) => Promise<void>;

        /**
         * Remove a directory
         */
        removeDir: (
          path: string,
          options?: { recursive?: boolean }
        ) => Promise<void>;

        /**
         * Check if a path exists
         */
        exists: (path: string) => Promise<boolean>;

        /**
         * Copy a file
         */
        copyFile: (source: string, destination: string) => Promise<void>;

        /**
         * Rename a file
         */
        renameFile: (oldPath: string, newPath: string) => Promise<void>;
      };
    };
  }
}
