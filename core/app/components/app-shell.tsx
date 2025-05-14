"use client";

import React from 'react';
import { Suspense } from 'react';
import { BackgroundJobsSidebar, Navigation } from "../client-components";
import { DatabaseErrorHandler } from "./client-wrappers";
import { AppInitializingScreen } from './app-initializing-screen';
import { useUILayout } from '@core/lib/contexts/ui-layout-context';

/**
 * AppShell component that conditionally renders either the initialization screen
 * or the full application UI based on the app initialization state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAppInitializing } = useUILayout();

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
        <div className="flex-1 transition-all duration-300 ease-in-out" style={{ marginLeft: "var(--sidebar-width, 256px)" }}>
          <div className="container mx-auto px-6 py-8">
            <Suspense fallback={<div className="h-16 flex items-center justify-center text-muted-foreground">Loading navigation...</div>}>
              <Navigation />
            </Suspense>
            {children}
          </div>
        </div>
      </div>

      {/* Database error handler (displays in modal when there's a db issue) */}
      <DatabaseErrorHandler />
    </>
  );
}