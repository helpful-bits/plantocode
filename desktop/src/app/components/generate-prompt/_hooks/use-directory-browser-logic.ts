"use client";

import { dirname } from "@tauri-apps/api/path";
import { useState, useEffect, useCallback, useRef } from "react";

import {
  getHomeDirectoryAction,
  listDirectoriesAction,
  getCommonPaths,
} from "@/actions";
import { normalizePath } from "@/utils/path-utils";

import { logger } from "./logger";

// Fallback paths in case the server action fails
const DEFAULT_COMMON_PATHS: Array<{ name: string; path: string }> = [
  { name: "Home", path: "/home" },
  { name: "Documents", path: "/Documents" },
  { name: "Desktop", path: "/Desktop" },
  { name: "Root", path: "/" },
];

export type DirectoryInfo = {
  name: string;
  path: string;
  isAccessible: boolean;
};

interface UseDirectoryBrowserLogicProps {
  initialPath?: string;
  isOpen: boolean;
}

export function useDirectoryBrowserLogic({
  initialPath,
  isOpen,
}: UseDirectoryBrowserLogicProps) {
  // State
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathParts, setPathParts] = useState<{ name: string; path: string }[]>(
    []
  );
  const [commonPaths, setCommonPaths] = useState<
    Array<{ name: string; path: string }>
  >([]);

  // Refs
  const prevPathRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const initialLoadCompletedRef = useRef<boolean>(false);

  // Special flag to prevent multiple concurrent loading operations
  const loadingLockRef = useRef<boolean>(false);

  // Process path into breadcrumb parts for navigation
  const updatePathParts = useCallback(async (fullPath: string) => {
    if (!fullPath) {
      setPathParts([]);
      return;
    }

    // Normalize the path first
    const normalizedPath = await normalizePath(fullPath);
    const parts: { name: string; path: string }[] = [];

    // Split by path separators and filter out empty segments
    const pathSegments = normalizedPath.split(/[/\\]+/).filter(Boolean);

    // Handle root path or Windows drive
    let currentAccumulatedPath = normalizedPath.startsWith("/") ? "/" : "";
    if (!normalizedPath.startsWith("/") && normalizedPath.includes(":")) {
      // Handle Windows Drive (e.g., C:\)
      currentAccumulatedPath = normalizedPath.substring(
        0,
        normalizedPath.indexOf(":") + 2
      );
      parts.push({
        name: currentAccumulatedPath,
        path: currentAccumulatedPath,
      });
      pathSegments.shift(); // Remove drive from segments
    } else if (normalizedPath.startsWith("/")) {
      parts.push({ name: "/", path: "/" });
    }

    // Process path segments and build the breadcrumb parts
    for (const segment of pathSegments) {
      // Build up the accumulated path correctly based on current state
      if (currentAccumulatedPath === "/") {
        currentAccumulatedPath += segment;
      } else if (currentAccumulatedPath.endsWith("/")) {
        currentAccumulatedPath += segment;
      } else {
        currentAccumulatedPath += "/" + segment;
      }

      // Add to parts array
      parts.push({
        name: segment,
        path: currentAccumulatedPath,
      });
    }

    setPathParts(parts);
  }, []);

  // Load directories from a given path
  const loadDirectories = useCallback(
    async (path: string) => {
      // Normalize the path for consistent comparison
      const normalizedPath = await normalizePath(path);

      // Skip if path is the same as current (prevents duplicate loads)
      if (
        prevPathRef.current &&
        normalizedPath === (await normalizePath(prevPathRef.current)) &&
        directories.length > 0
      ) {
        logger.debug("DirectoryBrowser", `Path unchanged, skipping load: ${path} (normalized: ${normalizedPath})`);
        return;
      }

      // Prevent concurrent loading operations
      if (loadingLockRef.current) {
        logger.debug("DirectoryBrowser", `Already loading a directory, skipping request for: ${path}`);
        return;
      }

      // Acquire lock
      loadingLockRef.current = true;

      logger.debug("DirectoryBrowser", `Loading directories for: ${path} (normalized: ${normalizedPath})`);
      setIsLoading(true);
      setError(null);
      prevPathRef.current = path;

      try {
        if (!path) {
          throw new Error("Empty path provided");
        }

        logger.debug("DirectoryBrowser", `Calling listDirectoriesAction for: ${path}`);
        const result = await listDirectoriesAction(path);
        logger.debug("DirectoryBrowser", `Received response for: ${path}`, {
          isSuccess: result?.isSuccess,
          hasData: !!result?.data,
        });

        // Check component is still mounted
        if (!isMountedRef.current) {
          logger.debug("DirectoryBrowser", `Component unmounted, stopping directory load for: ${path}`);
          return;
        }

        // Handle invalid responses
        if (!result) {
          throw new Error("Invalid server response");
        }

        if (result.isSuccess && result.data) {
          // Update all path-related state atomically with normalized paths
          // We need to await all path normalizations since they are async now
          const normalizedDirs = await Promise.all(
            result.data.directories.map(async (d: DirectoryInfo) => ({
              ...d,
              path: await normalizePath(d.path),
            }))
          );
          setDirectories(normalizedDirs);
          setCurrentPath(await normalizePath(result.data.currentPath));
          setParentPath(
            result.data.parentPath
              ? await normalizePath(result.data.parentPath)
              : null
          );
          await updatePathParts(result.data.currentPath);

          logger.debug("DirectoryBrowser", `Successfully loaded ${result.data.directories.length} directories for '${path}'`);
        } else {
          throw new Error(
            result.message || "An error occurred while loading directories"
          );
        }
      } catch (err) {
        // Handle errors gracefully
        if (!isMountedRef.current) return;

        const errorMessage =
          err instanceof Error
            ? err.message
            : "An error occurred while loading directories";
        logger.error("DirectoryBrowser", `Error loading directories for '${path}':`, err);
        setError(errorMessage);

        // Preserve previous directories if possible for better UX during errors
        if (directories.length === 0) {
          setDirectories([]);
        }
      } finally {
        // Always release loading state and lock
        if (isMountedRef.current) {
          logger.debug("DirectoryBrowser", `Finished loading directories for: ${path}, resetting loading state`);
          setIsLoading(false);
        }
        loadingLockRef.current = false;
      }
    },
    [directories.length, updatePathParts]
  );

  // Handle navigation to a specific directory
  const navigateToDirectory = useCallback(
    async (path: string) => {
      // Skip if unmounted or already loading
      if (!isMountedRef.current) {
        logger.debug("DirectoryBrowser", "Cannot navigate - component unmounted");
        return;
      }

      // Clear any stale loading states
      if (isLoading) {
        logger.debug("DirectoryBrowser", "Resetting stale loading state before navigation");
        setIsLoading(false);
      }

      if (loadingLockRef.current) {
        logger.debug("DirectoryBrowser", "Releasing stale loading lock before navigation");
        loadingLockRef.current = false;
      }

      logger.debug("DirectoryBrowser", "Navigating to directory:", path);

      // Reset the prev path ref to ensure we can navigate
      prevPathRef.current = null;

      // Double-check mounting status before navigating
      if (!isMountedRef.current) return;

      await loadDirectories(path);
    },
    [isLoading, loadDirectories]
  );

  // Handle navigation to parent directory
  const navigateToParent = useCallback(async () => {
    // Skip the operation entirely if unmounted
    if (!isMountedRef.current) {
      logger.debug("DirectoryBrowser", "Cannot navigate to parent - component is unmounted");
      return;
    }

    try {
      logger.debug(
        "DirectoryBrowser", 
        "Attempting to navigate to parent. parentPath:",
        parentPath,
        "isLoading:",
        isLoading,
        "loadingLock:",
        loadingLockRef.current
      );

      // Reset any stale loading states that might be preventing navigation
      if (isLoading) {
        logger.debug("DirectoryBrowser", "Resetting stale loading state");
        setIsLoading(false);
      }

      if (loadingLockRef.current) {
        logger.debug("DirectoryBrowser", "Releasing stale loading lock");
        loadingLockRef.current = false;
      }

      // Now proceed with parent navigation
      if (parentPath) {
        // Force a new path reference by creating a new string to bypass the prevPathRef check
        const parentPathToUse = String(parentPath);
        logger.debug("DirectoryBrowser", "Navigating to parent path:", parentPathToUse);

        // Reset the prev path ref to ensure we can navigate to parent
        prevPathRef.current = null;

        // Double-check mounting status before navigating
        if (!isMountedRef.current) return;

        await loadDirectories(parentPathToUse);
      } else if (currentPath) {
        // Fallback: try to navigate up one level by using dirname from Tauri API
        const possibleParent = await dirname(currentPath);
        if (possibleParent !== currentPath) {
          logger.debug("DirectoryBrowser", "Using fallback path.dirname for parent navigation:", possibleParent);

          // Reset the prev path ref to ensure we can navigate to parent
          prevPathRef.current = null;

          // Double-check mounting status before navigating
          if (!isMountedRef.current) return;

          await loadDirectories(possibleParent);
        } else {
          logger.debug("DirectoryBrowser", "Cannot navigate up from", currentPath);
        }
      } else {
        logger.debug("DirectoryBrowser", "Cannot navigate to parent - no current path available");
      }
    } catch (err) {
      logger.error("DirectoryBrowser", "Error navigating to parent directory:", err);

      // Only reset state if still mounted
      if (isMountedRef.current) {
        // Ensure loading state is reset
        setIsLoading(false);
      }
      loadingLockRef.current = false;
    }
  }, [parentPath, currentPath, loadDirectories, isLoading]);

  // Handle refresh of current directory
  const handleRefresh = useCallback(async () => {
    try {
      logger.debug("DirectoryBrowser", "Refreshing current directory:", currentPath);
      if (currentPath && !isLoading && !loadingLockRef.current) {
        // Reset the prevPathRef to ensure it reloads even if it's the same path
        prevPathRef.current = null;
        await loadDirectories(currentPath);
      } else {
        logger.debug(
          "DirectoryBrowser",
          "Cannot refresh - isLoading:",
          isLoading,
          "loadingLock:",
          loadingLockRef.current
        );
      }
    } catch (err) {
      logger.error("DirectoryBrowser", "Error refreshing directory:", err);
      // Ensure loading state is reset
      setIsLoading(false);
      loadingLockRef.current = false;
    }
  }, [currentPath, loadDirectories, isLoading]);

  // Navigate to home directory
  const navigateToHome = useCallback(async () => {
    // Skip if already loading
    if (isLoading || loadingLockRef.current) return;

    try {
      const result = await getHomeDirectoryAction();

      // Check component is still mounted
      if (!isMountedRef.current) return;

      if (result?.isSuccess && result.data) {
        await loadDirectories(result.data);
      } else {
        // Fall back to root if home can't be determined
        await loadDirectories("/");
      }
    } catch (err) {
      logger.error("DirectoryBrowser", "Error navigating to home directory:", err);

      if (isMountedRef.current) {
        setError("Failed to navigate to home directory");

        // Still try to load root as fallback
        try {
          await loadDirectories("/");
        } catch {
          // Last resort fallback - just show the error
        }
      }
    }
  }, [isLoading, loadDirectories]);

  // Set mounted flag as soon as the component mounts
  useEffect(() => {
    logger.debug("DirectoryBrowser", "Component mounted, setting isMountedRef.current = true");
    isMountedRef.current = true;

    return () => {
      logger.debug("DirectoryBrowser", "Component unmounted, setting isMountedRef.current = false");
      isMountedRef.current = false;
    };
  }, []);

  // Load initial directory when dialog opens - separate from mounted effect
  useEffect(() => {
    if (!isOpen) {
      // Reset the initial load flag when dialog closes
      initialLoadCompletedRef.current = false;
      return;
    }

    // Skip if initial loading already happened for this dialog session
    if (initialLoadCompletedRef.current) {
      logger.debug("DirectoryBrowser", "Initial directory already loaded, skipping initialPath load");
      return;
    }

    logger.debug(
      "DirectoryBrowser",
      "Loading initial directory - isOpen:",
      isOpen,
      "initialLoadCompleted:",
      initialLoadCompletedRef.current
    );

    const loadInitialDirectory = async () => {
      // Skip if component is already unmounted
      if (!isMountedRef.current) {
        logger.debug("DirectoryBrowser", "Component already unmounted, skipping initial directory load");
        return;
      }

      // Initialize with fallback
      let directoryToLoad = "/";

      // Use initial path if provided
      if (initialPath) {
        directoryToLoad = initialPath;
      } else {
        // Try to get home directory
        try {
          const result = await getHomeDirectoryAction();

          // Check if component is still mounted after async operation
          if (!isMountedRef.current) {
            logger.debug("DirectoryBrowser", "Component unmounted during home directory fetch");
            return;
          }

          if (
            result?.isSuccess &&
            result.data &&
            typeof result.data === "string" &&
            result.data.trim()
          ) {
            directoryToLoad = result.data;
          } else {
            logger.debug("DirectoryBrowser", "Using fallback path: home directory action returned incomplete data");
          }
        } catch (err) {
          // Check if component is still mounted after async error
          if (!isMountedRef.current) {
            logger.debug("DirectoryBrowser", "Component unmounted after home directory error");
            return;
          }
          logger.error("DirectoryBrowser", "Error getting home directory:", err);
        }
      }

      // Load the directory content
      try {
        // Another mounted check before expensive operation
        if (!isMountedRef.current) {
          logger.debug("DirectoryBrowser", "Component unmounted before loadDirectories call");
          return;
        }

        await loadDirectories(directoryToLoad);

        // Check if component is still mounted after loading directories
        if (!isMountedRef.current) {
          logger.debug("DirectoryBrowser", "Component unmounted after loadDirectories call");
          return;
        }

        // Mark initial loading as completed after successful load
        initialLoadCompletedRef.current = true;
        logger.debug("DirectoryBrowser", "Initial directory loaded successfully, marked initialLoadCompleted");
      } catch (loadErr) {
        // Check if still mounted after error
        if (!isMountedRef.current) {
          logger.debug("DirectoryBrowser", "Component unmounted after loadDirectories error");
          return;
        }

        logger.error("DirectoryBrowser", `Failed to load directories for '${directoryToLoad}':`, loadErr);
        setError(
          `Failed to load directories: ${loadErr instanceof Error ? loadErr.message : "Unknown error"}`
        );
        setIsLoading(false);
      }
    };

    void loadInitialDirectory();
  }, [initialPath, loadDirectories, isOpen]);

  // Load common paths once when the component mounts
  useEffect(() => {
    const loadCommonPaths = async () => {
      try {
        const serverPaths = await getCommonPaths();

        if (isMountedRef.current) {
          if (serverPaths && serverPaths.length > 0) {
            setCommonPaths(serverPaths);
          } else {
            setCommonPaths(DEFAULT_COMMON_PATHS);
          }
        }
      } catch (err) {
        logger.error("DirectoryBrowser", "Error loading common paths:", err);

        if (isMountedRef.current) {
          setCommonPaths(DEFAULT_COMMON_PATHS);
        }
      }
    };

    void loadCommonPaths();
  }, []);

  // Directory click handler
  const handleDirectoryClick = useCallback((dir: DirectoryInfo) => {
    // Skip if component is unmounted or directory is not accessible
    if (!isMountedRef.current || !dir.isAccessible) return;

    logger.debug("DirectoryBrowser", "Directory selected (click):", dir.path);

    // Just select the directory without navigating to it - path is already normalized in state
    setCurrentPath(dir.path);
  }, []);

  // Directory double-click handler
  const handleDirectoryDoubleClick = useCallback(
    (dir: DirectoryInfo) => {
      // Skip if component is unmounted, directory is not accessible, or loading state prevents navigation
      if (!isMountedRef.current || !dir.isAccessible) return;

      logger.debug("DirectoryBrowser", "Directory selected (double click):", dir.path);

      // Clear any stale loading states
      if (isLoading) {
        logger.debug("DirectoryBrowser", "Resetting stale loading state before double-click navigation");
        setIsLoading(false);
      }

      if (loadingLockRef.current) {
        logger.debug("DirectoryBrowser", "Releasing stale loading lock before double-click navigation");
        loadingLockRef.current = false;
      }

      // Navigate to the directory
      void navigateToDirectory(dir.path);
    },
    [navigateToDirectory, isLoading]
  );

  return {
    // State
    currentPath,
    parentPath,
    directories,
    isLoading,
    error,
    pathParts,
    commonPaths,

    // Refs
    isMountedRef,
    loadingLockRef,

    // Handlers
    navigateToDirectory,
    navigateToParent,
    handleRefresh,
    navigateToHome,
    handleDirectoryClick,
    handleDirectoryDoubleClick,
  };
}
