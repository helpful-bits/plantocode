"use client";

import {
  AlertCircle,
  ChevronRight,
  FolderIcon,
  FolderOpen,
  Home,
  Loader2,
  RefreshCw,
  SkipBack,
  Lock,
} from "lucide-react";
import { useCallback, useRef, Fragment } from "react";

import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/ui/dialog";
import { ScrollArea } from "@/ui/scroll-area";
import { normalizePath } from "@/utils/path-utils";
import { cn } from "@/utils/utils";

import {
  useDirectoryBrowserLogic,
  type DirectoryInfo,
} from "../_hooks/use-directory-browser-logic";

interface DirectoryBrowserProps {
  onClose: () => void;
  onSelect: (directoryPath: string) => void;
  initialPath?: string;
  isOpen: boolean;
}

export default function DirectoryBrowser({
  onClose,
  onSelect,
  initialPath,
  isOpen,
}: DirectoryBrowserProps) {
  // Use the custom hook to manage directory browser logic
  const {
    currentPath,
    parentPath,
    directories,
    isLoading,
    error,
    pathParts,
    commonPaths,
    navigateToDirectory,
    navigateToParent,
    handleRefresh,
    navigateToHome,
    handleDirectoryClick,
    handleDirectoryDoubleClick,
  } = useDirectoryBrowserLogic({ initialPath, isOpen });

  // Refs
  const directoryListRef = useRef<HTMLDivElement>(null);

  // Handle directory selection confirmation
  const handleSelect = useCallback(async () => {
    if (currentPath) {
      const normalizedPath = await normalizePath(currentPath);
      onSelect(normalizedPath);
      onClose();
    }
  }, [currentPath, onSelect, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
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
              commonPaths.map((item: { name: string; path: string }) => (
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
            {pathParts.map((part: { name: string; path: string }, index: number) => (
              <Fragment key={`path-${part.path}`}>
                {index > 0 && (
                  <ChevronRight
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 py-0.5 text-left rounded-sm"
                  onClick={() => navigateToDirectory(part.path)}
                  disabled={isLoading}
                  aria-label={`Navigate to ${part.name === "/" ? "Root" : part.name}`}
                >
                  <span className="truncate">
                    {part.name === "/" ? "Root" : part.name}
                  </span>
                </Button>
              </Fragment>
            ))}
          </div>

          {/* Directory content with loading overlay */}
          <div className="relative flex-1 border rounded-md overflow-hidden">
            {/* Non-invasive loading indicator */}
            {isLoading && (
              <div className="absolute top-2 right-2 z-10 px-3 py-1 rounded-md border bg-background/70 backdrop-blur-[1px] shadow-sm">
                <div className="flex items-center gap-2">
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary/70"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-muted-foreground">Loading...</p>
                </div>
              </div>
            )}

            {!isLoading && error && directories.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4">
                <div className="flex flex-col items-center gap-2 px-4 text-center max-w-sm border border-destructive/30 bg-destructive/5 p-3 rounded-md">
                  <AlertCircle
                    className="h-5 w-5 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            )}

            {/* Directory content scroll area */}
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1" ref={directoryListRef}>
                {/* Parent directory button - always show except at absolute root */}
                {(parentPath ||
                  (currentPath &&
                    currentPath !== "/" &&
                    !currentPath.match(/^[A-Z]:\\$/i))) && (
                  <button
                    onClick={navigateToParent}
                    disabled={isLoading}
                    className="w-full flex items-center gap-2 p-2 hover:bg-accent rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Go to parent directory"
                  >
                    <SkipBack
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>Go Up</span>
                  </button>
                )}

                {/* Directory list or empty state */}
                {!isLoading && directories.length === 0 && !error ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FolderOpen
                      className="h-8 w-8 mb-2 text-muted-foreground/80"
                      aria-hidden="true"
                    />
                    <p>No subdirectories found</p>
                  </div>
                ) : (
                  <div role="list" aria-label="Directory list">
                    {directories.map((dir: DirectoryInfo) => (
                      <button
                        key={dir.path}
                        onClick={() => handleDirectoryClick(dir)}
                        onDoubleClick={() => handleDirectoryDoubleClick(dir)}
                        className={cn(
                          "w-full flex items-center gap-2 p-2 hover:bg-accent rounded-md text-sm",
                          !dir.isAccessible && "opacity-50 cursor-not-allowed"
                          // Path comparison is now done in click handler due to async nature
                        )}
                        disabled={!dir.isAccessible || isLoading}
                        data-selected={
                          currentPath === dir.path ? "true" : "false"
                        }
                        data-accessible={dir.isAccessible ? "true" : "false"}
                      >
                        {dir.isAccessible ? (
                          <FolderIcon
                            className="h-4 w-4 text-blue-500"
                            aria-hidden="true"
                          />
                        ) : (
                          <Lock
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden="true"
                          />
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
                <Loader2
                  className="h-3.5 w-3.5 mr-2 animate-spin"
                  aria-hidden="true"
                />
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
