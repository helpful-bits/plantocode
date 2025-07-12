import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";
import { JOB_STATUSES } from "@/types/session-types";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatUsdCurrencyPrecise } from "@/utils/currency-utils";
import { useMemo } from "react";

export function JobDetailsCostUsageSection() {
  const { job } = useJobDetailsContext();
  const isLocalTask = (job.taskType && TaskTypeDetails[job.taskType as TaskType]?.requiresLlm === false);
  
  const costLabel = useMemo(() => {
    if (job.isFinalized === true) {
      return 'Final Cost';
    }
    if (JOB_STATUSES.ACTIVE.includes(job.status) || job.isFinalized === false) {
      return 'Estimated Cost';
    }
    return 'Cost';
  }, [job.status, job.isFinalized]);
  
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

  // Display token and cost data directly from job object (server-provided data)
  const inputTokens = job.tokensSent || 0;
  const outputTokens = job.tokensReceived || 0;
  const totalTokens = (inputTokens + outputTokens);
  
  // Extract cache token information from job fields directly
  const cacheWriteTokens = job.cacheWriteTokens || 0;
  const cacheReadTokens = job.cacheReadTokens || 0;
  

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
                <AnimatedNumber 
                  value={inputTokens} 
                  duration={600}
                  format={(v) => Math.round(v).toLocaleString()}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <div className="text-xs text-muted-foreground">Output</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                <AnimatedNumber 
                  value={outputTokens} 
                  duration={600}
                  format={(v) => Math.round(v).toLocaleString()}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                <AnimatedNumber 
                  value={totalTokens} 
                  duration={600}
                  format={(v) => Math.round(v).toLocaleString()}
                />
              </div>
            </div>
          </div>
          
          {/* Cache Token Display Section - Only show if any cache tokens exist */}
          {(cacheWriteTokens > 0 || cacheReadTokens > 0) && (
            <div className="pt-4 border-t border-border/50">
              <div className="text-xs text-muted-foreground mb-2 font-medium">Cache Usage</div>
              <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Cache tokens optimize performance and reduce costs by reusing previously processed content
              </div>
              <div className="grid grid-cols-1 gap-3">
                {cacheWriteTokens > 0 && (
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <div className="text-xs text-muted-foreground">Cache Write</div>
                    </div>
                    <div className="text-sm font-mono font-medium text-foreground">
                      <AnimatedNumber 
                        value={cacheWriteTokens} 
                        duration={600}
                        format={(v) => Math.round(v).toLocaleString()}
                      />
                    </div>
                  </div>
                )}
                {cacheReadTokens > 0 && (
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                      <div className="text-xs text-muted-foreground">Cache Read</div>
                    </div>
                    <div className="text-sm font-mono font-medium text-foreground">
                      <AnimatedNumber 
                        value={cacheReadTokens} 
                        duration={600}
                        format={(v) => Math.round(v).toLocaleString()}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                <div><strong>Cache Write:</strong> Tokens saved to cache for future use</div>
                <div><strong>Cache Read:</strong> Tokens retrieved from cache</div>
              </div>
            </div>
          )}
          
          {/* Cost Display Section */}
          <div className="pt-2 border-t border-border/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <div className="text-xs text-muted-foreground">
                  {costLabel}
                  {job.isFinalized === false && (
                    <span className="ml-1 text-yellow-500">●</span>
                  )}
                </div>
              </div>
              <div className="text-sm font-mono font-medium text-foreground">
                {job.actualCost !== null && job.actualCost !== undefined ? (
                  <AnimatedNumber 
                    value={job.actualCost} 
                    duration={800}
                    format={(v) => formatUsdCurrencyPrecise(v)}
                  />
                ) : (
                  'Calculating...'
                )}
              </div>
            </div>
          </div>
        </div>


      </CardContent>
    </Card>
  );
}