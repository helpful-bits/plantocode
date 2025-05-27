import { type BackgroundJob } from "@/types/session-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Progress } from "@/ui/progress";

interface JobDetailsTokenUsageSectionProps {
  job: BackgroundJob;
}

export function JobDetailsTokenUsageSection({
  job,
}: JobDetailsTokenUsageSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Token Usage</CardTitle>
        <CardDescription className="text-xs">
          Input and output token consumption
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <div className="text-xs text-muted-foreground">Input</div>
            </div>
            <div className="text-sm font-mono font-medium text-foreground">
              {job.tokensSent?.toLocaleString() || 0}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <div className="text-xs text-muted-foreground">Output</div>
            </div>
            <div className="text-sm font-mono font-medium text-foreground">
              {job.tokensReceived?.toLocaleString() || 0}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="text-sm font-mono font-medium text-foreground">
              {(
                (job.tokensSent || 0) + (job.tokensReceived || 0)
              ).toLocaleString()}
            </div>
          </div>
        </div>

        {job.status === "running" &&
          job.maxOutputTokens &&
          job.tokensReceived && (
            <div className="mt-4">
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                <span>Output Tokens Used</span>
                <span>
                  {job.tokensReceived} / {job.maxOutputTokens}
                </span>
              </div>
              <Progress
                value={Math.min(
                  (job.tokensReceived / job.maxOutputTokens) * 100,
                  100
                )}
                className="h-1"
              />
            </div>
          )}
      </CardContent>
    </Card>
  );
}
