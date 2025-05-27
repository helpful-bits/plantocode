/**
 * Subscription Manager Component
 *
 * Displays subscription information and provides options to manage subscriptions.
 */

import { open } from "@tauri-apps/plugin-shell";
import { useState, useEffect } from "react";

import { useAuth } from "@/contexts/auth-context";
import { Card } from "@/ui/card";
import { useToast } from "@/ui/use-toast";
import { securedFetchJson } from "@/utils/secured-fetch";
import { getErrorMessage } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";

import {
  LoadingSkeleton,
  ErrorState,
  NoSubscriptionState,
} from "./components/loading-and-error-states";
import { SubscriptionDetails } from "./components/subscription-details";
import { type SubscriptionInfo } from "./types";

// Server URL from environment variables
const SERVER_URL = (import.meta.env.VITE_MAIN_SERVER_BASE_URL as string) || "http://localhost:8080";

export default function SubscriptionManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { showNotification } = useNotification();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
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

        const result = await securedFetchJson<SubscriptionInfo>(
          `${SERVER_URL}/api/billing/subscription`,
          { method: "GET" }
        );
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
      const result = await securedFetchJson<{ url: string }>(
        `${SERVER_URL}/api/billing/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ plan: "pro" }),
        }
      );

      // Open the URL in the default browser
      if (result && result.url) {
        await open(result.url);
      } else {
        throw new Error("Invalid response format");
      }

      // Show toast notification
      toast({
        title: "Checkout Session Created",
        description: "Opening the upgrade page in your browser...",
        variant: "success",
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
      const result = await securedFetchJson<{ url: string }>(
        `${SERVER_URL}/api/billing/portal`,
        { method: "GET" }
      );

      // Open the URL in the default browser
      if (result && result.url) {
        await open(result.url);
      } else {
        throw new Error("Invalid response format");
      }

      // Show toast notification
      toast({
        title: "Customer Portal",
        description:
          "Opening the subscription management page in your browser...",
        variant: "success",
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
      <SubscriptionDetails
        subscription={subscription}
        onUpgrade={handleUpgrade}
        onManage={handleManageSubscription}
      />
    );
  };

  return (
    <Card className="p-4 shadow-sm border">
      <h3 className="font-medium mb-4">Subscription</h3>
      {renderContent()}
    </Card>
  );
}
