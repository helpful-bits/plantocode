"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { readDirectoryAction, readExternalFileAction } from "@/actions/read-directory-actions";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { estimateTokens } from "@/lib/token-estimator";
import { hashString } from "@/lib/hash";
import { getFormatInstructions } from "@/lib/format-instructions";
import CodebaseStructure from "./_components/codebase-structure";
import { useProject } from "@/lib/contexts/project-context";

import FileBrowser from "./file-browser";
import PatternDescriptionInput from "./_components/pattern-description-input";
import RegexInput from "./_components/regex-input";
import PastePaths from "./paste-paths";
import path from "path";
import TaskDescriptionArea from "./_components/task-description";
import VoiceTranscription from "./voice-transcription";
import { useFormat } from "@/lib/contexts/format-context";

const GLOBAL_PROJECT_DIR_KEY = "o1-pro-flow-project-dir";
const TASK_DESC_KEY = "task-description";
const SEARCH_TERM_KEY = "search-term";
const PASTED_PATHS_KEY = "pasted-paths";
const INCLUDED_FILES_KEY = "included-files";
const FORCE_EXCLUDED_FILES_KEY = "force-excluded-files";
const CODEBASE_STRUCTURE_KEY = "codebase-structure";
const PATTERN_DESC_KEY = "pattern-desc";
const TITLE_REGEX_KEY = "title-regex";
const CONTENT_REGEX_KEY = "content-regex";

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
  const { outputFormat, customFormat } = useFormat();
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);

  /**
   * Generate a namespaced localStorage key using a hashed project directory and current format.
   */
  const getLocalKey = useCallback((dir: string, suffix: string) => {
    const hash = hashString(dir);
    return `gp-${hash}-${suffix}`; // Key should be based on directory, not format
  }, [outputFormat]);

  // Load states from localStorage specific to the directory and format
  const loadCachedStates = useCallback((dir: string) => {
    const cachedTask = localStorage.getItem(getLocalKey(dir, TASK_DESC_KEY));
    const cachedSearch = localStorage.getItem(getLocalKey(dir, SEARCH_TERM_KEY));
    const cachedPaths = localStorage.getItem(getLocalKey(dir, PASTED_PATHS_KEY));
    const cachedStructure = localStorage.getItem(getLocalKey(dir, CODEBASE_STRUCTURE_KEY));
    const cachedPatternDesc = localStorage.getItem(getLocalKey(dir, PATTERN_DESC_KEY));
    const cachedTitleRegex = localStorage.getItem(getLocalKey(dir, TITLE_REGEX_KEY));
    const cachedContentRegex = localStorage.getItem(getLocalKey(dir, CONTENT_REGEX_KEY)); // Corrected key
    
    if (cachedTask) setTaskDescription(cachedTask);
    if (cachedSearch) setSearchTerm(cachedSearch);
    if (cachedPaths) setPastedPaths(cachedPaths);
    if (cachedStructure) setCodebaseStructure(cachedStructure);
    if (cachedPatternDesc) setPatternDescription(cachedPatternDesc);
    if (cachedTitleRegex) setTitleRegex(cachedTitleRegex);
    if (cachedContentRegex) setContentRegex(cachedContentRegex);

    // File selections are loaded within handleLoadFiles/initial mount effect

  }, [getLocalKey]);

  // Save relevant states whenever they change
  useEffect(() => {
    if (projectDirectory) {
      localStorage.setItem(getLocalKey(projectDirectory, TASK_DESC_KEY), taskDescription);
      localStorage.setItem(getLocalKey(projectDirectory, SEARCH_TERM_KEY), searchTerm);
      localStorage.setItem(getLocalKey(projectDirectory, PASTED_PATHS_KEY), pastedPaths);
    }
  }, [taskDescription, searchTerm, pastedPaths, projectDirectory, getLocalKey]);
  const handleLoadFiles = useCallback(async (dir?: string) => {
    const directory = dir || projectDirectory;
    if (!directory?.trim()) {
      setError("Please enter a project directory");
      return;
    }

    // Always clear errors before loading files
    setError("");
    setIsLoadingFiles(true);
    setLoadingStatus("Reading directory...");

    try {
      const result = await readDirectoryAction(directory);
      if (!result.isSuccess) {
        setAllFilesMap({});
        setFileContentsMap({});
        setError(result.message);
        return;
      }

      // Only check for empty files when explicitly loading
      if (Object.keys(result.data).length === 0) {
        // Display the git repository error message and empty the file map
        console.log("Directory read successfully, but no files found/readable.");
        setError("No files found. Is this a git repository?");
        setAllFilesMap({});
        return;
      }

      // Load saved selections for this directory
      let savedIncludedFiles: string[] = [];
      let savedForceExcluded: string[] = [];
      try {
        const key = getLocalKey(directory, INCLUDED_FILES_KEY);
        const keyEx = getLocalKey(directory, FORCE_EXCLUDED_FILES_KEY);
        savedIncludedFiles = JSON.parse(localStorage.getItem(key) || "[]");
        savedForceExcluded = JSON.parse(localStorage.getItem(keyEx) || "[]");
      } catch (e) {
        console.warn("Failed to parse saved files from localStorage");
        // Don't reset localStorage here, just proceed with empty arrays
      }
      // Apply saved selections to the newly loaded file list
      const newFilesMap: FilesMap = {};
      Object.entries(result.data).forEach(([path, content]) => {
        newFilesMap[path] = {
          path,
          size: new Blob([content as string]).size,
          forceExcluded: savedForceExcluded.includes(path),
          included: savedIncludedFiles.includes(path) && !savedForceExcluded.includes(path),
        };
      });
      setFileContentsMap(result.data); // Store contents separately
      setAllFilesMap(newFilesMap); // Store all files info map
      setError(""); // Clear any errors if successful
    } catch (err) {
      setError("Failed to read directory");
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  }, [projectDirectory, setError, setIsLoadingFiles, setLoadingStatus, setAllFilesMap, setFileContentsMap, getLocalKey]);

  // Effect to load global project dir and initial files/states on mount
  useEffect(() => {
    const savedDir = localStorage.getItem(GLOBAL_PROJECT_DIR_KEY);
    if (savedDir) {
      setProjectDirectory(savedDir);
      loadCachedStates(savedDir); // Load text/regex states first

      const loadFilesInitial = async (dir: string) => {
        try {
          setIsLoadingFiles(true);
          const result = await readDirectoryAction(dir);
          
          if (result.isSuccess && Object.keys(result.data).length > 0) {
            let savedIncludedFiles: string[] = [];
            let savedForceExcluded: string[] = [];
            try {
              savedIncludedFiles = JSON.parse(
                localStorage.getItem(getLocalKey(dir, INCLUDED_FILES_KEY)) || "[]",
              );
              savedForceExcluded = JSON.parse(
                localStorage.getItem(getLocalKey(dir, FORCE_EXCLUDED_FILES_KEY)) || "[]",
              );
            } catch (e) {
              console.warn("Failed to parse saved files from localStorage");
            } // Don't reset localStorage

            const newFilesMap: FilesMap = {};
            Object.entries(result.data).forEach(([path, content]) => {
              newFilesMap[path] = {
                path,
                size: new Blob([content as string]).size,
                forceExcluded: savedForceExcluded.includes(path),
                included: savedIncludedFiles.includes(path) && !savedForceExcluded.includes(path),
              };
            });
            setFileContentsMap(result.data);
            setAllFilesMap(newFilesMap); // Set the map with loaded selections
          } else if (!result.isSuccess) {
            // Silently handle error on initial load unless it's critical
            console.warn("Initial file load failed:", result.message);
          }
        } catch (err) {
          console.error("Failed to silently load files on mount:", err);
          setIsLoadingFiles(false);
          setLoadingStatus("");
        }
      };
      
      loadFilesInitial(savedDir);
    }
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

      localStorage.setItem(getLocalKey(projectDirectory, INCLUDED_FILES_KEY), JSON.stringify(includedPaths));
      localStorage.setItem(getLocalKey(projectDirectory, FORCE_EXCLUDED_FILES_KEY), JSON.stringify(excludedPaths));
    }
  }, [allFilesMap, projectDirectory, getLocalKey]); // Run whenever selections change

  // Load cached states when project directory changes
  useEffect(() => {
    if (projectDirectory) {
      loadCachedStates(projectDirectory);
    }
  }, [projectDirectory, loadCachedStates]);

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Whenever the project directory changes, store globally and load from cache
  const handleDirectoryChange = useCallback((value: string) => {
    // The context setter already handles localStorage for GLOBAL_PROJECT_DIR_KEY
    setProjectDirectory(value);
    loadCachedStates(value);
    // Reset state that shouldn't carry over between projects
    setPrompt("");
    setAllFilesMap({}); // Clear file map, will be reloaded by handleLoadFiles if needed
    setFileContentsMap({});
    // Clear errors unless it's the git repo warning which might persist if the new dir also lacks it
    if (error !== "No files found. Is this a git repository?") {
      setError("");
    }
  }, [setProjectDirectory, loadCachedStates, error]); // Dependencies for handleDirectoryChange

  const handleTaskChange = useCallback((value: string) => {
    setTaskDescription(value);
    localStorage.setItem(getLocalKey(projectDirectory, TASK_DESC_KEY), value);
  }, [projectDirectory, getLocalKey]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    localStorage.setItem(getLocalKey(projectDirectory, SEARCH_TERM_KEY), value);
  }, [projectDirectory, getLocalKey]);

  const handlePastedPathsChange = useCallback((value: string) => {
    setPastedPaths(value);
    localStorage.setItem(getLocalKey(projectDirectory, PASTED_PATHS_KEY), value);
  }, [projectDirectory, getLocalKey]);

  const handlePatternDescriptionChange = useCallback((value: string) => {
    setPatternDescription(value);
    localStorage.setItem(getLocalKey(projectDirectory, PATTERN_DESC_KEY), value);
  }, [projectDirectory, getLocalKey]);

  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    localStorage.setItem(getLocalKey(projectDirectory, TITLE_REGEX_KEY), value);
    setTitleRegexError(null); // Clear error on manual change
  }, [projectDirectory, getLocalKey]);

  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    localStorage.setItem(getLocalKey(projectDirectory, CONTENT_REGEX_KEY), value);
    setContentRegexError(null); // Clear error on manual change
  }, [projectDirectory, getLocalKey]);

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    localStorage.setItem(getLocalKey(projectDirectory, TITLE_REGEX_KEY), "");
    localStorage.setItem(getLocalKey(projectDirectory, CONTENT_REGEX_KEY), "");
    setTitleRegexError(null);
    setContentRegexError(null);
  }, [projectDirectory, getLocalKey]);

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

    // If no regex, return search-filtered list
    if (!hasTitleRegex && !hasContentRegex) {
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

  }, [allFilesMap, searchTerm, titleRegex, contentRegex, fileContentsMap, titleRegexError, contentRegexError]); // Include regex errors

  const handleGenerateRegex = useCallback(async () => {
    if (!patternDescription.trim()) {
      setRegexGenerationError("Please enter a pattern description first.");
      return;
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError("");
    try {
      console.log("Generating regex patterns for:", patternDescription);
      const result = await generateRegexPatternsAction(patternDescription, codebaseStructure);
      console.log("Regex generation result:", result);
      
      if (result.isSuccess && result.data) {
        console.log("Setting title regex:", result.data.titleRegex || "");
        const newTitleRegex = result.data.titleRegex || "";
        const newContentRegex = result.data.contentRegex || "";
        setTitleRegex(newTitleRegex);
        setContentRegex(newContentRegex);
        localStorage.setItem(getLocalKey(projectDirectory, TITLE_REGEX_KEY), result.data.titleRegex || "");
        localStorage.setItem(getLocalKey(projectDirectory, CONTENT_REGEX_KEY), result.data.contentRegex || "");
        setRegexGenerationError(""); // Clear any previous error on success
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns.");
      }
    } catch (error) {
      console.error("Error in handleGenerateRegex:", error);
      setRegexGenerationError(error instanceof Error ? error.message : "Unexpected error generating regex patterns");
    } finally {
      setIsGeneratingRegex(false);
    }
  }, [patternDescription, projectDirectory, getLocalKey, codebaseStructure]); // Added codebaseStructure dependency

  const updateTokenCount = async (text: string) => {
    const count = await estimateTokens(text);
    setTokenCount(count);
  };

  const handleCodebaseStructureChange = useCallback((value: string) => {
    setCodebaseStructure(value);
    localStorage.setItem(getLocalKey(projectDirectory, CODEBASE_STRUCTURE_KEY), value);
  }, [projectDirectory, getLocalKey]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError("");
    setLoadingStatus("Reading project files...");
    setExternalPathWarnings([]);

    try {
      // Get files from the project directory first
      // Ensure file contents are loaded if not already
      if (Object.keys(fileContentsMap).length === 0 && projectDirectory?.trim()) {
        // Use handleLoadFiles to ensure files are loaded before continuing
        // await handleLoadFiles(projectDirectory); // Re-fetching might overwrite recent selections, rely on existing state
        // If error occurred during loading, bail out early
        if (error) {
          setIsLoading(false);
          return;
        }
      }
      let currentFileContents = { ...fileContentsMap };
      
      const result = await readDirectoryAction(projectDirectory);
      
      if (result.isSuccess) {
        // Update the current contents but don't directly reassign state variable
        currentFileContents = { ...result.data };
        setFileContentsMap(result.data);
      } else if (!pastedPaths.trim()) {
        // Only show error if no pasted paths are available
        setError(result.message);
        setIsLoading(false);
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0;
      const isAnyFileIncluded = Object.values(allFilesMap).some((f) => f.included);

      if (!hasPastedPaths && !isAnyFileIncluded) {
        setError("Please include at least one file or paste file paths");
        setIsLoading(false);
        return;
      }

      // Collect paths from pasted content if available
      if (hasPastedPaths) {
        setLoadingStatus("Processing external file paths...");
        const externalPaths = pastedPaths
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => !!p && !p.startsWith("#"));
          
        // Check if any path is absolute or doesn't exist in our project files map
        const externalPathsToProcess = externalPaths.filter(p => {
          return path.isAbsolute(p) || !currentFileContents[p]; // Check against current contents map
        });
        
        // Process each external path
        const warnings: string[] = [];
        for (const filePath of externalPathsToProcess) {
          const externalFileResult = await readExternalFileAction(filePath);
          if (externalFileResult.isSuccess && externalFileResult.data) {
            // Merge with existing file contents
            currentFileContents = { ...currentFileContents, ...externalFileResult.data };
          } else {
            console.warn(`Failed to read external file ${filePath}: ${externalFileResult.message}`);
            warnings.push(`Could not read external path "${filePath}": ${externalFileResult.message}`);
          }
        }
        
        if (warnings.length > 0) {
          setExternalPathWarnings(warnings);
        }
      }
      
      // Determine which files to include in the prompt
      const filesToUse = hasPastedPaths
        ? pastedPaths
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => !!p && !p.startsWith("#") && currentFileContents[p] !== undefined) // Only include if content was read (even if empty)
        : Object.values(allFilesMap).filter((f) => f.included).map((f) => f.path);

      // Generate file contents markup using currentFileContents
      const fileContentMarkup = Object.entries(currentFileContents)
        .filter(([path]) => filesToUse.includes(path))
        .map(([path, content]) => `<file>
<file_path>${path}</file_path>
<file_content>
${content}
</file_content>
</file>`)
        .join("\n\n");

      const formatInstructions = await getFormatInstructions(outputFormat, customFormat);
      
      let instructions = formatInstructions;
      
      if (outputFormat === "refactoring") {
        if (codebaseStructure.trim()) {
          const structureSection = `<structure>
${codebaseStructure}
</structure>`;
          instructions = formatInstructions.replace("{{STRUCTURE_SECTION}}", structureSection);
        } else {
          instructions = formatInstructions
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
    } catch (error) {
      setError("Failed to generate prompt");
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
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

  return (
    <div className="max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
      {error && <div className="text-destructive">{error}</div>}

      {/* Project Directory */}
      <div className="flex flex-col gap-2">
        <label className="mb-2 font-bold text-foreground">Project Directory:</label>
        <div className="flex gap-2">
          <Input
            className="border rounded bg-background text-foreground p-2 flex-1"
            type="text"
            value={projectDirectory}
            onChange={(e) => handleDirectoryChange(e.target.value)}
            placeholder="e.g. /Users/myusername/projects/o1-pro-flow"
          />
          <Button
            className="bg-secondary text-secondary-foreground p-2 rounded whitespace-nowrap"
            onClick={() => handleLoadFiles(projectDirectory)}
            disabled={isLoadingFiles}
          >
            {isLoadingFiles ? "Loading..." : "Load Files"}
          </Button>
        </div>
      </div>

      {/* New: Pattern Description and Regex Generation */}
      <PatternDescriptionInput
        value={patternDescription}
        onChange={handlePatternDescriptionChange}
        onGenerateRegex={handleGenerateRegex}
        isGeneratingRegex={isGeneratingRegex}
        regexGenerationError={regexGenerationError}
        projectDirectory={projectDirectory}
        codebaseStructure={codebaseStructure}
      />

      {/* New: Regex Inputs */}
      <RegexInput
        titleRegex={titleRegex}
        contentRegex={contentRegex}
        onTitleChange={handleTitleRegexChange}
        onContentChange={handleContentRegexChange}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        onClearPatterns={handleClearPatterns}
      />

      {/* File Browser */}
      <FileBrowser
        displayedFiles={displayedFiles}
        allFilesMap={allFilesMap}
        setAllFilesMap={setAllFilesMap} // Pass setter for master list
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        titleRegex={titleRegex}
        contentRegex={contentRegex} // Pass content regex for display/context if needed
        fileContentsMap={fileContentsMap}
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
        foundFiles={displayedFiles.map((f) => f.path)}
      />

      {/* Voice Transcription */}
      <VoiceTranscription
        onTranscribed={(text) => {
          // Use functional update to avoid issues with stale state in closure
          setTaskDescription(prevTaskDesc => {
            const updatedText = (prevTaskDesc ? prevTaskDesc + " " : "") + text;
            // Save to localStorage inside the functional update to ensure consistency
            // NOTE: Generally avoid side-effects here, but localStorage is sync and matches existing pattern
            localStorage.setItem(getLocalKey(projectDirectory || '', TASK_DESC_KEY), updatedText);
            return updatedText;
          });
        }} // Pass projectDirectory for getLocalKey usage
        foundFiles={Object.keys(allFilesMap)}
      />

      {/* Codebase Structure (only for refactoring) */}
      {outputFormat === "refactoring" && (
        <CodebaseStructure
          value={codebaseStructure}
          onChange={handleCodebaseStructureChange}
        /> // Removed projectDirectory prop
      )}

      {/* Generate Prompt */}
      <Button
        className="bg-primary text-primary-foreground p-2 rounded disabled:opacity-50"
        onClick={handleGenerate}
        disabled={isLoading}
      >
        {isLoading ? loadingStatus : "Generate Prompt"}
      </Button>

      {/* Generated Prompt */}
      {prompt && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="font-bold text-foreground">Generated Prompt:</label>
            <span className="text-sm text-muted-foreground">
              ~{tokenCount.toLocaleString()} tokens
            </span>
          </div>
          <textarea
            className="border rounded bg-background text-foreground p-2 h-96 w-full font-mono text-sm"
            value={prompt}
            onChange={async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
              const newPrompt = e.target.value;
              setPrompt(newPrompt);
              await updateTokenCount(newPrompt);
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              className="bg-secondary text-secondary-foreground p-2 rounded"
              onClick={handleCopy}
            >
              {copySuccess ? "Copied!" : "Copy to Clipboard"}
            </Button>
            {copySuccess && (
              <span className="text-green-500 dark:text-green-400 text-sm">
                ✓ Copied to clipboard
              </span>
            )}
          </div>
        </div>
      )}

      {error && <div className="text-destructive mt-4">{error}</div>}
      
      {externalPathWarnings.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
          <h4 className="font-semibold text-yellow-800">Warning: Some external files could not be read</h4>
          <ul className="list-disc pl-5 mt-2 text-sm text-yellow-700">
            {externalPathWarnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}