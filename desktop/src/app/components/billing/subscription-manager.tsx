/**
 * Subscription Manager Component
 *
 * Displays subscription information and provides options to manage subscriptions.
 */

import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";

import { useAuth } from "@/contexts/auth-context";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { useSpendingData } from "@/hooks/use-spending-data";
import { invoke } from "@tauri-apps/api/core";

import {
  LoadingSkeleton,
  ErrorState,
  NoSubscriptionState,
} from "./components/loading-and-error-states";
import { PollingBillingManager } from "./polling-billing-manager";
import { ComprehensiveBillingDashboard } from "./comprehensive-billing-dashboard";
import { CostBasedSpendingOverview } from "./components/cost-based-spending-overview";
import { CreditPurchaseModal } from "./components/credit-purchase-modal";
import type { SubscriptionDetails, CheckoutSessionResponse, BillingPortalResponse } from "@/types/tauri-commands";

export default function SubscriptionManager() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { creditBalance, refreshSpendingData } = useSpendingData();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);


  // Load subscription info when user is available or refresh counter changes
  useEffect(() => {
    /**
     * Load subscription information from the server
     */
    const fetchSubscription = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await invoke<SubscriptionDetails>("get_subscription_details_command");
        setSubscription(result);
      } catch (err) {
        const errorInfo = extractErrorInfo(err);
        const userMessage = createUserFriendlyErrorMessage(errorInfo, "subscription");
        
        await logError(err, "SubscriptionManager.fetchSubscription", {
          userId: user?.sub,
          refreshCounter
        });
        
        setError(userMessage);
        showNotification({
          title: "Subscription Error",
          message: userMessage,
          type: "error",
          actionButton: {
            label: "Retry",
            onClick: () => handleRetry(),
            variant: "outline"
          }
        });
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      void fetchSubscription();
    }
  }, [user, refreshCounter, showNotification]);

  /**
   * Handle credit purchase modal
   */
  const handleBuyCredits = () => {
    setIsCreditModalOpen(true);
  };

  const handleCreditPurchaseComplete = async () => {
    // Refresh both subscription data and spending data after credit purchase
    setRefreshCounter(prev => prev + 1);
    await refreshSpendingData();
  };

  /**
   * Handle subscription upgrade
   */
  const handleUpgrade = async () => {
    try {
      const result = await invoke<CheckoutSessionResponse>("create_checkout_session_command", { plan: "pro" });

      // Validate response format
      if (!result || !result.url) {
        throw new Error("Invalid checkout session response - missing URL");
      }

      // Open the URL in the default browser
      await open(result.url);

      // Show notification with more context
      showNotification({
        title: "Checkout Session Created",
        message: "Opening the upgrade page in your browser. Complete your purchase to activate your subscription.",
        type: "success",
      });
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "checkout");
      
      await logError(err, "SubscriptionManager.handleUpgrade", {
        userId: user?.sub,
        plan: "pro"
      });
      
      setError(userMessage);
      showNotification({
        title: "Checkout Failed",
        message: userMessage,
        type: "error",
        actionButton: {
          label: "Try Again",
          onClick: () => handleUpgrade(),
          variant: "outline"
        }
      });
    }
  };

  /**
   * Handle managing subscription
   */
  const handleManageSubscription = async () => {
    try {
      const result = await invoke<BillingPortalResponse>("create_billing_portal_command");

      // Validate response format
      if (!result || !result.url) {
        throw new Error("Invalid billing portal response - missing URL");
      }

      // Open the URL in the default browser
      await open(result.url);

      // Show notification with more context
      showNotification({
        title: "Customer Portal",
        message: "Opening the subscription management page in your browser. You can update payment methods, change plans, and view billing history.",
        type: "success",
      });
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "billing portal");
      
      await logError(err, "SubscriptionManager.handleManageSubscription", {
        userId: user?.sub,
        hasSubscription: !!subscription
      });
      
      setError(userMessage);
      showNotification({
        title: "Portal Access Failed",
        message: userMessage,
        type: "error",
        actionButton: {
          label: "Try Again",
          onClick: () => handleManageSubscription(),
          variant: "outline"
        }
      });
    }
  };

  /**
   * Handle retry action
   */
  const handleRetry = () => {
    setRefreshCounter((prev: number) => prev + 1);
  };

  // Render appropriate content based on state
  const renderContent = () => {
    if (loading) {
      return <LoadingSkeleton />;
    }

    if (error) {
      return <ErrorState message={error} onRetry={handleRetry} />;
    }

    if (!subscription) {
      return <NoSubscriptionState onUpgrade={handleUpgrade} />;
    }

    return (
      <div className="space-y-8">
        <PollingBillingManager
          subscription={subscription}
          onRefresh={handleRetry}
        />
        <CostBasedSpendingOverview 
          onUpgrade={handleUpgrade}
          onManageSpending={handleManageSubscription}
          onBuyCredits={handleBuyCredits}
        />
        <ComprehensiveBillingDashboard />
        <CreditPurchaseModal
          isOpen={isCreditModalOpen}
          onClose={() => setIsCreditModalOpen(false)}
          currentBalance={creditBalance || 0}
          onPurchaseComplete={handleCreditPurchaseComplete}
        />
      </div>
    );
  };

  return renderContent();
}
