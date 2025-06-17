"use client";

import { useCallback } from "react";
import { Zap, CheckCircle } from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";

interface PlanDetails {
  name: string;
  priceUsd: number;
  billingInterval: string;
}

interface SpendingDetails {
  periodEnd: string;
}

interface PlanCardProps {
  planDetails?: PlanDetails;
  subscriptionStatus?: string;
  trialEndsAt?: string;
  spendingDetails?: SpendingDetails;
  onUpgradePlan: () => void;
}

export function PlanCard({
  planDetails,
  subscriptionStatus,
  trialEndsAt,
  spendingDetails,
  onUpgradePlan
}: PlanCardProps) {
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
          <Zap className="h-4 w-4 text-primary" />
          Current Plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">
              {planDetails ? planDetails.name : "Free"}
            </div>
            {planDetails && (
              subscriptionStatus === 'trialing' ? (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Trial
                </Badge>
              ) : (
                <Badge variant="success" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )
            )}
          </div>
          
          {planDetails && subscriptionStatus === 'trialing' && trialEndsAt && (
            <div className="mt-3">
              {(() => {
                const trialEndDate = new Date(trialEndsAt);
                const today = new Date();
                const timeDiff = trialEndDate.getTime() - today.getTime();
                const daysLeft = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
                
                return (
                  <Badge 
                    variant={daysLeft === 0 ? "destructive" : daysLeft < 3 ? "destructive" : daysLeft < 7 ? "warning" : "secondary"}
                    className="w-full justify-center text-xs font-medium"
                  >
                    {daysLeft === 0 ? 'Trial expired' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in trial`}
                  </Badge>
                );
              })()}
            </div>
          )}
          
          {planDetails && planDetails.priceUsd > 0 ? (
            <div className="space-y-2">
              <div className="text-lg font-semibold">
                {formatCurrency(planDetails.priceUsd, "USD")}/{planDetails.billingInterval}
              </div>
              <div className="text-sm text-muted-foreground">
                {subscriptionStatus === 'trialing' && trialEndsAt ? (
                  `Trial ends ${new Date(trialEndsAt).toLocaleDateString()}`
                ) : spendingDetails ? (
                  `Period ends: ${new Date(spendingDetails.periodEnd).toLocaleDateString()}`
                ) : (
                  'No period information available'
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No active subscription
            </div>
          )}
          
          <Button 
            size="sm" 
            onClick={onUpgradePlan}
            className="w-full mt-3"
          >
            <Zap className="h-4 w-4 mr-2" />
            Upgrade Plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}