"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback } from "react";

import { type ActionState } from "@/types";
import {
  handleActionError,
  createSuccessActionState,
  traceActionResult,
} from "@/utils/action-utils";

// Removed unused type definition

/**
 * Options for useTauriCommand hook
 */
interface UseTauriCommandOptions<T> {
  /** The name of the Tauri command to invoke */
  command: string;

  /** Optional trace name for debugging (defaults to command name) */
  traceName?: string;

  /** Optional parameters transformer (prepare params before sending to backend) */
  transformParams?: (params: unknown) => Record<string, unknown>;

  /** Optional result transformer (process result after receiving from backend) */
  transformResult?: (result: unknown) => T;

  /** Optional success message */
  successMessage?: string;

  /** Called on successful completion */
  onSuccess?: (data: T) => void;

  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Hook for invoking Tauri commands with standardized error handling and state management
 */
export function useTauriCommand<T = unknown>(options: UseTauriCommandOptions<T>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const traceName = options.traceName || options.command;

  const execute = useCallback(
    async (params?: Record<string, unknown>): Promise<ActionState<T>> => {
      setIsLoading(true);
      setError(null);

      try {
        // Transform params if needed
        const finalParams = options.transformParams
          ? options.transformParams(params)
          : params;

        // Invoke the command
        // Explicitly handle null/undefined params to avoid Tauri errors
        const result = finalParams
          ? await invoke<unknown>(options.command, finalParams)
          : await invoke<unknown>(options.command);

        // Transform result if needed
        const transformedResult = options.transformResult
          ? options.transformResult(result)
          : (result as T);

        // Update state
        setData(transformedResult);

        // Call onSuccess callback if provided
        if (options.onSuccess) {
          options.onSuccess(transformedResult);
        }

        // Create and return success action state
        const actionState = createSuccessActionState<T>(
          transformedResult,
          options.successMessage
        );

        return traceActionResult(actionState, traceName);
      } catch (err) {
        const actionState = handleActionError(err, traceName);

        // Update state
        setError(actionState.error ?? null);

        // Call onError callback if provided
        if (options.onError && actionState.error) {
          options.onError(actionState.error);
        }

        return actionState as ActionState<T>;
      } finally {
        setIsLoading(false);
      }
    },
    [options, traceName] // Options contains all the needed properties
  );

  return {
    execute,
    isLoading,
    error,
    data,
    reset: useCallback(() => {
      setData(null);
      setError(null);
    }, []),
  };
}

/**
 * Expected job response structure from Tauri commands
 */
interface JobCommandResult {
  jobId?: string;
  job_id?: string;
  id?: string;
  metadata?: {
    jobId?: string;
  };
  status?: string;
  job_status?: string;
}

/**
 * Type guard to check if a result has job information
 */
function hasJobInfo(result: unknown): result is JobCommandResult {
  if (!result || typeof result !== "object") return false;

  const obj = result as Record<string, unknown>;
  return !!(
    "jobId" in obj ||
    "job_id" in obj ||
    "id" in obj ||
    (obj.metadata &&
      typeof obj.metadata === "object" &&
      "jobId" in (obj.metadata))
  );
}

/**
 * Hook for background job-creating Tauri commands with standardized job status monitoring
 */
export function useTauriJobCommand<T = unknown>(
  options: UseTauriCommandOptions<T> & {
    /** If true, will monitor the background job and track its state */
    monitorJob?: boolean;
    /** Hook into job completion */
    onJobComplete?: (jobData: unknown) => void;
  }
) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // Create a modified onSuccess that captures the job ID
  const enhancedOptions = {
    ...options,
    onSuccess: (result: unknown) => {
      if (hasJobInfo(result)) {
        // Extract job ID from various possible shapes
        const extractedJobId =
          result.jobId ||
          result.job_id ||
          result.metadata?.jobId ||
          (typeof result === "object" && "id" in result ? result.id : null);

        // Extract job status if available
        const extractedStatus = result.status || result.job_status || null;

        if (extractedJobId) {
          setJobId(extractedJobId);
        }

        if (extractedStatus) {
          setJobStatus(extractedStatus);
        }
      }

      // Call the original onSuccess if it exists
      if (options.onSuccess) {
        options.onSuccess(result as T);
      }
    },
  };

  // Use the base hook
  const commandResult = useTauriCommand<T>(enhancedOptions);

  // Return the enhanced result
  return {
    ...commandResult,
    jobId,
    jobStatus,
    resetJob: useCallback(() => {
      setJobId(null);
      setJobStatus(null);
    }, []),
  };
}
