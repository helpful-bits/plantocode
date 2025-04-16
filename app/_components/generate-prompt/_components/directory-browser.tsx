"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Button } from "@/components/ui/button"; // Keep Button import
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  getHomeDirectoryAction, 
  listDirectoriesAction, 
  getCommonPaths
} from "@/actions/directory-actions"; // Keep directory-actions import
import { cn } from "@/lib/utils"; // Keep cn import

// Fallback paths in case the server action fails
const DEFAULT_COMMON_PATHS: Array<{ name: string, path: string }> = [
  { name: "Home", path: "/home" },
  { name: "Documents", path: "/Documents" },
  { name: "Desktop", path: "/Desktop" },
  { name: "Root", path: "/" },
];

interface DirectoryBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (directoryPath: string) => void;
  initialPath?: string;
}

export default function DirectoryBrowser({ 
  isOpen, 
  onClose, 
  onSelect,
  initialPath
}: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<{ name: string; path: string; isAccessible: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathParts, setPathParts] = useState<{ name: string; path: string }[]>([]);
  const [commonPaths, setCommonPaths] = useState<Array<{name: string, path: string}>>([]);

  // Function to load directories from the current path
  const loadDirectories = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await listDirectoriesAction(path);
      if (!result.isSuccess) {
        // Check if it's a permission error
        if (result.message?.includes("permission denied")) {
          setError(result.message);
          // Still update current path if possible, but show empty directories
          if (result.data?.currentPath) {
            setCurrentPath(result.data.currentPath);
            setParentPath(result.data.parentPath);
            setDirectories([]); // Show no directories on permission error
            updatePathParts(result.data.currentPath); // Update breadcrumbs
          }
        } else {
          setError(result.message || "Failed to load directories");
          // Keep previous directories if there's an error that's not permission-related
        }
      } else {
        setCurrentPath(result.data.currentPath);
        setParentPath(result.data.parentPath);
        setDirectories(result.data.directories);
        updatePathParts(result.data.currentPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while loading directories");
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed useClientAPI dependency

  const updatePathParts = useCallback((fullPath: string) => {
    if (!fullPath) {
      setPathParts([]);
      return;
    }
    const parts: { name: string; path: string }[] = [];
    const pathSegments = fullPath.split(/[/\\]+/).filter(Boolean);

    let currentAccumulatedPath = fullPath.startsWith('/') ? '/' : '';
    if (!fullPath.startsWith('/') && fullPath.includes(':')) { // Handle Windows Drive
      currentAccumulatedPath = fullPath.substring(0, fullPath.indexOf(':') + 2); // C:\
      parts.push({ name: currentAccumulatedPath, path: currentAccumulatedPath });
      pathSegments.shift(); // Remove drive from segments
    } else if (fullPath.startsWith('/')) {
      parts.push({ name: '/', path: '/' });
    }
    
    // Process the path segments
    for (const segment of pathSegments) {
      if (currentAccumulatedPath === '/') {
        currentAccumulatedPath += segment;
      } else if (currentAccumulatedPath.endsWith('/') || currentAccumulatedPath.endsWith('\\')) {
        currentAccumulatedPath += segment;
      } else {
        currentAccumulatedPath += '/' + segment;
      }
      
      parts.push({
        name: segment,
        path: currentAccumulatedPath
      });
    }
    
    setPathParts(parts);
  }, []);

  // Load initial directory on open // Keep comment
  useEffect(() => {
    if (isOpen) {
      const loadInitialDirectory = async () => {
        if (initialPath) {
          await loadDirectories(initialPath);
        } else {
          try {
            const result = await getHomeDirectoryAction();
            
            if (result.isSuccess && result.data) {
              await loadDirectories(result.data);
            } else {
              // Fallback to first common path
              try {
                // Ensure common paths are loaded before trying to use them
                const loadedCommonPaths = commonPaths.length > 0 ? commonPaths : await getCommonPaths();
                setCommonPaths(loadedCommonPaths); // Store loaded paths
                if (commonPaths && commonPaths.length > 0) {
                  await loadDirectories(commonPaths[0].path);
                } else {
                  // Ultimate fallback if commonPaths is empty or undefined
                  await loadDirectories('/');
                }
              } catch (commonPathError) {
                console.error("Common path fallback failed:", commonPathError);
                // Try root as last resort
                await loadDirectories('/');
              }
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load home directory");
            setIsLoading(false);
            
            // Try common paths as last resort
            // Ensure common paths are loaded before trying to use them
            try {
              const loadedCommonPaths = commonPaths.length > 0 ? commonPaths : await getCommonPaths();
              if (commonPaths && commonPaths.length > 0) {
                await loadDirectories(commonPaths[0].path);
              } else {
                // Ultimate fallback
                await loadDirectories('/');
              }
            } catch (fallbackErr) {
              console.error("Fallback path also failed:", fallbackErr);
              setError("Could not load any directory. Please enter a path manually.");
            }
          }
        }
      };

      loadInitialDirectory();
    } // Close if(isOpen)
  }, [isOpen, initialPath, loadDirectories]); // Removed useClientAPI dependency

  // Handle directory navigation
  const navigateToDirectory = useCallback(async (path: string) => { // Keep function
    await loadDirectories(path);
  }, [loadDirectories]);

  // Handle go to parent directory
  const navigateToParent = useCallback(async () => {
    if (parentPath) {
      await loadDirectories(parentPath);
    }
  }, [parentPath, loadDirectories]);

  // Handle refresh current directory
  const handleRefresh = useCallback(async () => {
    if (currentPath) {
      await loadDirectories(currentPath);
    }
  }, [currentPath, loadDirectories]);

  // Handle directory selection
  const handleSelect = useCallback(() => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  }, [currentPath, onSelect, onClose]);

  // Handle shortcut navigation // Keep comment
  const navigateToShortcut = useCallback(async (path: string) => {
    await loadDirectories(path);
  }, [loadDirectories]);

  // Load common paths
  useEffect(() => {
    const loadCommonPaths = async () => {
      try {
        const serverPaths = await getCommonPaths();
        if (serverPaths && serverPaths.length > 0) {
          setCommonPaths(serverPaths);
        } else {
          setCommonPaths(DEFAULT_COMMON_PATHS); // Fallback to default if server action fails
        }
      } catch (error) {
        console.error("Error loading common paths:", error);
        setCommonPaths(DEFAULT_COMMON_PATHS); // Fallback to default on error
      }
    };
    
    loadCommonPaths();
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Select Directory
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 h-[450px]">
          {/* Shortcuts */}
          <div className="flex gap-2 flex-wrap">
            {commonPaths && commonPaths.length > 0 ? (
              commonPaths.map((item) => (
                <Button
                  key={item.path}
                  variant="outline"
                  size="sm"
                  onClick={() => navigateToShortcut(item.path)}
                  className="flex items-center gap-1.5"
                >
                  {item.name.toLowerCase() === "home" ? (
                    <Home className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <FolderIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  )}
                  {item.name}
                </Button>
              ))
            ) : (
              // Fallback when commonPaths is not available
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToShortcut("/")}
                className="flex items-center gap-1.5"
              >
                <Home className="h-3.5 w-3.5" />
                Root
              </Button>
            )}
          </div>

          {/* Current path breadcrumbs */}
          <div className="flex items-center gap-1 flex-wrap bg-muted/50 p-2 rounded-md text-sm">
            {pathParts.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 py-0.5 text-left"
                  onClick={() => navigateToDirectory(part.path)}
                >
                  {part.name}
                </Button>
              </React.Fragment>
            ))}
          </div>

          {/* Directory content */}
          <div className="relative flex-1 border rounded-md overflow-hidden">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            ) : null}

            <ScrollArea className="h-full">
              <div className="p-2 space-y-1">
                {/* Parent directory button */}
                {parentPath && (
                  <button
                    onClick={navigateToParent}
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-md text-sm font-medium"
                  >
                    <SkipBack className="h-4 w-4" />
                    Go Up
                  </button>
                )}

                {/* Directory list */}
                {directories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FolderOpen className="h-8 w-8 mb-2" />
                    <p>No directories found in this location</p>
                  </div>
                ) : (
                  directories.map((dir) => (
                    <button
                      key={dir.path}
                      onClick={() => dir.isAccessible && navigateToDirectory(dir.path)}
                      className={cn(
                        "w-full flex items-center gap-2 p-2 hover:bg-muted rounded-md text-sm",
                        !dir.isAccessible && "opacity-50 cursor-not-allowed"
                      )}
                      disabled={!dir.isAccessible}
                    >
                      {dir.isAccessible ? (
                        <FolderIcon className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="truncate">{dir.name}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-between sm:justify-between mt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const result = await getHomeDirectoryAction();
                  
                  if (result.isSuccess && result.data) {
                    await loadDirectories(result.data);
                  }
                } catch (error) {
                  console.error("Error navigating to home directory:", error);
                  setError("Failed to navigate to home directory");
                }
              }}
              disabled={isLoading}
            >
              <Home className="h-4 w-4" />
              <span className="ml-2">Home</span>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSelect}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              Select Directory
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 