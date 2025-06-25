"use client";

import { useState, useEffect } from "react";
import { 
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
import { useBillingData } from "@/hooks/use-billing-data";
import { CreditManager, PaymentMethodsList, InvoicesList, CreditTransactionHistory } from "./billing-components";
import { SubscriptionModal } from "./components/subscription-modal";
import { AutoTopOffSettings } from "./components/AutoTopOffSettings";
import { formatUsdCurrency } from "@/utils/currency-utils";

interface BillingDashboardProps {}

interface BillingOverviewCardProps {
  planDetails?: {
    name: string;
    priceUsd: number;
    billingInterval: string;
  };
  subscriptionStatus?: string;
  trialEndsAt?: string;
  creditBalanceUsd?: number;
  onManageSubscription: () => void;
  onBuyCredits: () => void;
}

function BillingOverviewCard({
  planDetails,
  subscriptionStatus,
  trialEndsAt,
  creditBalanceUsd,
  onManageSubscription,
  onBuyCredits
}: BillingOverviewCardProps) {
  const isLowBalance = creditBalanceUsd !== undefined && creditBalanceUsd < 1.0;
  const isZeroBalance = creditBalanceUsd !== undefined && creditBalanceUsd <= 0;

  return (
    <Card className="border-2 border-primary/10 bg-gradient-to-br from-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-bold flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          Billing Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Top-up Credits
              </h4>
            </div>
            <div className={`text-5xl font-black mb-4 ${isZeroBalance ? 'text-red-600' : isLowBalance ? 'text-amber-600' : 'text-primary'}`}>
              {creditBalanceUsd !== undefined ? (
                formatUsdCurrency(creditBalanceUsd)
              ) : (
                <span className="text-muted-foreground">Loading...</span>
              )}
            </div>
            {isLowBalance && (
              <div className={`text-sm font-medium mb-4 px-3 py-2 rounded-lg ${isZeroBalance ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {isZeroBalance ? 'No credits remaining - services are blocked' : 'Low credit balance - consider purchasing more credits'}
              </div>
            )}
            <Button 
              size="lg" 
              onClick={onBuyCredits}
              className={`w-full font-semibold shadow-md hover:shadow-lg transition-all duration-200 ${isZeroBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'}`}
            >
              <Plus className="h-5 w-5 mr-2" />
              Buy Credits
            </Button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-3xl font-bold text-foreground">
                  {planDetails ? planDetails.name : "Free Plan"}
                </h3>
                {planDetails && planDetails.priceUsd > 0 ? (
                  <div className="text-lg font-semibold text-muted-foreground mt-1">
                    {planDetails.name}, {formatUsdCurrency(planDetails.priceUsd)}/{planDetails.billingInterval}
                  </div>
                ) : (
                  <div className="text-lg font-medium text-muted-foreground mt-1">
                    Pay-as-you-go with credits only
                  </div>
                )}
              </div>
              {planDetails ? (
                subscriptionStatus === 'trialing' ? (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300 font-semibold px-3 py-1">
                    Trial Active
                  </Badge>
                ) : subscriptionStatus === 'active' ? (
                  <Badge variant="default" className="bg-green-100 text-green-800 border-green-300 font-semibold px-3 py-1">
                    Active Plan
                  </Badge>
                ) : subscriptionStatus === 'canceled' ? (
                  <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300 font-semibold px-3 py-1">
                    Cancelled
                  </Badge>
                ) : subscriptionStatus === 'past_due' ? (
                  <Badge variant="destructive" className="bg-orange-100 text-orange-800 border-orange-300 font-semibold px-3 py-1">
                    Past Due
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-semibold px-3 py-1">
                    {subscriptionStatus ? subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1) : 'Unknown'}
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300 font-semibold px-3 py-1">
                  Free Plan
                </Badge>
              )}
            </div>
            
            {planDetails && subscriptionStatus === 'trialing' && trialEndsAt && (
              <div className="space-y-2">
                {(() => {
                  const trialEndDate = new Date(trialEndsAt);
                  const today = new Date();
                  const timeDiff = trialEndDate.getTime() - today.getTime();
                  const daysLeft = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
                  
                  return (
                    <div className="space-y-2">
                      <Badge 
                        variant={daysLeft === 0 ? "destructive" : daysLeft < 3 ? "destructive" : daysLeft < 7 ? "secondary" : "default"}
                        className="w-full justify-center font-medium py-2 text-sm"
                      >
                        {daysLeft === 0 ? 'Trial Expired' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
                      </Badge>
                      <div className="text-sm text-muted-foreground text-center">
                        Trial ends {new Date(trialEndsAt).toLocaleDateString('en-US', { 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            
            <Button 
              onClick={onManageSubscription}
              variant="outline"
              className="w-full font-semibold border-2 hover:bg-muted/80 hover:border-primary/30 transition-all duration-200"
              size="lg"
            >
              <Settings className="h-4 w-4 mr-2" />
              {planDetails && planDetails.priceUsd > 0 ? (
                subscriptionStatus === 'canceled' ? 'Reactivate Subscription' : 
                subscriptionStatus === 'past_due' ? 'Update Payment Method' :
                'Manage Subscription'
              ) : 'Upgrade to Pro Plan'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingDashboard({}: BillingDashboardProps = {}) {
  const [isCreditManagerOpen, setIsCreditManagerOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

  const { 
    dashboardData,
    isLoading,
    error,
    refreshBillingData
  } = useBillingData();


  const hasAnyData = dashboardData !== null;


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
    // Check for URL parameters to auto-open modals
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upgrade') === 'true') {
      setIsSubscriptionModalOpen(true);
      // Clean up the URL parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('upgrade');
      window.history.replaceState(null, '', newUrl.toString());
    }
    if (urlParams.get('credits') === 'true') {
      setIsCreditManagerOpen(true);
      // Clean up the URL parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('credits');
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
    <div className="space-y-8" role="main" aria-label="Billing Dashboard">
      
      {dashboardData?.servicesBlocked && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-red-800 font-semibold">Services Blocked</AlertTitle>
          <AlertDescription className="flex items-center justify-between mt-2">
            <span className="text-red-700">Your AI services are currently blocked due to zero credit balance. Please add credits to continue using the service.</span>
            <Button 
              size="sm" 
              onClick={() => setIsCreditManagerOpen(true)}
              className="ml-4 bg-red-600 hover:bg-red-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Buy Credits
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && hasAnyData && (
        <Alert variant="default" className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="text-amber-800 font-semibold">Partial Data Loading Issue</AlertTitle>
          <AlertDescription className="mt-2 text-amber-700">
            <p className="mb-3">Some billing information could not be loaded: {error}</p>
            <Button 
              onClick={refreshBillingData} 
              variant="outline" 
              size="sm"
              className="bg-background hover:bg-muted border-amber-300"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Retry Loading
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <BillingOverviewCard
        planDetails={dashboardData?.planDetails}
        subscriptionStatus={dashboardData?.subscriptionStatus}
        trialEndsAt={dashboardData?.trialEndsAt}
        creditBalanceUsd={dashboardData?.creditBalanceUsd}
        onManageSubscription={() => setIsSubscriptionModalOpen(true)}
        onBuyCredits={() => setIsCreditManagerOpen(true)}
      />

      <div className="grid gap-8">
        <div className="space-y-8">
          <AutoTopOffSettings className="transition-all duration-200 hover:shadow-lg" />
          
          <PaymentMethodsList className="transition-all duration-200 hover:shadow-lg" />
          
          <CreditTransactionHistory className="transition-all duration-200 hover:shadow-lg" />
          
          <InvoicesList className="transition-all duration-200 hover:shadow-lg" />
        </div>
      </div>

      <CreditManager
        isOpen={isCreditManagerOpen}
        onClose={() => {
          setIsCreditManagerOpen(false);
          refreshBillingData();
        }}
      />
      
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => {
          setIsSubscriptionModalOpen(false);
          refreshBillingData();
        }}
        onSubscriptionComplete={() => {
          setIsSubscriptionModalOpen(false);
          refreshBillingData();
        }}
        dashboardData={dashboardData}
      />
    </div>
  );
}