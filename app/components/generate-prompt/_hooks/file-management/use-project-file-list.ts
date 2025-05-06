"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { shouldIncludeByDefault } from "../../_utils/file-selection";
import { useNotification } from "@/lib/contexts/notification-context";
import { normalizePath, normalizePathForComparison } from "@/lib/path-utils";

// Types
export type FileInfo = { 
  path: string; 
  size?: number; 
  included: boolean; 
  forceExcluded: boolean;
  comparablePath: string; // Added for consistent path comparison
};

export type FilesMap = { [path: string]: FileInfo };

// Type for tracking active load operations
interface ActiveLoad {
  promise: Promise<boolean> | null;
  controller: AbortController | null;
  directory: string | null;
}

/**
 * Hook to manage loading and refreshing the raw list of files for a project directory
 */
export function useProjectFileList(projectDirectory: string | null) {
  // State
  const [rawFilesMap, setRawFilesMap] = useState<FilesMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  // Track the current active load operation
  const activeLoadRef = useRef<ActiveLoad>({
    promise: null,
    controller: null,
    directory: null
  });

  /**
   * Load files for a given directory
   */
  const loadFiles = useCallback(async (
    dirToLoad: string,
    signal?: AbortSignal
  ): Promise<boolean> => {
    // Skip if no directory provided
    if (!dirToLoad) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ProjectFileList] No directory provided, skipping load');
      }
      return false;
    }

    const normalizedDir = normalizePath(dirToLoad);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ProjectFileList] loadFiles called with dirToLoad: "${dirToLoad}" (normalized: "${normalizedDir}")`);
    }
    
    setError(null);
    
    // Use the provided signal or check for one
    const loadSignal = signal;
    
    if (!loadSignal && process.env.NODE_ENV === 'development') {
      console.warn('[ProjectFileList] No AbortSignal provided, load may not be safely abortable');
    }
    
    try {
      // Use the /api/list-files endpoint
      const response = await fetch('/api/list-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          directory: normalizedDir,
          includeStats: true
        }),
        signal: loadSignal  // Pass the abort signal to the fetch call
      });
      
      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ProjectFileList] API error (${response.status}): ${errorText}`);
        setError(`Failed to load files (${response.status})`);
        return false;
      }
      
      // Parse the response
      const result = await response.json();
      
      // Check if the operation was aborted after fetch but before processing
      if (loadSignal?.aborted) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Load operation aborted after fetch but before processing`);
        }
        throw new DOMException("Aborted", "AbortError");
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ProjectFileList] Raw result from API:`, {
          hasFiles: !!result.files,
          filesCount: result.files?.length || 0,
          hasStats: !!result.stats,
          statsCount: result.stats?.length || 0
        });
      }
      
      if (result.files) {
        // Got file paths list
        const filePaths = result.files;
        
        // Process file paths
        let filesMap: FilesMap = {};
        
        // Determine if we have file stats
        const hasStats = result.stats && Array.isArray(result.stats) && result.stats.length === filePaths.length;
        
        for (let i = 0; i < filePaths.length; i++) {
          const filePath = filePaths[i];
          // Determine if file should be included by default
          const include = shouldIncludeByDefault(filePath);
          
          // Get size from stats if available
          const fileSize = hasStats ? result.stats[i]?.size : undefined;
          
          // Compute comparable path for consistent matching
          const comparablePath = normalizePathForComparison(filePath);
          
          // Add to file map
          filesMap[filePath] = {
            path: filePath,
            size: fileSize,
            included: include,
            forceExcluded: false,
            comparablePath
          };
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Processed ${Object.keys(filesMap).length} file paths into filesMap`);
        }
        
        // Final check for abort signal before updating state
        if (loadSignal?.aborted) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProjectFileList] Load operation aborted before updating state`);
          }
          throw new DOMException("Aborted", "AbortError");
        }
        
        // Update the filesMap state
        setRawFilesMap(filesMap);
        
        // Return success
        return true;
      } else if (result.error) {
        console.error(`[ProjectFileList] API error: ${result.error}`);
        setError(`${result.error}`);
        return false;
      } else {
        console.error(`[ProjectFileList] Unexpected API response format:`, result);
        setError('Invalid response from server');
        return false;
      }
    } catch (error) {
      // Handle aborted requests differently than other errors
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProjectFileList] Load operation was aborted');
        }
        return false;
      }
      
      console.error('[ProjectFileList] Exception loading file list:', error);
      setError(`Error loading file list: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, []);

  /**
   * Refresh files for the current project directory
   */
  const refreshFiles = useCallback(async (preserveState: boolean = false): Promise<boolean> => {
    if (!projectDirectory) {
      console.warn('[ProjectFileList] Cannot refresh files - no project directory selected.');
      return false;
    }
    
    if (isLoading) {
      console.warn('[ProjectFileList] Already loading files.');
      return false;
    }
    
    const normalizedDir = normalizePath(projectDirectory);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ProjectFileList] Starting refresh for directory: ${normalizedDir} (preserveState=${preserveState})`);
    }
    
    // Abort any ongoing load operation
    if (activeLoadRef.current.controller) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ProjectFileList] Aborting previous load operation before refresh`);
      }
      activeLoadRef.current.controller.abort();
      activeLoadRef.current = {
        promise: null,
        controller: null,
        directory: null
      };
    }
    
    // Create a new AbortController for this refresh operation
    const controller = new AbortController();
    
    // Update loading state
    setIsLoading(true);
    
    // Start the load operation
    const loadPromise = loadFiles(projectDirectory, controller.signal);
    
    // Store this as the active operation
    activeLoadRef.current = {
      promise: loadPromise,
      controller,
      directory: projectDirectory
    };
    
    try {
      // Await the result
      const result = await loadPromise;
      
      // Check if this operation was aborted
      if (controller.signal.aborted) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Refresh operation was aborted during loadFiles`);
        }
        return false;
      }
      
      showNotification({
        title: "Files refreshed",
        message: "Project file list has been refreshed",
        type: "success"
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ProjectFileList] Files refreshed successfully: ${result ? 'success' : 'failed'}`);
      }
      
      return result;
    } catch (error) {
      // Only handle non-abort errors
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error(`[ProjectFileList] Error refreshing files:`, error);
        setError(`Error refreshing files: ${error instanceof Error ? error.message : String(error)}`);
        
        showNotification({
          title: "Error refreshing files",
          message: error instanceof Error ? error.message : "An unknown error occurred",
          type: "error"
        });
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`[ProjectFileList] Refresh operation was aborted`);
      }
      return false;
    } finally {
      // Only clean up if this is still the active load
      if (activeLoadRef.current.controller === controller) {
        // This was the active load and it's now complete
        activeLoadRef.current = {
          promise: null,
          controller: null,
          directory: null
        };
        
        // Reset loading state
        setIsLoading(false);
      }
    }
  }, [projectDirectory, isLoading, loadFiles, showNotification]);
  
  // Load files when project directory changes
  useEffect(() => {
    // Only log execution ID in development
    const executionId = process.env.NODE_ENV === 'development' 
      ? Math.random().toString(36).substring(2, 8) 
      : '';
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[useProjectFileList][${executionId}] Directory change triggered - projectDirectory: "${projectDirectory}"`);
    }
    
    // Only proceed if we have a project directory
    if (projectDirectory) {
      const normalizedDir = normalizePath(projectDirectory);
      
      // Skip if already loading this directory
      if (
        activeLoadRef.current.promise !== null && 
        activeLoadRef.current.directory === normalizedDir
      ) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[useProjectFileList][${executionId}] Already loading files for "${normalizedDir}", skipping load`);
        }
        return;
      }
      
      // Abort any ongoing load
      if (activeLoadRef.current.controller) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[useProjectFileList][${executionId}] Aborting previous load operation`);
        }
        activeLoadRef.current.controller.abort();
      }
      
      // Create a new controller
      const controller = new AbortController();
      
      // Update loading state
      setIsLoading(true);
      
      // Start the file loading process
      const loadPromise = loadFiles(normalizedDir, controller.signal);
      
      // Store this as the active operation
      activeLoadRef.current = {
        promise: loadPromise,
        controller,
        directory: normalizedDir
      };
      
      // Handle the promise
      loadPromise
        .then(success => {
          if (controller.signal.aborted) return;
          if (process.env.NODE_ENV === 'development') {
            console.log(`[useProjectFileList][${executionId}] File loading ${success ? 'succeeded' : 'failed'}`);
          }
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          
          // Only log errors that aren't due to aborting
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            console.error(`[useProjectFileList][${executionId}] Error loading files:`, error);
            setError(`Error loading files: ${error instanceof Error ? error.message : String(error)}`);
          }
        })
        .finally(() => {
          // Only clean up if this is still the active load
          if (activeLoadRef.current.controller === controller) {
            // This was the active load and it's now complete
            activeLoadRef.current = {
              promise: null,
              controller: null,
              directory: null
            };
            
            // Reset loading state
            setIsLoading(false);
          }
        });
      
      // Cleanup function
      return () => {
        // Only abort if this controller is still the active one
        if (activeLoadRef.current.controller === controller) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[useProjectFileList][${executionId}] Cleaning up - aborting in-progress file load`);
          }
          controller.abort();
          
          activeLoadRef.current = {
            promise: null,
            controller: null,
            directory: null
          };
          
          setIsLoading(false);
        }
      };
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[useProjectFileList][${executionId}] No project directory provided, skipping file loading`);
    }
  }, [projectDirectory, loadFiles, setIsLoading, setError]);

  return {
    rawFilesMap,
    isLoading,
    error,
    refreshFiles
  };
}