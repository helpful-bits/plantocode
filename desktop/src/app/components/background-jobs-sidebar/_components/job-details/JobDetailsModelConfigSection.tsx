import { type BackgroundJob } from "@/types/session-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

// Helper function to identify local/filesystem tasks
const isLocalTask = (taskType: string): boolean => {
  const localTaskTypes = [
    "local_file_filtering",
    "directory_tree_generation"
  ];
  return localTaskTypes.includes(taskType);
};

interface JobDetailsModelConfigSectionProps {
  job: BackgroundJob;
}

export function JobDetailsModelConfigSection({
  job,
}: JobDetailsModelConfigSectionProps) {
  // Don't render for filesystem/local jobs
  if (job.apiType === "filesystem" || isLocalTask(job.taskType)) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Model Configuration</CardTitle>
          <CardDescription className="text-xs">
            AI model settings used for this job
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-muted-foreground">
            Not Applicable - This is a local filesystem operation
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Model Configuration</CardTitle>
        <CardDescription className="text-xs">
          AI model settings used for this job
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Model</div>
            <div className="text-sm font-medium">
              {job.modelUsed || "Default"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Temperature</div>
            <div className="text-sm font-medium">
              {job.temperature !== undefined ? job.temperature : "Default"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Max Output Tokens
            </div>
            <div className="text-sm font-medium">
              {job.maxOutputTokens
                ? job.maxOutputTokens.toLocaleString()
                : "Default"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
