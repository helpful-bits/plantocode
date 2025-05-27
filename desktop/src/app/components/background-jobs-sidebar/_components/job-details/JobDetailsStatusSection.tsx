import { type BackgroundJob } from "@/types/session-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

interface JobDetailsStatusSectionProps {
  job: BackgroundJob;
}

export function JobDetailsStatusSection({ job }: JobDetailsStatusSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Job Status</CardTitle>
        <CardDescription className="text-xs">
          Current job execution details
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <div className="text-sm font-medium text-foreground">{job.status}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Task</div>
            <div className="text-sm font-medium text-foreground">{job.taskType}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
