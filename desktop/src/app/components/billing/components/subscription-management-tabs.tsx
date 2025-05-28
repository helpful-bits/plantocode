"use client";

import { useState } from "react";
import { 
  CreditCard, 
  Settings, 
  AlertTriangle,
  ExternalLink,
  Download,
  Calendar,
  Check,
  X
} from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { Badge } from "@/ui/badge";
import { Progress } from "@/ui/progress";
import { Alert, AlertDescription } from "@/ui/alert";
import { useNotification } from "@/contexts/notification-context";
import { securedFetchJson } from "@/utils/secured-fetch";
import { getErrorMessage } from "@/utils/error-handling";
import { useSpendingData } from "@/hooks/use-spending-data";

import { type SubscriptionInfo } from "../types";
import { CostBasedSpendingOverview } from "./cost-based-spending-overview";

// Server URL from environment variables
const SERVER_URL = (import.meta.env.VITE_MAIN_SERVER_BASE_URL as string) || "http://localhost:8080";

interface SubscriptionManagementTabsProps {
  subscription: SubscriptionInfo;
  onRefresh: () => void;
}

// NO HARDCODED PLAN DATA - All plan information comes from the API

export function SubscriptionManagementTabs({ subscription }: SubscriptionManagementTabsProps) {
  const { showNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch spending data to pass to CostBasedSpendingOverview
  const { spendingStatus } = useSpendingData();

  const isActive = subscription.status === "active";
  const isTrialing = subscription.status === "trialing";

  // All usage statistics come from the subscription object from API
  const usagePercentage = subscription.usage?.usagePercentage ?? 0;
  const currentSpending = subscription.usage?.currentSpending ?? 0;
  const monthlyAllowance = subscription.usage?.monthlyAllowance ?? 0;

  // Handle plan upgrade
  const handlePlanChange = async (targetPlan: string) => {
    try {
      setIsLoading(true);
      const result = await securedFetchJson<{ url: string }>(
        `${SERVER_URL}/api/billing/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ plan: targetPlan }),
        }
      );

      if (result?.url) {
        // Open external checkout
        window.open(result.url, '_blank');
        showNotification({
          title: "Redirecting to Checkout",
          message: `Opening ${targetPlan} plan checkout in a new tab...`,
          type: "success",
        });
      }
    } catch (err) {
      console.error("Plan change error:", err);
      showNotification({
        title: "Plan Change Failed",
        message: getErrorMessage(err),
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle subscription cancellation
  const handleCancelSubscription = async () => {
    try {
      setIsLoading(true);
      // For now, redirect to Stripe portal for cancellation
      const result = await securedFetchJson<{ url: string }>(
        `${SERVER_URL}/api/billing/portal`,
        { method: "GET" }
      );

      if (result?.url) {
        window.open(result.url, '_blank');
        showNotification({
          title: "Opening Billing Portal",
          message: "Manage your subscription in the billing portal...",
          type: "info",
        });
      }
    } catch (err) {
      console.error("Cancellation error:", err);
      showNotification({
        title: "Portal Access Failed",
        message: getErrorMessage(err),
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle billing portal access
  const handleManageBilling = async () => {
    try {
      setIsLoading(true);
      const result = await securedFetchJson<{ url: string }>(
        `${SERVER_URL}/api/billing/portal`,
        { method: "GET" }
      );

      if (result?.url) {
        window.open(result.url, '_blank');
        showNotification({
          title: "Opening Billing Portal",
          message: "Access your invoices and payment methods...",
          type: "success",
        });
      }
    } catch (err) {
      console.error("Billing portal error:", err);
      showNotification({
        title: "Portal Access Failed",
        message: getErrorMessage(err),
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium">Subscription Management</h3>
          </div>
          <Badge variant={isActive ? "success" : isTrialing ? "secondary" : "outline"}>
            {isActive ? "Active" : isTrialing ? "Trial" : subscription.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="plans" className="text-xs">Plans</TabsTrigger>
            <TabsTrigger value="billing" className="text-xs">Billing</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Cost-Based Spending Overview */}
            <CostBasedSpendingOverview 
              spendingData={spendingStatus}
              onUpgrade={() => handlePlanChange('pro')}
              onManageSpending={handleManageBilling}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Current Plan */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Current Plan</h4>
                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{subscription.planName || subscription.plan}</span>
                    <span className="text-sm text-muted-foreground">
                      <span className="text-sm text-muted-foreground">${monthlyAllowance}/month allowance</span>
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500" />
                      Cost-based billing
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500" />
                      Pay for what you use
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage Overview */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Usage This Month</h4>
                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Spending</span>
                      <span className="text-sm font-medium">{usagePercentage}%</span>
                    </div>
                    <Progress value={usagePercentage} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>${currentSpending.toFixed(2)} used</span>
                      <span>${monthlyAllowance.toFixed(2)} allowance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Next Billing */}
            {(isActive || isTrialing) && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Next Billing</h4>
                <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {isTrialing ? "Trial ends" : "Renews"} on {" "}
                      {subscription.currentPeriodEndsAt 
                        ? new Date(subscription.currentPeriodEndsAt).toLocaleDateString()
                        : subscription.trialEndsAt
                        ? new Date(subscription.trialEndsAt).toLocaleDateString()
                        : "Unknown"
                      }
                    </span>
                  </div>
                  {subscription.nextInvoiceAmount && (
                    <span className="text-sm font-medium">
                      ${subscription.nextInvoiceAmount.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Usage Warning */}
            {usagePercentage > 80 && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You've used {usagePercentage}% of your monthly token limit. Consider upgrading to avoid service interruption.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Plans Tab */}
          <TabsContent value="plans" className="space-y-4 mt-4">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Available Plans</h4>
              <div className="grid gap-3">
                {/* Plans are now loaded dynamically from API - this section would need plan data from props */}
                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    Plan management moved to billing portal. Use "Manage Billing" button above.
                  </p>
                </div>
                {false && Object.entries({}).map(([planKey, plan]) => (
                  <div 
                    key={planKey}
                    className={`p-4 border rounded-lg ${
                      subscription.plan === planKey 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border/50 bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-medium">{(plan as any).name}</h5>
                          {subscription.plan === planKey && (
                            <Badge variant="secondary" className="text-xs">Current</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {(plan as any).price}{(plan as any).period && `/${(plan as any).period}`}
                        </p>
                      </div>
                      {subscription.plan !== planKey && (
                        <Button 
                          size="sm" 
                          variant={planKey === 'pro' ? 'default' : 'outline'}
                          onClick={() => handlePlanChange(planKey)}
                          disabled={isLoading}
                        >
                          {planKey === 'enterprise' ? 'Contact Sales' : 'Upgrade'}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {((plan as any).features || []).map((feature: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Check className="h-3 w-3 text-green-500" />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Billing & Invoices</h4>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleManageBilling}
                  disabled={isLoading}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Billing Portal
                </Button>
              </div>

              <div className="space-y-3">
                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Payment Method</span>
                    <Button size="sm" variant="ghost" onClick={handleManageBilling}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Manage your payment methods in the billing portal
                  </p>
                </div>

                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Invoice History</span>
                    <Button size="sm" variant="ghost" onClick={handleManageBilling}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    View and download your invoices in the billing portal
                  </p>
                </div>

                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">This Month's Cost</span>
                    <span className="text-sm font-medium">
                      ${(subscription.usage?.currentSpending ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Based on current usage
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Subscription Settings</h4>
              
              <div className="space-y-3">
                <div className="p-4 border border-border/50 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Billing Preferences</span>
                    <Button size="sm" variant="ghost" onClick={handleManageBilling}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Manage billing notifications and preferences
                  </p>
                </div>

                {(isActive || isTrialing) && (
                  <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-destructive">Cancel Subscription</span>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={handleCancelSubscription}
                        disabled={isLoading}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cancel your subscription. You'll retain access until the end of your billing period.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}