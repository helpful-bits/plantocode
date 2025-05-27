import { Loader2 } from "lucide-react";
import { type BackgroundJob, JOB_STATUSES, type JobStatus } from "@/types/session-types";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ui/dialog";
import { formatJobDuration } from "@/utils/date-utils";


// Import component sections
import { JobDetailsAdditionalInfoSection } from "./_components/job-details/JobDetailsAdditionalInfoSection";
import { JobDetailsErrorSection } from "./_components/job-details/JobDetailsErrorSection";
import { JobDetailsMetadataSection } from "./_components/job-details/JobDetailsMetadataSection";
import { JobDetailsModelConfigSection } from "./_components/job-details/JobDetailsModelConfigSection";
import { JobDetailsPromptSection } from "./_components/job-details/JobDetailsPromptSection";
import { JobDetailsResponseSection } from "./_components/job-details/JobDetailsResponseSection";
import { JobDetailsStatusSection } from "./_components/job-details/JobDetailsStatusSection";
import { JobDetailsTimingSection } from "./_components/job-details/JobDetailsTimingSection";
import { JobDetailsTokenUsageSection } from "./_components/job-details/JobDetailsTokenUsageSection";
import { getParsedMetadata } from "./utils";

interface JobDetailsModalProps {
  job: BackgroundJob | null;
  onClose: () => void;
}

export function JobDetailsModal({ job, onClose }: JobDetailsModalProps) {
  // File-based content loading has been removed
  // All job output content is now stored directly in the job.response field

  // Format JSON data for display
  const formatMetadata = (metadata: string | Record<string, unknown> | null | undefined) => {
    try {
      if (!metadata) return "None";

      // Parse metadata string if needed
      const parsedMetadata = getParsedMetadata(metadata);
      if (!parsedMetadata) {
        return typeof metadata === "string" ? metadata : "Invalid metadata";
      }

      // Filter out keys that are already shown in the UI
      // or don't provide useful information
      const filteredMetadata = { ...parsedMetadata };
      const keysToRemove = [
        "modelUsed",
        "maxOutputTokens",
        "temperature",
        "tokensSent",
        "tokensReceived",
        "tokensTotal",
        "lastUpdateTime", // This is redundant with the updatedAt field
        "outputFilePath", // This is shown separately in the UI
        "regexData", // This will be displayed separately if present
      ];

      keysToRemove.forEach((key) => {
        if (key in filteredMetadata) {
          delete filteredMetadata[key];
        }
      });

      // Format the object for display
      return JSON.stringify(filteredMetadata, null, 2);
    } catch (_e) {
      return "Invalid metadata";
    }
  };

  // Format regex patterns for display
  const formatRegexPatterns = (regexDataInput: string | Record<string, unknown> | null | undefined): string | null => {
    if (!regexDataInput) return null;

    try {
      let regexData: Record<string, unknown>;
      
      // If it's a string, try to parse it as JSON
      if (typeof regexDataInput === "string") {
        try {
          regexData = JSON.parse(regexDataInput) as Record<string, unknown>;
        } catch (_e) {
          return regexDataInput;
        }
      } else {
        regexData = regexDataInput;
      }

      // Cast to any for flexible access to the data structure from Rust backend
      const data = regexData as any;
      const patternsOutput: string[] = [];
      
      // Extract primary pattern
      const primaryPattern = data?.primaryPattern?.pattern;
      if (primaryPattern) {
        patternsOutput.push(`Primary: /${primaryPattern}/`);
      }

      // Extract alternative patterns
      const alternatives = data?.alternativePatterns;
      if (Array.isArray(alternatives)) {
        alternatives.forEach((alt: any, index: number) => {
          const altPattern = alt?.pattern;
          if (altPattern) {
            patternsOutput.push(`Alt ${index + 1}: /${altPattern}/`);
          }
        });
      }

      // Extract flags
      const flags = data?.flags;
      if (Array.isArray(flags) && flags.length > 0) {
        patternsOutput.push(`Flags: ${flags.join("")}`);
      }

      // Return structured output if we found patterns
      if (patternsOutput.length > 0) {
        return patternsOutput.join("\n");
      }

      // Fallback: try the old structure for backward compatibility
      const regexPatternsTyped = data as Record<string, string>;
      const fallbackPatterns = [
        regexPatternsTyped.titleRegex && `Title: ${regexPatternsTyped.titleRegex}`,
        regexPatternsTyped.contentRegex && `Content: ${regexPatternsTyped.contentRegex}`,
        regexPatternsTyped.negativeTitleRegex &&
          `Negative Title: ${regexPatternsTyped.negativeTitleRegex}`,
        regexPatternsTyped.negativeContentRegex &&
          `Negative Content: ${regexPatternsTyped.negativeContentRegex}`,
      ].filter(Boolean);

      if (fallbackPatterns.length > 0) {
        return fallbackPatterns.join("\n");
      }

      // Final fallback
      return "No regex patterns found in metadata.";
    } catch (_e) {
      return JSON.stringify(regexDataInput, null, 2);
    }
  };

  if (!job) return null;

  // Get job duration if possible, using startTime and endTime if available
  const jobDuration = job.startTime
    ? formatJobDuration(job.startTime, job.endTime, job.status)
    : "N/A";

  // Determine which content to show as the prompt
  const promptContent = job.prompt || "No prompt data available";

  const getResponseContent = () => {
    // For Content View - show EXACTLY what would be copied with the copy button
    if (
      job.taskType === "implementation_plan" &&
      job.metadata?.showPureContent === true
    ) {
      // Always return the raw response for implementation plans in content view
      // This is EXACTLY what gets copied by the copy button
      return job.response || "No content available yet.";
    }

    // Standard streaming response handling for details view
    if (
      job.taskType === "implementation_plan" &&
      (job.status === "running" || job.status === "processing_stream") &&
      job.metadata?.isStreaming === true
    ) {
      if (job.response) {
        return job.response;
      } else {
        return "Waiting for implementation plan content to stream...";
      }
    }

    // Standard completed response handling for details view
    if (job.taskType === "implementation_plan" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      if (job.response) {
        return job.response;
      }

      return "Implementation plan job completed, but no content is available.";
    }

    // Path finder job handling - improved structured data display
    if (job.taskType === "path_finder" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      // Try to get structured data from metadata first (prioritize this for better formatting)
      let paths: string[] = [];
      let pathCountFromMeta: number | undefined;

      if (job.metadata?.pathFinderData && typeof job.metadata.pathFinderData === 'string') {
        try {
          const pathDataParsed = JSON.parse(job.metadata.pathFinderData) as { paths?: string[]; allFiles?: string[] };
          // Use camelCase allFiles or paths
          const pathsArray = pathDataParsed?.allFiles || pathDataParsed?.paths;
          if (Array.isArray(pathsArray) && pathsArray.every(p => typeof p === 'string')) {
            paths = pathsArray;
          }
        } catch (e) {
          console.warn("Failed to parse pathFinderData from metadata for path_finder job:", e);
        }
      }

      if (typeof job.metadata?.pathCount === 'number') {
        pathCountFromMeta = job.metadata.pathCount;
      }

      // If paths were successfully parsed from metadata, use them
      if (paths.length > 0) {
        const pathCount = pathCountFromMeta ?? paths.length; // Prefer explicit count if available
        return `Found ${pathCount} relevant file${pathCount !== 1 ? "s" : ""}:\n\n${paths.join("\n")}`;
      }

      // Fallback to job.response if pathData parsing failed or paths were empty
      if (job.response) {
          const count = pathCountFromMeta ?? job.response.split('\n').filter(Boolean).length;
          return `Found ${count} relevant file${count !== 1 ? "s" : ""}:\n\n${job.response}`;
      }
      return "Path finder job completed, but no path data found.";
    }

    // Streaming jobs special handling - for jobs with isStreaming flag
    if ((job.status === "running" || job.status === "processing_stream") && job.metadata?.isStreaming === true) {
      if (job.response) {
        // For streaming jobs, show the response with a note that it's streaming
        return `${job.response}\n\n[Streaming in progress...]`;
      } else {
        return "Waiting for streaming content to begin...";
      }
    }

    // Handle standard response case with JSON detection
    if (job.response) {
      // Check if response is JSON and format it nicely if so
      if (
        job.response.trim().startsWith("{") ||
        job.response.trim().startsWith("[")
      ) {
        try {
          const parsedResponse = JSON.parse(job.response) as unknown;
          return JSON.stringify(parsedResponse, null, 2);
        } catch (_e) {
          // Not valid JSON, continue to return as-is
        }
      }

      // Not JSON or parsing failed, return as is
      return job.response;
    }

    // Customize the fallback based on job status
    if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      return "Job completed but no response data is available.";
    } else if (job.status === "failed") {
      return (
        job.errorMessage || "Job failed but no error details are available."
      );
    } else if (job.status === "canceled") {
      return job.errorMessage || "Job was canceled by the user.";
    } else if (job.status === "running" || job.status === "processing_stream") {
      return job.statusMessage || "Job is currently processing...";
    } else if (["preparing", "queued", "created", "acknowledged_by_worker", "preparing_input", "generating_stream"].includes(job.status)) {
      return job.statusMessage || "Job is preparing to run...";
    } else if (job.status === "idle") {
      return "Job is waiting to start...";
    } else {
      return "No response data available";
    }
  };

  // Get response content using the helper function
  const responseContent = getResponseContent();

  return (
    <Dialog open={!!job} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle
            className={job.taskType === "implementation_plan" ? "text-xl" : ""}
          >
            {(() => {
              const parsedMeta = getParsedMetadata(job.metadata);

              if (
                job.taskType === "implementation_plan" &&
                parsedMeta?.showPureContent === true
              ) {
                return (
                  <div className="flex items-center gap-2">
                    <span>Implementation Plan Content</span>
                    {(job.status === "running" || job.status === "processing_stream") && parsedMeta?.isStreaming && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </div>
                );
              } else if (
                job.taskType === "implementation_plan" &&
                parsedMeta?.sessionName
              ) {
                return <>Implementation Plan: {parsedMeta.sessionName}</>;
              } else {
                return <>Job Details</>;
              }
            })()}
          </DialogTitle>
          <DialogDescription className="text-balance">
            {(() => {
              const parsedMeta = getParsedMetadata(job.metadata);

              if (parsedMeta?.showPureContent === true) {
                if ((job.status === "running" || job.status === "processing_stream") && parsedMeta?.isStreaming) {
                  return <>Live updates in progress</>;
                } else {
                  return <>Content View</>;
                }
              } else {
                return <>Details for job ID: {job.id}</>;
              }
            })()}
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-col space-y-6 overflow-y-auto pr-2 mt-4 w-full"
          style={{ maxHeight: "calc(90vh - 150px)" }}
        >
          <div className="grid grid-cols-1 gap-4 py-4">
            <JobDetailsStatusSection job={job} />
            <JobDetailsModelConfigSection job={job} />
            <JobDetailsTimingSection job={job} jobDuration={jobDuration} />
            <JobDetailsTokenUsageSection job={job} />
            <JobDetailsAdditionalInfoSection job={job} />
          </div>

          <JobDetailsErrorSection job={job} />

          <div className="flex flex-col space-y-6 w-full">
            <JobDetailsPromptSection promptContent={promptContent} />
            <JobDetailsResponseSection
              job={job}
              responseContent={responseContent}
            />
            <JobDetailsMetadataSection
              job={job}
              formatMetadata={formatMetadata}
              formatRegexPatterns={formatRegexPatterns}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" variant="outline" className="h-9">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
