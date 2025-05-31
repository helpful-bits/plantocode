import { type BackgroundJob } from "@/types/session-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Progress } from "@/ui/progress";
import { formatTimestamp } from "@/utils/date-utils";

import { getStreamingProgressValue, getParsedMetadata } from "../../utils";

interface JobDetailsTimingSectionProps {
  job: BackgroundJob;
  jobDuration: string;
}

export function JobDetailsTimingSection({
  job,
  jobDuration,
}: JobDetailsTimingSectionProps) {
  const parsedMetadata = getParsedMetadata(job.metadata);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Timing</CardTitle>
        <CardDescription className="text-xs">
          Job execution timeline and progress
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Created</div>
            <div className="text-sm font-medium text-foreground">
              {formatTimestamp(
                job.createdAt && job.createdAt > 0 ? job.createdAt : Date.now()
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Completed</div>
            <div className="text-sm font-medium text-foreground">
              {job.endTime && job.endTime > 0
                ? formatTimestamp(job.endTime)
                : "Not completed"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Duration</div>
            <div className="text-sm font-medium text-foreground">{jobDuration}</div>
            {job.status === "running" && job.startTime && (
              <div className="mt-2">
                <Progress
                  value={
                    // Calculate progress with unified handling for implementation plans
                    job.taskType === "implementation_plan" &&
                    parsedMetadata?.isStreaming === true
                      ? getStreamingProgressValue(
                          job.metadata,
                          job.startTime,
                          job.maxOutputTokens
                        )
                      : // For other streaming jobs
                        parsedMetadata?.isStreaming
                        ? typeof parsedMetadata.responseLength === "number" &&
                          typeof parsedMetadata.estimatedTotalLength === "number"
                          ? Math.min(
                              (parsedMetadata.responseLength /
                                parsedMetadata.estimatedTotalLength) *
                                100,
                              98
                            )
                          : typeof parsedMetadata.streamProgress === "number"
                          ? parsedMetadata.streamProgress
                          : Math.min(
                              Math.floor((Date.now() - job.startTime) / 200),
                              95
                            )
                        : Math.min(
                            Math.floor((Date.now() - job.startTime) / 300),
                            90
                          )
                  }
                  className="h-1 w-full animate-pulse"
                />
                <div className="text-xs text-muted-foreground mt-1">Running...</div>
                {typeof parsedMetadata?.streamProgress === "number" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                    {Math.floor(parsedMetadata.streamProgress)}%
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
