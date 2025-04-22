"use client";

import { useState, useCallback, useRef } from "react";
import { readDirectoryAction, invalidateDirectoryCache } from "@/actions/read-directory-actions";
import { invalidateFileCache } from '@/lib/git-utils';
import { normalizePath } from "@/lib/path-utils";
import { FilesMap } from "./use-generate-prompt-state";
import { mergeFileMaps, applySessionSelections } from "../_utils/selection-merge";

// Constant for minimum time between file loads to prevent spam
const MIN_LOAD_INTERVAL = 60000; // 1 minute

interface UseFileLoaderProps {
  projectDirectory: string;
  allFilesMap: FilesMap;
  setAllFilesMap: (map: FilesMap) => void;
  setFileContentsMap: (map: Record<string, string>) => void;
  shouldIncludeByDefault: (filePath: string) => boolean;
  previousFilesMap?: FilesMap;
  sessionSelections?: {
    included: string[];
    excluded: string[];
  };
}

export function useFileLoader({
  projectDirectory,
  allFilesMap,
  setAllFilesMap,
  setFileContentsMap,
  shouldIncludeByDefault,
  previousFilesMap,
  sessionSelections
}: UseFileLoaderProps) {
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [isRefreshingFiles, setIsRefreshingFiles] = useState(false);
  
  // Track when files were last loaded to prevent frequent reloads
  const loadFilesRef = useRef<{ 
    lastLoaded: { [dir: string]: number },
    isLoading: boolean 
  }>({ 
    lastLoaded: {}, 
    isLoading: false 
  });

  // Keep track of whether we've applied session selections
  const sessionSelectionsAppliedRef = useRef(false);

  // Load files for a project directory
  const loadFiles = useCallback(async (
    dirToLoad: string, 
    mapToMerge?: FilesMap,
    applySessions?: {
      included: string[];
      excluded: string[];
    }
  ) => {
    const normalizedDir = normalizePath(dirToLoad);
    
    // Check if files were recently loaded
    const now = Date.now();
    const lastLoaded = loadFilesRef.current.lastLoaded[normalizedDir] || 0;
    const timeElapsed = now - lastLoaded;
    
    if (timeElapsed < MIN_LOAD_INTERVAL && Object.keys(allFilesMap).length > 0) {
      console.log(`[File Loader] Files were loaded ${timeElapsed}ms ago, skipping reload.`);
      return;
    }
    
    // Prevent concurrent loads
    if (loadFilesRef.current.isLoading) {
      console.log('[File Loader] File loading already in progress, skipping request.');
      return;
    }
    
    loadFilesRef.current.isLoading = true;
    setIsLoadingFiles(true);
    setLoadingStatus("Loading project files...");
    
    try {
      console.log(`[File Loader] Loading files for ${normalizedDir}`);
      
      // Read file list and contents from server action
      const result = await readDirectoryAction(normalizedDir);
      
      if (result.isSuccess && result.data) {
        // Got files and contents
        const fileContents = result.data;
        
        // Process file paths
        let filesMap: FilesMap = {};
        for (const filePath of Object.keys(fileContents)) {
          const content = fileContents[filePath];
          
          // Determine if file should be included by default
          const include = shouldIncludeByDefault(filePath);
          
          // Add to file map
          filesMap[filePath] = {
            path: filePath,
            size: content.length,
            included: include,
            forceExcluded: false
          };
        }
        
        // Preserve selection state if previous map is provided or mapToMerge is passed
        const mapToUse = mapToMerge || previousFilesMap;
        if (mapToUse) {
          console.log('[File Loader] Merging selection state from previous files map');
          filesMap = mergeFileMaps(mapToUse, filesMap);
        }
        
        // Apply session selections if explicitly provided in this call
        if (applySessions) {
          console.log('[File Loader] Applying explicit session selections');
          filesMap = applySessionSelections(
            filesMap, 
            applySessions.included, 
            applySessions.excluded
          );
        }
        // Or apply session selections from props if provided and not yet applied
        else if (sessionSelections && !sessionSelectionsAppliedRef.current) {
          console.log('[File Loader] Applying session selections from props');
          filesMap = applySessionSelections(
            filesMap, 
            sessionSelections.included, 
            sessionSelections.excluded
          );
          sessionSelectionsAppliedRef.current = true;
        }
        
        // Update state
        setAllFilesMap(filesMap);
        setFileContentsMap(fileContents);
        console.log(`[File Loader] Loaded ${Object.keys(filesMap).length} files.`);
        
        // Record the load time
        loadFilesRef.current.lastLoaded[normalizedDir] = now;
      } else {
        console.error(`[File Loader] Failed to load files:`, result.message);
        setLoadingStatus(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error('[File Loader] Exception loading files:', error);
      setLoadingStatus(`Error loading files.`);
    } finally {
      loadFilesRef.current.isLoading = false;
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  }, [allFilesMap, setAllFilesMap, setFileContentsMap, shouldIncludeByDefault, previousFilesMap, sessionSelections]);

  // Refresh files (clear cache and reload)
  const refreshFiles = useCallback(async (preserveState: boolean = false) => {
    if (!projectDirectory) {
      console.warn('[File Loader] Cannot refresh files - no project directory selected.');
      return;
    }
    
    if (isRefreshingFiles || isLoadingFiles) {
      console.warn('[File Loader] Already refreshing or loading files.');
      return;
    }
    
    setIsRefreshingFiles(true);
    setLoadingStatus("Refreshing project files...");
    
    try {
      console.log('[File Loader] Refreshing file cache...');
      
      // Clear caches first
      await Promise.all([
        invalidateDirectoryCache(projectDirectory),
        invalidateFileCache(projectDirectory)
      ]);
      
      // Force reset the last loaded time
      loadFilesRef.current.lastLoaded[projectDirectory] = 0;
      
      // Reset the session selections applied flag so we don't re-apply them
      // when refreshing (we want to keep our current selections, not restore session ones)
      sessionSelectionsAppliedRef.current = true;
      
      // Load files again, passing current map if preserving state
      if (preserveState) {
        console.log('[File Loader] Preserving selection state during refresh');
        await loadFiles(projectDirectory, allFilesMap);
      } else {
        await loadFiles(projectDirectory);
      }
      
      console.log('[File Loader] Files refreshed successfully.');
    } catch (error) {
      console.error('[File Loader] Error refreshing files:', error);
      setLoadingStatus(`Error refreshing files.`);
    } finally {
      setIsRefreshingFiles(false);
      setLoadingStatus("");
    }
  }, [projectDirectory, isRefreshingFiles, isLoadingFiles, loadFiles, allFilesMap]);

  return {
    loadFiles,
    refreshFiles,
    isLoadingFiles,
    isRefreshingFiles,
    loadingStatus
  };
} 