import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Progress } from "@/ui/progress";
import { formatTimestamp } from "@/utils/date-utils";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

import { getStreamingProgressValue } from "../../utils";

export function JobDetailsTimingSection() {
  const { job, jobDuration } = useJobDetailsContext();
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
                  value={getStreamingProgressValue(job.metadata, job.startTime) || 5}
                  className="h-1 w-full animate-pulse"
                />
                <div className="text-xs text-muted-foreground mt-1">Running...</div>
                {(() => {
                  const progressValue = getStreamingProgressValue(job.metadata, job.startTime);
                  return progressValue !== undefined ? (
                    <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                      {Math.floor(progressValue)}%
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
