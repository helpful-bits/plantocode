"use client";

import { useCallback } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

interface SpendingDetails {
  currentSpendingUsd: number;
  spendingLimitUsd: number;
}

interface UsageCardProps {
  spendingDetails?: SpendingDetails;
  isLoading?: boolean;
}

export function UsageCard({
  spendingDetails,
  isLoading
}: UsageCardProps) {
  const formatCurrency = useCallback((amount: number, currency = "USD") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }, []);

  return (
    <Card className="hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          This Month's Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {spendingDetails ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span>
                  {formatCurrency(spendingDetails.currentSpendingUsd, "USD")} / 
                  {formatCurrency(spendingDetails.spendingLimitUsd, "USD")}
                </span>
                <span className="font-medium">
                  {((spendingDetails.currentSpendingUsd / spendingDetails.spendingLimitUsd) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${
                    (spendingDetails.currentSpendingUsd / spendingDetails.spendingLimitUsd) >= 0.9 ? 'bg-red-500' :
                    (spendingDetails.currentSpendingUsd / spendingDetails.spendingLimitUsd) >= 0.7 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min((spendingDetails.currentSpendingUsd / spendingDetails.spendingLimitUsd) * 100, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              {isLoading ? 'Loading usage data...' : 'Usage data unavailable'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}