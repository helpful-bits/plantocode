/**
 * Main App Component for PlanToCode Desktop
 *
 * This component serves as the entry point for the desktop application.
 * It wraps the core app with desktop-specific functionality:
 * - Authentication via Auth0
 * - Database access via Tauri SQLite
 * - API access via server proxying
 * - Credit management
 */

import { Profiler } from "react";
import { useEffect, useState, useCallback } from "react";
import { safeListen } from "@/utils/tauri-event-utils";
import { Routes, Route } from "react-router-dom";
import { onRender } from "./utils/react-performance-profiler";

import { AppShell } from "@/app/components/app-shell";
import { isTauriEnvironment } from "@/utils/platform";
import { AuthFlowManager } from "@/app/components/auth/auth-flow-manager";
import { ProvidersWrapper } from "@/app/components/providers-wrapper";
import { ThemeProvider } from "@/app/components/theme-provider";
import CoreHomePage from "@/app/page";
import SettingsPage from "@/app/settings/page";
import AccountPage from "@/app/account/page";
import FeedbackPage from "@/app/feedback/page";
import NotFoundPage from "@/app/not-found";
import { AuthProvider } from "@/contexts/auth-context";
import { UILayoutProvider } from "@/contexts/ui-layout-context";
import { EmptyState, LoadingScreen } from "@/ui";

import { RuntimeConfigProvider } from "./contexts/runtime-config-context";
import { initSessionEventBridge } from "./contexts/session/event-bridge";

void initSessionEventBridge();

// Custom provider for desktop-specific functionality
import { TauriEnvironmentChecker } from "./providers/tauri-environment-checker";


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
                      <Routes>
                        <Route path="/" element={<CoreHomePage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/account" element={<AccountPage />} />
                        <Route path="/feedback" element={<FeedbackPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
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

      // Initialize billing system optimizations (removed due to missing module)

      // Check if Tauri is available for desktop functionality
      if (isTauri) {
        
        // Basic Tauri environment validation with improved timeout handling
        try {
          // Test basic Tauri functionality with a timeout
          let timeoutId: number;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('Tauri API timeout')), 3000); // Reduced to 3s for faster failure
          });

          try {
            await Promise.race([
              import('@tauri-apps/api/app').then(({ getName }) => getName()),
              timeoutPromise
            ]);
          } finally {
            clearTimeout(timeoutId!);
          }
        } catch (tauriError) {
          const isTimeout = tauriError instanceof Error && tauriError.message === 'Tauri API timeout';
          console.warn("[App] Tauri API validation failed:", tauriError);
          // If it's a timeout, log it more specifically
          if (isTimeout) {
            console.warn("[App] Tauri API timed out - app may be slow to respond");
          }
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
    // Add a global initialization timeout to prevent infinite loading
    const globalTimeout = setTimeout(() => {
      if (!appReady && !initError) {
        console.error("[App] Global initialization timeout - forcing app ready state");
        setAppReady(true); // Force the app to proceed even if initialization is incomplete
      }
    }, 20000); // 20 second global timeout
    
    void initializeApp();
    
    return () => clearTimeout(globalTimeout);
  }, [initializeApp, appReady, initError]);

  // Listen for app close event to handle unsaved changes
  useEffect(() => {
    if (typeof window === "undefined" || !isTauri) {
      return;
    }

    const setupAppCloseListener = async () => {
      try {
        const unlisten = await safeListen("app-will-close", () => {
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
      cleanup?.();
      // Cleanup billing system on app shutdown (removed due to missing module)
    };
  }, []);

  useEffect(() => {
    const handleRejection = async (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('unregisterListener')) {
        console.warn('Caught a late-unmount Tauri listener error. Safely ignored.', event.reason);
        event.preventDefault();
        return;
      }

      // Log unhandled promise rejections
      const { logError } = await import('@/utils/error-handling');
      await logError(event.reason, 'Unhandled Promise Rejection', {
        promise: event.promise?.toString(),
      }).catch(console.error);
    };

    const handleError = async (event: ErrorEvent) => {
      // Log unhandled errors
      const { logError } = await import('@/utils/error-handling');
      await logError(event.error || event.message, 'Unhandled Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }).catch(console.error);
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
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

  return (
    <>
      {import.meta.env.DEV ? (
        <Profiler id="AppRoot" onRender={onRender}>
          <SafeAppContent />
        </Profiler>
      ) : (
        <SafeAppContent />
      )}
    </>
  );
}
