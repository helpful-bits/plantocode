import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";

export function JobDetailsCostUsageSection() {
  const { job } = useJobDetailsContext();
  // Don't render for filesystem/local jobs
  const isLocalTask = job.apiType === "filesystem" || (job.taskType && TaskTypeDetails[job.taskType as TaskType]?.requiresLlm === false);
  
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

  // Use actual cost data from job if available, otherwise show token counts only
  const inputCost = job.inputCost || 0;
  const outputCost = job.outputCost || 0;
  const totalCost = job.totalCost || (inputCost + outputCost);
  
  const inputTokens = job.tokensSent || 0;
  const outputTokens = job.tokensReceived || 0;
  const totalTokens = (job.totalTokens && job.totalTokens > 0) ? job.totalTokens : (inputTokens + outputTokens);
  
  // Show cost data only if we have actual costs, not estimates
  const hasCostData = totalCost > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">AI Usage</CardTitle>
        <CardDescription className="text-xs">
          {hasCostData ? "Actual cost for this AI operation" : "Token usage for this AI operation"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {hasCostData ? (
          // Show actual cost breakdown
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <div className="text-xs text-muted-foreground">Input Cost</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                ${inputCost.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground">
                {inputTokens.toLocaleString()} tokens
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <div className="text-xs text-muted-foreground">Output Cost</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                ${outputCost.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground">
                {outputTokens.toLocaleString()} tokens
              </div>
            </div>
          </div>
        ) : (
          // Show token counts only when no cost data available
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
        )}

        {hasCostData && (
          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <div className="text-xs text-muted-foreground">Total Cost</div>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                ${totalCost.toFixed(4)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalTokens.toLocaleString()} total tokens
            </div>
          </div>
        )}

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