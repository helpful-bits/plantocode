import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";

export function JobDetailsCostUsageSection() {
  const { job } = useJobDetailsContext();
  const isLocalTask = (job.taskType && TaskTypeDetails[job.taskType as TaskType]?.requiresLlm === false);
  
  if (isLocalTask) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">AI Usage</CardTitle>
          <CardDescription className="text-xs">
            Token usage and cost for this AI operation
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

  const totalCost = job.cost || 0;
  
  const inputTokens = job.tokensSent || 0;
  const outputTokens = job.tokensReceived || 0;
  const totalTokens = (inputTokens + outputTokens);
  
  const hasCostData = job.cost != null && job.cost > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">AI Usage</CardTitle>
        <CardDescription className="text-xs">
          {hasCostData ? "Cost and token usage for this AI operation" : "Token usage for this AI operation"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {hasCostData && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <div className="text-xs text-muted-foreground">Total Cost</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                ${totalCost.toFixed(6)}
              </div>
            </div>
          )}
          
          {/* Always show token breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <div className="text-xs text-muted-foreground">Input</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                {inputTokens.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <div className="text-xs text-muted-foreground">Output</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                {outputTokens.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                {totalTokens.toLocaleString()}
              </div>
            </div>
          </div>
        </div>


        {job.status === "running" && (
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground text-center">
              {hasCostData ? "💰 Cost accumulating during processing" : "🔄 Processing in progress"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}