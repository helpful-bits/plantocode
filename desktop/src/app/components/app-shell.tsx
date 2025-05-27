"use client";


import { DatabaseErrorHandler } from "@/ui";
import { isTauriEnvironment } from "@/utils/platform";

import { BackgroundJobsSidebar, Navigation } from "../client-components";

import { Suspense } from "react";
import type { ReactNode } from "react";

/**
 * AppShell component that conditionally renders either the initialization screen
 * or the full application UI based on the app initialization state.
 *
 * This component is designed to work in both web and desktop environments.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const runningInDesktop = isTauriEnvironment();

  // AuthFlowManager controls when this component renders, so we can proceed directly with the full UI
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
          {/* Navigation spans full width */}
          <div className={`w-full ${runningInDesktop ? "pt-10" : "pt-8"}`}>
            <Suspense
              fallback={
                <div className="h-16 flex items-center justify-center text-muted-foreground">
                  Loading navigation...
                </div>
              }
            >
              <Navigation />
            </Suspense>

            {/* Main content with container constraints */}
            <div className="container mx-auto px-6 pt-4 pb-8">
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* Database error handler (displays in modal when there's a db issue) */}
      <DatabaseErrorHandler />
    </>
  );
}
