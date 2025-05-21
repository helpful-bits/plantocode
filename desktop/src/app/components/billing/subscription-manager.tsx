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

import {
  LoadingSkeleton,
  ErrorState,
  NoSubscriptionState,
} from "./components/loading-and-error-states";
import { SubscriptionDetails } from "./components/subscription-details";
import { type SubscriptionInfo } from "./types";

// Server URL from environment variables
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) || "http://localhost:8080";

export default function SubscriptionManager() {
  const { user, getToken } = useAuth();
  const { toast } = useToast();
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

        const token = await getToken();
        if (!token) {
          throw new Error("Authentication token not found");
        }

        const response = await fetch(`${SERVER_URL}/api/billing/subscription`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch subscription: ${response.statusText}`);
        }

        const result = await response.json() as SubscriptionInfo;
        setSubscription(result);
      } catch (_err) {
        setError("Failed to load subscription information");
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      void fetchSubscription();
    }
  // SERVER_URL is a constant and doesn't need to be in the dependency array
  }, [user, refreshCounter, getToken]);

  /**
   * Handle subscription upgrade
   */
  const handleUpgrade = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication token not found");
      }

      const response = await fetch(`${SERVER_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: "pro" }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create checkout session: ${response.statusText}`
        );
      }

      const result = await response.json() as { url: string };

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
    } catch (_err) {
      setError("Failed to start checkout process");

      // Show error toast
      toast({
        title: "Checkout Failed",
        description:
          "There was a problem starting the checkout process. Please try again.",
        variant: "destructive",
      });
    }
  };

  /**
   * Handle managing subscription
   */
  const handleManageSubscription = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication token not found");
      }

      const response = await fetch(`${SERVER_URL}/api/billing/portal`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create portal session: ${response.statusText}`
        );
      }

      const result = await response.json() as { url: string };

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
    } catch (_err) {
      setError("Failed to open customer portal");

      // Show error toast
      toast({
        title: "Portal Access Failed",
        description:
          "There was a problem opening the customer portal. Please try again.",
        variant: "destructive",
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
