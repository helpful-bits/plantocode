import { RefreshCw } from "lucide-react";

import { useBillingData } from "@/hooks/use-billing-data";

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
  trialDaysLeft?: number;

  // Component display options
  compact?: boolean;
  showRefreshButton?: boolean;
  className?: string;
  onClick?: () => void;

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
  trialDaysLeft,

  // Display options
  compact = false,
  showRefreshButton = true,
  className = "",
  onClick,

}: CostUsageIndicatorProps) {
  // Fetch usage data if no override props provided
  const shouldFetch = currentSpending === undefined || monthlyAllowance === undefined;
  const { spendingStatus, trialDaysLeft: fetchedTrialDaysLeft, isLoading, error, refreshBillingData } = useBillingData();


  // Use provided values or fetched values with safe fallbacks
  const actualCurrentSpending = (currentSpending ?? spendingStatus?.currentSpending) ?? 0;
  const actualMonthlyAllowance = (monthlyAllowance ?? spendingStatus?.effectiveAllowance) ?? 0;
  const actualUsagePercentage = (usagePercentage ?? spendingStatus?.usagePercentage) ?? 0;
  const actualServicesBlocked = (servicesBlocked ?? spendingStatus?.servicesBlocked) ?? false;
  const actualTrialDaysLeft = trialDaysLeft ?? fetchedTrialDaysLeft;

  // Format currency with 2 decimal places
  const formattedSpending = actualCurrentSpending.toFixed(2);
  const formattedAllowance = actualMonthlyAllowance.toFixed(2);

  // Format currency symbol
  const currencySymbol = '$';

  // Show compact view with just the essentials
  if (compact) {
    return (
      <div 
        className={`flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''} ${className}`}
        onClick={onClick}
      >
        {actualTrialDaysLeft !== undefined && actualTrialDaysLeft !== null && (
          <Badge 
            variant={actualTrialDaysLeft === 0 ? "destructive" : actualTrialDaysLeft < 3 ? "warning" : "outline"} 
            className={actualTrialDaysLeft === 0 ? "" : "bg-primary/10 border-primary/20 text-primary"}
          >
            {actualTrialDaysLeft === 0 ? "Trial expired" : `${actualTrialDaysLeft} day${actualTrialDaysLeft !== 1 ? "s" : ""} left`}
          </Badge>
        )}

        <Badge 
          variant="outline" 
          className={`bg-background/80 border-border/60 backdrop-blur-sm text-foreground ${
            actualServicesBlocked ? "border-destructive/50 text-destructive" : ""
          }`}
        >
          {actualMonthlyAllowance > 0 ? `${currencySymbol}${formattedSpending} / ${currencySymbol}${formattedAllowance}` : `${currencySymbol}${formattedSpending}`}
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
            onClick={refreshBillingData}
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
    <Card 
      className={`p-4 shadow-soft backdrop-blur-sm bg-background/90 ${onClick ? 'cursor-pointer hover:bg-muted/20 transition-colors' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="space-y-3">
        {/* Usage title with spending and refresh button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-foreground">
            {actualServicesBlocked ? "⚠️ Usage (Blocked)" : "AI Usage"}
          </h3>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`bg-background/80 border-border/60 backdrop-blur-sm text-xs text-foreground ${
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
                onClick={refreshBillingData}
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
            className={`h-2 ${
              actualUsagePercentage > 90 ? "bg-destructive/20" : 
              actualUsagePercentage >= 75 ? "bg-warning/20" : ""
            }`}
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
        {actualTrialDaysLeft !== undefined && actualTrialDaysLeft !== null && (
          <div className="mt-2">
            <Badge
              variant={
                actualTrialDaysLeft === 0 ? "destructive" :
                actualTrialDaysLeft < 3 ? "destructive" :
                actualTrialDaysLeft < 7 ? "warning" : "secondary"
              }
              className="w-full justify-center text-xs"
            >
              {actualTrialDaysLeft === 0 ? "Trial expired" : `${actualTrialDaysLeft} day${actualTrialDaysLeft !== 1 ? "s" : ""} left in trial`}
            </Badge>
          </div>
        )}

        {/* Error message if any */}
        {error && <div className="text-xs text-destructive mt-1">{error}</div>}
      </div>
    </Card>
  );
}