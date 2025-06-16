"use client";

import { useState, useCallback, useEffect } from "react";
import { 
  CreditCard, 
  Zap, 
  Plus,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  BarChart3,
  RefreshCw
} from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { AnimatedNumber } from "@/ui/animated-number";
import { useBillingData } from "@/hooks/use-billing-data";
import { CreditManager } from "./billing-components";
import { SubscriptionModal } from "./components/subscription-modal";
import { BillingActions } from "./components/billing-actions";
import { openBillingPortal } from "@/actions/billing/portal.actions";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { open } from "@/utils/shell-utils";

interface BillingDashboardProps {
  onBuyCredits?: () => void;
}

export function BillingDashboard({ 
  onBuyCredits
}: BillingDashboardProps = {}) {
  const [isCreditManagerOpen, setIsCreditManagerOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [previousCreditBalance, setPreviousCreditBalance] = useState<number | null>(null);

  const { 
    dashboardData,
    spendingStatus,
    isLoading,
    error,
    refreshBillingData
  } = useBillingData();

  const { showNotification } = useNotification();

  const hasAnyData = dashboardData !== null;

  useEffect(() => {
    if (dashboardData?.creditBalanceUsd !== undefined) {
      setPreviousCreditBalance(dashboardData.creditBalanceUsd);
    }
  }, [dashboardData?.creditBalanceUsd]);

  useEffect(() => {
    const handleOpenSubscriptionModal = () => {
      setIsSubscriptionModalOpen(true);
    };

    window.addEventListener('open-subscription-modal', handleOpenSubscriptionModal);
    
    return () => {
      window.removeEventListener('open-subscription-modal', handleOpenSubscriptionModal);
    };
  }, []);

  useEffect(() => {
    // Check for upgrade parameter in URL to auto-open subscription modal
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upgrade') === 'true') {
      setIsSubscriptionModalOpen(true);
      // Clean up the URL parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('upgrade');
      window.history.replaceState(null, '', newUrl.toString());
    }
  }, []);


  const formatCurrency = useCallback((amount: number, currency = "USD") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }, []);

  const handleBuyCredits = useCallback(() => {
    if (onBuyCredits) {
      onBuyCredits();
    } else {
      setIsCreditManagerOpen(true);
    }
  }, [onBuyCredits]);

  const handleUpgradePlan = useCallback(async () => {
    // Check if user has a paid plan
    const hasPaidPlan = dashboardData && dashboardData.planDetails.priceUsd > 0;
    
    if (hasPaidPlan) {
      // For paid plan users: open billing portal
      try {
        const portalUrl = await openBillingPortal();
        await open(portalUrl);
        
        showNotification({
          title: "Billing Portal Opened",
          message: "Plan management is handled through Stripe's secure billing portal.",
          type: "success",
        });
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        showNotification({
          title: "Portal Access Failed",
          message: errorMessage,
          type: "error",
        });
      }
    } else {
      // For free/trial users: open in-app subscription modal
      setIsSubscriptionModalOpen(true);
    }
  }, [dashboardData, showNotification]);


  if (error && !hasAnyData) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to Load Billing Dashboard</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-4">{error}</p>
          <Button 
            onClick={refreshBillingData} 
            variant="outline" 
            size="sm"
            className="bg-background hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }


  return (
    <div className="space-y-6" role="main" aria-label="Billing Dashboard">
      
      {error && hasAnyData && (
        <Alert variant="default" className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">Partial Data Loading Issue</AlertTitle>
          <AlertDescription className="mt-2 text-orange-700">
            <p className="mb-3">Some billing information could not be loaded: {error}</p>
            <Button 
              onClick={refreshBillingData} 
              variant="outline" 
              size="sm"
              className="bg-background hover:bg-muted border-orange-300"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Retry Loading
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {spendingStatus?.servicesBlocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>AI Services Blocked</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-4">
              Your AI services have been blocked because you've exceeded your spending limit.
            </p>
            <div className="flex gap-3">
              <Button 
                size="sm" 
                onClick={handleBuyCredits}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Buy Credits
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleUpgradePlan}
              >
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  {dashboardData ? dashboardData.planDetails.name : "Free"}
                </div>
                {dashboardData && (
                  dashboardData.subscriptionStatus === 'trialing' ? (
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
              
              {dashboardData && dashboardData.subscriptionStatus === 'trialing' && dashboardData.trialEndsAt && (
                <div className="mt-3">
                  {(() => {
                    const trialEndDate = new Date(dashboardData.trialEndsAt);
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
              
              {dashboardData && dashboardData.planDetails.priceUsd > 0 ? (
                <div className="space-y-2">
                  <div className="text-lg font-semibold">
                    {formatCurrency(dashboardData.planDetails.priceUsd, "USD")}/{dashboardData.planDetails.billingInterval}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {dashboardData.subscriptionStatus === 'trialing' && dashboardData.trialEndsAt ? (
                      `Trial ends ${new Date(dashboardData.trialEndsAt).toLocaleDateString()}`
                    ) : (
                      `Period ends: ${new Date(dashboardData.spendingDetails.periodEnd).toLocaleDateString()}`
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
                onClick={handleUpgradePlan}
                className="w-full mt-3"
              >
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>

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
                {dashboardData ? (
                  <AnimatedNumber
                    value={dashboardData.creditBalanceUsd}
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
                onClick={handleBuyCredits}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Buy Credits
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              This Month's Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardData ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {formatCurrency(dashboardData.spendingDetails.currentSpendingUsd, "USD")} / 
                      {formatCurrency(dashboardData.spendingDetails.spendingLimitUsd, "USD")}
                    </span>
                    <span className="font-medium">
                      {((dashboardData.spendingDetails.currentSpendingUsd / dashboardData.spendingDetails.spendingLimitUsd) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-500 ${
                        (dashboardData.spendingDetails.currentSpendingUsd / dashboardData.spendingDetails.spendingLimitUsd) >= 0.9 ? 'bg-red-500' :
                        (dashboardData.spendingDetails.currentSpendingUsd / dashboardData.spendingDetails.spendingLimitUsd) >= 0.7 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min((dashboardData.spendingDetails.currentSpendingUsd / dashboardData.spendingDetails.spendingLimitUsd) * 100, 100)}%` }}
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
      </div>

      <BillingActions />

      <CreditManager
        isOpen={isCreditManagerOpen}
        onClose={() => setIsCreditManagerOpen(false)}
      />
      
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        onSubscriptionComplete={() => {
          setIsSubscriptionModalOpen(false);
          refreshBillingData();
        }}
      />
    </div>
  );
}