"use client";

import { useEffect, useState } from "react";
import { readDirectoryAction } from "@/actions/read-directory-actions";
import { Input } from "@/components/ui/input";
import { estimateTokens } from "@/lib/token-estimator";
import { hashString } from "@/lib/hash";

import FileBrowser from "./file-browser";
import PastePaths from "./paste-paths";
import TaskDescriptionArea from "./task-description";
import VoiceTranscription from "./voice-transcription";

const GLOBAL_PROJECT_DIR_KEY = "o1-pro-flow-project-dir";
const TASK_DESC_KEY = "task-desc";
const SEARCH_TERM_KEY = "search-term";
const PASTED_PATHS_KEY = "pasted-paths";
const INCLUDED_FILES_KEY = "included-files";
const FORCE_EXCLUDED_FILES_KEY = "force-excluded-files";

interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

/**
 * Generate a namespaced localStorage key using a hashed project directory.
 */
function getLocalKey(dir: string, suffix: string) {
  const hash = hashString(dir);
  return `gp-${hash}-${suffix}`;
}

export default function GeneratePromptForm() {
  const [projectDirectory, setProjectDirectory] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pastedPaths, setPastedPaths] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [foundFiles, setFoundFiles] = useState<FileInfo[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [pastedPathsFound, setPastedPathsFound] = useState(0);
  const [tokenCount, setTokenCount] = useState<number>(0);

  // Load states from localStorage specific to the directory
  function loadCachedStates(dir: string) {
    const cachedTask = localStorage.getItem(getLocalKey(dir, TASK_DESC_KEY));
    const cachedSearch = localStorage.getItem(getLocalKey(dir, SEARCH_TERM_KEY));
    const cachedPaths = localStorage.getItem(getLocalKey(dir, PASTED_PATHS_KEY));
    if (cachedTask) setTaskDescription(cachedTask);
    if (cachedSearch) setSearchTerm(cachedSearch);
    if (cachedPaths) setPastedPaths(cachedPaths);
  }

  useEffect(() => {
    const savedDir = localStorage.getItem(GLOBAL_PROJECT_DIR_KEY);
    if (savedDir) {
      setProjectDirectory(savedDir);
      loadCachedStates(savedDir);
      // Automatically load files if we have a saved directory
      handleLoadFiles(savedDir);
    }
  }, []);

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Whenever the project directory changes, store globally and load from cache
  const handleDirectoryChange = (value: string) => {
    setProjectDirectory(value);
    localStorage.setItem(GLOBAL_PROJECT_DIR_KEY, value);
    loadCachedStates(value);
    // Remove automatic file loading here
    setPrompt("");
    setError(""); // Clear any existing errors
  };

  const handleTaskChange = (value: string) => {
    setTaskDescription(value);
    localStorage.setItem(getLocalKey(projectDirectory, TASK_DESC_KEY), value);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem(getLocalKey(projectDirectory, SEARCH_TERM_KEY), value);
  };

  const handlePastedPathsChange = (value: string) => {
    setPastedPaths(value);
    localStorage.setItem(getLocalKey(projectDirectory, PASTED_PATHS_KEY), value);
  };

  const handleLoadFiles = async (dir?: string) => {
    const directory = dir || projectDirectory;
    if (!directory.trim()) {
      setError("Please enter a project directory");
      return;
    }

    setError("");
    setIsLoadingFiles(true);
    setLoadingStatus("Reading directory...");

    try {
      const result = await readDirectoryAction(directory);
      if (!result.isSuccess) {
        setError(result.message);
        return;
      }

      // Only check for empty files when explicitly loading
      if (Object.keys(result.data).length === 0) {
        setError("No files found. Is this a git repository?");
        return;
      }

      let savedIncludedFiles: string[] = [];
      let savedForceExcluded: string[] = [];
      try {
        savedIncludedFiles = JSON.parse(
          localStorage.getItem(getLocalKey(directory, INCLUDED_FILES_KEY)) || "[]"
        );
        savedForceExcluded = JSON.parse(
          localStorage.getItem(getLocalKey(directory, FORCE_EXCLUDED_FILES_KEY)) || "[]"
        );
      } catch (e) {
        console.warn("Failed to parse saved files from localStorage");
        localStorage.setItem(getLocalKey(directory, INCLUDED_FILES_KEY), "[]");
        localStorage.setItem(getLocalKey(directory, FORCE_EXCLUDED_FILES_KEY), "[]");
      }

      const files = Object.entries(result.data).map(([path, content]) => ({
        path,
        size: new Blob([content]).size,
        forceExcluded: savedForceExcluded.includes(path),
        included: savedIncludedFiles.includes(path) && !savedForceExcluded.includes(path),
      }));

      setFoundFiles(files);
      setError(""); // Clear any errors if successful
    } catch (error) {
      setError("Failed to read directory");
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  };

  const updateTokenCount = async (text: string) => {
    const count = await estimateTokens(text);
    setTokenCount(count);
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setError("");
    setLoadingStatus("Reading project files...");

    try {
      const result = await readDirectoryAction(projectDirectory);

      if (!result.isSuccess) {
        setError(result.message);
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0;
      const isAnyFileIncluded = foundFiles.some((f) => f.included);

      if (!hasPastedPaths && !isAnyFileIncluded) {
        setError("Please include at least one file or paste file paths");
        return;
      }

      const filesToUse = hasPastedPaths
        ? pastedPaths
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => !!p && !p.startsWith("#"))
        : foundFiles.filter((f) => f.included).map((f) => f.path);

      const fileContents = Object.entries(result.data)
        .filter(([path]) => filesToUse.includes(path))
        .map(([path, content]) => `${path}:\n${content}\n`)
        .join("\n");

      const fullPrompt = `You are an expert software engineer. Please implement the following changes and respond with a simplified diff format that shows what changes to make.

Here are the key requirements for the response format:
- Include the full file path for each file
- Mark added lines with '+'
- Mark deleted lines with '-'
- Include a few lines of context around the changes
- Group changes by file
- No need for git patch headers or complex metadata
- For new files, use "NEW FILE:" header and include the complete file contents
- Put any file deletions or renamings in a cleanup.sh script
- After the code block, provide a brief summary of what changes were made and why

Your response should be a single markdown code block followed by a short summary. Example format:

\`\`\`txt
file: path/to/file.ts
... existing code ...
- old line
+ new line
... existing code ...

NEW FILE: path/to/new/file.ts
import { something } from '@/lib/something';
 
export function NewComponent() {
  return <div>New component</div>;
}

cleanup.sh
#!/bin/bash
rm path/to/old/file.ts
mv path/to/original/file.ts path/to/new/location/file.ts
\`\`\`

Summary of changes:
- Updated Example component to render content instead of null
- Added new NewComponent for feature X
- Cleaned up old unused file and reorganized file structure

Please carefully review these existing project files to understand the current implementation and context:

${fileContents}

Task Description:
${taskDescription}`;

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

  const handleFileSelectionChange = (files: FileInfo[]) => {
    setFoundFiles(files);
    localStorage.setItem(
      getLocalKey(projectDirectory, INCLUDED_FILES_KEY),
      JSON.stringify(files.filter(f => f.included).map(f => f.path))
    );
    localStorage.setItem(
      getLocalKey(projectDirectory, FORCE_EXCLUDED_FILES_KEY),
      JSON.stringify(files.filter(f => f.forceExcluded).map(f => f.path))
    );
  };

  return (
    <div className="max-w-xl w-full mx-auto p-4 flex flex-col gap-4">
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
          <button
            className="bg-secondary text-secondary-foreground p-2 rounded whitespace-nowrap"
            onClick={() => handleLoadFiles(projectDirectory)}
            disabled={isLoadingFiles}
          >
            {isLoadingFiles ? "Loading..." : "Load Files"}
          </button>
        </div>
      </div>

      {/* File Browser */}
      <FileBrowser
        foundFiles={foundFiles}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        setFoundFiles={handleFileSelectionChange}
      />

      {/* Pasted Paths */}
      <PastePaths
        pastedPaths={pastedPaths}
        onChange={handlePastedPathsChange}
        foundFiles={foundFiles}
        setPastedPathsFound={setPastedPathsFound}
        pastedPathsFound={pastedPathsFound}
      />

      {/* Task Description */}
      <TaskDescriptionArea taskDescription={taskDescription} onChange={handleTaskChange} />

      {/* Voice Transcription */}
      <VoiceTranscription
        onTranscribed={(text) => {
          const newText = taskDescription + " " + text;
          setTaskDescription(newText);
          localStorage.setItem(getLocalKey(projectDirectory, TASK_DESC_KEY), newText);
        }}
        foundFiles={foundFiles.map((f) => f.path)}
      />

      {/* Generate Prompt */}
      <button
        className="bg-primary text-primary-foreground p-2 rounded disabled:opacity-50"
        onClick={handleGenerate}
        disabled={isLoading}
      >
        {isLoading ? loadingStatus : "Generate Prompt"}
      </button>

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
            <button
              className="bg-secondary text-secondary-foreground p-2 rounded"
              onClick={handleCopy}
            >
              {copySuccess ? "Copied!" : "Copy to Clipboard"}
            </button>
            {copySuccess && (
              <span className="text-green-500 dark:text-green-400 text-sm">
                ✓ Copied to clipboard
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 