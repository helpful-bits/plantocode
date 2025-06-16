"use client";

import { useState, useEffect } from "react";
import { 
  AlertTriangle,
  CheckCircle,
  Bell,
  Loader2,
  RefreshCw,
  Check,
  Info
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { openBillingPortal } from "@/actions/billing/portal.actions";
import { invoke } from "@tauri-apps/api/core";
import type { SpendingStatusInfo, SpendingAlert } from "@/types/tauri-commands";

export interface SpendingAlertManagerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpending: SpendingStatusInfo | null;
  onAlertsUpdated?: () => void;
}

export function SpendingAlertManager({ 
  isOpen, 
  onClose, 
  currentSpending,
  onAlertsUpdated 
}: SpendingAlertManagerProps) {
  const [alerts, setAlerts] = useState<SpendingAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const { showNotification } = useNotification();

  useEffect(() => {
    if (isOpen && currentSpending) {
      setAlerts(currentSpending.alerts || []);
    }
  }, [isOpen, currentSpending]);

  const loadSpendingStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const status = await invoke<SpendingStatusInfo>('get_spending_status_command');
      setAlerts(status.alerts || []);
      onAlertsUpdated?.();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to load spending status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      setActionLoading({ ...actionLoading, [alertId]: true });
      
      // Spending management is now handled through Stripe Customer Portal
      const portalUrl = await openBillingPortal();
      window.open(portalUrl, '_blank');
      
      showNotification({
        title: "Billing Portal Opened",
        message: "Spending settings and alerts are managed through Stripe's billing portal.",
        type: "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Portal Access Failed",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setActionLoading({ ...actionLoading, [alertId]: false });
    }
  };

  const acknowledgeAllUnread = async () => {
    const unreadAlerts = alerts.filter(alert => !alert.acknowledged);
    if (unreadAlerts.length === 0) return;

    try {
      setIsLoading(true);
      
      // All spending management is now handled through Stripe Customer Portal
      const portalUrl = await openBillingPortal();
      window.open(portalUrl, '_blank');
      
      showNotification({
        title: "Billing Portal Opened",
        message: "Spending settings and alerts are managed through Stripe's billing portal.",
        type: "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Failed to Acknowledge Alerts",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'services_blocked':
      case 'limit_reached':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case '90_percent':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case '75_percent':
        return <Info className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const getAlertMessage = (alert: SpendingAlert) => {
    switch (alert.alertType) {
      case 'services_blocked':
        return 'AI services blocked due to spending limit exceeded';
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

  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const unreadCount = alerts.filter(alert => !alert.acknowledged).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Spending Alerts {unreadCount > 0 && <Badge variant="destructive">{unreadCount}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Review and acknowledge your spending notifications.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {alerts.length} total alerts, {unreadCount} unread
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadSpendingStatus} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button onClick={acknowledgeAllUnread} disabled={isLoading}>
                <Check className="h-4 w-4 mr-2" />
                Acknowledge All ({unreadCount})
              </Button>
            )}
          </div>
        </div>

        {/* Alerts List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading alerts...
            </div>
          ) : alerts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Spending Alerts</h3>
                <p className="text-muted-foreground">
                  You don't have any spending alerts at this time.
                </p>
              </CardContent>
            </Card>
          ) : (
            alerts.map((alert) => (
              <Card key={alert.id} className={`${!alert.acknowledged ? 'border-l-4 border-l-orange-500' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getAlertIcon(alert.alertType)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {getAlertMessage(alert)}
                          </span>
                          {alert.acknowledged && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Acknowledged
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Current: {formatCurrency(alert.currentSpending)} • 
                          Threshold: {formatCurrency(alert.thresholdAmount)} • 
                          {formatDate(alert.alertSentAt)}
                        </div>
                      </div>
                    </div>

                    {!alert.acknowledged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                        disabled={actionLoading[alert.id]}
                      >
                        {actionLoading[alert.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}