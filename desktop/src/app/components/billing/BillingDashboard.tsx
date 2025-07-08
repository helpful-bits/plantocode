"use client";

import { useState, useEffect } from "react";
import { 
  Zap,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  Plus,
  FileWarning
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
    refreshBillingData
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