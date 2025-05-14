"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import path from "path";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FolderIcon,
  FolderOpen,
  Home,
  Loader2,
  RefreshCw,
  SkipBack,
  Lock
} from "lucide-react";
import { Button } from "@core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@core/components/ui/dialog";
import { ScrollArea } from "@core/components/ui/scroll-area";
import {
  getHomeDirectoryAction,
  listDirectoriesAction,
  getCommonPaths
} from "@core/actions/directory-actions";
import { cn } from "@core/lib/utils";
import { normalizePath, normalizePathForComparison } from "@core/lib/path-utils";

// Fallback paths in case the server action fails
const DEFAULT_COMMON_PATHS: Array<{ name: string, path: string }> = [
  { name: "Home", path: "/home" },
  { name: "Documents", path: "/Documents" },
  { name: "Desktop", path: "/Desktop" },
  { name: "Root", path: "/" },
];

interface DirectoryBrowserProps {
  onClose: () => void;
  onSelect: (directoryPath: string) => void;
  initialPath?: string;
  isOpen: boolean;
}

type DirectoryInfo = { name: string; path: string; isAccessible: boolean };

export default function DirectoryBrowser({
  onClose,
  onSelect,
  initialPath,
  isOpen
}: DirectoryBrowserProps) {
  // State
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathParts, setPathParts] = useState<{ name: string; path: string }[]>([]);
  const [commonPaths, setCommonPaths] = useState<Array<{name: string, path: string}>>([]);

  // Refs
  const prevPathRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const directoryListRef = useRef<HTMLDivElement>(null);
  const initialLoadCompletedRef = useRef<boolean>(false);

  // Special flag to prevent multiple concurrent loading operations
  const loadingLockRef = useRef<boolean>(false);

  // Process path into breadcrumb parts for navigation
  const updatePathParts = useCallback((fullPath: string) => {
    if (!fullPath) {
      setPathParts([]);
      return;
    }

    // Normalize the path first
    const normalizedPath = normalizePath(fullPath);
    const parts: { name: string; path: string }[] = [];

    // Split by path separators and filter out empty segments
    const pathSegments = normalizedPath.split(/[/\\]+/).filter(Boolean);

    // Handle root path or Windows drive
    let currentAccumulatedPath = normalizedPath.startsWith('/') ? '/' : '';
    if (!normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
      // Handle Windows Drive (e.g., C:\)
      currentAccumulatedPath = normalizedPath.substring(0, normalizedPath.indexOf(':') + 2);
      parts.push({ name: currentAccumulatedPath, path: currentAccumulatedPath });
      pathSegments.shift(); // Remove drive from segments
    } else if (normalizedPath.startsWith('/')) {
      parts.push({ name: '/', path: '/' });
    }

    // Process path segments and build the breadcrumb parts
    for (const segment of pathSegments) {
      // Build up the accumulated path correctly based on current state
      if (currentAccumulatedPath === '/') {
        currentAccumulatedPath += segment;
      } else if (currentAccumulatedPath.endsWith('/')) {
        currentAccumulatedPath += segment;
      } else {
        currentAccumulatedPath += '/' + segment;
      }

      // Add to parts array
      parts.push({
        name: segment,
        path: currentAccumulatedPath
      });
    }

    setPathParts(parts);
  }, []);

  // Load directories from a given path
  const loadDirectories = useCallback(async (path: string) => {
    // Normalize the path for consistent comparison
    const normalizedPath = normalizePath(path);

    // Skip if path is the same as current (prevents duplicate loads)
    if (prevPathRef.current && normalizedPath === normalizePath(prevPathRef.current) && directories.length > 0) {
      console.log(`[DirBrowser] Path unchanged, skipping load: ${path} (normalized: ${normalizedPath})`);
      return;
    }

    // Prevent concurrent loading operations
    if (loadingLockRef.current) {
      console.log(`[DirBrowser] Already loading a directory, skipping request for: ${path}`);
      return;
    }

    // Acquire lock
    loadingLockRef.current = true;

    console.log(`[DirBrowser] Loading directories for: ${path} (normalized: ${normalizedPath})`);
    setIsLoading(true);
    setError(null);
    prevPathRef.current = path;

    try {
      if (!path) {
        throw new Error("Empty path provided");
      }

      console.log(`[DirBrowser] Calling listDirectoriesAction for: ${path}`);
      const result = await listDirectoriesAction(path);
      console.log(`[DirBrowser] Received response for: ${path}`, { isSuccess: result?.isSuccess, hasData: !!result?.data });

      // Check component is still mounted
      if (!isMountedRef.current) {
        console.log(`[DirBrowser] Component unmounted, stopping directory load for: ${path}`);
        return;
      }

      // Handle invalid responses
      if (!result) {
        throw new Error("Invalid server response");
      }

      if (result.isSuccess && result.data) {
        // Update all path-related state atomically with normalized paths
        setDirectories(result.data.directories.map(d => ({ ...d, path: normalizePath(d.path) })));
        setCurrentPath(normalizePath(result.data.currentPath));
        setParentPath(result.data.parentPath ? normalizePath(result.data.parentPath) : null);
        updatePathParts(result.data.currentPath);

        // Scroll to top when changing directories
        if (directoryListRef.current) {
          directoryListRef.current.scrollTop = 0;
        }

        console.log(`[DirBrowser] Successfully loaded ${result.data.directories.length} directories for '${path}'`);
      } else {
        throw new Error(result.message || "An error occurred while loading directories");
      }
    } catch (err) {
      // Handle errors gracefully
      if (!isMountedRef.current) return;

      const errorMessage = err instanceof Error ? err.message : "An error occurred while loading directories";
      console.error(`[DirBrowser] Error loading directories for '${path}':`, err);
      setError(errorMessage);

      // Preserve previous directories if possible for better UX during errors
      if (directories.length === 0) {
        setDirectories([]);
      }
    } finally {
      // Always release loading state and lock
      if (isMountedRef.current) {
        console.log(`[DirBrowser] Finished loading directories for: ${path}, resetting loading state`);
        setIsLoading(false);
      }
      loadingLockRef.current = false;
    }
  }, [directories.length, updatePathParts]);

  // Set mounted flag as soon as the component mounts
  useEffect(() => {
    console.log("[DirBrowser] Component mounted, setting isMountedRef.current = true");
    isMountedRef.current = true;

    return () => {
      console.log("[DirBrowser] Component unmounted, setting isMountedRef.current = false");
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
      console.log("[DirBrowser] Initial directory already loaded, skipping initialPath load");
      return;
    }

    console.log("[DirBrowser] Loading initial directory - isOpen:", isOpen, "initialLoadCompleted:", initialLoadCompletedRef.current);

    const loadInitialDirectory = async () => {
      // Skip if component is already unmounted
      if (!isMountedRef.current) {
        console.log("[DirBrowser] Component already unmounted, skipping initial directory load");
        return;
      }

      // Initialize with fallback
      let directoryToLoad = '/';

      // Use initial path if provided
      if (initialPath) {
        directoryToLoad = initialPath;
      } else {
        // Try to get home directory
        try {
          const result = await getHomeDirectoryAction();

          // Check if component is still mounted after async operation
          if (!isMountedRef.current) {
            console.log("[DirBrowser] Component unmounted during home directory fetch");
            return;
          }

          if (result?.isSuccess && result.data && typeof result.data === 'string' && result.data.trim()) {
            directoryToLoad = result.data;
          } else {
            console.log("[DirBrowser] Using fallback path: home directory action returned incomplete data");
          }
        } catch (err) {
          // Check if component is still mounted after async error
          if (!isMountedRef.current) {
            console.log("[DirBrowser] Component unmounted after home directory error");
            return;
          }
          console.error("[DirBrowser] Error getting home directory:", err);
        }
      }

      // Load the directory content
      try {
        // Another mounted check before expensive operation
        if (!isMountedRef.current) {
          console.log("[DirBrowser] Component unmounted before loadDirectories call");
          return;
        }

        await loadDirectories(directoryToLoad);

        // Check if component is still mounted after loading directories
        if (!isMountedRef.current) {
          console.log("[DirBrowser] Component unmounted after loadDirectories call");
          return;
        }

        // Mark initial loading as completed after successful load
        initialLoadCompletedRef.current = true;
        console.log("[DirBrowser] Initial directory loaded successfully, marked initialLoadCompleted");
      } catch (loadErr) {
        // Check if still mounted after error
        if (!isMountedRef.current) {
          console.log("[DirBrowser] Component unmounted after loadDirectories error");
          return;
        }

        console.error(`[DirBrowser] Failed to load directories for '${directoryToLoad}':`, loadErr);
        setError(`Failed to load directories: ${loadErr instanceof Error ? loadErr.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    loadInitialDirectory();
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
      } catch (error) {
        console.error("[DirBrowser] Error loading common paths:", error);

        if (isMountedRef.current) {
          setCommonPaths(DEFAULT_COMMON_PATHS);
        }
      }
    };

    loadCommonPaths();
  }, []);

  // Handle navigation to a specific directory
  const navigateToDirectory = useCallback(async (path: string) => {
    // Skip if unmounted or already loading
    if (!isMountedRef.current) {
      console.log("[DirBrowser] Cannot navigate - component unmounted");
      return;
    }

    // Clear any stale loading states
    if (isLoading) {
      console.log("[DirBrowser] Resetting stale loading state before navigation");
      setIsLoading(false);
    }

    if (loadingLockRef.current) {
      console.log("[DirBrowser] Releasing stale loading lock before navigation");
      loadingLockRef.current = false;
    }

    console.log("[DirBrowser] Navigating to directory:", path);

    // Reset the prev path ref to ensure we can navigate
    prevPathRef.current = null;

    // Double-check mounting status before navigating
    if (!isMountedRef.current) return;

    await loadDirectories(path);
  }, [isLoading, loadDirectories]);

  // Handle navigation to parent directory
  const navigateToParent = useCallback(async () => {
    // Skip the operation entirely if unmounted
    if (!isMountedRef.current) {
      console.log("[DirBrowser] Cannot navigate to parent - component is unmounted");
      return;
    }

    try {
      console.log("[DirBrowser] Attempting to navigate to parent. parentPath:", parentPath, "isLoading:", isLoading, "loadingLock:", loadingLockRef.current);

      // Reset any stale loading states that might be preventing navigation
      if (isLoading) {
        console.log("[DirBrowser] Resetting stale loading state");
        setIsLoading(false);
      }

      if (loadingLockRef.current) {
        console.log("[DirBrowser] Releasing stale loading lock");
        loadingLockRef.current = false;
      }

      // Now proceed with parent navigation
      if (parentPath) {
        // Force a new path reference by creating a new string to bypass the prevPathRef check
        const parentPathToUse = String(parentPath);
        console.log("[DirBrowser] Navigating to parent path:", parentPathToUse);

        // Reset the prev path ref to ensure we can navigate to parent
        prevPathRef.current = null;

        // Double-check mounting status before navigating
        if (!isMountedRef.current) return;

        await loadDirectories(parentPathToUse);
      } else if (currentPath) {
        // Fallback: try to navigate up one level by using path.dirname
        const possibleParent = path.dirname(currentPath);
        if (possibleParent !== currentPath) {
          console.log("[DirBrowser] Using fallback path.dirname for parent navigation:", possibleParent);

          // Reset the prev path ref to ensure we can navigate to parent
          prevPathRef.current = null;

          // Double-check mounting status before navigating
          if (!isMountedRef.current) return;

          await loadDirectories(possibleParent);
        } else {
          console.log("[DirBrowser] Cannot navigate up from", currentPath);
        }
      } else {
        console.log("[DirBrowser] Cannot navigate to parent - no current path available");
      }
    } catch (error) {
      console.error("[DirBrowser] Error navigating to parent directory:", error);

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
      console.log("[DirBrowser] Refreshing current directory:", currentPath);
      if (currentPath && !isLoading && !loadingLockRef.current) {
        // Reset the prevPathRef to ensure it reloads even if it's the same path
        prevPathRef.current = null;
        await loadDirectories(currentPath);
      } else {
        console.log("[DirBrowser] Cannot refresh - isLoading:", isLoading, "loadingLock:", loadingLockRef.current);
      }
    } catch (error) {
      console.error("[DirBrowser] Error refreshing directory:", error);
      // Ensure loading state is reset
      setIsLoading(false);
      loadingLockRef.current = false;
    }
  }, [currentPath, loadDirectories, isLoading]);

  // Handle directory selection confirmation
  const handleSelect = useCallback(() => {
    if (currentPath) {
      console.log("[DirBrowser] Directory selected:", currentPath);
      onSelect(normalizePath(currentPath));
      onClose();
    }
  }, [currentPath, onSelect, onClose]);

  // Handle navigation to home directory
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
        await loadDirectories('/');
      }
    } catch (error) {
      console.error("[DirBrowser] Error navigating to home directory:", error);

      if (isMountedRef.current) {
        setError("Failed to navigate to home directory");

        // Still try to load root as fallback
        try {
          await loadDirectories('/');
        } catch {
          // Last resort fallback - just show the error
        }
      }
    }
  }, [isLoading, loadDirectories]);

  // Directory selection handler
  const handleDirectoryClick = useCallback((dir: DirectoryInfo) => {
    // Skip if component is unmounted or directory is not accessible
    if (!isMountedRef.current || !dir.isAccessible) return;

    console.log("[DirBrowser] Directory selected (click):", dir.path);

    // Just select the directory without navigating to it - path is already normalized in state
    setCurrentPath(dir.path);
  }, []);

  // Directory navigation handler (double click)
  const handleDirectoryDoubleClick = useCallback((dir: DirectoryInfo) => {
    // Skip if component is unmounted, directory is not accessible, or loading state prevents navigation
    if (!isMountedRef.current || !dir.isAccessible) return;

    console.log("[DirBrowser] Directory selected (double click):", dir.path);

    // Clear any stale loading states
    if (isLoading) {
      console.log("[DirBrowser] Resetting stale loading state before double-click navigation");
      setIsLoading(false);
    }

    if (loadingLockRef.current) {
      console.log("[DirBrowser] Releasing stale loading lock before double-click navigation");
      loadingLockRef.current = false;
    }

    // Navigate to the directory
    navigateToDirectory(dir.path);
  }, [navigateToDirectory, isLoading]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Select Directory
          </DialogTitle>
          <DialogDescription className="text-sm text-balance">
            Browse and select a directory for your project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 h-[450px] overflow-hidden mt-2">
          {/* Shortcut buttons */}
          <div className="flex gap-2 flex-wrap overflow-x-auto pb-2">
            {commonPaths && commonPaths.length > 0 ? (
              commonPaths.map((item) => (
                <Button
                  key={item.path}
                  variant="outline"
                  size="sm"
                  onClick={() => navigateToDirectory(item.path)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 whitespace-nowrap h-8"
                  aria-label={`Go to ${item.name}`}
                >
                  {item.name.toLowerCase() === "home" ? (
                    <Home className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  ) : (
                    <FolderIcon className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  )}
                  <span className="truncate">{item.name}</span>
                </Button>
              ))
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToDirectory("/")}
                disabled={isLoading}
                className="flex items-center gap-1.5 h-8"
                aria-label="Go to root directory"
              >
                <Home className="h-3.5 w-3.5 mr-1.5" />
                Root
              </Button>
            )}
          </div>

          {/* Path breadcrumbs */}
          <div
            className="flex items-center gap-1 flex-wrap bg-muted/50 p-2 rounded-md text-sm overflow-x-auto min-w-0"
            role="navigation"
            aria-label="Directory path breadcrumbs"
          >
            {pathParts.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 py-0.5 text-left rounded-sm"
                  onClick={() => navigateToDirectory(part.path)}
                  disabled={isLoading}
                  aria-label={`Navigate to ${part.name === "/" ? "Root" : part.name}`}
                >
                  <span className="truncate">{part.name === "/" ? "Root" : part.name}</span>
                </Button>
              </React.Fragment>
            ))}
          </div>

          {/* Directory content with loading overlay */}
          <div className="relative flex-1 border rounded-md overflow-hidden">
            {/* Non-invasive loading indicator */}
            {isLoading && (
              <div className="absolute top-2 right-2 z-10 px-3 py-1 rounded-md border bg-background/70 backdrop-blur-[1px] shadow-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary/70" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">Loading...</p>
                </div>
              </div>
            )}

            {!isLoading && error && directories.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4">
                <div className="flex flex-col items-center gap-2 px-4 text-center max-w-sm border border-destructive/30 bg-destructive/5 p-3 rounded-md">
                  <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            )}

            {/* Directory content scroll area */}
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1" ref={directoryListRef}>
                {/* Parent directory button - always show except at absolute root */}
                {(parentPath || (currentPath && currentPath !== '/' && !currentPath.match(/^[A-Z]:\\$/i))) && (
                  <button
                    onClick={navigateToParent}
                    disabled={isLoading}
                    className="w-full flex items-center gap-2 p-2 hover:bg-accent rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Go to parent directory"
                  >
                    <SkipBack className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>Go Up</span>
                  </button>
                )}

                {/* Directory list or empty state */}
                {!isLoading && directories.length === 0 && !error ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FolderOpen className="h-8 w-8 mb-2 text-muted-foreground/80" aria-hidden="true" />
                    <p>No subdirectories found</p>
                  </div>
                ) : (
                  <div role="list" aria-label="Directory list">
                    {directories.map((dir) => (
                      <button
                        key={dir.path}
                        onClick={() => handleDirectoryClick(dir)}
                        onDoubleClick={() => handleDirectoryDoubleClick(dir)}
                        className={cn(
                          "w-full flex items-center gap-2 p-2 hover:bg-accent rounded-md text-sm",
                          !dir.isAccessible && "opacity-50 cursor-not-allowed",
                          normalizePathForComparison(currentPath) === normalizePathForComparison(dir.path) && "bg-accent"
                        )}
                        disabled={!dir.isAccessible || isLoading}
                        data-selected={normalizePathForComparison(currentPath) === normalizePathForComparison(dir.path) ? "true" : "false"}
                        data-accessible={dir.isAccessible ? "true" : "false"}
                      >
                        {dir.isAccessible ? (
                          <FolderIcon className="h-4 w-4 text-blue-500" aria-hidden="true" />
                        ) : (
                          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="truncate text-left">{dir.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer with action buttons */}
        <DialogFooter className="flex gap-2 justify-between sm:justify-between mt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-9"
              aria-label="Refresh directory list"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
              )}
              <span>Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={navigateToHome}
              disabled={isLoading}
              className="h-9"
              aria-label="Go to home directory"
            >
              <Home className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
              <span>Home</span>
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="h-9"
            >
              Cancel
            </Button>

            <Button
              size="sm"
              onClick={handleSelect}
              disabled={!currentPath || isLoading}
              className="h-9"
            >
              <FolderOpen className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
              <span>Select this Directory</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 