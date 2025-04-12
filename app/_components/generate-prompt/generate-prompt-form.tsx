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

// Lazy load SessionManager only on the client-side to ensure localStorage is available
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

  /**
   * Generate a namespaced localStorage key using a hashed project directory and current format.
   */
  const getLocalKey = useCallback((dir: string, suffix: string, format: string = outputFormat) => {
    if (!dir) return "";
    const hash = hashString(dir);
    return `o1-pro-flow-${hash}-${format}-${suffix}`;
  }, [outputFormat]); // Now depends on outputFormat

  // Load states from localStorage specific to the directory
  const loadCachedStates = useCallback((dir: string, format: string = outputFormat) => {
    const cachedTask = localStorage.getItem(getLocalKey(dir, TASK_DESC_KEY, format));
    const cachedSearch = localStorage.getItem(getLocalKey(dir, SEARCH_TERM_KEY, format));
    const cachedPaths = localStorage.getItem(getLocalKey(dir, PASTED_PATHS_KEY, format));
    const cachedStructure = localStorage.getItem(getLocalKey(dir, CODEBASE_STRUCTURE_KEY, format));
    const cachedPatternDesc = localStorage.getItem(getLocalKey(dir, PATTERN_DESC_KEY, format));
    const cachedTitleRegex = localStorage.getItem(getLocalKey(dir, TITLE_REGEX_KEY, format)); // Corrected key
    const cachedContentRegex = localStorage.getItem(getLocalKey(dir, CONTENT_REGEX_KEY, format)); // Corrected key
    
    if (cachedTask) setTaskDescription(cachedTask);
    if (cachedSearch) setSearchTerm(cachedSearch);
    if (cachedPaths) setPastedPaths(cachedPaths);
    if (cachedStructure) setCodebaseStructure(cachedStructure);
    if (cachedPatternDesc) setPatternDescription(cachedPatternDesc);
    if (cachedTitleRegex) setTitleRegex(cachedTitleRegex);
    if (cachedContentRegex) setContentRegex(cachedContentRegex);

    const savedRegexActive = localStorage.getItem(getLocalKey(dir, REGEX_ACTIVE_KEY, format));
    // Default to true if no setting found
    setIsRegexActive(savedRegexActive === null ? true : savedRegexActive === "true");
    setActiveSessionId(null); // Loading cached state means it's not a loaded session
  }, [getLocalKey, outputFormat]); // Depends only on getLocalKey which depends on nothing changing

  // Save relevant states whenever they change
  useEffect(() => {
    if (projectDirectory) {
      localStorage.setItem(getLocalKey(projectDirectory, TASK_DESC_KEY, outputFormat), taskDescription);
      localStorage.setItem(getLocalKey(projectDirectory, SEARCH_TERM_KEY, outputFormat), searchTerm);
      localStorage.setItem(getLocalKey(projectDirectory, PASTED_PATHS_KEY, outputFormat), pastedPaths);
      localStorage.setItem(getLocalKey(projectDirectory, PATTERN_DESC_KEY, outputFormat), patternDescription);
      localStorage.setItem(getLocalKey(projectDirectory, TITLE_REGEX_KEY, outputFormat), titleRegex);
      localStorage.setItem(getLocalKey(projectDirectory, CONTENT_REGEX_KEY, outputFormat), contentRegex);
      localStorage.setItem(getLocalKey(projectDirectory, CODEBASE_STRUCTURE_KEY, outputFormat), codebaseStructure);
      localStorage.setItem(getLocalKey(projectDirectory, REGEX_ACTIVE_KEY, outputFormat), String(isRegexActive));
      // Note: Included/Excluded files are saved in a separate effect triggered by allFilesMap changes
    } // TODO: Debounce this?
  }, [taskDescription, searchTerm, pastedPaths, patternDescription, titleRegex, contentRegex, codebaseStructure, isRegexActive, projectDirectory, getLocalKey, outputFormat]); // Added all relevant state dependencies

  const handleLoadFiles = useCallback(async (dir?: string) => {
    const directory = dir || projectDirectory;
    if (!directory?.trim()) {
      setError("Please enter a project directory");
      return;
    }

    console.log(`Attempting to load files for directory: ${directory}`);
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

      // Load saved selections for this directory
      let savedIncludedFiles: string[] = [];
      let savedForceExcluded: string[] = [];
      try {
        const key = getLocalKey(directory, INCLUDED_FILES_KEY, outputFormat);
        const keyEx = getLocalKey(directory, FORCE_EXCLUDED_FILES_KEY, outputFormat);
        savedIncludedFiles = JSON.parse(localStorage.getItem(key) || "[]");
        savedForceExcluded = JSON.parse(localStorage.getItem(keyEx) || "[]");
      } catch (e) {
        console.warn("Failed to parse saved files from localStorage");
        // Don't reset localStorage here, just proceed with empty arrays
      }
      // Apply saved selections to the newly loaded file list
      const newFilesMap: FilesMap = {};
      Object.entries(result.data || {}).forEach(([path, content]) => {
        newFilesMap[path] = {
          path,
          size: new Blob([content as string]).size,
          forceExcluded: savedForceExcluded.includes(path),
          included: savedIncludedFiles.includes(path) && !savedForceExcluded.includes(path),
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
  }, [projectDirectory, getLocalKey, outputFormat]); // Removed state setters from dependency array as they are stable

  // Effect to load global project dir and initial files/states on mount
  useEffect(() => {
    const savedDir = localStorage.getItem(GLOBAL_PROJECT_DIR_KEY) || "";
    if (savedDir) {
      setProjectDirectory(savedDir);
      loadCachedStates(savedDir, outputFormat); // Load text/regex states first

      // Call handleLoadFiles to load files and apply saved selections
      handleLoadFiles(savedDir);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setProjectDirectory, getLocalKey, loadCachedStates]); // Only run on mount

  // Save file selections whenever allFilesMap changes
  useEffect(() => {
    if (projectDirectory && Object.keys(allFilesMap).length > 0) { // Only save if there are files
      const includedPaths = Object.values(allFilesMap)
        .filter(f => f.included && !f.forceExcluded) // Only save explicitly included ones
        .map(f => f.path);
      const excludedPaths = Object.values(allFilesMap)
        .filter(f => f.forceExcluded)
        .map(f => f.path);

      localStorage.setItem(getLocalKey(projectDirectory, INCLUDED_FILES_KEY, outputFormat), JSON.stringify(includedPaths));
      localStorage.setItem(getLocalKey(projectDirectory, FORCE_EXCLUDED_FILES_KEY, outputFormat), JSON.stringify(excludedPaths));
      
      // Clear active session when files are modified since we're no longer in the exact saved state
      // setActiveSessionId(null); // Commented out: Keep session active even if file selection changes
    }
  }, [allFilesMap, projectDirectory, getLocalKey, outputFormat]); // Run whenever selections change or project changes

  // Load cached states and files when project directory context changes
  useEffect(() => {
    if (projectDirectory) {
      loadCachedStates(projectDirectory, outputFormat);
      handleLoadFiles(projectDirectory);
      setActiveSessionId(null); // Clear active session when project changes explicitly
    } else { setActiveSessionId(null); } // Also clear if dir is cleared
  }, [projectDirectory, loadCachedStates, handleLoadFiles, outputFormat]);

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

  const handleTaskChange = (value: string) => {
    setTaskDescription(value);
    // Auto-save logic handled by the useEffect hook now
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    // Auto-save logic handled by the useEffect hook now
  };

  const handlePastedPathsChange = (value: string) => {
    setPastedPaths(value);
    // Auto-save logic handled by the useEffect hook now
  };

  const handlePatternDescriptionChange = (value: string) => {
    setPatternDescription(value);
    // Auto-save logic handled by the useEffect hook now
  };

  const handleTitleRegexChange = (value: string) => {
    setTitleRegex(value);
    // Auto-save logic handled by the useEffect hook now
    setTitleRegexError(null); // Clear error on manual change
  };

  const handleContentRegexChange = (value: string) => {
    setContentRegex(value);
    // Auto-save logic handled by the useEffect hook now
    setContentRegexError(null); // Clear error on manual change
  };

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    setTitleRegexError(null);
    setContentRegexError(null);
  }, [projectDirectory, getLocalKey, outputFormat]);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    // Auto-save logic handled by the useEffect hook now
  }, [isRegexActive, projectDirectory, getLocalKey, outputFormat]);

  // Memoized calculation for files displayed in the browser
  const displayedFiles = useMemo(() => {
    let baseFiles = Object.values(allFilesMap).sort((a, b) => a.path.localeCompare(b.path)); // Sort for stable display

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
      const result = await generateRegexPatternsAction(patternDescription, codebaseStructure || undefined); // Pass undefined if empty
      console.log("Regex generation result:", result);
      
      if (result.isSuccess && result.data) {
        const newTitleRegex = result.data.titleRegex || "";
        const newContentRegex = result.data.contentRegex || "";
        setTitleRegex(newTitleRegex);
        setContentRegex(newContentRegex);
        setRegexGenerationError(""); // Clear any previous error on success
        setActiveSessionId(null); // Clear active session as regex changed
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns.");
      }
    } catch (error) {
      console.error("Error in handleGenerateRegex:", error);
      setRegexGenerationError(error instanceof Error ? error.message : "Unexpected error generating regex patterns");
    } finally {
      setIsGeneratingRegex(false);
    }
  }, [patternDescription, codebaseStructure, projectDirectory, getLocalKey, outputFormat]); // Added codebaseStructure dependency

  const updateTokenCount = async (text: string) => {
    const count = await estimateTokens(text);
    setTokenCount(count);
  };

  const handleCodebaseStructureChange = useCallback((value: string) => {
    setCodebaseStructure(value);
    setActiveSessionId(null); // Structure changed, clear active session
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
          return acc;
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
  }, [
    projectDirectory, taskDescription, searchTerm, pastedPaths, patternDescription,
    titleRegex, contentRegex, isRegexActive, codebaseStructure, allFilesMap,
    outputFormat
  ]);

  // Function to apply a loaded session's state
  const applySessionState = useCallback(async (session: Session) => {
    setTaskDescription(session.taskDescription);
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
    setActiveSessionId(session.id); // Track which session is currently active

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
  }, [setCustomFormat, setAllFilesMap]); // Add setters if they aren't stable

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
        <SessionManager
          projectDirectory={projectDirectory}
          getCurrentSessionState={getCurrentSessionState}
          onLoadSession={applySessionState}
          outputFormat={outputFormat}
          activeSessionId={activeSessionId}
        />
      </React.Suspense>

      {/* Pattern Description and Regex Generation */}
      <PatternDescriptionInput
        value={patternDescription}
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
        setAllFilesMap={setAllFilesMap} // Pass setter for master list
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        titleRegex={titleRegex}
        contentRegex={contentRegex} // Pass content regex for display/context if needed
        fileContentsMap={fileContentsMap}
        isRegexActive={isRegexActive} // Pass isRegexActive to FileBrowser
      />

      {/* Pasted Paths */}
      <PastePaths
        pastedPaths={pastedPaths}
        onChange={handlePastedPathsChange}
        foundFiles={displayedFiles}
        allFilesMap={allFilesMap}
        setPastedPathsFound={setPastedPathsFound}
        pastedPathsFound={pastedPathsFound}
      />

      {/* Task Description */}
      <TaskDescriptionArea 
        taskDescription={taskDescription} 
        onChange={handleTaskChange}
      />

      {/* Voice Transcription */}
      <VoiceTranscription
        onTranscribed={(text) => {
          // Use functional update to avoid issues with stale state in closure
          setTaskDescription((prevTaskDesc) => {
            const updatedText = (prevTaskDesc ? prevTaskDesc + " " : "") + text;
            // Save to localStorage inside the functional update to ensure consistency
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