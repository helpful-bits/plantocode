"use client";

import { useState, useCallback, useEffect } from "react";
import { readDirectoryAction, readExternalFileAction } from "@/actions/read-directory-actions";
import { enhanceTaskDescriptionAction, generateTaskPromptTemplateAction } from "@/actions/task-enhancement-actions";
import { estimateTokens } from "@/lib/token-estimator";
import { getDiffPrompt } from "@/prompts/diff-prompt";
import { normalizePath } from "@/lib/path-utils";
import { FilesMap } from "./use-generate-prompt-state";

interface UsePromptGeneratorProps {
  taskDescription: string;
  allFilesMap: FilesMap;
  fileContentsMap: Record<string, string>;
  pastedPaths: string;
  projectDirectory: string;
  diffTemperature: number;
}

export function usePromptGenerator({
  taskDescription,
  allFilesMap,
  fileContentsMap,
  pastedPaths,
  projectDirectory,
  diffTemperature
}: UsePromptGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [architecturalPrompt, setArchitecturalPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [error, setError] = useState("");
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);

  // Estimate tokens whenever prompt changes
  useEffect(() => {
    const updateTokenCount = async () => {
      if (prompt) {
        const count = await estimateTokens(prompt);
        setTokenCount(count);
      } else {
        setTokenCount(0);
      }
    };
    
    updateTokenCount();
  }, [prompt]);

  // Generate prompt
  const generatePrompt = useCallback(async () => {
    setIsGenerating(true);
    setError(""); 
    setPrompt(""); 
    setExternalPathWarnings([]);

    try {
      // Refresh file contents from the file system for project files
      let currentFileContents: { [key: string]: string } = {};
      
      if (!projectDirectory) {
        setError("No project directory specified");
        setIsGenerating(false);
        return;
      }

      const freshResult = await readDirectoryAction(projectDirectory);
      if (freshResult.isSuccess && freshResult.data) {
        currentFileContents = { ...freshResult.data };
      } else {
        setError("Failed to read current file contents: " + freshResult.message);
        setIsGenerating(false);
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0; 
      const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {}).some((f) => f.included && !f.forceExcluded);

      // Determine which files to use
      let filesToUse: string[] = [];
      const warnings: string[] = [];

      if (hasPastedPaths) {
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

        const projectFilePaths = new Set(Object.keys(currentFileContents || {}));

        for (const filePath of rawPastedPaths) {
          // Try to normalize the path if it's not an absolute path
          const normalizedPath = normalizePath(filePath, projectDirectory);
          
          // Check if the path exists in our normalized map
          if (normalizedFileContentsMap[normalizedPath]) {
            // Use the original path from the map
            const originalPath = normalizedFileContentsMap[normalizedPath];
            filesToUse.push(originalPath);
          }
          else if (projectFilePaths.has(filePath)) {
            // Original path lookup
            if (currentFileContents[filePath] !== undefined) {
              filesToUse.push(filePath);
            } else {
              warnings.push(`Could not find content for project path "${filePath}".`);
              console.warn(`Content missing for project path: ${filePath}`);
            }
          } else {
            // Path is potentially external
            const externalFileResult = await readExternalFileAction(filePath);

            // Process the external file result
            if (externalFileResult.isSuccess && externalFileResult.data) {
              // Merge external content into our temporary map
              const processedData = Object.entries(externalFileResult.data).reduce((acc, [key, value]) => {
                acc[key] = typeof value === 'string' ? value : value.toString('utf-8');
                return acc;
              }, {} as Record<string, string>);
              
              currentFileContents = { ...currentFileContents, ...processedData };
              // Add the path
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
          setIsGenerating(false);
          if (warnings.length > 0) setExternalPathWarnings(warnings);
          return;
        }
      } else if (isAnyFileIncludedFromBrowser) {
        // No pasted paths, use files selected in the browser from the state
        const selectedPaths = new Set(Object.values(allFilesMap)
          .filter(f => f.included && !f.forceExcluded)
          .map(f => f.path));

        // Create a map of normalized paths to original paths for better matching
        const normalizedToOriginal: Record<string, string> = {};
        Object.keys(currentFileContents).forEach(originalPath => {
          const normalizedPath = normalizePath(originalPath, projectDirectory);
          normalizedToOriginal[normalizedPath] = originalPath;
        });
        
        filesToUse = Object.keys(currentFileContents)
          .filter(path => selectedPaths.has(path) && currentFileContents[path] !== undefined);
        
        console.log("Files to use:", filesToUse);
      } else {
        // Neither pasted paths nor browser selection
        setError("Please include at least one file using the file browser or paste file paths.");
        setIsGenerating(false);
        return;
      }

      if (warnings.length > 0) {
        setExternalPathWarnings(warnings);
      }

      // Generate file contents markup
      const fileContentMarkup = Object.entries(currentFileContents)
        .filter(([filePath]) => filesToUse.includes(filePath))
        .map(([path, content]) => `<file>
<file_path>${path}</file_path>
<file_content>
${content}
</file_content>
</file>`)
        .join("\n\n");

      const instructions = await getDiffPrompt();

      const fullPrompt = `${instructions}

<project_files>
${fileContentMarkup}
</project_files>

<task>
${taskDescription}
</task>`;

      setPrompt(fullPrompt);
      
      // Estimate tokens
      const tokenEstimate = await estimateTokens(fullPrompt);
      setTokenCount(tokenEstimate);
    } catch (error) {
      setError("Failed to generate prompt");
      console.error("Error during prompt generation:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [
    projectDirectory,
    taskDescription,
    pastedPaths,
    allFilesMap
  ]);

  // Copy prompt to clipboard
  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopySuccess(true);
    } catch {
      setError("Failed to copy to clipboard");
    }
  }, [prompt]);

  // Generate and copy architectural prompt
  const copyArchPrompt = useCallback(async () => {
    // Get file paths from either pasted paths or selected files in browser
    let relevantFiles: string[] = [];
    
    if (pastedPaths.trim()) {
      // If pasted paths exist, use those (override browser selections)
      relevantFiles = pastedPaths.split('\n')
        .map(path => path.trim())
        .filter(p => !!p && !p.startsWith('#'));
    } else {
      // Otherwise, use files selected in the browser
      const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {})
        .some((f) => f.included && !f.forceExcluded);
        
      if (isAnyFileIncludedFromBrowser) {
        relevantFiles = Object.values(allFilesMap)
          .filter(f => f.included && !f.forceExcluded)
          .map(f => f.path);
      }
    }
    
    // Check if we have a task description and files
    if (!taskDescription.trim() || relevantFiles.length === 0) {
      const errorMsg = !taskDescription.trim() 
        ? "Please enter a task description."
        : "Please select files in the browser or paste file paths.";
      setError(errorMsg);
      return;
    }
    
    setIsGeneratingGuidance(true);
    
    try {
      const enhancedTaskResult = await enhanceTaskDescriptionAction({
        originalDescription: taskDescription,
        relevantFiles,
        fileContents: fileContentsMap,
        projectDirectory
      });
      
      if (enhancedTaskResult.isSuccess && enhancedTaskResult.data) {
        const enhancedPrompt = enhancedTaskResult.data;
        setArchitecturalPrompt(enhancedPrompt);
        
        // Copy the enhanced prompt to clipboard
        await navigator.clipboard.writeText(enhancedPrompt);
        
        // Set copy success state if clipboardFeedback property exists or by default
        setTaskCopySuccess(true);
        
        // Reset after a short delay
        setTimeout(() => {
          setTaskCopySuccess(false);
        }, 3000);
      } else {
        setError(`Failed to generate architectural guidance: ${enhancedTaskResult.message}`);
      }
    } catch (error) {
      console.error("Error generating architectural guidance:", error);
      setError("Failed to generate architectural guidance");
    } finally {
      setIsGeneratingGuidance(false);
    }
  }, [taskDescription, pastedPaths, allFilesMap, fileContentsMap, projectDirectory]);

  // Copy prompt template
  const copyTemplatePrompt = useCallback(async () => {
    setIsCopyingPrompt(true);
    
    try {
      // Get file paths from either pasted paths or selected files in browser
      let relevantFiles: string[] = [];
      
      if (pastedPaths.trim()) {
        // If pasted paths exist, use those (override browser selections)
        relevantFiles = pastedPaths.split('\n')
          .map(path => path.trim())
          .filter(p => !!p && !p.startsWith('#'));
      } else {
        // Otherwise, use files selected in the browser
        const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {})
          .some((f) => f.included && !f.forceExcluded);
          
        if (isAnyFileIncludedFromBrowser) {
          relevantFiles = Object.values(allFilesMap)
            .filter(f => f.included && !f.forceExcluded)
            .map(f => f.path);
        }
      }
      
      // Ensure we have files to work with
      if (relevantFiles.length === 0) {
        setError("Please select files in the browser or paste file paths.");
        setIsCopyingPrompt(false);
        return;
      }
      
      const templateResult = await generateTaskPromptTemplateAction({
        originalDescription: taskDescription,
        relevantFiles,
        fileContents: fileContentsMap,
        projectDirectory
      });
      
      if (templateResult.isSuccess && templateResult.data) {
        await navigator.clipboard.writeText(templateResult.data);
        
        // Set copy success state if clipboardFeedback property exists or by default
        setTaskCopySuccess(true);
        
        // Reset after a short delay
        setTimeout(() => {
          setTaskCopySuccess(false);
        }, 3000);
      } else {
        setError(`Failed to copy prompt template: ${templateResult.message}`);
      }
    } catch (error) {
      console.error("Error copying prompt template:", error);
      setError("Failed to copy prompt template");
    } finally {
      setIsCopyingPrompt(false);
    }
  }, [taskDescription, pastedPaths, allFilesMap, fileContentsMap, projectDirectory]);

  return {
    prompt,
    tokenCount,
    architecturalPrompt,
    isGenerating,
    copySuccess,
    taskCopySuccess,
    error,
    externalPathWarnings,
    generatePrompt,
    copyPrompt,
    copyArchPrompt,
    copyTemplatePrompt,
    setError
  };
} 