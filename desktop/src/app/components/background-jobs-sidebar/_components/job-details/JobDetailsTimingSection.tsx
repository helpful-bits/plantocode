import { type BackgroundJob } from "@/types/session-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Progress } from "@/ui/progress";
import { formatTimestamp } from "@/utils/date-utils";

import { getStreamingProgressValue } from "../../utils";

interface JobDetailsTimingSectionProps {
  job: BackgroundJob;
  jobDuration: string;
}

export function JobDetailsTimingSection({
  job,
  jobDuration,
}: JobDetailsTimingSectionProps) {
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
                    job.metadata?.isStreaming === true
                      ? getStreamingProgressValue(
                          job.metadata,
                          job.startTime,
                          job.maxOutputTokens
                        )
                      : // For other streaming jobs
                        job.metadata?.isStreaming
                        ? job.metadata.responseLength &&
                          job.metadata.estimatedTotalLength
                          ? Math.min(
                              (job.metadata.responseLength /
                                job.metadata.estimatedTotalLength) *
                                100,
                              98
                            )
                          : job.metadata.streamProgress ||
                            Math.min(
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
                {typeof job.metadata?.streamProgress === "number" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                    {Math.floor(job.metadata.streamProgress)}%
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
