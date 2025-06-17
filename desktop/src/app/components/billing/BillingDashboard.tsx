"use client";

import { useState, useCallback, useEffect } from "react";
import { 
  CreditCard, 
  Zap,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

import { Button } from "@/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { useBillingData } from "@/hooks/use-billing-data";
import { CreditManager } from "./billing-components";
import { SubscriptionModal } from "./components/subscription-modal";
import { BillingActions } from "./components/billing-actions";
import { PlanCard } from "./components/PlanCard";
import { CreditBalanceCard } from "./components/CreditBalanceCard";
import { UsageCard } from "./components/UsageCard";
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
        <PlanCard
          planDetails={dashboardData?.planDetails}
          subscriptionStatus={dashboardData?.subscriptionStatus}
          trialEndsAt={dashboardData?.trialEndsAt}
          spendingDetails={dashboardData?.spendingDetails}
          onUpgradePlan={handleUpgradePlan}
        />

        <CreditBalanceCard
          creditBalanceUsd={dashboardData?.creditBalanceUsd}
          previousCreditBalance={previousCreditBalance}
          onBuyCredits={handleBuyCredits}
        />

        <UsageCard
          spendingDetails={dashboardData?.spendingDetails}
          isLoading={isLoading}
        />
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