"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { 
  CreditCard, 
  ExternalLink, 
  RefreshCw,
  Clock,
  Loader2
} from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Progress } from "@/ui/progress";
import { useNotification } from "@/contexts/notification-context";
import { invoke } from "@tauri-apps/api/core";
import { getErrorMessage } from "@/utils/error-handling";
import type { SubscriptionDetails, CheckoutSessionResponse, BillingPortalResponse } from "@/types/tauri-commands";

interface PollingBillingManagerProps {
  subscription?: any;
  onRefresh?: () => void;
}

interface PollingState {
  isActive: boolean;
  action: "upgrade" | "manage" | null;
  startTime: number;
  timeoutDuration: number; // milliseconds
}

export function PollingBillingManager({ 
  subscription, 
  onRefresh 
}: PollingBillingManagerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pollingState, setPollingState] = useState<PollingState | null>(null);
  const [lastKnownStatus, setLastKnownStatus] = useState<string | null>(null);
  const [pollingErrorCount, setPollingErrorCount] = useState(0);
  const { showNotification } = useNotification();
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (subscription?.status && !lastKnownStatus) {
      setLastKnownStatus(subscription.status);
    }
  }, [subscription?.status, lastKnownStatus]);

  const stopPolling = useCallback(() => {
    // Clear all timers safely
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Reset state only if component is still mounted
    if (isMountedRef.current) {
      setPollingState(null);
      setIsProcessing(false);
      setPollingErrorCount(0); // Reset error count when stopping
    }
  }, []);

  const checkSubscriptionStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await invoke<SubscriptionDetails>("get_subscription_details_command");
      
      // Reset error count on successful fetch only if mounted
      if (isMountedRef.current) {
        setPollingErrorCount(0);
      }
      
      // Check if status changed
      if (response?.status && response.status !== lastKnownStatus) {
        console.log(`Subscription status changed: ${lastKnownStatus} → ${response.status}`);
        
        // Update local state only if mounted
        if (isMountedRef.current) {
          setLastKnownStatus(response.status);
        }
        
        // Refresh the parent component
        if (onRefresh) {
          onRefresh();
        }
        
        // Show success notification with more context only if mounted
        if (isMountedRef.current) {
          const statusMessages: Record<string, string> = {
            'active': 'Your subscription is now active and all features are available.',
            'trialing': 'Your trial period has started.',
            'past_due': 'Your subscription payment is past due. Please update your payment method.',
            'canceled': 'Your subscription has been canceled.',
            'incomplete': 'Your subscription setup is incomplete. Please complete the payment process.',
            'incomplete_expired': 'Your subscription setup has expired. Please restart the process.',
            'unpaid': 'Your subscription is unpaid. Please update your payment method.'
          };
          
          showNotification({
            title: "Subscription Updated",
            message: statusMessages[response.status] || `Your subscription status changed to: ${response.status}`,
            type: response.status === 'active' || response.status === 'trialing' ? "success" : 
                  response.status === 'past_due' || response.status === 'unpaid' ? "warning" : "info",
          });
        }
        
        return true; // Status changed
      }
      
      return false; // No change
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error("Failed to check subscription status:", error);
      
      const newErrorCount = pollingErrorCount + 1;
      if (isMountedRef.current) {
        setPollingErrorCount(newErrorCount);
      }
      
      // Provide specific error handling based on error type
      let shouldStopPolling = false;
      let errorTitle = "Polling Error";
      let errorMsg = "Failed to check subscription status.";
      
      if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
        errorTitle = "Authentication Error";
        errorMsg = "Session expired. Please sign in again.";
        shouldStopPolling = true; // Stop polling on auth errors
      } else if (errorMessage.includes("403") || errorMessage.includes("forbidden")) {
        errorTitle = "Access Denied";
        errorMsg = "Access to subscription data denied.";
        shouldStopPolling = true;
      } else if (newErrorCount >= 5) {
        errorTitle = "Polling Stopped";
        errorMsg = "Automatic subscription status updates have been paused due to repeated connection errors. You can manually refresh or try again later.";
        shouldStopPolling = true;
      } else if (newErrorCount >= 3) {
        errorTitle = "Connection Issues";
        errorMsg = `Connection error (${newErrorCount}/5). Continuing to monitor...`;
      }
      
      if (shouldStopPolling) {
        stopPolling();
        if (isMountedRef.current) {
          showNotification({
            title: errorTitle,
            message: errorMsg,
            type: "error",
          });
        }
      } else if (newErrorCount >= 3 && isMountedRef.current) {
        showNotification({
          title: errorTitle,
          message: errorMsg,
          type: "warning",
        });
      }
      
      return false;
    }
  }, [lastKnownStatus, onRefresh, showNotification, pollingErrorCount, stopPolling]);

  const startPolling = useCallback((action: "upgrade" | "manage", timeoutMinutes: number = 10) => {
    // Stop any existing polling first
    stopPolling();
    
    const timeoutDuration = timeoutMinutes * 60 * 1000;
    
    // Reset error count when starting polling only if mounted
    if (isMountedRef.current) {
      setPollingErrorCount(0);
      
      setPollingState({
        isActive: true,
        action,
        startTime: Date.now(),
        timeoutDuration,
      });
    }

    // Start polling with proper error handling
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const statusChanged = await checkSubscriptionStatus();
        if (statusChanged) {
          stopPolling();
        }
      } catch (error) {
        // Error is already handled in checkSubscriptionStatus
        console.warn("Polling interval error:", error);
      }
    }, 3000);

    // Set timeout with better messaging
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      if (isMountedRef.current) {
        const actionContext = action === "upgrade" ? "checkout completion" : "billing changes";
        showNotification({
          title: "Monitoring Timeout",
          message: `Stopped automatically checking for ${actionContext}. You can manually refresh if needed or the status will update when you return to the app.`,
          type: "info",
        });
      }
    }, timeoutDuration);

  }, [checkSubscriptionStatus, stopPolling, showNotification]);

  const handleUpgrade = async (plan: string) => {
    try {
      if (isMountedRef.current) {
        setIsProcessing(true);
      }
      
      const result = await invoke<CheckoutSessionResponse>("create_checkout_session_command", { plan });

      if (result?.url) {
        await open(result.url);
        
        if (isMountedRef.current) {
          showNotification({
            title: "Checkout Opened",
            message: "Complete your purchase in the browser. The app will automatically detect when your subscription is activated.",
            type: "info",
          });
        }
        
        startPolling("upgrade", 10);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      if (isMountedRef.current) {
        showNotification({
          title: "Checkout Failed",
          message: errorMessage,
          type: "error",
        });
        setIsProcessing(false);
      }
    }
  };

  const handleManageBilling = async () => {
    try {
      if (isMountedRef.current) {
        setIsProcessing(true);
      }
      
      const result = await invoke<BillingPortalResponse>("create_billing_portal_command");

      if (result?.url) {
        await open(result.url);
        
        if (isMountedRef.current) {
          showNotification({
            title: "Billing Portal Opened",
            message: "Manage your subscription in the browser. The app will automatically detect any changes you make.",
            type: "info",
          });
        }
        
        startPolling("manage", 5);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      if (isMountedRef.current) {
        showNotification({
          title: "Portal Access Failed",
          message: errorMessage,
          type: "error",
        });
        setIsProcessing(false);
      }
    }
  };

  const formatTimeRemaining = (startTime: number, duration: number): string => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, duration - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (startTime: number, duration: number): number => {
    const elapsed = Date.now() - startTime;
    return Math.min(100, (elapsed / duration) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Active Polling Status */}
      {pollingState && (
        <Alert className="border-blue-200 bg-blue-50">
          <Clock className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Monitoring Subscription Changes
          </AlertTitle>
          <AlertDescription className="text-blue-700 mt-2 space-y-3">
            <p>
              {pollingState.action === "upgrade" 
                ? "Waiting for checkout completion..."
                : "Watching for billing changes..."
              }
            </p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Time remaining:</span>
                <span className="font-mono">
                  {formatTimeRemaining(pollingState.startTime, pollingState.timeoutDuration)}
                </span>
              </div>
              <Progress 
                value={getProgressPercentage(pollingState.startTime, pollingState.timeoutDuration)} 
                className="h-1"
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={stopPolling}
              >
                Stop Monitoring
              </Button>
              <Button 
                size="sm" 
                onClick={checkSubscriptionStatus}
              >
                Check Now
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Subscription Status */}
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium">Current Subscription</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={subscription?.status === "active" ? "success" : "secondary"}>
                {subscription?.status || "Unknown"}
              </Badge>
              {pollingState && (
                <Badge variant="outline" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Live
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="font-medium">{subscription?.plan || "Free"}</span>
            </div>
            
            {subscription?.trialEndsAt && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Trial Ends</span>
                <span className="font-medium">
                  {new Date(subscription.trialEndsAt).toLocaleDateString()}
                </span>
              </div>
            )}
            
            {subscription?.currentPeriodEndsAt && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Renews</span>
                <span className="font-medium">
                  {new Date(subscription.currentPeriodEndsAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-4">
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <h4 className="font-medium text-sm">Plan Management</h4>
          </CardHeader>
          <CardContent className="space-y-3">
            
            <Button 
              onClick={() => handleUpgrade("pro")}
              disabled={isProcessing}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Upgrade to Pro
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <h4 className="font-medium text-sm">Billing Management</h4>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Manage your complete billing dashboard:
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>• Update payment methods</li>
                <li>• Download invoices</li>
                <li>• Change or cancel subscription</li>
                <li>• View billing history</li>
              </ul>
            </div>
            
            <Button 
              onClick={handleManageBilling}
              disabled={isProcessing}
              variant="outline"
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Billing
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Manual Refresh */}
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium">Manual Refresh</p>
              <p className="text-xs text-muted-foreground mt-1">
                Force check for subscription changes
              </p>
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={checkSubscriptionStatus}
              disabled={isProcessing}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}