import { AlertCircle } from "lucide-react";

import { type BackgroundJob } from "@/types/session-types";

interface JobDetailsErrorSectionProps {
  job: BackgroundJob;
}

export function JobDetailsErrorSection({ job }: JobDetailsErrorSectionProps) {
  if (!job.errorMessage) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="p-5 bg-red-50 dark:bg-destructive/10 rounded-md mb-2">
        <h4 className="font-semibold mb-3 text-xs text-red-800 dark:text-red-400 uppercase flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Error Information
        </h4>
        <pre className="whitespace-pre-wrap text-balance text-sm text-red-800 dark:text-red-400 w-full">
          {job.errorMessage}
        </pre>
      </div>
    </div>
  );
}
