import { Loader2, ClipboardCopy, FileCode } from "lucide-react";

import { type BackgroundJob } from "@/types/session-types";
import { Button } from "@/ui/button";
import { Progress } from "@/ui/progress";
import { ScrollArea } from "@/ui/scroll-area";
import { toast } from "@/ui/use-toast";

import { getStreamingProgressValue } from "../../utils";

interface JobDetailsResponseSectionProps {
  job: BackgroundJob;
  responseContent: string;
}

export function JobDetailsResponseSection({
  job,
  responseContent,
}: JobDetailsResponseSectionProps) {
  return (
    <div className="p-5 bg-gray-50 dark:bg-muted/10 rounded-md">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-xs text-muted-foreground uppercase">
          {job.taskType === "implementation_plan" &&
          job.metadata?.showPureContent === true ? (
            <div className="flex items-center gap-2">
              <span>Content</span>
              {job.status === "running" && job.metadata?.isStreaming && (
                <div className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Live Updates</span>
                </div>
              )}
            </div>
          ) : (
            <span>Response</span>
          )}
        </h4>
        {job.taskType === "implementation_plan" && job.response && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2 py-1 flex items-center gap-1"
            onClick={() => {
              void navigator.clipboard.writeText(job.response || "");
              toast({
                title: "Copied to clipboard",
                description: "Implementation plan content copied to clipboard",
                duration: 2000,
              });
            }}
          >
            <ClipboardCopy className="h-3 w-3 mr-1" />
            Copy content
          </Button>
        )}
      </div>

      {/* Show progress bar for streaming jobs */}
      {job.status === "running" && job.metadata?.isStreaming && (
        <div className="mb-3">
          <Progress
            value={
              // Calculate progress with unified handling for implementation plans
              job.taskType === "implementation_plan"
                ? getStreamingProgressValue(
                    job.metadata,
                    job.startTime,
                    job.maxOutputTokens
                  )
                : job.metadata.responseLength &&
                    job.metadata.estimatedTotalLength
                  ? Math.min(
                      (job.metadata.responseLength /
                        job.metadata.estimatedTotalLength) *
                        100,
                      97
                    )
                  : Math.min(
                      Math.floor(
                        (Date.now() - (job.startTime || Date.now())) / 150
                      ),
                      90
                    )
            }
            className="h-1 mb-2"
          />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                Streaming in progress...
              </span>
            </div>
            <div className="flex items-center gap-2">
              {job.metadata.responseLength && (
                <span>
                  {Math.floor(job.metadata.responseLength / 1024)} KB received
                </span>
              )}
              {typeof job.metadata.streamProgress === "number" && (
                <span>{Math.floor(job.metadata.streamProgress)}% complete</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Display with improved formatting for file references */}
      {responseContent &&
      responseContent.includes("file:") &&
      job.outputFilePath ? (
        <div className="space-y-3">
          {/* When we have both content and file reference, display content first */}
          <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">
            {/* Display content part before the file reference */}
            {responseContent.split(/file:.*$/m)[0].trim()}
          </pre>

          {/* Show file reference separately with better styling */}
          <div className="mt-3 p-3 border rounded-md bg-muted/20 text-xs flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileCode className="h-4 w-4" />
              <span>Complete content available in file:</span>
            </div>
            <code className="text-xs bg-muted/30 p-1 rounded font-mono">
              {job.outputFilePath}
            </code>
          </div>
        </div>
      ) : (
        <ScrollArea className="max-h-[70vh]">
          <pre
            className={`whitespace-pre-wrap font-mono text-balance w-full ${
              job.taskType === "implementation_plan" &&
              job.metadata?.showPureContent === true
                ? job.status === "running" && job.metadata?.isStreaming
                  ? "text-xs p-6 bg-blue-50/30 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md animate-pulse"
                  : "text-xs p-6 bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md"
                : job.taskType === "implementation_plan"
                  ? "text-xs p-6 bg-muted/20 rounded-md"
                  : "text-xs"
            }`}
          >
            {responseContent}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}
