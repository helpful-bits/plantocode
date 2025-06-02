"use client";

import { useState, useEffect } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  AlertTriangle,
  Download,
  BarChart3,
  PieChart,
  History
} from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Progress } from "@/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useNotification } from "@/contexts/notification-context";
import { invoke } from "@tauri-apps/api/core";
import { getErrorMessage } from "@/utils/error-handling";

interface SpendingAnalytics {
  userId: string;
  periodMonths: number;
  currentStatus: SpendingStatus;
  summary: SpendingSummary;
  trends: SpendingTrend[];
  monthlyAverage: number;
  projectedMonthEndSpending: number;
  spendingTrend: "increasing" | "decreasing" | "stable" | "insufficient_data";
  costPerRequest: number;
  costPerToken: number;
  daysUntilLimit?: number;
  generatedAt: string;
}

interface SpendingStatus {
  currentSpending: number;
  includedAllowance: number;
  remainingAllowance: number;
  overageAmount: number;
  usagePercentage: number;
  servicesBlocked: boolean;
  hardLimit: number;
  nextBillingDate: string;
  currency: string;
  alerts: SpendingAlert[];
}

interface SpendingSummary {
  totalSpending: number;
  totalOverage: number;
  totalRequests: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalPeriods: number;
}

interface SpendingTrend {
  periodStart: string;
  totalSpending: number;
  overageAmount: number;
  totalRequests: number;
  planId: string;
}

interface SpendingAlert {
  id: string;
  alertType: string;
  thresholdAmount: number;
  currentSpending: number;
  alertSentAt: string;
  acknowledged: boolean;
}

interface SpendingForecast {
  userId: string;
  monthsAhead: number;
  totalProjectedSpending: number;
  monthlyForecasts: MonthlyForecast[];
  basedOnMonths: number;
  confidenceLevel: number;
  generatedAt: string;
}

interface MonthlyForecast {
  monthOffset: number;
  projectedSpending: number;
  confidenceLevel: number;
}

interface PaymentMethod {
  id: string;
  typeName: string;
  lastFour?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  createdDate: string;
}

interface PaymentMethodsResponse {
  paymentMethods: PaymentMethod[];
  hasDefault: boolean;
}

interface InvoiceHistoryEntry {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdDate: string;
  dueDate?: string;
  paidDate?: string;
  invoicePdf?: string;
  description: string;
}

interface InvoiceHistoryResponse {
  invoices: InvoiceHistoryEntry[];
  totalCount: number;
  hasMore: boolean;
}

export function ComprehensiveBillingDashboard() {
  const [analytics, setAnalytics] = useState<SpendingAnalytics | null>(null);
  const [forecast, setForecast] = useState<SpendingForecast | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsResponse | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all billing data with individual error handling
      const results = await Promise.allSettled([
        invoke<SpendingAnalytics>("get_spending_analytics_command"),
        invoke<SpendingForecast>("get_spending_forecast_command"),
        invoke<PaymentMethodsResponse>("get_payment_methods_command"),
        invoke<InvoiceHistoryResponse>("get_invoice_history_command"),
      ]);

      const [analyticsResult, forecastResult, paymentMethodsResult, invoiceResult] = results;
      
      // Handle analytics data
      if (analyticsResult.status === 'fulfilled') {
        setAnalytics(analyticsResult.value);
      } else {
        console.error('Failed to load analytics:', analyticsResult.reason);
      }
      
      // Handle forecast data
      if (forecastResult.status === 'fulfilled') {
        setForecast(forecastResult.value);
      } else {
        console.error('Failed to load forecast:', forecastResult.reason);
      }
      
      // Handle payment methods data
      if (paymentMethodsResult.status === 'fulfilled') {
        setPaymentMethods(paymentMethodsResult.value);
      } else {
        console.error('Failed to load payment methods:', paymentMethodsResult.reason);
      }
      
      // Handle invoice history data
      if (invoiceResult.status === 'fulfilled') {
        setInvoiceHistory(invoiceResult.value);
      } else {
        console.error('Failed to load invoice history:', invoiceResult.reason);
      }
      
      // Check if any critical data failed to load
      const failedRequests = results.filter(result => result.status === 'rejected');
      if (failedRequests.length === results.length) {
        // All requests failed
        const firstError = getErrorMessage(failedRequests[0].reason);
        throw new Error(firstError);
      } else if (failedRequests.length > 0) {
        // Some requests failed
        const errorCount = failedRequests.length;
        const totalCount = results.length;
        showNotification({
          title: "Partial Data Load",
          message: `${errorCount} of ${totalCount} billing data sections could not be loaded. Some information may be incomplete.`,
          type: "warning",
        });
      }
      
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      
      // Provide specific error messages based on error type
      let userMessage = "Failed to load billing dashboard";
      let errorType: 'auth' | 'network' | 'billing' | 'unknown' = 'unknown';
      
      if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
        userMessage = "Authentication required. Please log in again to view billing data.";
        errorType = 'auth';
      } else if (errorMessage.includes("403") || errorMessage.includes("forbidden")) {
        userMessage = "Access denied. You may not have permission to view billing information.";
        errorType = 'auth';
      } else if (errorMessage.includes("network") || errorMessage.includes("connection") || errorMessage.includes("timeout")) {
        userMessage = "Network error. Please check your internet connection and try again.";
        errorType = 'network';
      } else if (errorMessage.includes("billing") || errorMessage.includes("subscription") || errorMessage.includes("payment")) {
        userMessage = "Billing service temporarily unavailable. Please try again later.";
        errorType = 'billing';
      }
      
      setError(userMessage);
      showNotification({
        title: errorType === 'auth' ? "Authentication Error" :
               errorType === 'network' ? "Connection Error" :
               errorType === 'billing' ? "Billing Service Error" : "Failed to Load Billing Data",
        message: userMessage,
        type: "error",
        actionButton: {
          label: "Retry",
          onClick: () => loadBillingData(),
          variant: "outline"
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case "decreasing":
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <BarChart3 className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "open":
        return "bg-blue-100 text-blue-800";
      case "past_due":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load billing dashboard: {error}</span>
          </div>
          <Button 
            onClick={loadBillingData} 
            variant="outline" 
            className="mt-4"
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.currentStatus.currentSpending, analytics.currentStatus.currency)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{analytics.currentStatus.usagePercentage.toFixed(1)}% of allowance used</span>
              {analytics.currentStatus.servicesBlocked && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  Blocked
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monthly Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.monthlyAverage, analytics.currentStatus.currency)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {getTrendIcon(analytics.spendingTrend)}
              <span className="capitalize">{analytics.spendingTrend.replace('_', ' ')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected Month End
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.projectedMonthEndSpending, analytics.currentStatus.currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {analytics.daysUntilLimit && (
                <span>~{analytics.daysUntilLimit} days until limit</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cost Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {formatCurrency(analytics.costPerRequest, analytics.currentStatus.currency)}/req
            </div>
            <div className="text-xs text-muted-foreground">
              {analytics.costPerToken > 0 && (
                <span>{(analytics.costPerToken * 1000).toFixed(4)}¢/1k tokens</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Current Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monthly Allowance Usage</span>
              <span>{analytics.currentStatus.usagePercentage.toFixed(1)}%</span>
            </div>
            <Progress 
              value={analytics.currentStatus.usagePercentage} 
              className={`h-2 ${analytics.currentStatus.usagePercentage > 90 ? "bg-red-100" : ""}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatCurrency(analytics.currentStatus.currentSpending, analytics.currentStatus.currency)} used
              </span>
              <span>
                {formatCurrency(analytics.currentStatus.includedAllowance, analytics.currentStatus.currency)} allowance
              </span>
            </div>
          </div>

          {analytics.currentStatus.overageAmount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Overage Charges</span>
              </div>
              <div className="text-sm text-amber-700 mt-1">
                {formatCurrency(analytics.currentStatus.overageAmount, analytics.currentStatus.currency)} in overage fees for this period
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Spending Trends</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="invoices">Invoice History</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Historical Spending Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.trends.map((trend, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-border/60 rounded-lg">
                    <div>
                      <div className="font-medium">
                        {new Date(trend.periodStart).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long' 
                        })}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {trend.totalRequests} requests • Plan: {trend.planId}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">
                        {formatCurrency(trend.totalSpending, analytics.currentStatus.currency)}
                      </div>
                      {trend.overageAmount > 0 && (
                        <div className="text-xs text-amber-600">
                          +{formatCurrency(trend.overageAmount, analytics.currentStatus.currency)} overage
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          {forecast ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Spending Forecast
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  {forecast.basedOnMonths ? (
                    <>Based on {forecast.basedOnMonths} months of data • {(forecast.confidenceLevel * 100).toFixed(0)}% confidence</>
                  ) : (
                    "Forecast data incomplete"
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-lg font-bold text-blue-900">
                      {formatCurrency(forecast.totalProjectedSpending || 0, analytics?.currentStatus?.currency || "USD")}
                    </div>
                    <div className="text-sm text-blue-700">
                      Projected spending over next {forecast.monthsAhead || 0} months
                    </div>
                  </div>

                  {forecast.monthlyForecasts && forecast.monthlyForecasts.length > 0 ? (
                    forecast.monthlyForecasts.map((monthly, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border border-border/60 rounded-lg">
                        <div>
                          <div className="font-medium">
                            Month +{monthly.monthOffset || index + 1}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {((monthly.confidenceLevel || 0) * 100).toFixed(0)}% confidence
                          </div>
                        </div>
                        <div className="font-bold">
                          {formatCurrency(monthly.projectedSpending || 0, analytics?.currentStatus?.currency || "USD")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No monthly forecast data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-muted-foreground">
                  Spending forecast could not be loaded
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payment-methods" className="space-y-4">
          {paymentMethods && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!paymentMethods?.paymentMethods || paymentMethods.paymentMethods.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {!paymentMethods ? "Payment methods could not be loaded" : "No payment methods on file"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentMethods.paymentMethods.map((method) => (
                      <div key={method.id} className="flex items-center justify-between p-3 border border-border/60 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-medium">
                            {method.brand?.toUpperCase() || method.typeName?.toUpperCase() || "CARD"}
                          </div>
                          <div>
                            <div className="font-medium">
                              •••• •••• •••• {method.lastFour || "****"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {method.expMonth && method.expYear ? (
                                <span>Expires {method.expMonth}/{method.expYear}</span>
                              ) : (
                                <span>Expiration date not available</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {method.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoiceHistory && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Invoice History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!invoiceHistory?.invoices || invoiceHistory.invoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {!invoiceHistory ? "Invoice history could not be loaded" : "No invoices found"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoiceHistory.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between p-3 border border-border/60 rounded-lg">
                        <div>
                          <div className="font-medium">
                            {invoice.description || "Invoice"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {invoice.createdDate ? new Date(invoice.createdDate).toLocaleDateString() : "Date not available"}
                            {invoice.dueDate && (
                              <span> • Due: {new Date(invoice.dueDate).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-bold">
                              {formatCurrency(invoice.amount || 0, invoice.currency || "USD")}
                            </div>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getStatusColor(invoice.status || "unknown")}`}
                            >
                              {invoice.status || "Unknown"}
                            </Badge>
                          </div>
                          {invoice.invoicePdf && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(invoice.invoicePdf, '_blank')}
                              title="Download Invoice PDF"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}