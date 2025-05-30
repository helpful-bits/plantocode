/**
 * Subscription Manager Component
 *
 * Displays subscription information and provides options to manage subscriptions.
 */

import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";

import { useAuth } from "@/contexts/auth-context";
import { getErrorMessage } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { invoke } from "@tauri-apps/api/core";

import {
  LoadingSkeleton,
  ErrorState,
  NoSubscriptionState,
} from "./components/loading-and-error-states";
import { PollingBillingManager } from "./polling-billing-manager";
import type { SubscriptionDetails, CheckoutSessionResponse, BillingPortalResponse } from "@/types/tauri-commands";

export default function SubscriptionManager() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);


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
        const errorMessage = getErrorMessage(err);
        console.error("Subscription fetch error:", err);
        
        // Provide specific error messages based on error type
        let userMessage = "Failed to load subscription information";
        
        if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
          userMessage = "Authentication required. Please log in again.";
        } else if (errorMessage.includes("403") || errorMessage.includes("forbidden")) {
          userMessage = "Access denied. Please check your subscription permissions.";
        } else if (errorMessage.includes("network") || errorMessage.includes("offline")) {
          userMessage = "Network error. Please check your internet connection.";
        } else if (errorMessage.includes("timeout")) {
          userMessage = "Request timed out. Please try again.";
        }
        
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
  // SERVER_URL is a constant and doesn't need to be in the dependency array
  }, [user, refreshCounter]);

  /**
   * Handle subscription upgrade
   */
  const handleUpgrade = async () => {
    try {
      const result = await invoke<CheckoutSessionResponse>("create_checkout_session_command", { plan: "pro" });

      // Open the URL in the default browser
      if (result && result.url) {
        await open(result.url);
      } else {
        throw new Error("Invalid response format");
      }

      // Show notification
      showNotification({
        title: "Checkout Session Created",
        message: "Opening the upgrade page in your browser...",
        type: "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error("Checkout error:", err);
      
      let userMessage = "Failed to start checkout process";
      
      if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
        userMessage = "Authentication required. Please log in again.";
      } else if (errorMessage.includes("payment") || errorMessage.includes("billing")) {
        userMessage = "Payment service unavailable. Please try again later.";
      } else if (errorMessage.includes("network")) {
        userMessage = "Network error. Please check your connection and try again.";
      }
      
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

      // Open the URL in the default browser
      if (result && result.url) {
        await open(result.url);
      } else {
        throw new Error("Invalid response format");
      }

      // Show notification
      showNotification({
        title: "Customer Portal",
        message: "Opening the subscription management page in your browser...",
        type: "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error("Customer portal error:", err);
      
      let userMessage = "Failed to open customer portal";
      
      if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
        userMessage = "Authentication required. Please log in again.";
      } else if (errorMessage.includes("subscription") || errorMessage.includes("no active")) {
        userMessage = "No active subscription found. Please upgrade first.";
      } else if (errorMessage.includes("network")) {
        userMessage = "Network error. Please check your connection and try again.";
      }
      
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
      <PollingBillingManager
        subscription={subscription}
        onRefresh={handleRetry}
      />
    );
  };

  return renderContent();
}
