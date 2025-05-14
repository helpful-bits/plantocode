"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { shouldIncludeByDefault } from "../../_utils/file-selection";
import { useNotification } from '@core/lib/contexts/notification-context';
import { normalizePath, normalizePathForComparison, makePathRelative } from '@core/lib/path-utils';

// Types
export type FileInfo = { 
  path: string;         // Project-relative path
  size?: number; 
  included: boolean; 
  forceExcluded: boolean;
  comparablePath: string; // Normalized project-relative path for consistent comparison
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
// Track in-flight requests to prevent duplicate simultaneous requests
// This is a very short-lived "cache" that only lasts during a single request cycle
const inFlightRequests: Record<string, Promise<any>> = {};

export function useProjectFileList(projectDirectory: string | null) {
  // DEBUG: Log hook initialization
  console.log(`[DEBUG][useProjectFileList] Initializing with project: ${projectDirectory}`);
  console.time('[DEBUG][useProjectFileList] Hook initialization time');
  // State
  const [rawFilesMap, setRawFilesMap] = useState<FilesMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const { showNotification } = useNotification();

  // Maximum number of retries for loading files
  const MAX_RETRIES = 3;

  // Prevent duplicate loads at startup
  const initialLoadCompletedRef = useRef<boolean>(false);

  // Track the current active load operation
  const activeLoadRef = useRef<ActiveLoad>({
    promise: null,
    controller: null,
    directory: null
  });

  // Refs to store timeout IDs for cleanup
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Load files for a given directory
   */
  const loadFiles = useCallback(async (
    dirToLoad: string,
    signal?: AbortSignal
  ): Promise<boolean> => {
    // Check if already aborted before starting
    if (signal?.aborted) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ProjectFileList] Load operation aborted before starting');
      }
      return false;
    }

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

    // Check if there's already an in-flight request for this directory
    const existingRequest = inFlightRequests[normalizedDir];
    if (existingRequest) {
      console.log(`[ProjectFileList] Reusing in-flight request for ${normalizedDir}`);
      try {
        // Check if already aborted before reusing request
        if (signal?.aborted) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProjectFileList] Load operation aborted before reusing in-flight request`);
          }
          return false;
        }

        // Wait for the existing request to complete
        const response = await existingRequest;

        // Check again if aborted after request completed
        if (signal?.aborted) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProjectFileList] Load operation aborted after reusing in-flight request`);
          }
          return false;
        }

        return true;
      } catch (error) {
        // Handle abort errors gracefully
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProjectFileList] In-flight request aborted for ${normalizedDir}`);
          }
          return false;
        }

        console.error(`[ProjectFileList] In-flight request for ${normalizedDir} failed:`, error);
        return false;
      }
    }

    setError(null);

    // Use the provided signal or check for one
    const loadSignal = signal;

    if (!loadSignal && process.env.NODE_ENV === 'development') {
      console.warn('[ProjectFileList] No AbortSignal provided, load may not be safely abortable');
    }

    try {
      console.log(`[ProjectFileList] Fetching fresh file list for ${normalizedDir}`);

      // Create the fetch request
      const fetchPromise = fetch('/api/list-files', {
        method: 'POST', // explicitly use POST as this is what the API expects
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          directory: normalizedDir,
          includeStats: true,
          pattern: '**/*' // explicitly include all files
        }),
        signal: loadSignal  // Pass the abort signal to the fetch call
      });

      // Store this as an in-flight request to deduplicate simultaneous calls
      inFlightRequests[normalizedDir] = fetchPromise.then(r => r.clone());

      // Execute the fetch
      const response = await fetchPromise;
      
      // Handle HTTP errors with more detailed error messages
      if (!response.ok) {
        let errorText = '';
        let errorDetails = {};

        try {
          // Try to parse as JSON first
          const errorJson = await response.json();
          errorText = errorJson.error || 'Unknown API error';
          errorDetails = errorJson;
        } catch {
          // If not JSON, read as plain text
          errorText = await response.text() || `HTTP error ${response.status}`;
        }

        console.error(`[ProjectFileList] API error (${response.status}): ${errorText}`, errorDetails);

        // Set appropriate error message based on status code
        switch (response.status) {
          case 400:
            setError(`Invalid request: ${errorText}`);
            break;
          case 403:
            setError(`Permission denied accessing directory: ${errorText}`);
            break;
          case 404:
            setError(`Directory not found: ${errorText}`);
            break;
          case 500:
            setError(`Server error: ${errorText}`);
            break;
          default:
            setError(`Failed to load files (${response.status}): ${errorText}`);
        }

        return false;
      }
      
      // Parse the response
      const result = await response.json();
      
      // Check if the operation was aborted after fetch but before processing
      if (loadSignal?.aborted) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Load operation aborted after fetch but before processing`);
        }
        // Return false instead of throwing an exception
        return false;
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
        
        // Process file paths with better error handling and path normalization
        let filesMap: FilesMap = {};

        // Determine if we have file stats
        const hasStats = result.stats && Array.isArray(result.stats) && result.stats.length === filePaths.length;

        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Processing ${filePaths.length} file paths from API, hasStats=${hasStats}`);
          if (filePaths.length > 0) {
            console.log(`[ProjectFileList] Sample absolute paths from API: ${filePaths.slice(0, 3).join(', ')}${filePaths.length > 3 ? '...' : ''}`);
          }
        }

        // Keep track of any path processing errors
        const pathProcessingErrors: string[] = [];

        for (let i = 0; i < filePaths.length; i++) {
          try {
            const absoluteFilePath = filePaths[i];

            if (!absoluteFilePath) {
              console.warn(`[ProjectFileList] Skipping empty file path at index ${i}`);
              continue;
            }

            // Normalize the absolute path first for consistent processing
            const normalizedAbsolutePath = normalizePath(absoluteFilePath);

            // Convert absolute path to project-relative path using makePathRelative
            // This makes sure we have consistent relative paths regardless of OS
            const relativePath = makePathRelative(normalizedAbsolutePath, dirToLoad);

            if (!relativePath) {
              console.warn(`[ProjectFileList] Failed to make relative path from ${normalizedAbsolutePath}, skipping`);
              continue;
            }

            // No automatic inclusion - start with everything unchecked
            const include = false;

            // Get size from stats if available
            const fileSize = hasStats ? result.stats[i]?.size : undefined;

            // Compute comparable path for consistent matching from the relative path
            const comparablePath = normalizePathForComparison(relativePath);

            if (process.env.NODE_ENV === 'development' && i < 3) {
              console.log(`[ProjectFileList] Path processing example:
                absolutePath: ${absoluteFilePath}
                normalizedAbsolutePath: ${normalizedAbsolutePath}
                relativePath: ${relativePath}
                comparablePath: ${comparablePath}
              `);
            }

            // Add to file map using the relative path as the key
            filesMap[relativePath] = {
              path: relativePath,
              size: fileSize,
              included: include,
              forceExcluded: false,
              comparablePath
            };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[ProjectFileList] Error processing file path at index ${i}:`, errorMsg);
            pathProcessingErrors.push(errorMsg);
          }
        }

        if (pathProcessingErrors.length > 0) {
          console.warn(`[ProjectFileList] Encountered ${pathProcessingErrors.length} errors while processing file paths`);
          if (pathProcessingErrors.length > Object.keys(filesMap).length) {
            // More errors than successful paths - this is a serious problem
            setError(`Failed to process most file paths (${pathProcessingErrors.length} errors)`);
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Successfully processed ${Object.keys(filesMap).length} of ${filePaths.length} file paths`);
          if (Object.keys(filesMap).length > 0) {
            const sampleKeys = Object.keys(filesMap).slice(0, 3);
            console.log(`[ProjectFileList] Sample relative paths (keys in filesMap): ${sampleKeys.join(', ')}${Object.keys(filesMap).length > 3 ? '...' : ''}`);
          }
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Processed ${Object.keys(filesMap).length} file paths into filesMap (project-relative paths)`);
        }
        
        // Final check for abort signal before updating state
        if (loadSignal?.aborted) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProjectFileList] Load operation aborted before updating state`);
          }
          // Return false instead of throwing an exception
          return false;
        }
        
        // Update the filesMap state
        setRawFilesMap(filesMap);

        // Clear the in-flight request since it's complete
        delete inFlightRequests[normalizedDir];

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
        // Clear the in-flight request on abort
        delete inFlightRequests[normalizedDir];
        return false;
      }

      // Handle fetch abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProjectFileList] Fetch operation was aborted');
        }
        // Clear the in-flight request on abort
        delete inFlightRequests[normalizedDir];
        return false;
      }

      console.error('[ProjectFileList] Exception loading file list:', error);
      setError(`Error loading file list: ${error instanceof Error ? error.message : String(error)}`);
      // Clear the in-flight request on error
      delete inFlightRequests[normalizedDir];
      return false;
    }
  }, []);

  /**
   * Refresh files for the current project directory
   */
  const refreshFiles = useCallback(async (preserveState: boolean = false): Promise<boolean> => {
    if (!projectDirectory) {
      console.warn('[ProjectFileList] Cannot refresh files - no project directory selected.');
      setError('No project directory selected');
      return false;
    }

    // Allow refresh even if already loading, to handle retries and force reload
    if (isLoading) {
      console.log('[ProjectFileList] Force refreshing even though already loading.');
    }

    const normalizedDir = normalizePath(projectDirectory);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ProjectFileList] Starting refresh for directory: ${normalizedDir} (preserveState=${preserveState})`);
    }
    
    // Abort any ongoing load operation
    if (activeLoadRef.current.controller && !activeLoadRef.current.controller.signal.aborted) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ProjectFileList] Aborting previous load operation before refresh`);
      }
      try {
        activeLoadRef.current.controller.abort();
      } catch (error) {
        console.error('[ProjectFileList] Error while aborting controller:', error);
      }
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

      if (result) {
        // Show success notification
        showNotification({
          title: "Files refreshed",
          message: "Project file list has been refreshed",
          type: "success"
        });

        // Mark as initialized on successful refresh
        setIsInitialized(true);

        // Reset retry count on success
        setRetryCount(0);

        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProjectFileList] Files refreshed successfully`);
        }
      } else {
        console.warn(`[ProjectFileList] Refresh returned false - partial refresh failure`);

        // Try to auto-retry for partial failures
        if (retryCount < MAX_RETRIES) {
          const nextRetry = retryCount + 1;
          console.log(`[ProjectFileList] Auto-retry after refresh failure (${nextRetry}/${MAX_RETRIES})`);
          setRetryCount(nextRetry);

          // Schedule a delayed retry with exponential backoff
          setTimeout(() => {
            if (projectDirectory) {
              console.log(`[ProjectFileList] Executing refresh retry #${nextRetry}`);
              // Skip preserveState for retries to get fresh data
              refreshFiles(false).catch(e => console.error("[ProjectFileList] Refresh retry failed:", e));
            }
          }, 1000 * Math.pow(2, nextRetry - 1)); // Exponential backoff: 1s, 2s, 4s
        } else {
          // After all retries, mark as initialized anyway so UI can show error state
          console.log(`[ProjectFileList] All refresh retries failed (${retryCount}/${MAX_RETRIES}), marking as initialized`);
          setIsInitialized(true);

          showNotification({
            title: "Error refreshing files",
            message: "Failed to refresh file list after multiple attempts. Try again manually.",
            type: "warning"
          });
        }
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

        // Try to auto-retry for errors
        if (retryCount < MAX_RETRIES) {
          const nextRetry = retryCount + 1;
          console.log(`[ProjectFileList] Auto-retry after error (${nextRetry}/${MAX_RETRIES})`);
          setRetryCount(nextRetry);

          // Schedule a delayed retry with exponential backoff (longer for errors)
          setTimeout(() => {
            if (projectDirectory) {
              console.log(`[ProjectFileList] Executing error retry #${nextRetry}`);
              refreshFiles(false).catch(e => console.error("[ProjectFileList] Error retry failed:", e));
            }
          }, 1500 * Math.pow(2, nextRetry - 1)); // Exponential backoff: 1.5s, 3s, 6s
        } else {
          // After all retries, mark as initialized anyway
          console.log(`[ProjectFileList] All error retries failed (${retryCount}/${MAX_RETRIES}), marking as initialized`);
          setIsInitialized(true);
        }
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

        console.log(`[ProjectFileList] Refresh complete, isInitialized=${isInitialized}, retryCount=${retryCount}/${MAX_RETRIES}`);
      }
    }
  // Remove isLoading from dependencies to prevent refresh loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectory, loadFiles, showNotification]);

  // Load files when project directory changes
  useEffect(() => {
    // Only log execution ID in development
    const executionId = process.env.NODE_ENV === 'development'
      ? Math.random().toString(36).substring(2, 8)
      : '';

    if (process.env.NODE_ENV === 'development') {
      console.log(`[useProjectFileList][${executionId}] Directory change triggered - projectDirectory: "${projectDirectory}"`);
    }

    // Reset initialization state whenever the directory changes
    // This prevents stale initialization state from persisting across directory changes
    setIsInitialized(false);

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
      if (activeLoadRef.current.controller && !activeLoadRef.current.controller.signal.aborted) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[useProjectFileList][${executionId}] Aborting previous load operation`);
        }
        try {
          activeLoadRef.current.controller.abort();
        } catch (error) {
          console.error(`[useProjectFileList][${executionId}] Error while aborting controller:`, error);
        }
      }

      // Reset error state when starting a new load
      setError(null);

      // Reset retry count when starting a fresh load for a new directory
      setRetryCount(0);

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

          if (success) {
            // Success - reset retry count and mark as initialized
            setRetryCount(0);
            setIsInitialized(true);
            // Log success for debugging
            console.log(`[useProjectFileList][${executionId}] Successfully loaded files for ${normalizedDir}`);
          } else {
            // Handle load failure with retry logic
            if (retryCount < MAX_RETRIES) {
              const nextRetry = retryCount + 1;
              console.log(`[useProjectFileList][${executionId}] Retrying file load (${nextRetry}/${MAX_RETRIES})`);
              setRetryCount(nextRetry);

              // Delay retry to avoid rapid failures
              // We need to make sure retries don't cascade and cause multiple refreshes
              console.log(`[useProjectFileList] Scheduling retry #${nextRetry} for ${normalizedDir} in ${1000 * nextRetry}ms`);

              // Use a stable reference to prevent multiple timeouts
              const timeoutId = setTimeout(() => {
                // Only proceed if we're still in the same project directory context
                if (projectDirectory && normalizedDir === normalizePath(projectDirectory)) {
                  console.log(`[useProjectFileList] Executing retry #${nextRetry} for ${normalizedDir}`);
                  refreshFiles(true).catch(e => console.error("[useProjectFileList] Retry failed:", e));
                } else {
                  console.log(`[useProjectFileList] Skipping retry #${nextRetry} - directory changed`);
                }
              }, 1000 * nextRetry); // Increasing backoff

              // Store timeout ID to clean it up if needed
              retryTimeoutRef.current = timeoutId;
            } else {
              // Mark as initialized even if loading failed after all retries
              // This allows the UI to show error state instead of loading indefinitely
              console.log(`[useProjectFileList][${executionId}] All retries failed, stopping retry attempts`);
              setIsInitialized(true);
            }
          }
        })
        .catch(error => {
          if (controller.signal.aborted) return;

          // Only log errors that aren't due to aborting
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            console.error(`[useProjectFileList][${executionId}] Error loading files:`,
              error instanceof Error ? error.message : String(error));

            // Set a more descriptive error message
            setError(`Error loading files from ${normalizedDir}: ${error instanceof Error ? error.message : String(error)}`);

            // Implement retry for errors
            if (retryCount < MAX_RETRIES) {
              const nextRetry = retryCount + 1;
              console.log(`[useProjectFileList][${executionId}] Retrying after error (${nextRetry}/${MAX_RETRIES})`);
              setRetryCount(nextRetry);

              // Delay retry to avoid rapid failures
              console.log(`[useProjectFileList] Scheduling error retry #${nextRetry} for ${normalizedDir} in ${1500 * nextRetry}ms`);

              // Use a stable reference to prevent multiple timeouts
              const timeoutId = setTimeout(() => {
                // Only proceed if we're still in the same project directory context
                if (projectDirectory && normalizedDir === normalizePath(projectDirectory)) {
                  console.log(`[useProjectFileList] Executing error retry #${nextRetry} for ${normalizedDir}`);
                  refreshFiles(true).catch(e => console.error("[useProjectFileList] Error retry failed:", e));
                } else {
                  console.log(`[useProjectFileList] Skipping error retry #${nextRetry} - directory changed`);
                }
              }, 1500 * nextRetry); // Longer backoff for errors

              // Store timeout ID to clean it up if needed
              errorRetryTimeoutRef.current = timeoutId;
            } else {
              // Mark as initialized even if loading failed after all retries
              // Ensure we set initialized to true so UI can show error state
              setIsInitialized(true);
              console.log(`[useProjectFileList][${executionId}] Failed to load files after ${MAX_RETRIES} retries`);
            }
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

            // Log initialization state for debugging
            console.log(`[useProjectFileList][${executionId}] Load complete, isInitialized=${isInitialized}, retryCount=${retryCount}/${MAX_RETRIES}`);
          }
        });

      // Cleanup function
      return () => {
        // Only abort if this controller is still the active one and not already aborted
        if (activeLoadRef.current.controller === controller && !controller.signal.aborted) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[useProjectFileList][${executionId}] Cleaning up - aborting in-progress file load`);
          }
          try {
            controller.abort();
          } catch (error) {
            console.error(`[useProjectFileList][${executionId}] Error while aborting controller:`, error);
          }

          activeLoadRef.current = {
            promise: null,
            controller: null,
            directory: null
          };

          setIsLoading(false);
        }

        // Clear any scheduled retries to prevent them from firing after directory changes
        if (retryTimeoutRef.current) {
          console.log(`[useProjectFileList] Clearing scheduled retry timeout`);
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }

        // Clear any scheduled error retries
        if (errorRetryTimeoutRef.current) {
          console.log(`[useProjectFileList] Clearing scheduled error retry timeout`);
          clearTimeout(errorRetryTimeoutRef.current);
          errorRetryTimeoutRef.current = null;
        }
      };
    } else {
      // No directory provided - reset state
      if (process.env.NODE_ENV === 'development') {
        console.log(`[useProjectFileList][${executionId}] No project directory provided, resetting state`);
      }

      // When there's no project directory, we should reset to empty state
      // This prevents displaying stale data from a previous directory
      setRawFilesMap({});
      setError(null);
      setIsLoading(false);
      // We still mark as initialized because the UI should display "No project directory selected" state
      setIsInitialized(true);
    }
  // Only include dependencies that we need to react to
  // Exclude state values that are set within this effect to avoid infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectory, loadFiles, refreshFiles]);

  // Log the end of hook initialization
  console.timeEnd('[DEBUG][useProjectFileList] Hook initialization time');
  console.log('[DEBUG][useProjectFileList] Hook initialized successfully');

  return {
    rawFilesMap,
    isLoading,
    isInitialized,  // Add the initialization state to the returned object
    error,
    refreshFiles,
    retryCount     // Return retry count for debugging
  };
}