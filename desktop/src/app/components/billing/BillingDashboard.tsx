"use client";

import { useState, useCallback } from "react";
import { 
  CreditCard, 
  Zap, 
  Plus,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  BarChart3,
  RefreshCw,
  Bell,
  FileText
} from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { useNotification } from "@/contexts/notification-context";
import { useBillingData } from "@/hooks/use-billing-data";
import { getErrorMessage } from "@/utils/error-handling";
import { openBillingPortal } from "@/actions/billing/portal.actions";
import { 
  CreditManager,
  PaymentMethodsManager,
  SpendingAlertManager,
  InvoiceHistoryManager
} from "./billing-components";

interface BillingDashboardProps {
  onBuyCredits?: () => void;
}

export function BillingDashboard({ 
  onBuyCredits
}: BillingDashboardProps = {}) {
  
  // Modal states
  const [isCreditManagerOpen, setIsCreditManagerOpen] = useState(false);
  const [isPaymentMethodsOpen, setIsPaymentMethodsOpen] = useState(false);
  const [isAlertManagerOpen, setIsAlertManagerOpen] = useState(false);
  const [isInvoiceHistoryOpen, setIsInvoiceHistoryOpen] = useState(false);

  const { showNotification } = useNotification();
  const { 
    spendingStatus,
    subscriptionDetails,
    creditBalance,
    isLoading,
    error,
    refreshBillingData
  } = useBillingData();


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

  const handleChangePlan = useCallback(async () => {
    // Open billing portal directly for plan changes
    try {
      const portalUrl = await openBillingPortal();
      window.open(portalUrl, '_blank');
      
      showNotification({
        title: "Billing Portal Opened",
        message: "Plan changes are handled through Stripe's secure billing portal.",
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
  }, [showNotification]);

  const openStripePortal = useCallback(async () => {
    try {
      const portalUrl = await openBillingPortal();
      window.open(portalUrl, '_blank');
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Portal Access Failed",
        message: errorMessage,
        type: "error",
      });
    }
  }, [showNotification]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-0 pb-4">
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-32 mb-2"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
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

      {/* Services Blocked Alert */}
      {spendingStatus?.servicesBlocked && (
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
                onClick={handleChangePlan}
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
                  {subscriptionDetails?.planName || "Free"}
                </div>
                {subscriptionDetails?.status === 'active' && (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
              
              {subscriptionDetails && subscriptionDetails.nextInvoiceAmount && subscriptionDetails.nextInvoiceAmount > 0 ? (
                <div className="space-y-2">
                  <div className="text-lg font-semibold">
                    {formatCurrency(subscriptionDetails.nextInvoiceAmount, subscriptionDetails.currency)}/month
                  </div>
                  {subscriptionDetails.currentPeriodEndsAt && (
                    <div className="text-sm text-muted-foreground">
                      Next billing: {new Date(subscriptionDetails.currentPeriodEndsAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No active subscription
                </div>
              )}
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
                {creditBalance !== null ? formatCurrency(creditBalance, spendingStatus?.currency || "USD") : "$0.00"}
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
              {spendingStatus ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {formatCurrency(spendingStatus.currentSpending, spendingStatus.currency)} / 
                      {formatCurrency(spendingStatus.includedAllowance, spendingStatus.currency)}
                    </span>
                    <span className="font-medium">
                      {spendingStatus.usagePercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-500 ${
                        spendingStatus.usagePercentage >= 90 ? 'bg-red-500' :
                        spendingStatus.usagePercentage >= 70 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(spendingStatus.usagePercentage, 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No usage data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              onClick={handleChangePlan}
              className="justify-start h-auto p-4"
            >
              <ExternalLink className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Change Plan</div>
                <div className="text-xs text-muted-foreground">Manage in billing portal</div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              onClick={() => setIsPaymentMethodsOpen(true)}
              className="justify-start h-auto p-4"
            >
              <CreditCard className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Payment Methods</div>
                <div className="text-xs text-muted-foreground">Add, view & manage</div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              onClick={openStripePortal}
              className="justify-start h-auto p-4"
            >
              <ExternalLink className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Billing Portal</div>
                <div className="text-xs text-muted-foreground">Full billing access</div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              onClick={() => setIsInvoiceHistoryOpen(true)}
              className="justify-start h-auto p-4"
            >
              <FileText className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Invoice History</div>
                <div className="text-xs text-muted-foreground">View & download PDFs</div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              onClick={() => setIsAlertManagerOpen(true)}
              className="justify-start h-auto p-4"
            >
              <Bell className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Spending Alerts</div>
                <div className="text-xs text-muted-foreground">Review notifications</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal Components */}
      <CreditManager
        isOpen={isCreditManagerOpen}
        onClose={() => setIsCreditManagerOpen(false)}
      />


      <PaymentMethodsManager
        isOpen={isPaymentMethodsOpen}
        onClose={() => setIsPaymentMethodsOpen(false)}
        onPaymentMethodsUpdated={refreshBillingData}
      />

      <SpendingAlertManager
        isOpen={isAlertManagerOpen}
        onClose={() => setIsAlertManagerOpen(false)}
        currentSpending={spendingStatus}
        onAlertsUpdated={refreshBillingData}
      />

      <InvoiceHistoryManager
        isOpen={isInvoiceHistoryOpen}
        onClose={() => setIsInvoiceHistoryOpen(false)}
      />
    </div>
  );
}