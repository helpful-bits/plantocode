/**
 * Main App Component for Vibe Manager Desktop
 *
 * This component serves as the entry point for the desktop application.
 * It wraps the core app with desktop-specific functionality:
 * - Authentication via Auth0
 * - Database access via Tauri SQLite
 * - API access via server proxying
 * - Subscription management
 */

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";

import { AppShell } from "@/app/components/app-shell";
import { isTauriEnvironment } from "@/utils/platform";
import { AuthFlowManager } from "@/app/components/auth/auth-flow-manager";
import { ProvidersWrapper } from "@/app/components/providers-wrapper";
import { ThemeProvider } from "@/app/components/theme-provider";
import CoreHomePage from "@/app/page";
import SettingsPage from "@/app/settings/page";
import AccountPage from "@/app/account/page";
import { AuthProvider } from "@/contexts/auth-context";
import { UILayoutProvider } from "@/contexts/ui-layout-context";
import { EmptyState, LoadingScreen } from "@/ui";

import { RuntimeConfigProvider } from "./contexts/runtime-config-context";
// Custom provider for desktop-specific functionality
import { TauriEnvironmentChecker } from "./providers/tauri-environment-checker";

// Simple router component to handle path changes
function Router() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    let lastKnownPath = window.location.pathname; // Initialize with current path
    
    const handlePathChange = () => {
      const newPath = window.location.pathname;
      if (newPath !== lastKnownPath) { // Only if path truly changed
        setCurrentPath(newPath);
        lastKnownPath = newPath; // Update last known path
        // Dispatch custom event for other components
        window.dispatchEvent(new CustomEvent('routeChange', { detail: { path: newPath } }));
      }
    };

    // Initial dispatch
    handlePathChange();

    window.addEventListener('popstate', handlePathChange);

    const originalPushState = window.history.pushState;
    window.history.pushState = function(state, title, url) {
      originalPushState.call(window.history, state, title, url);
      handlePathChange(); // This already calls dispatch
    };

    return () => {
      window.removeEventListener('popstate', handlePathChange);
      window.history.pushState = originalPushState;
    };
  }, []); // Empty dependency array for mount/unmount logic

  switch (currentPath) {
    case '/settings':
      return <SettingsPage />;
    case '/account':
      return <AccountPage />;
    case '/':
    default:
      return <CoreHomePage />;
  }
}

// Safe app structure to ensure proper provider nesting and prevent remounting
function SafeAppContent() {
  // Only render the auth-dependent components when needed
  return (
    <ThemeProvider defaultTheme="system" enableSystem>
      <RuntimeConfigProvider>
        <AuthProvider>
          <TauriEnvironmentChecker>
            <UILayoutProvider>
              <AuthFlowManager>
                <ProvidersWrapper environmentConfig={{ isDesktop: true }}>
                  {/* App Shell Component */}
                  <AppShell>
                    {/* Router handles different pages */}
                    <Router />
                  </AppShell>
                </ProvidersWrapper>
              </AuthFlowManager>
            </UILayoutProvider>
          </TauriEnvironmentChecker>
        </AuthProvider>
      </RuntimeConfigProvider>
    </ThemeProvider>
  );
}

// Main application with authentication wrapper
export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isTauri] = useState(() => isTauriEnvironment());

  // Memoize the initialization function to ensure it only runs once
  const initializeApp = useCallback(async () => {
    try {
      // Validate environment
      if (typeof window === "undefined") {
        throw new Error("Application must run in a browser environment");
      }

      // Check if Tauri is available for desktop functionality
      if (isTauri) {
        // Use a logger that can be configured instead of console.log
        // eslint-disable-next-line no-console
        console.log("[App] Tauri environment detected - initializing desktop features");
        
        // Basic Tauri environment validation
        try {
          // Test basic Tauri functionality with a timeout
          await Promise.race([
            import('@tauri-apps/api/app').then(({ getName }) => getName()),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Tauri API timeout')), 5000)
            )
          ]);
        } catch (tauriError) {
          console.warn("[App] Tauri API validation failed:", tauriError);
          // Continue anyway - the app can still function with limited features
        }
      } else {
        console.warn("[App] Tauri not detected - some features may be limited");
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
  }, [isTauri]);

  // Set app as ready after ensuring environment is initialized
  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  // Listen for app close event to handle unsaved changes
  useEffect(() => {
    if (typeof window === "undefined" || !isTauri) {
      return;
    }

    const setupAppCloseListener = async () => {
      try {
        const unlisten = await listen("app-will-close", () => {
          // This event is emitted when the user tries to close the app
          // The session context will handle saving if needed
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("app-will-close"));
          }
        });

        return unlisten;
      } catch (error) {
        console.error("Failed to setup app close listener:", error);
        // Don't throw - this is a non-critical feature
        return () => {}; // Return a no-op cleanup function
      }
    };

    let cleanup: (() => void) | undefined;
    
    setupAppCloseListener()
      .then((unlistenFn) => {
        cleanup = unlistenFn;
      })
      .catch((error) => {
        console.error("Error setting up app close listener:", error);
      });

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
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

  return <SafeAppContent />;
}
