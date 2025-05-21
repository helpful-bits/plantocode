/**
 * Main App Component for Vibe Manager Desktop
 *
 * This component serves as the entry point for the desktop application.
 * It wraps the core app with desktop-specific functionality:
 * - Authentication via Firebase
 * - Database access via Tauri SQLite
 * - API access via server proxying
 * - Subscription management
 */

import { useEffect, useState } from "react";

import { AppShell } from "@/app/components/app-shell";
import { AuthFlowManager } from "@/app/components/auth/auth-flow-manager";
import SubscriptionManager from "@/app/components/billing/subscription-manager";
import { ProvidersWrapper } from "@/app/components/providers-wrapper";
import { ThemeProvider } from "@/app/components/theme-provider";
import CoreHomePage from "@/app/page";
import { AuthProvider } from "@/contexts/auth-context";
import { EmptyState, LoadingScreen } from "@/ui";
import { Toaster } from "@/ui/toaster";

import { RuntimeConfigProvider } from "./contexts/runtime-config-context";
// Custom provider for desktop-specific functionality
import { DesktopEnvironmentProvider } from "./providers/desktop-bridge-provider";

// Main application with authentication wrapper
export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Set app as ready after ensuring environment is initialized
  useEffect(() => {
    const initializeApp = () => {
      try {
        // Check if there are deep links waiting to be processed
        if (typeof window !== "undefined" && window.__TAURI_IPC__) {
          // Use a logger that can be configured instead of console.log
          // eslint-disable-next-line no-console
          console.log("[App] Checking for pending deep links...");
        }

        setAppReady(true);
      } catch (err) {
        console.error("Failed to initialize app:", err);
        setInitError(
          err instanceof Error
            ? `Initialization Error: ${err.message}`
            : "Failed to initialize application"
        );
      }
    };

    void initializeApp();
  }, []);

  if (initError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="max-w-md w-full p-8">
          <EmptyState
            variant="error"
            title="Initialization Error"
            description={initError}
            actionText="Retry"
            onAction={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  if (!appReady) {
    return <LoadingScreen loadingType="initializing" />;
  }

  // Create a safe app structure to ensure proper provider nesting
  const SafeAppContent = () => {
    // Only render the auth-dependent components when needed
    return (
      <ThemeProvider defaultTheme="system" enableSystem>
        <RuntimeConfigProvider>
          <AuthProvider>
            <DesktopEnvironmentProvider>
              <AuthFlowManager>
                <ProvidersWrapper environmentConfig={{ isDesktop: true }}>
                  {/* App Shell Component */}
                  <AppShell>
                    {/* Core Home Page */}
                    <CoreHomePage />
                    {/* Subscription Manager (fixed position) */}
                    <div className="fixed top-4 right-4 z-50 w-80">
                      <SubscriptionManager />
                    </div>
                  </AppShell>
                  {/* Toaster needs to be within ProvidersWrapper to access notification context */}
                  <Toaster />
                </ProvidersWrapper>
              </AuthFlowManager>
            </DesktopEnvironmentProvider>
          </AuthProvider>
        </RuntimeConfigProvider>
      </ThemeProvider>
    );
  };

  return <SafeAppContent />;
}
