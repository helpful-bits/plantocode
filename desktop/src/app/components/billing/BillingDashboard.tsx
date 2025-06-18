"use client";

import { useState, useEffect } from "react";
import { 
  CreditCard, 
  Zap,
  AlertTriangle,
  RefreshCw,
  Settings,
  DollarSign,
  Plus
} from "lucide-react";

import { Button } from "@/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { AnimatedNumber } from "@/ui/animated-number";
import { useBillingData } from "@/hooks/use-billing-data";
import { CreditManager, PaymentMethodsList, InvoicesList, CreditTransactionHistory } from "./billing-components";
import { SubscriptionModal } from "./components/subscription-modal";
import { formatUsdCurrency } from "@/utils/currency-utils";

interface BillingDashboardProps {}

// Integrated Plan & Usage Card Component
interface BillingOverviewCardProps {
  planDetails?: {
    name: string;
    price: number;
    currency: string;
    billingInterval: string;
  };
  subscriptionStatus?: string;
  trialEndsAt?: string;
  spendingDetails?: {
    currentSpendingUsd: number;
    spendingLimitUsd: number;
    periodEnd: string;
  };
  creditBalanceUsd?: number;
  previousCreditBalance?: number | null;
  onManageSubscription: () => void;
  onBuyCredits: () => void;
}

function BillingOverviewCard({
  planDetails,
  subscriptionStatus,
  trialEndsAt,
  spendingDetails,
  creditBalanceUsd,
  previousCreditBalance,
  onManageSubscription,
  onBuyCredits
}: BillingOverviewCardProps) {
  return (
    <Card className="hover:shadow-md transition-all duration-200 col-span-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Plan & Credits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan Information */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">
                  {planDetails ? planDetails.name : "Free"}
                </h3>
                {planDetails && planDetails.price > 0 && (
                  <div className="text-lg font-semibold text-muted-foreground">
                    {formatUsdCurrency(planDetails.price)}/{planDetails.billingInterval}
                  </div>
                )}
              </div>
              {planDetails && (
                subscriptionStatus === 'trialing' ? (
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                    Trial
                  </Badge>
                ) : (
                  <Badge variant="success" className="bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                )
              )}
            </div>
            
            {planDetails && subscriptionStatus === 'trialing' && trialEndsAt && (
              <div>
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
            
            {planDetails && spendingDetails && (
              <div className="text-sm text-muted-foreground">
                {subscriptionStatus === 'trialing' && trialEndsAt ? (
                  `Trial ends ${new Date(trialEndsAt).toLocaleDateString()}`
                ) : (
                  `Period ends: ${new Date(spendingDetails.periodEnd).toLocaleDateString()}`
                )}
              </div>
            )}
            
            <Button 
              size="sm" 
              onClick={onManageSubscription}
              className="w-full"
            >
              <Settings className="h-4 w-4 mr-2" />
              Manage Subscription
            </Button>
          </div>

          {/* Credit Balance */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4" />
                Credit Balance
              </h4>
              <div className="text-2xl font-bold mb-4">
                {creditBalanceUsd !== undefined ? (
                  <AnimatedNumber
                    value={creditBalanceUsd}
                    previousValue={previousCreditBalance}
                    formatValue={(value) => formatUsdCurrency(value)}
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingDashboard({}: BillingDashboardProps = {}) {
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

  useEffect(() => {
    const handleOpenCreditManager = () => {
      setIsCreditManagerOpen(true);
    };

    window.addEventListener('open-credit-manager', handleOpenCreditManager);
    
    return () => {
      window.removeEventListener('open-credit-manager', handleOpenCreditManager);
    };
  }, []);






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
                onClick={() => setIsCreditManagerOpen(true)}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Buy Credits
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setIsSubscriptionModalOpen(true)}
              >
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* New three-section layout */}
      <div className="space-y-6">
        {/* Section 1: Current Plan & Usage */}
        <BillingOverviewCard
          planDetails={dashboardData?.planDetails}
          subscriptionStatus={dashboardData?.subscriptionStatus}
          trialEndsAt={dashboardData?.trialEndsAt}
          spendingDetails={dashboardData?.spendingDetails}
          creditBalanceUsd={dashboardData?.creditBalanceUsd}
          previousCreditBalance={previousCreditBalance}
          onManageSubscription={() => setIsSubscriptionModalOpen(true)}
          onBuyCredits={() => setIsCreditManagerOpen(true)}
        />

        {/* Section 2: Payment Methods */}
        <PaymentMethodsList className="hover:shadow-md transition-all duration-200" />

        {/* Section 3: Credit Transaction History */}
        <CreditTransactionHistory className="hover:shadow-md transition-all duration-200" />

        {/* Section 4: Billing History */}
        <InvoicesList className="hover:shadow-md transition-all duration-200" />
      </div>

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
        dashboardData={dashboardData}
      />
    </div>
  );
}