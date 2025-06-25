import { RefreshCw } from "lucide-react";

import { useBillingData } from "@/hooks/use-billing-data";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";

interface CostUsageIndicatorProps {
  // Override props (for when you want to provide data directly instead of fetching)
  creditBalance?: number;
  trialDaysLeft?: number;

  // Component display options
  compact?: boolean;
  showRefreshButton?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * CostUsageIndicator component
 * Displays credit balance and trial information
 * Can either fetch data automatically or display provided data
 */
export function CostUsageIndicator({
  // Override props
  creditBalance,
  trialDaysLeft,

  // Display options
  compact = false,
  showRefreshButton = true,
  className = "",
  onClick,
}: CostUsageIndicatorProps) {
  // Fetch billing data
  const { creditBalanceUsd, trialDaysLeft: fetchedTrialDaysLeft, isLoading, error, refreshBillingData } = useBillingData();

  // Use provided values or fetched values with safe fallbacks
  const actualCreditBalance = (creditBalance ?? creditBalanceUsd) ?? 0;
  const actualTrialDaysLeft = trialDaysLeft ?? fetchedTrialDaysLeft;

  // Format currency with 2 decimal places
  const formattedCreditBalance = actualCreditBalance.toFixed(2);

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
          className="bg-background/80 border-border/60 backdrop-blur-sm text-foreground"
        >
          Credits: {currencySymbol}{formattedCreditBalance}
        </Badge>

        {showRefreshButton && (
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
        {/* Credit balance title with refresh button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-foreground">
            Credit Balance
          </h3>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className="bg-background/80 border-border/60 backdrop-blur-sm text-xs text-foreground"
            >
              {currencySymbol}{formattedCreditBalance}
            </Badge>

            {showRefreshButton && (
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