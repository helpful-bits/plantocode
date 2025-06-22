import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";
import { useBackgroundJobs } from "@/contexts/background-jobs";
import { formatUsdCurrency } from "@/utils/currency-utils";

// Cost calculation utility - estimates cost based on tokens and model
function calculateJobCost(job: any): number | null {
  const inputTokens = job.tokensSent || 0;
  const outputTokens = job.tokensReceived || 0;
  
  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  // Basic cost estimation - these rates are approximate for common models
  // In a real implementation, these would come from a model pricing table
  const inputCostPer1k = 0.001; // $0.001 per 1k input tokens (approximate)
  const outputCostPer1k = 0.002; // $0.002 per 1k output tokens (approximate)
  
  const inputCost = (inputTokens / 1000) * inputCostPer1k;
  const outputCost = (outputTokens / 1000) * outputCostPer1k;
  
  return inputCost + outputCost;
}

export function JobDetailsCostUsageSection() {
  const { job } = useJobDetailsContext();
  const { jobs } = useBackgroundJobs();
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
  
  // Calculate cost for current job
  const currentJobCost = calculateJobCost(job);
  
  // Calculate total cost from all jobs with the same project hash
  const totalCost = jobs
    .filter(j => j.projectHash === job.projectHash)
    .reduce((sum, j) => {
      const jobCost = calculateJobCost(j);
      return sum + (jobCost || 0);
    }, 0);

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
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <div className="text-xs text-muted-foreground">Job Cost</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                {currentJobCost !== null ? formatUsdCurrency(currentJobCost) : 'N/A'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <div className="text-xs text-muted-foreground">Total Cost</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                {totalCost > 0 ? formatUsdCurrency(totalCost) : 'N/A'}
              </div>
            </div>
          </div>
        </div>


        {job.status === "running" && (
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground text-center">
              🔄 Processing in progress
              {currentJobCost !== null && (
                <span className="block mt-1">
                  Estimated cost so far: {formatUsdCurrency(currentJobCost)}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}