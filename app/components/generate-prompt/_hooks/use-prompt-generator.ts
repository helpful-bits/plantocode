"use client";

import { useState, useCallback, useEffect } from "react";
import { readDirectoryAction, readExternalFileAction } from "@/actions/read-directory-actions";
import { enhanceTaskDescriptionAction, generateTaskPromptTemplateAction } from "@/actions/task-enhancement-actions";
import { estimateTokens } from "@/lib/token-estimator";
import { normalizePath } from "@/lib/path-utils";
import { FilesMap, FileInfo } from "./file-management/use-project-file-list";

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
  projectDirectory}: UsePromptGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
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
      // TODO: Implement on-demand content loading - readDirectoryAction now returns just file paths, not content
      // This will need to be updated to fetch content only for the files that are going to be used
      let currentFileContents: { [key: string]: string } = {};
      
      if (!projectDirectory) {
        setError("No project directory specified");
        setIsGenerating(false);
        return;
      }

      // Current implementation - we're temporarily going to need another server action to load file contents
      // Note: When updating this code, add a content loading action that can load content for specific files on demand
      const freshResult = await readDirectoryAction(projectDirectory); 
      if (freshResult.isSuccess && freshResult.data) {
        // This will be an empty object or contain old file contents
        // TODO: Add implementation to load contents for all selected files
        currentFileContents = fileContentsMap; // Use the existing content map for now
      } else {
        setError("Failed to get file list: " + freshResult.message);
        setIsGenerating(false);
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0; 
      const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {}).some((f: FileInfo) => f.included && !f.forceExcluded);

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
          .filter((f: FileInfo) => f.included && !f.forceExcluded)
          .map((f: FileInfo) => f.path));

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

      // Get the complete prompt template with formatted file contents
      const templateResult = await generateTaskPromptTemplateAction({
        originalDescription: taskDescription,
        relevantFiles: filesToUse,
        fileContents: currentFileContents,
        projectDirectory
      });
      
      if (!templateResult.isSuccess || !templateResult.data) {
        setError(`Failed to generate template instructions: ${templateResult.message}`);
        setIsGenerating(false);
        return;
      }
      
      // Set the prompt directly from the template result
      setPrompt(templateResult.data);
      
      // Estimate tokens
      const tokenEstimate = await estimateTokens(templateResult.data);
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
    allFilesMap,
    fileContentsMap
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

  // Generate and copy architectural prompt function removed

  // Return values and functions
  return {
    prompt,
    tokenCount,
    isGenerating,
    copySuccess,
    error,
    externalPathWarnings,
    generatePrompt,
    copyPrompt,
    setError,
    setExternalPathWarnings
  };
} 