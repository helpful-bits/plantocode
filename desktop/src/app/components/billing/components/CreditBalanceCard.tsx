"use client";

import { useCallback } from "react";
import { DollarSign, Plus } from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { AnimatedNumber } from "@/ui/animated-number";

interface CreditBalanceCardProps {
  creditBalanceUsd?: number;
  previousCreditBalance?: number | null;
  onBuyCredits: () => void;
}

export function CreditBalanceCard({
  creditBalanceUsd,
  previousCreditBalance,
  onBuyCredits
}: CreditBalanceCardProps) {
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
          <DollarSign className="h-4 w-4 text-primary" />
          Credit Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-2xl font-bold">
            {creditBalanceUsd !== undefined ? (
              <AnimatedNumber
                value={creditBalanceUsd}
                previousValue={previousCreditBalance}
                formatValue={(value) => formatCurrency(value, "USD")}
                className="text-2xl font-bold"
              />
            ) : (
              <span className="text-muted-foreground">Loading...</span>
            )}
          </div>
          <Button 
            size="sm" 
            onClick={onBuyCredits}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Buy Credits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}