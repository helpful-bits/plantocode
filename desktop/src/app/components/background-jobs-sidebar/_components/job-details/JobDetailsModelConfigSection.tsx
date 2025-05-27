import { type BackgroundJob } from "@/types/session-types";

interface JobDetailsModelConfigSectionProps {
  job: BackgroundJob;
}

export function JobDetailsModelConfigSection({
  job,
}: JobDetailsModelConfigSectionProps) {
  return (
    <div className="col-span-1">
      <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
        <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">
          Model Configuration
        </h4>
        <div className="grid grid-cols-5 gap-6">
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Model</h5>
            <p className="text-sm font-medium">
              {job.modelUsed || "Default"}
            </p>
          </div>
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">Temperature</h5>
            <p className="text-sm font-medium">
              {job.temperature !== undefined ? job.temperature : "Default"}
            </p>
          </div>
          <div>
            <h5 className="text-xs text-muted-foreground mb-1">
              Max Output Tokens
            </h5>
            <p className="text-sm font-medium">
              {job.maxOutputTokens
                ? job.maxOutputTokens.toLocaleString()
                : "Default"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
