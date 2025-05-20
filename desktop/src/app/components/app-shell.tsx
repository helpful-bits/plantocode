"use client";


import { useUILayout } from "@/contexts/ui-layout-context";
import { DatabaseErrorHandler } from "@/ui";
import { AppInitializingScreen } from "@/ui/app-initializing-screen";
import { TokenUsageIndicator } from "@/ui/token-usage-indicator";
import { isDesktopApp, isTauriEnvironment } from "@/utils/platform";

import { BackgroundJobsSidebar, Navigation } from "../client-components";

import type React from "react";
import { Suspense } from "react";

/**
 * AppShell component that conditionally renders either the initialization screen
 * or the full application UI based on the app initialization state.
 *
 * This component is designed to work in both web and desktop environments.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAppInitializing } = useUILayout();
  const runningInDesktop = isDesktopApp() || isTauriEnvironment();

  // Show the app initializing screen during critical loading phase
  if (isAppInitializing) {
    return <AppInitializingScreen />;
  }

  // Once initialized, show the full application UI
  return (
    <>
      {/* Main content layout with sidebar */}
      <div className="flex min-h-screen">
        {/* Background jobs sidebar */}
        <Suspense fallback={<div className="w-12"></div>}>
          <BackgroundJobsSidebar />
        </Suspense>

        {/* Main content area with dynamic margin based on sidebar state */}
        <div
          className="flex-1 transition-all duration-300 ease-in-out"
          style={{ marginLeft: "var(--sidebar-width, 320px)" }}
        >
          <div
            className={`container mx-auto px-6 py-8 ${runningInDesktop ? "pt-10" : ""}`}
          >
            <div className="flex justify-between items-center mb-6">
              <Suspense
                fallback={
                  <div className="h-16 flex items-center justify-center text-muted-foreground">
                    Loading navigation...
                  </div>
                }
              >
                <Navigation />
              </Suspense>

              {/* Token usage indicator in the top right */}
              <div className="hidden md:block">
                <TokenUsageIndicator compact={true} showRefreshButton={true} />
              </div>
            </div>

            {children}
          </div>
        </div>
      </div>

      {/* Database error handler (displays in modal when there's a db issue) */}
      <DatabaseErrorHandler />
    </>
  );
}
