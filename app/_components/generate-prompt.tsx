"use client";

import { readDirectoryAction } from "@/actions/read-directory-actions";
import { useEffect, useState } from "react";

const PROJECT_DIR_KEY = 'o1-xml-parser-project-dir';
const TASK_DESC_KEY = 'o1-xml-parser-task-desc';
const SEARCH_TERM_KEY = 'o1-xml-parser-search';
const INCLUDED_FILES_KEY = 'o1-xml-parser-included-files';
const PASTED_PATHS_KEY = 'o1-xml-parser-pasted-paths';

interface FilePreview {
  path: string;
  size: number;
  included: boolean;
}

export function GeneratePrompt() {
  const [projectDirectory, setProjectDirectory] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [foundFiles, setFoundFiles] = useState<FilePreview[]>([]);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [taskDescription, setTaskDescription] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [pastedPaths, setPastedPaths] = useState<string>("");
  const [pastedPathsFound, setPastedPathsFound] = useState<number>(0);

  // Load all saved state on mount
  useEffect(() => {
    const savedDir = localStorage.getItem(PROJECT_DIR_KEY);
    const savedTask = localStorage.getItem(TASK_DESC_KEY);
    const savedSearch = localStorage.getItem(SEARCH_TERM_KEY);
    const savedPaths = localStorage.getItem(PASTED_PATHS_KEY);

    if (savedDir) setProjectDirectory(savedDir);
    if (savedTask) setTaskDescription(savedTask);
    if (savedSearch) setSearchTerm(savedSearch);
    if (savedPaths) setPastedPaths(savedPaths);
    
    // If we have a saved directory, load the files
    if (savedDir) {
      handleLoadFiles(savedDir);
    }
  }, []);

  // Clear copy success message after delay
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Remove directory loading from handleDirectoryChange
  const handleDirectoryChange = (value: string) => {
    setProjectDirectory(value);
    localStorage.setItem(PROJECT_DIR_KEY, value);
    setPrompt("");
  };

  // Save task description when it changes
  const handleTaskChange = (value: string) => {
    setTaskDescription(value);
    localStorage.setItem(TASK_DESC_KEY, value);
  };

  // Save search term when it changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem(SEARCH_TERM_KEY, value);
  };

  // Add a function to count found paths
  const countFoundPaths = (paths: string[], availableFiles: string[]) => {
    return paths.filter(p => availableFiles.includes(p)).length;
  };

  // Add a function to parse and filter paths consistently
  const parseAndFilterPaths = (value: string) => {
    return value
      .split('\n')
      .map(line => {
        // Handle "path # comment" format
        if (line.includes('#')) {
          // Split only on the first # to handle paths that might contain #
          const [path, ...rest] = line.split('#');
          // If after # there's more content on the same line, it's a comment
          if (rest.length > 0) {
            return path.trim();
          }
        }
        return line.trim();
      })
      .filter(path => {
        // Skip empty lines, pure comments, and section headers
        if (!path || path.startsWith('#')) return false;
        
        // Skip markdown-style headers
        if (path.match(/^#+\s/)) return false;
        
        // Skip lines that are only part of a comment (no path)
        if (path.match(/^module\s|^models$/)) return false;
        
        return true;
      });
  };

  // Modify handleLoadFiles to use the helper function
  const handleLoadFiles = async (directory?: string) => {
    const dirToUse = directory || projectDirectory;
    if (!dirToUse.trim()) {
      setError("Please enter a project directory");
      return;
    }

    setError("");
    setIsLoadingFiles(true);
    setLoadingStatus("Reading directory...");
    setFoundFiles([]);
    
    try {
      const result = await readDirectoryAction(dirToUse.trim());
      
      if (!result.isSuccess) {
        setError(result.message);
        return;
      }

      // Get saved included files
      const savedIncludedFiles = JSON.parse(
        localStorage.getItem(INCLUDED_FILES_KEY) || '[]'
      ) as string[];

      const files = Object.entries(result.data).map(([path, content]) => ({
        path,
        size: new Blob([content]).size,
        included: savedIncludedFiles.includes(path)
      }));
      setFoundFiles(files);

      // Update pastedPathsFound if there are pasted paths
      if (pastedPaths.trim()) {
        const paths = parseAndFilterPaths(pastedPaths);
        const availableFiles = files.map(f => f.path);
        setPastedPathsFound(countFoundPaths(paths, availableFiles));
      }

    } catch (error) {
      setError("Failed to read directory");
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopySuccess(true);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };

  // Update included files storage when toggling
  const handleToggleFile = (path: string) => {
    setFoundFiles(files => {
      const newFiles = files.map(file => 
        file.path === path 
          ? { ...file, included: !file.included }
          : file
      );
      
      // Save included files to localStorage
      const includedPaths = newFiles
        .filter(f => f.included)
        .map(f => f.path);
      localStorage.setItem(INCLUDED_FILES_KEY, JSON.stringify(includedPaths));
      
      return newFiles;
    });
  };

  // Simplify handlePastedPathsChange
  const handlePastedPathsChange = (value: string) => {
    setPastedPaths(value);
    localStorage.setItem(PASTED_PATHS_KEY, value);

    if (foundFiles.length > 0) {
      const paths = parseAndFilterPaths(value);
      const availableFiles = foundFiles.map(f => f.path);
      setPastedPathsFound(countFoundPaths(paths, availableFiles));
    } else {
      setPastedPathsFound(0);
    }
  };

  // Simplify handleGenerate path processing
  const handleGenerate = async () => {
    setError("");
    if (!taskDescription.trim()) {
      setError("Please provide a task description");
      return;
    }

    // Check if we have either pasted paths or included files
    if (!pastedPaths.trim() && !foundFiles.some(f => f.included)) {
      setError("Please include at least one file or paste file paths");
      return;
    }

    setIsLoading(true);
    setLoadingStatus("Generating prompt...");
    
    try {
      const result = await readDirectoryAction(projectDirectory);
      
      if (!result.isSuccess) {
        setError(result.message);
        return;
      }

      // Use pasted paths if available, otherwise use included files
      const paths = pastedPaths.trim() 
        ? parseAndFilterPaths(pastedPaths)
        : foundFiles.filter(f => f.included).map(f => f.path);

      // Save the filtered paths back to localStorage if using pasted paths
      if (pastedPaths.trim()) {
        localStorage.setItem(PASTED_PATHS_KEY, paths.join('\n'));
        setPastedPaths(paths.join('\n'));
        setPastedPathsFound(countFoundPaths(paths, Object.keys(result.data)));
      }

      const filesList = Object.entries(result.data)
        .filter(([path]) => paths.includes(path))
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
- For new files, use "NEW FILE:" header and include the complete file contents with + at the start of each line
- Put any file deletions or renamings in a cleanup.sh script

Please respond with your changes in a markdown code block like this:

\`\`\`txt
file: path/to/file.ts
... existing code ...
- old line
+ new line
... existing code ...

NEW FILE: path/to/new/file.ts
+ import { something } from '@/lib/something';
+ 
+ export function NewComponent() {
+   return <div>New component</div>;
+ }

cleanup.sh
#!/bin/bash
rm path/to/old/file.ts
mv path/to/original/file.ts path/to/new/location/file.ts
\`\`\`

Please carefully review these existing project files to understand the current implementation and context:

${filesList}

Task Description:
${taskDescription}`;

      setPrompt(fullPrompt);
    } catch (error) {
      setError("Failed to generate prompt");
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredFiles = foundFiles.filter(file => 
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBulkToggle = (include: boolean) => {
    const filesToToggle = selectedFiles.size > 0 
      ? foundFiles.filter(f => selectedFiles.has(f.path))
      : filteredFiles;

    setFoundFiles(files => 
      files.map(file => 
        filesToToggle.some(f => f.path === file.path)
          ? { ...file, included: include }
          : file
      )
    );
    setSelectedFiles(new Set());
  };

  return (
    <div className="max-w-xl w-full mx-auto p-4 flex flex-col gap-4">
      {error && <div className="text-destructive">{error}</div>}

      <div className="flex flex-col gap-2">
        <label className="mb-2 font-bold text-foreground">Project Directory:</label>
        <div className="flex gap-2">
          <input
            className="border rounded bg-background text-foreground p-2 flex-1"
            type="text"
            value={projectDirectory}
            onChange={(e) => handleDirectoryChange(e.target.value)}
            placeholder="e.g. /Users/myusername/projects/o1-xml-parser"
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

      {foundFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="font-bold text-foreground">
            Found Files ({foundFiles.filter(f => f.included).length}/{foundFiles.length}):
          </label>

          <div className="flex gap-2 items-center">
            <input
              type="text"
              className="border rounded bg-background text-foreground p-2 flex-1"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <button
              className="bg-secondary text-secondary-foreground p-2 rounded text-sm"
              onClick={() => handleBulkToggle(false)}
              disabled={filteredFiles.length === 0}
            >
              Exclude {selectedFiles.size > 0 ? 'Selected' : 'Filtered'}
            </button>
            <button
              className="bg-secondary text-secondary-foreground p-2 rounded text-sm"
              onClick={() => handleBulkToggle(true)}
              disabled={filteredFiles.length === 0}
            >
              Include {selectedFiles.size > 0 ? 'Selected' : 'Filtered'}
            </button>
          </div>

          <div className="border rounded bg-background p-2 max-h-48 overflow-y-auto">
            {filteredFiles.map((file, i) => (
              <div 
                key={i} 
                className={`flex items-center justify-between text-sm py-1 ${
                  selectedFiles.has(file.path) ? 'bg-accent' : ''
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.path)}
                    onChange={(e) => {
                      setSelectedFiles(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) {
                          next.add(file.path);
                        } else {
                          next.delete(file.path);
                        }
                        return next;
                      });
                    }}
                    className="cursor-pointer"
                  />
                  <input
                    type="checkbox"
                    checked={file.included}
                    onChange={() => handleToggleFile(file.path)}
                    className="cursor-pointer"
                  />
                  <span className="font-mono">{file.path}</span>
                </label>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
              </div>
            ))}
            {filteredFiles.length === 0 && searchTerm && (
              <div className="text-muted-foreground text-center py-2">
                No files match your search
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="font-bold text-foreground">
            Or Paste File Paths (one per line):
            <span className="text-sm font-normal text-muted-foreground ml-2">
              Overrides file selection when not empty
            </span>
          </label>
          {pastedPaths.trim() && (
            <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
              {pastedPathsFound} files found
            </span>
          )}
        </div>
        <textarea
          className="border rounded bg-background text-foreground p-2 h-32 font-mono text-sm"
          value={pastedPaths}
          onChange={(e) => handlePastedPathsChange(e.target.value)}
          placeholder="path/to/file1.ts&#10;path/to/file2.ts&#10;path/to/file3.ts"
        />
      </div>

      <div className="flex flex-col">
        <label className="mb-2 font-bold text-foreground">Task Description:</label>
        <textarea
          className="border rounded bg-background text-foreground p-2 h-32 w-full"
          value={taskDescription}
          onChange={(e) => handleTaskChange(e.target.value)}
          placeholder="Describe what changes you want to make..."
        />
      </div>

      <button
        className="bg-primary text-primary-foreground p-2 rounded disabled:opacity-50"
        onClick={handleGenerate}
        disabled={isLoading}
      >
        {isLoading ? loadingStatus : "Generate Prompt"}
      </button>

      {prompt && (
        <div className="flex flex-col gap-2">
          <label className="font-bold text-foreground">Generated Prompt:</label>
          <textarea
            className="border rounded bg-background text-foreground p-2 h-96 w-full font-mono text-sm"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
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