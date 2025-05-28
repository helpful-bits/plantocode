"use client";


import { DatabaseErrorHandler } from "@/ui";

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
  // AuthFlowManager controls when this component renders, so we can proceed directly with the full UI
  return (
    <>
      {/* Background jobs sidebar - positioned outside flex layout */}
      <Suspense fallback={null}>
        <BackgroundJobsSidebar />
      </Suspense>

      {/* Main content area with dynamic margin based on sidebar state */}
      <div
        className="min-h-screen transition-all duration-300 ease-in-out min-w-0 bg-background"
        style={{ marginLeft: "var(--sidebar-width, 320px)" }}
      >
          {/* Navigation spans full width */}
          <div className="w-full bg-background">
            <Suspense
              fallback={
                <div className="h-16 flex items-center justify-center text-muted-foreground animate-pulse">
                  Loading navigation...
                </div>
              }
            >
              <Navigation />
            </Suspense>

            {/* Main content with container constraints */}
            <main className="container mx-auto px-6 pt-4 pb-8 max-w-7xl bg-background">
              {children}
            </main>
          </div>
        </div>

      {/* Database error handler (displays in modal when there's a db issue) */}
      <DatabaseErrorHandler />
    </>
  );
}
