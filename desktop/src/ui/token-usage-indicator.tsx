import { Loader2, RefreshCw } from "lucide-react";

import { useTokenUsage } from "@/hooks/useTokenUsage";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { Progress } from "./progress";

interface TokenUsageIndicatorProps {
  // Override props (for when you want to provide data directly instead of fetching)
  tokensUsed?: number;
  maxTokens?: number;
  cost?: number;
  currency?: string;
  trialDaysLeft?: number;

  // Component display options
  compact?: boolean;
  showRefreshButton?: boolean;
  className?: string;

  // Fetch options
  serverUrl?: string;
  getAuthToken?: () => Promise<string | null>;
  autoRefreshInterval?: number | null;
}

/**
 * TokenUsageIndicator component
 * Displays token usage statistics and trial information
 * Can either fetch data automatically or display provided data
 */
export function TokenUsageIndicator({
  // Override props
  tokensUsed,
  maxTokens,
  cost,
  currency = "USD",
  trialDaysLeft,

  // Display options
  compact = false,
  showRefreshButton = true,
  className = "",

  // Fetch options
  serverUrl,
  getAuthToken,
  autoRefreshInterval,
}: TokenUsageIndicatorProps) {
  // Fetch usage data if no override props provided
  const shouldFetch = tokensUsed === undefined || maxTokens === undefined;
  const { usage, isLoading, error, refreshUsage } = useTokenUsage({ 
    serverUrl, 
    getAuthToken, 
    autoRefreshInterval
  });

  // Use provided values or fetched values
  const actualTokensUsed = tokensUsed ?? usage?.usedTokens ?? 0;
  const actualMaxTokens = maxTokens ?? usage?.monthlyLimit;
  const actualCost = cost ?? usage?.estimatedCost ?? 0;
  const actualCurrency = currency ?? usage?.currency ?? "USD";
  const actualTrialDaysLeft = trialDaysLeft ?? usage?.trialDaysRemaining;

  // Calculate progress percentage if max tokens is available
  const progressPercentage = actualMaxTokens
    ? Math.min(100, Math.round((actualTokensUsed / actualMaxTokens) * 100))
    : undefined;

  // Format cost with 2 decimal places
  const formattedCost = actualCost.toFixed(2);

  // Format currency symbol
  const currencySymbol = actualCurrency === "USD" ? "$" : actualCurrency;

  // Show compact view with just the essentials
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {isLoading && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}

        {actualTrialDaysLeft !== undefined && (
          <Badge variant="outline" className="bg-primary/10">
            {actualTrialDaysLeft} day{actualTrialDaysLeft !== 1 ? "s" : ""} left
          </Badge>
        )}

        <Badge variant="outline" className="bg-muted/20">
          {currencySymbol}
          {formattedCost}
        </Badge>

        {showRefreshButton && shouldFetch && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={refreshUsage}
            disabled={isLoading}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  // Show full card view with more details
  return (
    <Card className={`p-4 shadow-sm ${className}`}>
      <div className="space-y-3">
        {/* Usage title with cost and refresh button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Token Usage</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-muted/10 text-xs">
              {currencySymbol}
              {formattedCost}
            </Badge>

            {showRefreshButton && shouldFetch && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={refreshUsage}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Token usage progress bar */}
        {progressPercentage !== undefined && (
          <div className="space-y-1">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{actualTokensUsed.toLocaleString()} used</span>
              <span>{actualMaxTokens?.toLocaleString()} total</span>
            </div>
          </div>
        )}

        {/* Trial days left indicator */}
        {actualTrialDaysLeft !== undefined && (
          <div className="mt-2">
            <Badge
              variant={
                typeof actualTrialDaysLeft === "number" &&
                actualTrialDaysLeft < 5
                  ? "warning"
                  : "secondary"
              }
              className="w-full justify-center text-xs"
            >
              {actualTrialDaysLeft} day{actualTrialDaysLeft !== 1 ? "s" : ""}{" "}
              left in trial
            </Badge>
          </div>
        )}

        {/* Error message if any */}
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>
    </Card>
  );
}