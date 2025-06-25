import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";
import { formatUsdCurrency } from "@/utils/currency-utils";

export function JobDetailsCostUsageSection() {
  const { job } = useJobDetailsContext();
  const isLocalTask = (job.taskType && TaskTypeDetails[job.taskType as TaskType]?.requiresLlm === false);
  
  if (isLocalTask) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">AI Usage</CardTitle>
          <CardDescription className="text-xs">
            Token usage and cost information for this AI operation
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

  const inputTokens = job.tokensSent || 0;
  const outputTokens = job.tokensReceived || 0;
  const totalTokens = (inputTokens + outputTokens);
  
  // Always use the server-authoritative 'actualCost' for display to ensure consistency with billing.
  const jobCost = job.actualCost;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">AI Usage</CardTitle>
        <CardDescription className="text-xs">
          Token usage and cost information for this AI operation
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
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
          
          {/* Cost Display Section */}
          <div className="pt-2 border-t border-border/50">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <div className="text-xs text-muted-foreground">Cost</div>
                </div>
                <div className="text-sm font-mono font-medium text-foreground">
                  {jobCost !== null && jobCost !== undefined ? formatUsdCurrency(jobCost) : 'N/A'}
                </div>
              </div>
              {job.duration_ms && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                    <div className="text-xs text-muted-foreground">API Duration</div>
                  </div>
                  <div className="text-sm font-mono font-medium text-foreground">
                    {job.duration_ms < 1000 
                      ? `${job.duration_ms}ms` 
                      : `${(job.duration_ms / 1000).toFixed(2)}s`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>


        {job.status === "running" && (
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground text-center">
              🔄 Processing in progress
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}