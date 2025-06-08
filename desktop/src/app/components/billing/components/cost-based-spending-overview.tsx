"use client";

import { useState } from "react";
import { 
  AlertTriangle, 
  DollarSign, 
  TrendingUp, 
  Shield, 
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  XCircle,
  CreditCard,
  Plus
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/ui/card";
import { Progress } from "@/ui/progress";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Button } from "@/ui/button";
import { useSpendingData } from "@/hooks/use-spending-data";
import { type SpendingStatusInfo } from "@/types/tauri-commands";

interface CostBasedSpendingOverviewProps {
  spendingData?: SpendingStatusInfo | null;
  onUpgrade?: () => void;
  onManageSpending?: () => void;
  onBuyCredits?: () => void;
}

export function CostBasedSpendingOverview({ 
  spendingData,
  onUpgrade,
  onManageSpending,
  onBuyCredits
}: CostBasedSpendingOverviewProps) {
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  
  // Use provided spending data or fetch from API as fallback
  const { 
    spendingStatus: fetchedSpendingStatus, 
    isLoading, 
    error, 
    refreshSpendingData
  } = useSpendingData();
  
  // Use provided spendingData if available, otherwise use fetched data
  const spendingStatus = spendingData || fetchedSpendingStatus;

  const formatCurrency = (amount: number) => {
    const currency = spendingStatus?.currency || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };
  
  // Show loading state only if no data is provided and hook is loading
  if (!spendingData && isLoading && !spendingStatus) {
    return (
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Loading spending data...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Show error state only if no data is provided and hook has error
  if (!spendingData && error && !spendingStatus) {
    return (
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load spending data: {error}
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-2" 
                onClick={refreshSpendingData}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  // Show fallback if no data
  if (!spendingStatus) {
    return (
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            No spending data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 100) return "text-red-600";
    if (percentage >= 90) return "text-orange-500";
    if (percentage >= 75) return "text-yellow-500";
    return "text-green-600";
  };


  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'services_blocked':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'limit_reached':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case '90_percent':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case '75_percent':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getAlertMessage = (alert: any) => {
    switch (alert.alertType) {
      case 'services_blocked':
        return 'AI services have been blocked due to spending limit exceeded';
      case 'limit_reached':
        return 'Monthly spending allowance exceeded - overage charges apply';
      case '90_percent':
        return 'You have used 90% of your monthly AI allowance';
      case '75_percent':
        return 'You have used 75% of your monthly AI allowance';
      default:
        return 'Spending notification';
    }
  };

  const recentAlerts = showAllAlerts ? spendingStatus.alerts : spendingStatus.alerts.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Services Blocked Alert */}
      {spendingStatus.servicesBlocked && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <XCircle className="h-4 w-4" />
          <AlertTitle className="text-red-800">AI Services Blocked</AlertTitle>
          <AlertDescription className="text-red-700 mt-2">
            <p>Your AI services have been automatically blocked because you've reached your spending limit of {formatCurrency(spendingStatus.hardLimit)}.</p>
            <div className="mt-3 flex gap-2">
              {onBuyCredits && (
                <Button size="sm" onClick={onBuyCredits}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Buy Credits
                </Button>
              )}
              {onUpgrade && (
                <Button size="sm" variant="outline" onClick={onUpgrade}>
                  Upgrade Plan
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onManageSpending}>
                Manage Spending
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Spending Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Current Spending */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Spending</p>
                <p className="text-2xl font-bold">{formatCurrency(spendingStatus.currentSpending)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Remaining Allowance */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Remaining</p>
                <p className={`text-2xl font-bold ${getUsageColor(spendingStatus.usagePercentage)}`}>
                  {formatCurrency(spendingStatus.remainingAllowance)}
                </p>
              </div>
              <Shield className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Overage Amount */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overage</p>
                <p className={`text-2xl font-bold ${spendingStatus.overageAmount > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                  {formatCurrency(spendingStatus.overageAmount)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Next Billing */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Next Billing</p>
                <p className="text-sm font-medium">
                  {new Date(spendingStatus.nextBillingDate).toLocaleDateString()}
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Credit Balance */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Credit Balance</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(spendingStatus.creditBalance || 0)}
                </p>
                {spendingStatus.creditBalance > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Available for overage
                  </p>
                )}
              </div>
              <div className="flex flex-col items-center gap-2">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
                {onBuyCredits && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-6 text-xs"
                    onClick={onBuyCredits}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Buy
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Progress */}
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Monthly Spending Progress</h3>
            <Badge variant={spendingStatus.usagePercentage >= 90 ? "destructive" : "secondary"}>
              {spendingStatus.usagePercentage.toFixed(1)}% used
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="space-y-2">
              <Progress 
                value={Math.min(spendingStatus.usagePercentage, 100)} 
                className="h-3"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatCurrency(spendingStatus.currentSpending)} spent</span>
                <span>{formatCurrency(spendingStatus.includedAllowance)} allowance</span>
              </div>
            </div>

            {/* Hard Limit Indicator */}
            <div className="pt-2 border-t border-border/50">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Hard limit:</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(spendingStatus.hardLimit)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Services automatically blocked at this limit
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spending Alerts */}
      {spendingStatus.alerts.length > 0 && (
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Recent Alerts</h3>
              {spendingStatus.alerts.length > 3 && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowAllAlerts(!showAllAlerts)}
                >
                  {showAllAlerts ? 'Show Less' : `View All (${spendingStatus.alerts.length})`}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="flex items-start gap-3 p-3 border border-border/30 rounded-lg bg-muted/20"
                >
                  {getAlertIcon(alert.alertType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {getAlertMessage(alert)}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>
                        {new Date(alert.alertSentAt).toLocaleDateString()} at{' '}
                        {new Date(alert.alertSentAt).toLocaleTimeString()}
                      </span>
                      <span>
                        Spending: {formatCurrency(alert.currentSpending)}
                      </span>
                    </div>
                  </div>
                  {alert.acknowledged ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Tips */}
      {!spendingStatus.servicesBlocked && spendingStatus.usagePercentage > 75 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <Zap className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Spending Optimization Tips</AlertTitle>
          <AlertDescription className="text-yellow-700 mt-2">
            <div className="space-y-2">
              <p>You're approaching your spending limit. Here are some ways to optimize:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Use less expensive models for simple tasks</li>
                <li>Reduce output length for content generation</li>
                <li>Batch similar requests to improve efficiency</li>
                {spendingStatus.creditBalance === 0 && (
                  <li>Purchase extra credits to extend your usage beyond the allowance</li>
                )}
                <li>Consider upgrading to a higher tier for better value</li>
              </ul>
              {spendingStatus.creditBalance > 0 && (
                <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-700">
                    <strong>Good news:</strong> You have {formatCurrency(spendingStatus.creditBalance)} in credit balance 
                    that will be used automatically when your allowance is exhausted.
                  </p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}