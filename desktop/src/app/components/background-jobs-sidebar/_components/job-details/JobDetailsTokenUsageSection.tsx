import { type BackgroundJob } from "@/types/session-types";
import { Progress } from "@/ui/progress";

interface JobDetailsTokenUsageSectionProps {
  job: BackgroundJob;
}

export function JobDetailsTokenUsageSection({
  job,
}: JobDetailsTokenUsageSectionProps) {
  return (
    <div className="col-span-1">
      <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
        <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">
          Token Usage
        </h4>
        <div className="grid grid-cols-5 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <h5 className="text-xs text-muted-foreground">Input</h5>
            </div>
            <p className="text-sm font-mono font-medium">
              {job.tokensSent?.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <h5 className="text-xs text-muted-foreground">Output</h5>
            </div>
            <p className="text-sm font-mono font-medium">
              {job.tokensReceived?.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <h5 className="text-xs text-muted-foreground">Total</h5>
            </div>
            <p className="text-sm font-mono font-medium">
              {(
                (job.tokensSent || 0) + (job.tokensReceived || 0)
              ).toLocaleString()}
            </p>
          </div>
        </div>

        {job.status === "running" &&
          job.maxOutputTokens &&
          job.tokensReceived && (
            <div className="mt-3">
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
      </div>
    </div>
  );
}
