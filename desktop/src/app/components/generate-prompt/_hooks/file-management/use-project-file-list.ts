"use client";

import { useState, useCallback, useEffect } from "react";

import { readDirectoryAction } from "@/actions";
import { useBackgroundJobs } from "@/contexts/background-jobs";
import { useNotification } from "@/contexts/notification-context";
import {
  normalizePath,
  normalizePathForComparison,
} from "@/utils/path-utils";

// Types
export type FileInfo = {
  path: string; // Project-relative path
  size?: number;
  included: boolean;
  forceExcluded: boolean;
  comparablePath: string; // Normalized project-relative path for consistent comparison
};

export type FilesMap = { [path: string]: FileInfo };

export function useProjectFileList(
  projectDirectory: string | null,
  sessionId: string | null
) {
  // State
  const [rawFilesMap, setRawFilesMap] = useState<FilesMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const { showNotification: _showNotification } = useNotification();
  const { jobs } = useBackgroundJobs();

  // Watch for job completion if we have an active job
  useEffect(() => {
    if (!jobId) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    // When job is completed, process the results
    if (job.status === "completed") {
      // Create an async function to process the result
      const processJobResult = async () => {
        try {
          // The job result will be in the job.response field
          if (job.response) {
            const result = JSON.parse(job.response) as { directory?: string; files: string[]; count?: number };
            
            if (result && result.files && Array.isArray(result.files)) {
              // Process file paths
              const filesMap: FilesMap = {};

              for (const projectRelativePath of result.files) {
                try {
                  
                  if (!projectRelativePath) continue;

                  // Normalize the project-relative path.
                  // The normalizePath command can handle relative paths and clean them up (e.g. slashes, dots).
                  const normalizedProjectRelativePath = await normalizePath(projectRelativePath);

                  // If normalizedProjectRelativePath is empty or null after normalization, skip.
                  if (!normalizedProjectRelativePath) continue;

                  // No automatic inclusion
                  const include = false;

                  // The comparablePath should be derived from the already relative path.
                  const comparablePath = await normalizePathForComparison(normalizedProjectRelativePath);

                  // Add to file map
                  filesMap[normalizedProjectRelativePath] = {
                    path: normalizedProjectRelativePath,
                    size: undefined, // Size not returned from job
                    included: include,
                    forceExcluded: false,
                    comparablePath,
                  };
                } catch (_err) {
                  // Error already handled
                }
              }

              // Update state
              setRawFilesMap(filesMap);
              setIsInitialized(true);
              setIsLoading(false);
              setError(null);
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Error processing job result: ${errorMessage}`);
          setIsLoading(false);
        }

        // Clear job ID after processing
        setJobId(null);
      };

      // Execute the async function
      void processJobResult();
    }
    // Handle failed jobs
    else if (job.status === "failed" || job.status === "canceled") {
      setError(`Reading directory failed: ${job.statusMessage || job.status}`);
      setIsLoading(false);
      setJobId(null);
    }
  }, [jobs, jobId, projectDirectory]);

  // Refresh files list method - creates a background job
  const refreshFiles = useCallback(async (): Promise<boolean> => {
    if (!projectDirectory) {
      return false;
    }

    if (!sessionId) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Start a background job to read the directory
      const result = await readDirectoryAction(sessionId, projectDirectory);

      if (!result.isSuccess) {
        setError(result.message || "Failed to start directory reading");
        setIsLoading(false);
        return false;
      }

      // Store the job ID to track its progress
      if (result.metadata && "jobId" in result.metadata) {
        const jobId = result.metadata.jobId as string;
        setJobId(jobId);
        return true;
      } else {
        setError("No job ID returned from read directory action");
        setIsLoading(false);
        return false;
      }
    } catch (readError) {
      const errorMessage = readError instanceof Error
        ? readError.message
        : "Unknown error reading directory";
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, [projectDirectory, sessionId]);

  // Reset state when project directory changes (auto-loading removed to prevent recursive scanning)
  useEffect(() => {
    // Reset state when project directory changes
    setRawFilesMap({});
    setError(null);
    setIsInitialized(false);
    setJobId(null);
  }, [projectDirectory, sessionId]);

  return {
    rawFilesMap,
    isLoading,
    isInitialized,
    error,
    refreshFiles,
    jobId,
  };
}
