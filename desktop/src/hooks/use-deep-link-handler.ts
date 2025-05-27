/**
 * Hook for handling deep links in desktop app
 *
 * This hook manages listening for deep link events and processing URLs
 * for authentication flows, stripe checkout callbacks, and billing portal returns.
 */

import { message } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";

import { useAuth } from "@/contexts/auth-context";
import { isTauriEnvironment } from "@/utils/platform";

export function useDeepLinkHandler() {
  // Get auth context for handling OAuth redirect URLs
  const auth = useAuth();

  // Setup deep link handler
  useEffect(() => {
    if (!isTauriEnvironment()) {
      // eslint-disable-next-line no-console
      console.log(
        "[Desktop] Not running in Tauri environment, skipping deep link handler setup"
      );
      return;
    }

    // Handle deep link URL - defined inside useEffect to properly include auth in dependencies
    const handleDeepLink = async (url: string) => {
      // eslint-disable-next-line no-console
      console.log("[Desktop] Deep link received:", url);
      
      // Add more debug information
      console.log("[Desktop] Deep link DEBUG - Current URL:", window.location.href);
      console.log("[Desktop] Deep link DEBUG - auth context:", auth ? "Available" : "Not available");
  
      try {
        // Parse the URL to get the path and query params
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        const params = new URLSearchParams(urlObj.search);
  
        // Check for different types of deep links
  
        // OAuth redirect handling code has been removed
        // The new authentication flow uses a web-based approach
        // with server-side token exchange and polling
  
        // Stripe checkout session success
        if (pathParts[0] === "auth-success" && params.has("session_id")) {
          // eslint-disable-next-line no-console
          console.log("[Desktop] Processing Stripe checkout success");
          // We don't need to do anything with the session_id - subscription processed by webhook
  
          // Show success message
          // We don't need to do anything else - the subscription was already processed by the webhook
          await message("Your subscription has been successfully activated!", {
            title: "Subscription Activated",
            kind: "info",
          });
          return;
        }
  
        // Stripe checkout canceled
        if (pathParts[0] === "auth-cancelled") {
          // eslint-disable-next-line no-console
          console.log("[Desktop] Processing Stripe checkout cancellation");
  
          // Show cancellation message
          await message("Your subscription process was cancelled.", {
            title: "Subscription Cancelled",
            kind: "info",
          });
          return;
        }
  
        // Billing portal return
        if (pathParts[0] === "billing-return") {
          // eslint-disable-next-line no-console
          console.log("[Desktop] Processing billing portal return");
  
          // Show confirmation message
          await message("Your subscription changes have been processed.", {
            title: "Subscription Updated",
            kind: "info",
          });
          return;
        }
  
        // Unknown deep link
        // eslint-disable-next-line no-console
        console.log("[Desktop] Unknown deep link format:", url);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Desktop] Failed to process deep link "${url}": ${errorMessage}`, error);
      }
    };

    const setupDeepLinkHandler = async () => {
      try {
        // Listen for deep-link events from Tauri
        const { listen } = await import("@tauri-apps/api/event");

        // These are fired by the Tauri backend in main.rs
        const unlistenDeepLink = await listen("deep-link", (event: { payload: string }) => {
          const url = event.payload;
          void handleDeepLink(url);
        });
        
        // Also listen for simulated deep link events from test button
        const handleSimulatedDeepLink = (e: CustomEvent<string>) => {
          console.log("[Desktop] Received simulated deep link:", e.detail);
          void handleDeepLink(e.detail);
        };
        
        window.addEventListener("deep-link" as any, handleSimulatedDeepLink as any);

        // Clean up listener on unmount
        return () => {
          unlistenDeepLink();
          window.removeEventListener("deep-link" as any, handleSimulatedDeepLink as any);
        };
      } catch (error) {
        console.error("[Desktop] Failed to set up deep link handler:", error);
        return undefined;
      }
    };

    const unlistenPromise = setupDeepLinkHandler();
    
    return () => {
      if (unlistenPromise) {
        unlistenPromise.then(unlistenFn => {
          if (unlistenFn && typeof unlistenFn === 'function') {
            unlistenFn();
          }
        }).catch(err => {
          console.error("[Desktop] Error cleaning up deep link handler:", err);
        });
      }
    };
  }, [auth]); // Only depends on auth context now that handleDeepLink is inside
}