import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";

export function JobDetailsModelConfigSection() {
  const { job, parsedMetadata } = useJobDetailsContext();
  
  // Extract model settings from task data
  const taskData = parsedMetadata?.taskData || {};
  const temperature = taskData.temperature;
  const maxTokens = taskData.max_tokens;
  
  if (job.taskType && TaskTypeDetails[job.taskType as TaskType]?.requiresLlm === false) {
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
              {temperature !== undefined ? Number(temperature).toFixed(2) : "Default"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Max Output Tokens
            </div>
            <div className="text-sm font-medium">
              {maxTokens !== undefined ? maxTokens : "Default"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
