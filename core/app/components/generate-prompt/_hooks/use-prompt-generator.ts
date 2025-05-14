"use client";

import { useState, useCallback, useEffect } from "react";
import { readDirectoryAction, readExternalFileAction } from "@core/actions/read-directory-actions";
import { enhanceTaskDescriptionAction, generateTaskPromptTemplateAction } from "@core/actions/task-enhancement-actions";
import { estimateTokens } from "@core/lib/token-estimator";
import { normalizePath, makePathRelative } from "@core/lib/path-utils";
import { FilesMap, FileInfo } from "./file-management/use-project-file-list";

interface UsePromptGeneratorProps {
  taskDescription: string;
  allFilesMap: FilesMap;
  fileContentsMap: Record<string, string>;
  pastedPaths: string;
  projectDirectory: string;
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

      // Use the fileContentsMap provided by props
      // This contains all the loaded file contents from FileManagementContext
      if (Object.keys(fileContentsMap).length > 0) {
        currentFileContents = fileContentsMap;
      } else {
        setError("No file contents available. Please ensure files are loaded in the browser.");
        setIsGenerating(false);
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0; 
      const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {}).some((f: FileInfo) => f.included && !f.forceExcluded);

      // Determine which files to use
      let filesToUse: string[] = [];
      const warnings: string[] = [];

      if (hasPastedPaths) {
        console.log("[PromptGenerator] Using pasted paths for file selection");
        // Create a normalized map for better file path matching
        const normalizedFileContentsMap = Object.keys(currentFileContents).reduce((acc, key) => {
          const normalizedKey = makePathRelative(key, projectDirectory);
          acc[normalizedKey] = key; // Store the original key
          return acc as Record<string, string>;
        }, {} as Record<string, string>);
        
        const rawPastedPaths = pastedPaths
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => !!p && !p.startsWith("#"));

        console.log(`[PromptGenerator] Processing ${rawPastedPaths.length} pasted paths`);
        const projectFilePaths = new Set(Object.keys(currentFileContents || {}));

        for (const filePath of rawPastedPaths) {
          // Try to normalize the path if it's not an absolute path
          const normalizedPath = makePathRelative(filePath, projectDirectory);
          
          // Check if the path exists in our normalized map
          if (normalizedFileContentsMap[normalizedPath]) {
            // Use the original path from the map
            const originalPath = normalizedFileContentsMap[normalizedPath];
            filesToUse.push(originalPath);
            console.log(`[PromptGenerator] Found match for normalized path: ${normalizedPath} -> ${originalPath}`);
          }
          else if (projectFilePaths.has(filePath)) {
            // Original path lookup
            if (currentFileContents[filePath] !== undefined) {
              filesToUse.push(filePath);
              console.log(`[PromptGenerator] Found match for direct path: ${filePath}`);
            } else {
              warnings.push(`Could not find content for project path "${filePath}".`);
              console.warn(`Content missing for project path: ${filePath}`);
            }
          } else {
            // Path is potentially external
            console.log(`[PromptGenerator] Attempting to read external path: ${filePath}`);
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
              console.log(`[PromptGenerator] Successfully read external path: ${filePath} -> ${addedPath}`);
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
        console.log("[PromptGenerator] No pasted paths, using browser-selected files");
        // No pasted paths, use files selected in the browser from the state
        const selectedPaths = new Set(Object.values(allFilesMap)
          .filter((f: FileInfo) => f.included && !f.forceExcluded)
          .map((f: FileInfo) => f.path));
        
        console.log(`[PromptGenerator] Found ${selectedPaths.size} selected paths in browser`);
        
        // Create a map of normalized paths to original paths for better matching
        const normalizedToOriginal: Record<string, string> = {};
        Object.keys(currentFileContents).forEach(originalPath => {
          const normalizedPath = makePathRelative(originalPath, projectDirectory);
          normalizedToOriginal[normalizedPath] = originalPath;
        });
        
        filesToUse = Object.keys(currentFileContents)
          .filter(path => selectedPaths.has(path) && currentFileContents[path] !== undefined);
        
        console.log(`[PromptGenerator] After filtering, using ${filesToUse.length} files from browser selection`);
        if (filesToUse.length > 0) {
          console.log(`[PromptGenerator] Sample files: ${filesToUse.slice(0, 3).join(', ')}${filesToUse.length > 3 ? '...' : ''}`);
        } else {
          console.warn("[PromptGenerator] No valid files found from browser selection");
        }
      } else {
        // Neither pasted paths nor browser selection
        console.warn("[PromptGenerator] No files selected - neither pasted paths nor browser selection found");
        console.log(`[PromptGenerator] pastedPaths length: ${pastedPaths.length}, hasPastedPaths: ${hasPastedPaths}`);
        console.log(`[PromptGenerator] browser selection: isAnyFileIncludedFromBrowser: ${isAnyFileIncludedFromBrowser}`);
        console.log(`[PromptGenerator] allFilesMap has ${Object.keys(allFilesMap || {}).length} entries`);
        
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