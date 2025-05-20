import { Loader2 } from "lucide-react";
import { type BackgroundJob } from "@/types/session-types";
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
        "regexPatterns", // This will be displayed separately if present
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
  const formatRegexPatterns = (regexPatterns: string | Record<string, unknown> | null | undefined): string | null => {
    if (!regexPatterns) return null;

    try {
      // If it's a string, try to parse it as JSON
      if (typeof regexPatterns === "string") {
        try {
          regexPatterns = JSON.parse(regexPatterns) as Record<string, string>;
        } catch (_e) {
          return regexPatterns as string;
        }
      }

      // Type the regex patterns and create a nicely formatted section
      const regexPatternsTyped = regexPatterns as Record<string, string>;
      const patterns = [
        regexPatternsTyped.titleRegex && `Title: ${regexPatternsTyped.titleRegex}`,
        regexPatternsTyped.contentRegex && `Content: ${regexPatternsTyped.contentRegex}`,
        regexPatternsTyped.negativeTitleRegex &&
          `Negative Title: ${regexPatternsTyped.negativeTitleRegex}`,
        regexPatternsTyped.negativeContentRegex &&
          `Negative Content: ${regexPatternsTyped.negativeContentRegex}`,
      ].filter(Boolean);

      return patterns.join("\n");
    } catch (_e) {
      return JSON.stringify(regexPatterns, null, 2);
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
      job.status === "running" &&
      job.metadata?.isStreaming === true
    ) {
      if (job.response) {
        return job.response;
      } else {
        return "Waiting for implementation plan content to stream...";
      }
    }

    // Standard completed response handling for details view
    if (job.taskType === "implementation_plan" && job.status === "completed") {
      if (job.response) {
        return job.response;
      }

      return "Implementation plan job completed, but no content is available.";
    }

    // Path finder job handling - improved structured data display
    if (job.taskType === "path_finder" && job.status === "completed") {
      // Try to get structured data from metadata first (prioritize this for better formatting)
      if (job.metadata?.pathData) {
        try {
          // Parse the JSON stored in metadata
          const pathData = JSON.parse(job.metadata.pathData) as unknown;
          
          // Type-guard and display paths in a formatted way with count
          if (pathData && typeof pathData === 'object' && 'paths' in pathData && Array.isArray(pathData.paths)) {
            const pathCount = pathData.paths.length;
            return `Found ${pathCount} relevant file${pathCount !== 1 ? "s" : ""}:\n\n${pathData.paths.join("\n")}`;
          }

          // If nested under 'result' or other field
          if (
            pathData && 
            typeof pathData === 'object' && 
            'result' in pathData && 
            pathData.result && 
            typeof pathData.result === 'object' && 
            'paths' in pathData.result && 
            Array.isArray(pathData.result.paths)
          ) {
            const pathCount = pathData.result.paths.length;
            return `Found ${pathCount} relevant file${pathCount !== 1 ? "s" : ""}:\n\n${pathData.result.paths.join("\n")}`;
          }
        } catch (_e) {
          // Fall back to response string below
        }
      }

      // If metadata parsing failed, but we have path count, use that with response
      if (job.metadata?.pathCount && job.response) {
        const count = job.metadata.pathCount;
        return `Found ${count} relevant file${count !== 1 ? "s" : ""}:\n\n${job.response}`;
      }
    }

    // Streaming jobs special handling - for jobs with isStreaming flag
    if (job.status === "running" && job.metadata?.isStreaming === true) {
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
    switch (job.status) {
      case "completed":
        return "Job completed but no response data is available.";
      case "failed":
        return (
          job.errorMessage || "Job failed but no error details are available."
        );
      case "canceled":
        return job.errorMessage || "Job was canceled by the user.";
      case "running":
        return job.statusMessage || "Job is currently processing...";
      case "preparing":
      case "queued":
      case "created":
      case "acknowledged_by_worker":
        return job.statusMessage || "Job is preparing to run...";
      case "idle":
        return "Job is waiting to start...";
      default:
        return "No response data available";
    }
  };

  // Get response content using the helper function
  const responseContent = getResponseContent();

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
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
                    {job.status === "running" && parsedMeta?.isStreaming && (
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
                if (job.status === "running" && parsedMeta?.isStreaming) {
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
