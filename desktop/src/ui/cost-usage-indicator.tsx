import { RefreshCw } from "lucide-react";

import { useCostUsage } from "@/hooks/useCostUsage";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { Progress } from "./progress";

interface CostUsageIndicatorProps {
  // Override props (for when you want to provide data directly instead of fetching)
  currentSpending?: number;
  monthlyAllowance?: number;
  usagePercentage?: number;
  servicesBlocked?: boolean;
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
 * CostUsageIndicator component
 * Displays cost-based usage statistics and trial information
 * Can either fetch data automatically or display provided data
 */
export function CostUsageIndicator({
  // Override props
  currentSpending,
  monthlyAllowance,
  usagePercentage,
  servicesBlocked,
  currency = "USD",
  trialDaysLeft,

  // Display options
  compact = false,
  showRefreshButton = true,
  className = "",

  // Fetch options
  autoRefreshInterval,
}: CostUsageIndicatorProps) {
  // Fetch usage data if no override props provided
  const shouldFetch = currentSpending === undefined || monthlyAllowance === undefined;
  const { usage, isLoading, error, refreshUsage } = useCostUsage({ 
    autoRefreshInterval
  });

  // Use provided values or fetched values with safe fallbacks
  const actualCurrentSpending = (currentSpending ?? usage?.currentSpending) ?? 0;
  const actualMonthlyAllowance = (monthlyAllowance ?? usage?.monthlyAllowance) ?? 0;
  const actualUsagePercentage = (usagePercentage ?? usage?.usagePercentage) ?? 0;
  const actualServicesBlocked = (servicesBlocked ?? usage?.servicesBlocked) ?? false;
  const actualCurrency = currency ?? usage?.currency ?? "USD";
  const actualTrialDaysLeft = trialDaysLeft ?? usage?.trialDaysRemaining;

  // Format currency with 2 decimal places
  const formattedSpending = actualCurrentSpending.toFixed(2);
  const formattedAllowance = actualMonthlyAllowance.toFixed(2);

  // Format currency symbol
  const currencySymbol = actualCurrency === "USD" ? "$" : actualCurrency;

  // Show compact view with just the essentials
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {actualTrialDaysLeft !== undefined && (
          <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary">
            {actualTrialDaysLeft} day{actualTrialDaysLeft !== 1 ? "s" : ""} left
          </Badge>
        )}

        <Badge 
          variant="outline" 
          className={`bg-background/80 border-border/60 backdrop-blur-sm ${
            actualServicesBlocked ? "border-destructive/50 text-destructive" : ""
          }`}
        >
          {currencySymbol}{formattedSpending}
        </Badge>

        {actualServicesBlocked && (
          <Badge variant="destructive" className="text-xs">
            Blocked
          </Badge>
        )}

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
    <Card className={`p-4 shadow-soft backdrop-blur-sm bg-background/90 ${className}`}>
      <div className="space-y-3">
        {/* Usage title with spending and refresh button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-foreground">
            {actualServicesBlocked ? "⚠️ Usage (Blocked)" : "AI Usage"}
          </h3>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`bg-background/80 border-border/60 backdrop-blur-sm text-xs ${
                actualServicesBlocked ? "border-destructive/50 text-destructive" : ""
              }`}
            >
              {currencySymbol}{formattedSpending}
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
        </div>

        {/* Cost usage progress bar */}
        <div className="space-y-1">
          <Progress 
            value={actualUsagePercentage} 
            className={`h-2 ${actualUsagePercentage > 90 ? "bg-destructive/20" : ""}`}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{currencySymbol}{formattedSpending} used</span>
            <span>{currencySymbol}{formattedAllowance} allowance</span>
          </div>
        </div>

        {/* Services blocked warning */}
        {actualServicesBlocked && (
          <div className="mt-2">
            <Badge variant="destructive" className="w-full justify-center text-xs">
              AI services blocked - Hard limit reached
            </Badge>
          </div>
        )}

        {/* High usage warning */}
        {!actualServicesBlocked && actualUsagePercentage > 75 && (
          <div className="mt-2">
            <Badge 
              variant={actualUsagePercentage > 90 ? "destructive" : "warning"} 
              className="w-full justify-center text-xs"
            >
              {actualUsagePercentage > 90 
                ? `${actualUsagePercentage.toFixed(0)}% used - Approaching limit`
                : `${actualUsagePercentage.toFixed(0)}% used`
              }
            </Badge>
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
        {error && <div className="text-xs text-destructive mt-1">{error}</div>}
      </div>
    </Card>
  );
}