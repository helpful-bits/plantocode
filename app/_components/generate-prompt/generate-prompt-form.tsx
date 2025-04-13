"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { readDirectoryAction, readExternalFileAction } from "@/actions/read-directory-actions";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { estimateTokens } from "@/lib/token-estimator";
import { hashString } from "@/lib/hash";
import { getFormatInstructions } from "@/lib/format-instructions";
import CodebaseStructure from "./_components/codebase-structure";
import { useProject } from "@/lib/contexts/project-context";
import { normalizePath } from "@/lib/path-utils";

import FileBrowser from "./file-browser";
import PatternDescriptionInput from "./_components/pattern-description-input";
import RegexInput from "./_components/regex-input";
import PastePaths from "./paste-paths";
import path from "path";
import TaskDescriptionArea from "./_components/task-description";
import VoiceTranscription from "./voice-transcription";
import { useFormat } from "@/lib/contexts/format-context";
import { Session } from "@/types/session-types";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import ProjectDirectorySelector from "./_components/project-directory-selector";
import { useDatabase } from "@/lib/contexts/database-context";

const TASK_DESC_KEY = "task-description"; // TODO: Consider making these format-specific?
const SEARCH_TERM_KEY = "search-term";
const PASTED_PATHS_KEY = "pasted-paths";
const INCLUDED_FILES_KEY = "included-files";
const FORCE_EXCLUDED_FILES_KEY = "force-excluded-files";
const CODEBASE_STRUCTURE_KEY = "codebase-structure";
const PATTERN_DESC_KEY = "pattern-desc";
const TITLE_REGEX_KEY = "title-regex";
const CONTENT_REGEX_KEY = "content-regex";
const REGEX_ACTIVE_KEY = "regex-active";
const ACTIVE_SESSION_KEY = "active-session-id"; // Add new constant for active session ID

// Lazy load SessionManager only on the client-side
const SessionManager = React.lazy(() => import("./_components/session-manager").then(module => ({ default: module.SessionManager })));

interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

type FilesMap = { [path: string]: FileInfo };

export default function GeneratePromptForm() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const { repository } = useDatabase(); // Access the repository from context
  const [taskDescription, setTaskDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pastedPaths, setPastedPaths] = useState("");
  const [patternDescription, setPatternDescription] = useState("");
  const [titleRegex, setTitleRegex] = useState("");
  const [contentRegex, setContentRegex] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [regexGenerationError, setRegexGenerationError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingRegex, setIsGeneratingRegex] = useState(false);
  const [allFilesMap, setAllFilesMap] = useState<FilesMap>({}); // All files from git ls-files, keyed by path
  const [fileContentsMap, setFileContentsMap] = useState<{ [key: string]: string }>({}); // Contents of files
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [pastedPathsFound, setPastedPathsFound] = useState(0);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [codebaseStructure, setCodebaseStructure] = useState("");
  const { outputFormat, customFormat, setCustomFormat } = useFormat();
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [isRegexActive, setIsRegexActive] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [pathDebugInfo, setPathDebugInfo] = useState<{ original: string, normalized: string }[]>([]);
  const [sessionRestoreAttempted, setSessionRestoreAttempted] = useState(false);

  // Function to save active session ID
  const handleSetActiveSessionId = useCallback((sessionId: string | null) => {
    setActiveSessionId(sessionId);
    // Also save to DB immediately (or consider debouncing)
    if (projectDirectory) {
      repository.setActiveSession(projectDirectory, outputFormat, sessionId);
    }
  }, [projectDirectory, outputFormat, repository]);
  const saveActiveSessionId = useCallback(async (sessionId: string | null) => {
    if (projectDirectory) {
      if (sessionId) {
        console.log("Saving active session ID to database:", sessionId);
        await repository.setActiveSession(projectDirectory, outputFormat, sessionId);
      } else {
        await repository.setActiveSession(projectDirectory, outputFormat, null);
      }
    }
  }, [projectDirectory, outputFormat, repository]);
  // Save cached state to database
  const saveCachedState = useCallback(async (key: string, value: string) => {
    if (projectDirectory) {
      await repository.saveCachedState(projectDirectory, outputFormat, key, value);
    }
  }, [projectDirectory, outputFormat, repository]);

  // Load cached states from database (only called if no active session)
  const loadCachedStates = useCallback(async (dir: string, format: string) => {
    console.log(`Loading cached states for ${dir}/${format}`);
    // Load each cached state item from the database
    const cachedTask = await repository.getCachedState(dir, format as any, TASK_DESC_KEY) ?? "";
    const cachedSearch = await repository.getCachedState(dir, format as any, SEARCH_TERM_KEY) ?? "";
    const cachedPaths = await repository.getCachedState(dir, format as any, PASTED_PATHS_KEY) ?? "";
    const cachedStructure = await repository.getCachedState(dir, format as any, CODEBASE_STRUCTURE_KEY) ?? "";
    const cachedPatternDesc = await repository.getCachedState(dir, format as any, PATTERN_DESC_KEY);
    const cachedTitleRegex = await repository.getCachedState(dir, format as any, TITLE_REGEX_KEY);
    const cachedContentRegex = await repository.getCachedState(dir, format as any, CONTENT_REGEX_KEY);
    
    if (cachedTask) setTaskDescription(cachedTask);
    if (cachedSearch) setSearchTerm(cachedSearch);
    if (cachedPaths) setPastedPaths(cachedPaths);
    if (cachedStructure) setCodebaseStructure(cachedStructure);
    if (cachedPatternDesc) setPatternDescription(cachedPatternDesc);
    if (cachedTitleRegex) setTitleRegex(cachedTitleRegex);
    if (cachedContentRegex) setContentRegex(cachedContentRegex);

    const savedRegexActive = await repository.getCachedState(dir, format as any, REGEX_ACTIVE_KEY);
    // Default to true if no setting found
    setIsRegexActive(savedRegexActive === null ? true : savedRegexActive === "true");
    
    // Don't reset active session ID here, as we want to potentially restore it
  }, [repository]);

  // Function to be called when any form input/selection changes
  const handleUserInteraction = useCallback(() => {
    if (activeSessionId) {
      console.log("User interaction detected, clearing active session ID");
      handleSetActiveSessionId(null); // Clear active session ID on interaction
    }
  }, [activeSessionId, handleSetActiveSessionId]);

  useEffect(() => {
    const saveAllStates = async () => {
      try {
        // Handle each save operation separately to avoid single failure causing all to fail
        const saveOperations = [
          saveCachedState(TASK_DESC_KEY, taskDescription).catch(err => {
            console.error(`Error saving task description:`, err);
            return null;
          }),
          saveCachedState(SEARCH_TERM_KEY, searchTerm).catch(err => {
            console.error(`Error saving search term:`, err);
            return null;
          }),
          saveCachedState(PASTED_PATHS_KEY, pastedPaths).catch(err => {
            console.error(`Error saving pasted paths:`, err);
            return null;
          }),
          saveCachedState(PATTERN_DESC_KEY, patternDescription).catch(err => {
            console.error(`Error saving pattern description:`, err);
            return null;
          }),
          saveCachedState(TITLE_REGEX_KEY, titleRegex).catch(err => {
            console.error(`Error saving title regex:`, err);
            return null;
          }),
          saveCachedState(CONTENT_REGEX_KEY, contentRegex).catch(err => {
            console.error(`Error saving content regex:`, err);
            return null;
          }),
          saveCachedState(CODEBASE_STRUCTURE_KEY, codebaseStructure).catch(err => {
            console.error(`Error saving codebase structure:`, err);
            return null;
          }),
          saveCachedState(REGEX_ACTIVE_KEY, String(isRegexActive)).catch(err => {
            console.error(`Error saving regex active state:`, err);
            return null;
          })
        ];
        
        await Promise.all(saveOperations);
        
        // Log success only if all operations succeeded
        if (!saveOperations.includes(null)) {
          console.log("Successfully saved all cached state items");
        }
      } catch (error) {
        console.error("Error in saveAllStates:", error);
      }
    };
    
    // Debounce state saving to reduce database writes
    const timerId = setTimeout(() => {
      saveAllStates();
    }, 500);
    
    return () => clearTimeout(timerId);
  }, [taskDescription, searchTerm, pastedPaths, patternDescription, titleRegex, contentRegex, codebaseStructure, isRegexActive, projectDirectory, outputFormat, saveCachedState]);

  // Save file selections whenever allFilesMap changes
  useEffect(() => {
    if (projectDirectory && Object.keys(allFilesMap).length > 0) { // Only save if there are files
      const includedPaths = Object.values(allFilesMap)
        .map(f => f.path);
      const excludedPaths = Object.values(allFilesMap)
        .filter(f => f.forceExcluded)
        .map(f => f.path);

      // Debounce file selection saving
      const timerId = setTimeout(async () => {
        try {
          const saveOperations = [
            saveCachedState(INCLUDED_FILES_KEY, JSON.stringify(includedPaths)).catch(err => {
              console.error(`Error saving included files:`, err);
              return null;
            }),
            saveCachedState(FORCE_EXCLUDED_FILES_KEY, JSON.stringify(excludedPaths)).catch(err => {
              console.error(`Error saving excluded files:`, err);
              return null;
            })
          ];
          
          await Promise.all(saveOperations);
          
          if (!saveOperations.includes(null)) {
            console.log("Successfully saved file selections");
          }
        } catch (error) {
          console.error("Error saving file selections:", error);
        }
      }, 500);
      
      return () => clearTimeout(timerId);
    }
  }, [allFilesMap, projectDirectory, outputFormat, saveCachedState]);

  // Define handleLoadFiles before checkActiveSessionId useEffect
  const handleLoadFiles = useCallback(async (dir?: string) => {
    const directory = dir || projectDirectory;
    if (!directory?.trim()) {
      setError("Please enter a project directory");
      return;
    }

    console.log(`Attempting to load files for directory: ${directory} (format: ${outputFormat})`);
    // Always clear errors before loading files
    setError("");
    setIsLoadingFiles(true);
    setLoadingStatus("Reading directory...");

    try {
      const result = await readDirectoryAction(directory);
      if (!result.isSuccess) {
        setAllFilesMap({});
        setFileContentsMap({});
        setError(result.message || "Failed to read directory");
        setIsLoadingFiles(false);
        return;
      }

      // Only check for empty files when explicitly loading
      if (!result.data || Object.keys(result.data || {}).length === 0) {
        // Display the git repository error message OR the accessibility error, empty file map
        setError("No files found. Is this a git repository?");
        setAllFilesMap({});
        return;
      }

        // **Important:** Only load file selections from cache if NOT restoring an active session.
        // If an active session is being restored, its file selections will be applied later.
        let fileSelectionsToApply: { included: string[]; excluded: string[] } | null = null;

        if (!activeSessionId) { // Only load from cache if no active session
            try {
                const savedIncludedFilesStr = await repository.getCachedState(directory, outputFormat, INCLUDED_FILES_KEY);
                const savedForceExcludedStr = await repository.getCachedState(directory, outputFormat, FORCE_EXCLUDED_FILES_KEY);
                fileSelectionsToApply = {
                    included: savedIncludedFilesStr ? JSON.parse(savedIncludedFilesStr) : [],
                    excluded: savedForceExcludedStr ? JSON.parse(savedForceExcludedStr) : []
                };
            } catch (e) {
                console.warn("Failed to parse saved files from cache:", e);
            }
        }

        // Apply saved selections to the newly loaded file list
      const newFilesMap: FilesMap = {};
      const savedIncludedFiles = fileSelectionsToApply?.included || [];
      const savedForceExcluded = fileSelectionsToApply?.excluded || [];
      
      Object.entries(result.data || {}).forEach(([filePath, content]) => {
        newFilesMap[filePath] = {
          path: filePath,
          size: new Blob([content as string]).size,
          forceExcluded: savedForceExcluded.includes(filePath),
          included: savedIncludedFiles.includes(filePath) && !savedForceExcluded.includes(filePath),
        };
      });
      setFileContentsMap(result.data || {}); // Store contents separately
      setAllFilesMap(newFilesMap); // Store all files info map
      setError(""); // Clear any errors if successful
    } catch (err) {
      console.error("Failed to read directory:", err);
      setError("Failed to read directory. Please ensure the path is correct and accessible.");
      setAllFilesMap({});
      setFileContentsMap({});
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  }, [projectDirectory, outputFormat, repository, activeSessionId]); // Add activeSessionId dependency
  
  // Load cached states and files when project directory context changes
  useEffect(() => {
    if (projectDirectory && outputFormat) {
      // Check if there's a saved active session ID first
      const checkActiveSessionId = async () => {
        const savedActiveSessionId = await repository.getActiveSessionId(projectDirectory, outputFormat);
        
        if (savedActiveSessionId) {
          console.log("Found saved session ID in database:", savedActiveSessionId);
          setActiveSessionId(savedActiveSessionId);
          // We'll attempt to restore the session later when SessionManager mounts
          setSessionRestoreAttempted(false);
        } else {
          // Only load cached states if no active session
          await loadCachedStates(projectDirectory, outputFormat);
          setActiveSessionId(null);
          setSessionRestoreAttempted(true);
        }
        
        // Always load files, regardless of session state
        await handleLoadFiles(projectDirectory);
      };
      
      checkActiveSessionId();
    } else { 
      setActiveSessionId(null);
      setSessionRestoreAttempted(true); // Mark as attempted if no project dir
    }
  }, [projectDirectory, outputFormat, loadCachedStates, handleLoadFiles, repository]);
  
  // Effect to load global project dir and initial files/states on mount
  useEffect(() => {
    // Project directory is now loaded from the ProjectProvider context
    // which already handles the database access
    // So we don't need to do anything here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setProjectDirectory]); // Only run on mount
  
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Handler for when a directory is selected/entered in the selector component
  const handleProjectDirectorySelected = useCallback(async (value: string) => {
    if (!value) {
      setError("Please select or enter a valid project directory");
      return;
    }

    // Clear any previous errors
    setError("");

    // Update context and global storage (triggers useEffect above)
    setProjectDirectory(value);
    
    // Reset state that shouldn't carry over between projects
    setPrompt("");
    
    // Load files from the selected directory
    try {
      await handleLoadFiles(value);
    } catch (err) {
      console.error("Error loading files:", err);
      setError(`Failed to load files: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [setProjectDirectory, handleLoadFiles]);

  // Update functions that modify active session ID
  const handleTaskChange = (value: string) => {
    // Always update local state immediately
    setTaskDescription(value);
      handleUserInteraction(); // Clear active session ID
    
    // Immediately save the task description to the database
    if (projectDirectory) {
      try {
        // Use a non-debounced save for immediate feedback
        saveCachedState(TASK_DESC_KEY, value)
          .catch(error => {
            console.error("Error saving task description:", error);
            // Show error in UI for user feedback
            setError(`Failed to save task description: ${error instanceof Error ? error.message : String(error)}`);
            
            // Clear error after a few seconds
            setTimeout(() => {
              setError(prev => {
                if (prev.includes("Failed to save task description")) {
                  return "";
                }
                return prev;
              });
            }, 5000);
          });
      } catch (error) {
        console.error("Unexpected error in handleTaskChange:", error);
      }
    } else {
      console.warn("Cannot save task description: No project directory set");
    }
    // Don't clear active session ID automatically
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    handleUserInteraction();
    // Don't clear active session ID automatically
  };

  const handlePastedPathsChange = (value: string) => {
    setPastedPaths(value);
    handleUserInteraction();
    // Don't clear active session ID automatically
  };

  const handlePatternDescriptionChange = (value: string) => {
    setPatternDescription(value);
    handleUserInteraction();
    // Don't clear active session ID automatically
  };

  const handleTitleRegexChange = (value: string) => {
    setTitleRegex(value);
    handleUserInteraction();
    // Don't clear active session ID automatically
  };

  const handleContentRegexChange = (value: string) => {
    setContentRegex(value);
    handleUserInteraction();
    // Don't clear active session ID automatically
  };

  const handleClearPatterns = useCallback(() => {
    if (!titleRegex && !contentRegex) return; // No change if already empty
    setTitleRegex("");
    setContentRegex("");
    setTitleRegexError(null);
    setContentRegexError(null);
    handleUserInteraction();
  }, [titleRegex, contentRegex, handleUserInteraction]);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    handleUserInteraction();
    // Don't clear active session ID automatically
  }, [isRegexActive, handleUserInteraction]);

  // Memoized calculation for files displayed in the browser
  const displayedFiles = useMemo(() => {
     // Create a copy before sorting to avoid mutating the state directly
    let baseFiles = Object.values({ ...allFilesMap }).sort((a, b) => a.path.localeCompare(b.path));

    // 1. Filter by searchTerm
    if (searchTerm) {
      baseFiles = baseFiles.filter((file) =>
        file.path.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    const hasTitleRegex = titleRegex.trim();
    const contentRegexTrimmed = contentRegex.trim();
    const hasContentRegex = contentRegexTrimmed && Object.keys(fileContentsMap).length > 0;

    // If regex is inactive or no regex patterns, return search-filtered list
    if (!isRegexActive || (!hasTitleRegex && !hasContentRegex)) {
      // Clear any previous regex errors if regex fields are now empty
      if (titleRegexError && !hasTitleRegex) setTitleRegexError(null);
      if (contentRegexError && !contentRegexTrimmed) setContentRegexError(null); // Use trimmed version here too
      return baseFiles;
    }

    let titleMatches = new Set<string>();
    let contentMatches = new Set<string>();
    let titleError: string | null = null;
    let contentError: string | null = null;

    // 2. Apply titleRegex if present
    if (hasTitleRegex) {
      try {
        const regex = new RegExp(titleRegex.trim());
        baseFiles.forEach((file) => {
          if (regex.test(file.path)) {
            titleMatches.add(file.path);
          }
        });
      } catch (e) {
        titleError = e instanceof Error ? e.message : "Invalid title regex";
      }
    }

    // 3. Apply contentRegex if present
    if (hasContentRegex) {
      try {
        const regex = new RegExp(contentRegexTrimmed, 'm'); // 'm' for multiline matching
        baseFiles.forEach((file) => {
          const content = fileContentsMap[file.path];
          if (typeof content === 'string' && regex.test(content)) {
            contentMatches.add(file.path);
          }
        });
      } catch (e) {
        contentError = e instanceof Error ? e.message : "Invalid content regex";
      }
    }

    // Update error states outside the loop/try-catch
    if (titleRegexError !== titleError) setTitleRegexError(titleError);
    if (contentRegexError !== contentError) setContentRegexError(contentError);

    // 4. Combine results using OR logic
    const combinedPaths = new Set<string>();
    // Only add matches if the corresponding regex was valid (no error)
    if (hasTitleRegex && !titleError) titleMatches.forEach(path => combinedPaths.add(path));
    if (hasContentRegex && !contentError) contentMatches.forEach(path => combinedPaths.add(path));

    // Filter the original baseFiles list based on the combined matched paths
    return baseFiles.filter(file => combinedPaths.has(file.path));

  }, [allFilesMap, searchTerm, titleRegex, contentRegex, fileContentsMap, titleRegexError, contentRegexError, isRegexActive]); // Add isRegexActive dependency

  const handleGenerateRegex = useCallback(async () => {
    if (!patternDescription.trim()) {
      setRegexGenerationError("Please enter a pattern description first.");
      return;
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError("");
    try {
      console.log("Generating regex patterns for:", patternDescription);
      const result = await generateRegexPatternsAction(patternDescription, codebaseStructure || undefined);
      console.log("Regex generation result:", result);
      
      if (result.isSuccess && result.data) {
        const newTitleRegex = result.data.titleRegex || "";
        const newContentRegex = result.data.contentRegex || "";
        setTitleRegex(newTitleRegex);
        setContentRegex(newContentRegex);
        setRegexGenerationError(""); // Clear any previous error on success
        // Don't clear active session ID when regex is auto-generated
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns.");
      }
    } catch (error) {
      console.error("Error in handleGenerateRegex:", error);
      setRegexGenerationError(error instanceof Error ? error.message : "Unexpected error generating regex patterns");
    } finally {
      setIsGeneratingRegex(false);
    }
  }, [patternDescription, codebaseStructure]); // Added codebaseStructure dependency

  const updateTokenCount = async (text: string) => {
    const count = await estimateTokens(text);
    setTokenCount(count);
  };

  const handleCodebaseStructureChange = useCallback((value: string) => {
    setCodebaseStructure(value);
    handleUserInteraction(); // Clear active session ID
  }, [handleUserInteraction]);

  // Update allFilesMap state from child components (FileBrowser, PastePaths)
  const handleFilesMapChange = useCallback((newMap: FilesMap) => {    setAllFilesMap(newMap);
  }, []);

  const handleGenerate = async () => {
    /**
     * Generates a prompt by:
     * 1. Always reading fresh file contents directly from the file system
     * 2. Using either the file browser selection or pasted paths to determine which files to include
     * 3. Generating the formatted prompt with the latest file contents
     */
    setIsLoading(true);
    setError(""); // Clear previous errors
    setLoadingStatus("Preparing files...");
    setExternalPathWarnings([]);

    try {
      // First, refresh file contents from the file system for project files
      setLoadingStatus("Reading file contents...");
      
      // Get fresh contents for project files
      let currentFileContents: { [key: string]: string } = {};
      
      if (projectDirectory) {
        const freshResult = await readDirectoryAction(projectDirectory);
        if (freshResult.isSuccess && freshResult.data) {
          currentFileContents = { ...freshResult.data };
        } else {
          setError("Failed to read current file contents: " + freshResult.message);
          setIsLoading(false);
          setLoadingStatus("");
          return;
        }
      } else {
        setError("No project directory specified");
        setIsLoading(false);
        setLoadingStatus("");
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0;
      const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {}).some((f) => f.included && !f.forceExcluded);

      // Determine which files to use based on pasted paths or browser selection
      let filesToUse: string[] = [];
      const warnings: string[] = [];

      if (hasPastedPaths) {
        setLoadingStatus("Processing pasted paths...");
        // Create a normalized map for better file path matching
        const normalizedFileContentsMap = Object.keys(currentFileContents).reduce((acc, key) => {
          const normalizedKey = normalizePath(key, projectDirectory);
          acc[normalizedKey] = key; // Store the original key
          return acc as Record<string, string>;
        }, {} as Record<string, string>);
        
        const rawPastedPaths = pastedPaths
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => !!p && !p.startsWith("#"));

        const projectFilePaths = new Set(Object.keys(currentFileContents || {})); // Use fresh file contents

        for (const filePath of rawPastedPaths) {
          // Try to normalize the path if it's not an absolute path
          const normalizedPath = normalizePath(filePath, projectDirectory);
          
          // Check if the path exists in our normalized map
          if (normalizedFileContentsMap[normalizedPath]) {
            // Use the original path from the map to ensure consistency
            const originalPath = normalizedFileContentsMap[normalizedPath];
            filesToUse.push(originalPath);
          }
          else if (projectFilePaths.has(filePath)) {
            // Legacy path lookup - original path matches directly
            if (currentFileContents[filePath] !== undefined) {
              filesToUse.push(filePath);
            } else {
              // Should theoretically not happen if we just got fresh content
              warnings.push(`Could not find content for project path "${filePath}".`);
              console.warn(`Content missing for project path: ${filePath}`);
            }
          } else {
            // Path is potentially external (absolute or relative outside project root handled by readExternal)
            setLoadingStatus(`Reading external file: ${filePath}...`);
            const externalFileResult = await readExternalFileAction(filePath);
            if (externalFileResult.isSuccess && externalFileResult.data) {
              // Merge external content into our temporary map for this generation
              currentFileContents = { ...currentFileContents, ...externalFileResult.data };
              // Add the path (using the key from externalFileResult.data which is the original path)
              const addedPath = Object.keys(externalFileResult.data)[0];
              filesToUse.push(addedPath);
            } else {
              warnings.push(`Could not read external path "${filePath}": ${externalFileResult.message}`);
              console.warn(`Failed to read external file ${filePath}: ${externalFileResult.message}`);
            }
          }
        }

        if (filesToUse.length === 0 && rawPastedPaths.length > 0) {
             setError("None of the pasted paths could be read or found. Check paths and permissions.");
             setIsLoading(true); // Keep loading state if error occurs here
             setLoadingStatus("");
             if (warnings.length > 0) setExternalPathWarnings(warnings);
             return;
        }
      } else if (isAnyFileIncludedFromBrowser) {
        setLoadingStatus("Using selected files...");
        // No pasted paths, use files selected in the browser from the state
        // Filter the *currentFileContents* using the selection state from *allFilesMap*
        const selectedPaths = new Set(Object.values(allFilesMap).filter(f => f.included && !f.forceExcluded).map(f => f.path));
        
        // Log selected paths for debugging
        console.log("Selected paths:", [...selectedPaths]);
        
        // Create a map of normalized paths to original paths for better matching
        const normalizedToOriginal: Record<string, string> = {};
        Object.keys(currentFileContents).forEach(originalPath => {
          const normalizedPath = normalizePath(originalPath, projectDirectory);
          normalizedToOriginal[normalizedPath] = originalPath;
        });
        
        // Check both original and normalized paths to ensure we find matches
        filesToUse = Object.keys(currentFileContents).filter(path => {
          // First check direct path match
          if (selectedPaths.has(path) && currentFileContents[path] !== undefined) {
            return true;
          }
          
          // If no direct match, try normalized path matching
          const normalizedPath = normalizePath(path, projectDirectory);
          return selectedPaths.has(normalizedPath) && currentFileContents[path] !== undefined;
        });
        
        // Log resolved file paths for debugging
        console.log("Files to use:", filesToUse);
      } else {
        // Neither pasted paths nor browser selection
        setError("Please include at least one file using the file browser or paste file paths.");
        setIsLoading(false);
        setLoadingStatus("");
        return;
      }

      if (warnings.length > 0) {
        setExternalPathWarnings(warnings);
      }

      // Generate file contents markup using the freshly loaded currentFileContents
      setLoadingStatus("Generating prompt markup...");
      const fileContentMarkup = Object.entries(currentFileContents)
        .filter(([filePath]) => filesToUse.includes(filePath)) // Filter using the determined filesToUse
        .map(([path, content]) => `<file>
<file_path>${path}</file_path>
<file_content>
${content}
</file_content>
</file>`)
        .join("\n\n");
        
      // Log final prompt paths for debugging
      console.log("Final paths in prompt:", Object.entries(currentFileContents)
        .filter(([filePath]) => filesToUse.includes(filePath))
        .map(([path]) => path));

      let instructions = await getFormatInstructions(outputFormat, customFormat);

      if (outputFormat === "refactoring") {
        if (codebaseStructure.trim()) {
          const structureSection = `<structure>
${codebaseStructure}
</structure>`;
          instructions = instructions.replace("{{STRUCTURE_SECTION}}", structureSection);
        } else {
          instructions = instructions
            .replace("{{STRUCTURE_SECTION}}", "")
            .replace(/(\d+)\./g, (match, num) => {
              const section = parseInt(num);
              return section > 2 ? `${section - 1}.` : `${section}.`;
            });
        }
      }

      const fullPrompt = `${instructions}

<project_files>
${fileContentMarkup}
</project_files>

<task>
${taskDescription}
</task>`;

      setPrompt(fullPrompt);
      await updateTokenCount(fullPrompt);
      
      // Update state with fresh file contents for future operations
      setFileContentsMap(currentFileContents);
    } catch (error) {
      setError("Failed to generate prompt");
      console.error("Error during prompt generation:", error); // Log the error
    } finally {
      setIsLoading(false);
      setLoadingStatus(""); // Clear loading status
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopySuccess(true);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  // Function to get the current state for saving a session
  const getCurrentSessionState = useCallback((): Omit<Session, 'id' | 'name'> => {
    const includedFiles = Object.values(allFilesMap || {})
      .filter(f => f.included) // Save all included, regardless of forceExclude status
      .map(f => f.path);
    const forceExcludedFiles = Object.values(allFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);

    return {
      projectDirectory,
      taskDescription,
      searchTerm,
      pastedPaths,
      patternDescription,
      titleRegex,
      contentRegex,
      isRegexActive,
      codebaseStructure,
      includedFiles,
      forceExcludedFiles,
      outputFormat,
    };
  }, [ // Ensure all state variables are listed
    projectDirectory, taskDescription, searchTerm, pastedPaths, patternDescription,
    titleRegex, contentRegex, isRegexActive, codebaseStructure, allFilesMap,
    outputFormat
  ]);

  // Function to apply a loaded session's state
  const applySessionState = useCallback(async (session: Session) => {
    console.log("Applying session state:", session.name);
    setTaskDescription(session.taskDescription ?? ""); // Use default value if null/undefined
    setSearchTerm(session.searchTerm);
    setPastedPaths(session.pastedPaths);
    setPatternDescription(session.patternDescription);
    setTitleRegex(session.titleRegex);
    setContentRegex(session.contentRegex);
    setIsRegexActive(session.isRegexActive);
    setCodebaseStructure(session.codebaseStructure);
    // Output format is handled by the context and session manager's filtering
    if ('customFormat' in session) {
      // Only set if it exists in the session object
      setCustomFormat((session as any).customFormat);
    }
    
    // Set active session ID internally, parent will handle saving via callback
    setActiveSessionId(session.id);
    
    // Update file selections based on the loaded session
    setAllFilesMap(prevMap => {
      const newMap = { ...prevMap };
      const includedSet = new Set(session.includedFiles);
      const excludedSet = new Set(session.forceExcludedFiles);

      for (const path in newMap) {
        const isExcluded = excludedSet.has(path);
        const isIncluded = includedSet.has(path) && !isExcluded;
        newMap[path] = { ...newMap[path], included: isIncluded, forceExcluded: isExcluded };
      }
      return newMap;
    });

    // Re-calculate token count for the loaded state
    setError(""); // Clear errors on successful load
    // Note: Prompt itself is not saved in the session, it will be regenerated on demand
  }, [setCustomFormat]);

  // Add this function to toggle debug mode
  const toggleDebugMode = () => {
    const newDebugMode = !debugMode;
    setDebugMode(newDebugMode);
    
    // If enabling debug mode, generate path debug info
    if (newDebugMode && projectDirectory) {
      const debugInfo = Object.keys(allFilesMap).map(originalPath => ({
        original: originalPath,
        normalized: normalizePath(originalPath, projectDirectory)
      }));
      setPathDebugInfo(debugInfo);
    } else {
      setPathDebugInfo([]);
    }
  };

  // Save active session ID whenever it changes
  useEffect(() => {
    if (projectDirectory && activeSessionId !== null) {
      console.log("Saving active session ID to database:", activeSessionId);
      saveActiveSessionId(activeSessionId);
    }
  }, [activeSessionId, projectDirectory, saveActiveSessionId]);

  // Add session state validation on page load to detect issues
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // This only runs in the browser
      console.log("Session initialization check running");
        let isSavingOnUnload = false; // Flag to prevent multiple saves


        const handleBeforeUnload = () => {
        // Last chance to save any unsaved data before page refresh
        if (projectDirectory && activeSessionId) {
          console.log("Page unloading - ensuring session state is saved");
          // Force re-save current session data if a session is active
          saveActiveSessionId(activeSessionId);
          
          // Save all individual form fields as well
          const saveAllData = async () => {
            if (isSavingOnUnload) return; // Prevent re-entry
            isSavingOnUnload = true;
            try {
              await Promise.all([
                saveCachedState(TASK_DESC_KEY, taskDescription),
                // ... include ALL other state variables that need saving ...
                 saveCachedState(SEARCH_TERM_KEY, searchTerm),
                 saveCachedState(PASTED_PATHS_KEY, pastedPaths),
                 saveCachedState(PATTERN_DESC_KEY, patternDescription),
                 saveCachedState(TITLE_REGEX_KEY, titleRegex),
                 saveCachedState(CONTENT_REGEX_KEY, contentRegex),
                 saveCachedState(CODEBASE_STRUCTURE_KEY, codebaseStructure),
                 saveCachedState(REGEX_ACTIVE_KEY, String(isRegexActive)),
                // Save file selections too
                 saveCachedState(INCLUDED_FILES_KEY, JSON.stringify(Object.values(allFilesMap).filter(f => f.included).map(f => f.path))),
                 saveCachedState(FORCE_EXCLUDED_FILES_KEY, JSON.stringify(Object.values(allFilesMap).filter(f => f.forceExcluded).map(f => f.path)))
              ]);
              console.log("Successfully saved state before unload");
            } catch (error) {
              console.error("Error saving data before unload:", error);
            } finally {
              isSavingOnUnload = false; // Reset flag
            }
          };
          
          // Using the deprecated synchronous XHR to ensure data is saved
          // before the page unloads
          // Trigger saveAllData first, then try to give it time with sync XHR
          saveAllData();
          const xhr = new XMLHttpRequest();
          xhr.open('GET', '/api/heartbeat', false); // Synchronous request
          try {
            xhr.send();
          } catch (e) {
            // Ignore errors - this is just to give time for the above async operations to complete
            console.warn("Sync XHR failed, save might not have completed.", e);
          }
        }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [
    projectDirectory, activeSessionId, saveActiveSessionId, saveCachedState, 
    taskDescription, searchTerm, pastedPaths, patternDescription, 
    titleRegex, contentRegex, codebaseStructure, isRegexActive
  ]);

  return (
    <div className="max-w-[1400px] w-full mx-auto p-4 flex flex-col gap-6">
      {error && <div className="text-destructive bg-destructive/10 p-3 rounded-lg font-medium">{error}</div>}

      {/* Project Directory */}
      <div className="flex flex-col gap-2 bg-card p-5 rounded-lg shadow-sm border">
        <label className="font-semibold text-lg text-card-foreground">Project Directory</label>
        <ProjectDirectorySelector
          value={projectDirectory}
          onChange={handleProjectDirectorySelected}
          isLoadingFiles={isLoadingFiles}
        />
      </div>

      {/* Session Manager (Lazy Loaded) - Only show if project directory exists */}
      <React.Suspense fallback={<div className="text-center text-muted-foreground">Loading Session Manager...</div>}>
        {projectDirectory && (
          <SessionManager
            projectDirectory={projectDirectory}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={applySessionState}
            outputFormat={outputFormat}
            activeSessionId={activeSessionId}
            setActiveSessionIdExternally={handleSetActiveSessionId} // Pass setter to SessionManager
          />
        )}
      </React.Suspense>

      {/* Pattern Description and Regex Generation */}
      <PatternDescriptionInput
        value={patternDescription}
        onInteraction={handleUserInteraction}
        onChange={handlePatternDescriptionChange}
        onGenerateRegex={handleGenerateRegex}
        isGeneratingRegex={isGeneratingRegex}
        regexGenerationError={regexGenerationError}
        codebaseStructure={codebaseStructure}
        foundFiles={Object.keys(allFilesMap)}
      />

      {/* Regex Inputs */}
      <RegexInput
        titleRegex={titleRegex}
        contentRegex={contentRegex}
        onInteraction={handleUserInteraction}
        onTitleChange={handleTitleRegexChange}
        onContentChange={handleContentRegexChange}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        onClearPatterns={handleClearPatterns}
        isActive={isRegexActive}
        onToggleActive={handleToggleRegexActive}
      />

      {/* File Browser - Only show if files loaded */}
      <FileBrowser
        displayedFiles={displayedFiles}
        allFilesMap={allFilesMap}
        onFilesMapChange={handleFilesMapChange} // Pass callback
        setAllFilesMap={setAllFilesMap} // Pass setter for master list
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        titleRegex={titleRegex}
        contentRegex={contentRegex} // Pass content regex for display/context if needed
        fileContentsMap={fileContentsMap}
        onInteraction={handleUserInteraction}
        isRegexActive={isRegexActive} // Pass isRegexActive to FileBrowser
      />

      {/* Pasted Paths */}
      <PastePaths
        pastedPaths={pastedPaths}
        onChange={handlePastedPathsChange}
        foundFiles={displayedFiles}
        onInteraction={handleUserInteraction}
        allFilesMap={allFilesMap}
        setPastedPathsFound={setPastedPathsFound}
        pastedPathsFound={pastedPathsFound}
      />

      {/* Task Description */}
      <TaskDescriptionArea 
        taskDescription={taskDescription}
        onInteraction={handleUserInteraction}
        onChange={handleTaskChange}
      />

      {/* Voice Transcription */}
      <VoiceTranscription
        onTranscribed={(text) => {
          handleUserInteraction(); // Transcription counts as interaction
          // Use functional update to avoid issues with stale state in closure
          setTaskDescription((prevTaskDesc) => {
            const updatedText = (prevTaskDesc ? prevTaskDesc + " " : "") + text;
            // Auto-save is handled by the main useEffect hook
            return updatedText;
          });

        }}
        foundFiles={Object.keys(allFilesMap)}
      />

      {/* Codebase Structure (only for refactoring) */}
      {outputFormat === "refactoring" && (
        <CodebaseStructure
          value={codebaseStructure}
          onChange={handleCodebaseStructureChange}
          onInteraction={handleUserInteraction}
        />
      )}

      {/* Generate Prompt */}
      <div className="flex flex-col gap-4 mt-4">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
          <Button
            variant="default"
            className="flex-1 md:flex-none"
            onClick={handleGenerate}
            disabled={isLoading || !projectDirectory}
          >
            {isLoading ? `${loadingStatus || "Generating..."}` : "Generate Prompt"}
          </Button>
          
          {prompt && (
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={isLoading}
              className="flex-1 md:flex-none"
            >
              {copySuccess ? "Copied!" : "Copy Prompt"}
            </Button>
          )}
          
          <Button
            variant="ghost"
            onClick={toggleDebugMode}
            className="text-xs text-muted-foreground"
            size="sm"
          >
            {debugMode ? "Hide Debug Info" : "Debug Path Issues"}
          </Button>
        </div>
        
        {debugMode && (
          <div className="bg-muted/30 p-3 rounded text-xs border">
            <h3 className="font-semibold mb-2">Path Debug Information</h3>
            <div className="bg-background p-2 rounded max-h-40 overflow-y-auto">
              <p className="mb-2">This shows how file paths are being normalized. If you're having issues with path selection, check if the paths match what you expect.</p>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left p-1 border-b">Original Path</th>
                    <th className="text-left p-1 border-b">Normalized Path</th>
                  </tr>
                </thead>
                <tbody>
                  {pathDebugInfo.map((item, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-muted/20' : ''}>
                      <td className="p-1 font-mono">{item.original}</td>
                      <td className="p-1 font-mono">{item.normalized}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {externalPathWarnings.length > 0 && (
          <div className="bg-yellow-500/10 p-3 rounded text-sm border border-yellow-500/50">
            <h3 className="font-semibold mb-2 text-yellow-700 dark:text-yellow-400">External Path Warnings</h3>
            <ul className="list-disc pl-5 space-y-1">
              {externalPathWarnings.map((warning, i) => (
                <li key={i} className="text-muted-foreground">{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {prompt && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="font-semibold">Prompt ({tokenCount.toLocaleString()} tokens):</label>
            </div>
            <div className="border rounded bg-card p-3 font-mono text-sm overflow-auto max-h-96 whitespace-pre-wrap">
              {prompt}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}