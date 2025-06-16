"use client";

import { useState, useCallback } from "react";
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
import { useBillingData } from "@/hooks/use-billing-data";
import { 
  CreditManager,
  SubscriptionModal
} from "./billing-components";
import { BillingActions } from "./components/billing-actions";

interface BillingDashboardProps {
  onBuyCredits?: () => void;
}

export function BillingDashboard({ 
  onBuyCredits
}: BillingDashboardProps = {}) {
  
  // Modal states
  const [isCreditManagerOpen, setIsCreditManagerOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

  const { 
    dashboardData,
    isLoading,
    error,
    refreshBillingData
  } = useBillingData();


  // Check if we have any data at all
  const hasAnyData = dashboardData !== null;
  


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


  // Temporarily disable loading state to debug
  // if (shouldShowLoading) {
  //   return (
  //     <div className="space-y-6">
  //       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  //         {[...Array(3)].map((_, i) => (
  //           <Card key={i} className="animate-pulse">
  //             <CardHeader className="space-y-0 pb-4">
  //               <div className="h-4 bg-muted rounded w-24"></div>
  //             </CardHeader>
  //             <CardContent>
  //               <div className="h-8 bg-muted rounded w-32 mb-2"></div>
  //               <div className="h-3 bg-muted rounded w-20"></div>
  //             </CardContent>
  //           </Card>
  //         ))}
  //       </div>
  //     </div>
  //   );
  // }

  // Only show error alert for complete failures when we have no data at all
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
      
      {/* Partial Data Loading Error Alert */}
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

      {/* Services Blocked Alert */}
      {dashboardData && 
       dashboardData.spendingDetails.currentSpendingUsd >= dashboardData.spendingDetails.spendingLimitUsd && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>AI Services Blocked</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-4">
              Your AI services have been blocked because you've reached your spending limit.
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
                onClick={handleBuyCredits}
              >
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Current Plan Card */}
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
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Trial
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  )
                )}
              </div>
              
              {dashboardData && dashboardData.planDetails.priceUsd > 0 ? (
                <div className="space-y-2">
                  <div className="text-lg font-semibold">
                    {formatCurrency(dashboardData.planDetails.priceUsd, "USD")}/{dashboardData.planDetails.billingInterval}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {dashboardData.subscriptionStatus === 'trialing' && dashboardData.trialEndsAt ? (
                      `Trial ends on ${new Date(dashboardData.trialEndsAt).toLocaleDateString()}`
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
                onClick={() => setIsSubscriptionModalOpen(true)}
                className="w-full mt-3"
              >
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Credit Balance Card */}
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
                {dashboardData ? formatCurrency(dashboardData.creditBalanceUsd, "USD") : (
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

        {/* Usage Summary Card */}
        <Card className="hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              This Month Usage
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

      {/* Billing Actions */}
      <BillingActions />

      {/* Modal Components */}
      <CreditManager
        isOpen={isCreditManagerOpen}
        onClose={() => setIsCreditManagerOpen(false)}
      />
      
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        currentStatus={dashboardData?.subscriptionStatus}
      />
    </div>
  );
}