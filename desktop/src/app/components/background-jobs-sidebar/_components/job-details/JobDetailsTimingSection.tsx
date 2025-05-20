import { type BackgroundJob } from "@/types/session-types";
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
    <div className="col-span-1">
      <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
        <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">
          Timing
        </h4>
        <div className="grid grid-cols-5 gap-6">
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Created</h5>
            <p className="text-sm font-medium">
              {formatTimestamp(
                job.createdAt && job.createdAt > 0 ? job.createdAt : Date.now()
              )}
            </p>
          </div>
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Completed</h5>
            <p className="text-sm font-medium">
              {job.endTime && job.endTime > 0
                ? formatTimestamp(job.endTime)
                : "Not completed"}
            </p>
          </div>
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Duration</h5>
            <p className="text-sm font-medium">{jobDuration}</p>
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
                <p className="text-xs text-muted-foreground mt-1">Running...</p>
                {typeof job.metadata?.streamProgress === "number" && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                    {Math.floor(job.metadata.streamProgress)}%
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
