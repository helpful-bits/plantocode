import { AlertCircle, ChevronRight } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { DataCard } from "@/ui/data-card";
import { TokenUsageIndicator } from "@/ui/token-usage-indicator";

import { type SubscriptionInfo } from "../types";

import type React from "react";



interface SubscriptionDetailsProps {
  subscription: SubscriptionInfo;
  onUpgrade: () => void;
  onManage: () => void;
}

/**
 * Component for displaying subscription details and actions
 */
export const SubscriptionDetails: React.FC<SubscriptionDetailsProps> = ({
  subscription,
  onUpgrade,
  onManage,
}) => {
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

  // Calculate total tokens
  const totalTokens =
    subscription.usage.tokensInput + subscription.usage.tokensOutput;

  // Status badge for subscription status
  const StatusBadge = () => {
    if (isActive) return <Badge className="bg-green-500/80">Active</Badge>;
    if (isCancelled) return <Badge variant="destructive">Cancelled</Badge>;
    if (isTrialing) return <Badge variant="secondary">Trial</Badge>;
    return <Badge variant="outline">{subscription.status}</Badge>;
  };

  return (
    <>
      {/* Token usage indicator */}
      <div className="mb-4">
        <TokenUsageIndicator
          tokensUsed={totalTokens}
          maxTokens={subscription.monthlyTokenLimit || 1000000}
          cost={subscription.usage.totalCost}
          trialDaysLeft={trialDaysLeft}
        />
      </div>

      {/* Trial ending soon alert */}
      {isTrialEndingSoon && (
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Your trial is ending soon</AlertTitle>
          <AlertDescription>
            <p className="mb-3">
              Upgrade now to continue enjoying unlimited access to all features.
            </p>
            <Button
              onClick={onUpgrade}
              size="sm"
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Upgrade Now
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <DataCard
        title="Subscription Details"
        className="mb-4"
        headerAction={<StatusBadge />}
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Plan</span>
            <span className="font-medium">
              {subscription.plan.toUpperCase()}
            </span>
          </div>

          {isTrialing && subscription.trialEndsAt && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Trial ends</span>
              <span className="font-medium">
                {new Date(subscription.trialEndsAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {isActive && subscription.currentPeriodEndsAt && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Renews on</span>
              <span className="font-medium">
                {new Date(
                  subscription.currentPeriodEndsAt
                ).toLocaleDateString()}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Monthly limit</span>
            <span className="font-medium">
              {subscription.monthlyTokenLimit?.toLocaleString() || "Unlimited"}{" "}
              tokens
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Used this month
            </span>
            <span className="font-medium">
              {totalTokens.toLocaleString()} tokens
            </span>
          </div>
        </div>
      </DataCard>

      <div className="space-y-3">
        {isFree || isTrialing ? (
          <>
            <Button
              onClick={onUpgrade}
              className="w-full"
              size={isTrialEndingSoon ? "lg" : "default"}
            >
              {isTrialing ? "Upgrade To Pro Plan" : "Upgrade to Pro"}
            </Button>

            {isTrialing && (
              <p className="text-xs text-center text-muted-foreground">
                Upgrade before your trial ends to keep all your projects and
                data. No credit card required for trial.
              </p>
            )}
          </>
        ) : (
          <>
            <Button onClick={onManage} variant="secondary" className="w-full">
              Manage Subscription
            </Button>

            {isActive && (
              <p className="text-xs text-center text-muted-foreground">
                You&apos;re on the Pro plan. Manage your billing, update payment
                methods, or change plans.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
};

SubscriptionDetails.displayName = "SubscriptionDetails";
