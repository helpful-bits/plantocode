"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Info, RefreshCw } from "lucide-react";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Alert, AlertDescription } from "@/ui/alert";
import { cn } from "@/utils/utils";
import { getFileFinderRootsForSession } from "@/actions/project-settings/external-folders.actions";
import { useSessionStateContext } from "@/contexts/session";
import { useProject } from "@/contexts/project-context";
import { safeListen } from "@/utils/tauri-event-utils";
import type { UnlistenFn } from "@tauri-apps/api/event";

interface ExternalFoldersManagerProps {
  onRootsChange: (roots: string[] | null) => void;
  className?: string;
}

export function ExternalFoldersManager({ 
  onRootsChange, 
  className 
}: ExternalFoldersManagerProps) {
  const { activeSessionId } = useSessionStateContext();
  const { projectDirectory } = useProject();
  const [availableRoots, setAvailableRoots] = useState<string[] | null>(null);
  const [selectedRoots, setSelectedRoots] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAvailableRoots = useCallback(async () => {
    if (!activeSessionId) return;
    
    setIsLoading(true);
    try {
      const roots = await getFileFinderRootsForSession(activeSessionId);
      setAvailableRoots(roots);
      
      // Auto-expand if roots are available
      if (roots && roots.length > 0) {
        setIsExpanded(true);
        // Pre-select all roots by default
        setSelectedRoots(roots);
      }
    } catch (error) {
      console.error("Failed to fetch available roots:", error);
      setAvailableRoots(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId]);

  // Fetch available roots when session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchAvailableRoots();
    }
  }, [activeSessionId, fetchAvailableRoots]);

  // Listen for job status changes to auto-refresh when root_folder_selection completes
  useEffect(() => {
    if (!activeSessionId) return;

    // Track root_folder_selection jobs for this session
    const rootFolderJobIds = new Set<string>();
    
    let unlistenJobCreated: UnlistenFn | null = null;
    let unlistenJobStatusChanged: UnlistenFn | null = null;
    let unlistenJobFinalized: UnlistenFn | null = null;

    const setupListeners = async () => {
      // Listen for new jobs being created to track root_folder_selection jobs
      unlistenJobCreated = await safeListen("job:created", async (event) => {
        const payload = event.payload as { job: any };
        const job = payload.job;
        
        // Track root_folder_selection jobs for our session
        if (job.sessionId === activeSessionId && job.taskType === "root_folder_selection") {
          rootFolderJobIds.add(job.id);
        }
      });

      // Listen for job status changes
      unlistenJobStatusChanged = await safeListen("job:status-changed", async (event) => {
        const update = event.payload as { 
          jobId: string; 
          status: string;
        };
        
        // Check if this is one of our tracked root_folder_selection jobs completing
        if (rootFolderJobIds.has(update.jobId) && update.status === "completed") {
          // Remove from tracking
          rootFolderJobIds.delete(update.jobId);
          // Refresh the available roots
          fetchAvailableRoots();
        }
      });

      // Also listen for job finalized events as a backup
      unlistenJobFinalized = await safeListen("job:finalized", async (event) => {
        const update = event.payload as { 
          jobId: string; 
          status: string;
        };
        
        // Check if this is one of our tracked root_folder_selection jobs
        if (rootFolderJobIds.has(update.jobId) && update.status === "completed") {
          // Remove from tracking
          rootFolderJobIds.delete(update.jobId);
          // Refresh the available roots
          fetchAvailableRoots();
        }
      });
    };

    setupListeners();

    // Cleanup listeners
    return () => {
      if (unlistenJobCreated) {
        unlistenJobCreated();
      }
      if (unlistenJobStatusChanged) {
        unlistenJobStatusChanged();
      }
      if (unlistenJobFinalized) {
        unlistenJobFinalized();
      }
    };
  }, [activeSessionId, fetchAvailableRoots]);

  // Notify parent when selected roots change
  useEffect(() => {
    onRootsChange(selectedRoots.length > 0 ? selectedRoots : null);
  }, [selectedRoots, onRootsChange]);

  const handleRootToggle = (root: string) => {
    setSelectedRoots(prev => {
      if (prev.includes(root)) {
        return prev.filter(r => r !== root);
      } else {
        return [...prev, root];
      }
    });
  };

  const handleSelectAll = () => {
    if (availableRoots) {
      setSelectedRoots(availableRoots);
    }
  };

  const handleDeselectAll = () => {
    setSelectedRoots([]);
  };

  // Always show the component, but with different states
  // Don't hide completely - show collapsed state when no roots available

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
          disabled={isLoading}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <FolderOpen className="h-4 w-4" />
          Scope to Specific Folders
          {availableRoots && (
            <span className="text-muted-foreground ml-1">
              ({selectedRoots.length}/{availableRoots.length} selected)
            </span>
          )}
        </button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchAvailableRoots}
          disabled={isLoading}
          className="h-6 w-6"
        >
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="space-y-3 pl-6">
          {!availableRoots ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Run a File Finder workflow first to select specific folders for the implementation plan.
                This helps reduce context and improves relevance.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Quick actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={selectedRoots.length === availableRoots.length}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={selectedRoots.length === 0}
                >
                  Deselect All
                </Button>
              </div>

              {/* Root folders list */}
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                {availableRoots.map((root) => {
                  const relativePath = projectDirectory 
                    ? root.replace(projectDirectory, "").replace(/^\//, "") || "/"
                    : root;
                  
                  return (
                    <label
                      key={root}
                      className="flex items-center gap-2 p-1.5 hover:bg-accent rounded-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedRoots.includes(root)}
                        onCheckedChange={() => handleRootToggle(root)}
                      />
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm truncate" title={root}>
                        {relativePath}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Info about what this does */}
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Selected folders will scope the directory tree and file contents 
                  included in the implementation plan, reducing token usage and improving focus.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>
      )}
    </div>
  );
}