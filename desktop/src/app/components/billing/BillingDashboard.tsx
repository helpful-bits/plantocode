"use client";

import { useState, useEffect } from "react";
import { 
  Zap,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  Plus,
  FileWarning,
  Clock
} from "lucide-react";

import { Button } from "@/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { useBillingData } from "@/hooks/use-billing-data";
import { CreditManager, PaymentMethodsList, InvoicesList, BillingHistory } from "./billing-components";
import { AutoTopOffSettings } from "./components/AutoTopOffSettings";
import { formatUsdCurrency } from "@/utils/currency-utils";
import { openBillingPortal } from "@/actions/billing";
import { open } from "@tauri-apps/plugin-shell";

interface BillingDashboardProps {}


export function BillingDashboard({}: BillingDashboardProps = {}) {
  const [isCreditManagerOpen, setIsCreditManagerOpen] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const { 
    dashboardData,
    isLoading,
    error,
    refreshBillingData,
    freeCreditBalanceUsd,
    usageLimitUsd,
    currentUsage,
    freeCreditsExpiresAt
  } = useBillingData();


  const hasAnyData = dashboardData !== null;


  useEffect(() => {
    // Check for URL parameters to auto-open modals
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('credits') === 'true') {
      setIsCreditManagerOpen(true);
      // Clean up the URL parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('credits');
      window.history.replaceState(null, '', newUrl.toString());
    }
    
    // Check for session_id (post-payment handling)
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      // Verify payment status and refresh billing data
      const verifyPayment = async () => {
        try {
          await refreshBillingData();
        } catch (err) {
          console.error('Error verifying payment:', err);
        }
      };
      verifyPayment();
      
      // Clean up the URL parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('session_id');
      window.history.replaceState(null, '', newUrl.toString());
    }
  }, [refreshBillingData]);

  useEffect(() => {
    const handleOpenCreditManager = () => {
      setIsCreditManagerOpen(true);
    };
    
    const handleBillingDataUpdated = () => {
      refreshBillingData();
    };

    window.addEventListener('open-credit-manager', handleOpenCreditManager);
    window.addEventListener('billing-data-updated', handleBillingDataUpdated);
    
    return () => {
      window.removeEventListener('open-credit-manager', handleOpenCreditManager);
      window.removeEventListener('billing-data-updated', handleBillingDataUpdated);
    };
  }, [refreshBillingData]);

  const handleUpdateBillingInfo = async () => {
    try {
      setIsOpeningPortal(true);
      const portalUrl = await openBillingPortal();
      await open(portalUrl);
    } catch (err) {
      console.error("Billing portal error:", err);
      // Handle error silently or show notification if needed
    } finally {
      setIsOpeningPortal(false);
    }
  };
  
  // Calculate free tier usage percentage
  const freeTierUsagePercentage = usageLimitUsd > 0 ? Math.min((currentUsage / usageLimitUsd) * 100, 100) : 0;
  const isFreeTierWarning = freeTierUsagePercentage >= 80 && freeTierUsagePercentage < 100;
  const isFreeTierExhausted = freeTierUsagePercentage >= 100;
  
  // Determine progress bar color based on usage
  const getProgressBarColor = () => {
    if (freeTierUsagePercentage < 50) return "bg-green-500";
    if (freeTierUsagePercentage < 80) return "bg-yellow-500";
    if (freeTierUsagePercentage < 100) return "bg-orange-500";
    return "bg-red-500";
  };






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
      
      {(dashboardData?.isPaymentMethodRequired || dashboardData?.isBillingInfoRequired) && (
        <Alert variant="destructive" className="border-orange-200 bg-orange-50">
          <FileWarning className="h-5 w-5" />
          <AlertTitle className="text-orange-800 font-semibold">Action Required</AlertTitle>
          <AlertDescription className="flex items-center justify-between mt-2">
            <span className="text-orange-700">
              {dashboardData?.isPaymentMethodRequired && dashboardData?.isBillingInfoRequired
                ? "A payment method and complete billing information are required to ensure uninterrupted service."
                : dashboardData?.isPaymentMethodRequired
                ? "A payment method is required to ensure uninterrupted service."
                : "Complete billing information is required to ensure uninterrupted service."
              }
            </span>
            <Button 
              size="sm" 
              onClick={handleUpdateBillingInfo}
              disabled={isOpeningPortal}
              className="ml-4 bg-orange-600 hover:bg-orange-700"
            >
              {isOpeningPortal ? "Opening..." : "Update Information Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
      
      {/* Free Tier Usage Alerts */}
      {freeCreditBalanceUsd > 0 && isFreeTierWarning && !isFreeTierExhausted && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <AlertTitle className="text-orange-800 font-semibold">Free Credits Running Low</AlertTitle>
          <AlertDescription className="flex items-center justify-between mt-2">
            <span className="text-orange-700">
              You've used {freeTierUsagePercentage.toFixed(0)}% of your free credits. Consider purchasing additional credits to ensure uninterrupted service.
            </span>
            <Button 
              size="sm" 
              onClick={() => setIsCreditManagerOpen(true)}
              className="ml-4 bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Buy Credits
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {freeCreditBalanceUsd > 0 && isFreeTierExhausted && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-red-800 font-semibold">Free Credits Exhausted</AlertTitle>
          <AlertDescription className="flex items-center justify-between mt-2">
            <span className="text-red-700">
              Your free credits have been fully used. Purchase credits now to continue using AI services.
            </span>
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

      <Card className="border-2 border-primary/10 bg-gradient-to-br from-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Current Balance
                </h4>
              </div>
              <div className={`text-5xl font-black mb-4 ${dashboardData?.creditBalanceUsd !== undefined && dashboardData.creditBalanceUsd <= 0 ? 'text-red-600' : dashboardData?.creditBalanceUsd !== undefined && dashboardData.creditBalanceUsd < 1.0 ? 'text-amber-600' : 'text-primary'}`}>
                {dashboardData?.creditBalanceUsd !== undefined ? (
                  formatUsdCurrency(dashboardData.creditBalanceUsd)
                ) : (
                  <span className="text-muted-foreground">Loading...</span>
                )}
              </div>
            </div>
            
            {/* Free Tier Usage Progress */}
            {freeCreditBalanceUsd > 0 && (
              <div className="space-y-3 max-w-md mx-auto">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Free Credit Usage</span>
                  <span className="font-medium">{freeTierUsagePercentage.toFixed(0)}%</span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/60 backdrop-blur-sm border border-border/30">
                  <div 
                    className={`h-full w-full flex-1 ${getProgressBarColor()} transition-all`}
                    style={{ transform: `translateX(-${100 - freeTierUsagePercentage}%)` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatUsdCurrency(currentUsage)} used</span>
                  <span>{formatUsdCurrency(usageLimitUsd)} limit</span>
                </div>
                {freeCreditsExpiresAt && (
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Expires {new Date(freeCreditsExpiresAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            )}
            
            <Button 
              size="lg" 
              onClick={() => setIsCreditManagerOpen(true)}
              className={`w-full max-w-md font-semibold shadow-md hover:shadow-lg transition-all duration-200 ${dashboardData?.creditBalanceUsd !== undefined && dashboardData.creditBalanceUsd <= 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'}`}
            >
              <Plus className="h-5 w-5 mr-2" />
              Buy Credits
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-8">
        <div className="space-y-8">
          <AutoTopOffSettings className="transition-all duration-200 hover:shadow-lg" />
          
          <PaymentMethodsList className="transition-all duration-200 hover:shadow-lg" />
          
          <BillingHistory className="transition-all duration-200 hover:shadow-lg" />
          
          <InvoicesList className="transition-all duration-200 hover:shadow-lg" />
        </div>
      </div>

      <CreditManager
        isOpen={isCreditManagerOpen}
        onClose={() => setIsCreditManagerOpen(false)}
      />
      
    </div>
  );
}