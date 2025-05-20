import { FileCode } from "lucide-react";

import { type BackgroundJob } from "@/types/session-types";

interface JobDetailsAdditionalInfoSectionProps {
  job: BackgroundJob;
}

export function JobDetailsAdditionalInfoSection({
  job,
}: JobDetailsAdditionalInfoSectionProps) {
  if (!job.outputFilePath && !job.statusMessage) {
    return null;
  }

  return (
    <div className="col-span-1">
      <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
        <h4 className="font-semibold mb-3 text-xs text-muted-foreground uppercase">
          Additional Information
        </h4>

        {job.outputFilePath && (
          <div className="mb-3">
            <h5 className="text-xs text-muted-foreground mb-1">File Output</h5>
            <div className="flex items-center gap-2">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <p
                className="text-sm font-medium truncate text-balance"
                title={job.outputFilePath || ""}
              >
                {job.outputFilePath}
              </p>
            </div>
          </div>
        )}

        {job.statusMessage && (
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">
              Status Message
            </h5>
            <div className="text-sm font-medium text-balance max-h-[100px] overflow-auto">
              {job.statusMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
