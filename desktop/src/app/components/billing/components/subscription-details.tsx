import { AlertCircle, ChevronRight, Calendar, CreditCard, Users, Zap } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Progress } from "@/ui/progress";

import { type SubscriptionInfo } from "../types";


interface SubscriptionDetailsProps {
  subscription: SubscriptionInfo;
  onUpgrade: () => void;
  onManage: () => void;
}

/**
 * Component for displaying subscription details and actions
 */
export function SubscriptionDetails({
  subscription,
  onUpgrade,
  onManage,
}: SubscriptionDetailsProps) {
  const isTrialing = subscription.status === "trialing";
  const isCancelled = subscription.status === "canceled";
  const isActive = subscription.status === "active";
  const isFree = subscription.plan === "free";

  // Calculate days left in trial if applicable
  const trialDaysLeft =
    isTrialing && subscription.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(subscription.trialEndsAt).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : undefined;

  // Determine if trial is ending soon (5 days or less)
  const isTrialEndingSoon =
    isTrialing && trialDaysLeft !== undefined && trialDaysLeft <= 5;

  // Calculate total tokens with safe fallbacks
  const tokensInputSafe = subscription.usage?.tokensInput ?? 0;
  const tokensOutputSafe = subscription.usage?.tokensOutput ?? 0;
  const totalTokens = tokensInputSafe + tokensOutputSafe;
  const monthlyLimit = subscription.monthlyTokenLimit || 1000000;
  const usagePercentage = Math.min(100, Math.round((totalTokens / monthlyLimit) * 100));

  // Status badge for subscription status
  function StatusBadge() {
    if (isActive) return <Badge variant="success">Active</Badge>;
    if (isCancelled) return <Badge variant="destructive">Cancelled</Badge>;
    if (isTrialing) return <Badge variant="secondary">Trial</Badge>;
    return <Badge variant="outline">{subscription.status}</Badge>;
  }

  return (
    <div className="space-y-6">
      {/* Trial ending soon alert - Aligned with app design */}
      {isTrialEndingSoon && (
        <Alert variant="warning" className="rounded-xl border border-border/60 backdrop-blur-sm shadow-soft">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Trial ending in {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="text-sm leading-7 mb-4">
              Upgrade now to continue enjoying unlimited access to all features.
            </p>
            <Button
              onClick={onUpgrade}
              size="sm"
              className="shadow-soft hover:shadow-soft-md backdrop-blur-sm transition-all duration-200"
            >
              <Zap className="mr-2 h-4 w-4" />
              Upgrade Now
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Token Usage Card - Aligned with app design */}
      <Card className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-soft hover:shadow-soft-md transition-all duration-300 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">Token Usage</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs rounded-full border px-2.5 py-0.5 font-medium transition-all duration-200 backdrop-blur-sm">
                ${(subscription.usage?.totalCost ?? 0).toFixed(2)}
              </Badge>
              {trialDaysLeft !== undefined && (
                <Badge 
                  variant={isTrialEndingSoon ? "warning" : "secondary"}
                  className="text-xs rounded-full border px-2.5 py-0.5 font-medium transition-all duration-200 backdrop-blur-sm"
                >
                  {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Monthly Usage</span>
                <span className="text-sm font-medium">{usagePercentage}% used</span>
              </div>
              <Progress value={usagePercentage} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{totalTokens.toLocaleString()} used</span>
                <span>{monthlyLimit.toLocaleString()} limit</span>
              </div>
            </div>
            {usagePercentage > 80 && (
              <Alert variant="warning" className="rounded-lg border p-3 backdrop-blur-sm shadow-soft">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Approaching usage limit - consider upgrading
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Details Card - Aligned with app design */}
      <Card className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-soft hover:shadow-soft-md transition-all duration-300 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">Subscription Details</h3>
            </div>
            <StatusBadge />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="font-medium text-sm">
                {subscription.plan.toUpperCase()}
              </span>
            </div>

            {isTrialing && subscription.trialEndsAt && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Trial ends
                </span>
                <span className="font-medium text-sm">
                  {new Date(subscription.trialEndsAt).toLocaleDateString()}
                </span>
              </div>
            )}

            {isActive && subscription.currentPeriodEndsAt && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Renews on
                </span>
                <span className="font-medium text-sm">
                  {new Date(
                    subscription.currentPeriodEndsAt
                  ).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons - Aligned with app design */}
      <div className="space-y-4">
        {isFree || isTrialing ? (
          <>
            <Button
              onClick={onUpgrade}
              className="w-full shadow-soft hover:shadow-soft-md backdrop-blur-sm transition-all duration-200"
              size={isTrialEndingSoon ? "lg" : "default"}
            >
              {isTrialing ? "Upgrade To Pro Plan" : "Upgrade to Pro"}
            </Button>

            {isTrialing && (
              <p className="text-xs text-center text-muted-foreground leading-7">
                Upgrade before your trial ends to keep all your projects and
                data. No credit card required for trial.
              </p>
            )}
          </>
        ) : (
          <>
            <Button 
              onClick={onManage} 
              variant="outline" 
              className="w-full shadow-soft hover:shadow-soft-md backdrop-blur-sm transition-all duration-200"
            >
              Manage Subscription
            </Button>

            {isActive && (
              <p className="text-xs text-center text-muted-foreground leading-7">
                You&apos;re on the Pro plan. Manage your billing, update payment
                methods, or change plans.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

SubscriptionDetails.displayName = "SubscriptionDetails";
