import { type BackgroundJob } from "@/types/session-types";

interface JobDetailsStatusSectionProps {
  job: BackgroundJob;
}

export function JobDetailsStatusSection({ job }: JobDetailsStatusSectionProps) {
  return (
    <div className="col-span-1">
      <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
        <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">
          Job Status
        </h4>
        <div className="grid grid-cols-5 gap-6">
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Status</h5>
            <p className="text-sm font-medium">{job.status}</p>
          </div>
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">API</h5>
            <p className="text-sm font-medium">{job.apiType}</p>
          </div>
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Task</h5>
            <p className="text-sm font-medium">{job.taskType}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
