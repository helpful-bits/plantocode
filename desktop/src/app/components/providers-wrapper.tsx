"use client";

import { useEffect, useState, lazy, Suspense } from "react";

import type React from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { logError } from "@/utils/error-handling";

// Force client-side only rendering to avoid hydration issues
// This component will only render its children when running in browser
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? <>{children}</> : null;
}


// Import all providers from the central contexts index using React.lazy
const ProjectProvider = lazy(() =>
  import("@/contexts").then((mod) => ({ default: mod.ProjectProvider }))
);

const DatabaseProvider = lazy(() =>
  import("@/contexts").then((mod) => ({ default: mod.DatabaseProvider }))
);

const BackgroundJobsProvider = lazy(() =>
  import("@/contexts/background-jobs").then((mod) => ({
    default: mod.BackgroundJobsProvider,
  }))
);

// Use SessionProvider for managing session state
const SessionProvider = lazy(() =>
  import("@/contexts/session").then((mod) => ({ default: mod.SessionProvider }))
);


// Simple notification provider with hydration safety
const NotificationProvider = lazy(() =>
  import("@/contexts").then((mod) => ({ default: mod.NotificationProvider }))
);

export interface ProvidersWrapperProps {
  children: React.ReactNode;
  // Optional prop to pass environment-specific configurations
  environmentConfig?: {
    isDesktop?: boolean;
    // Can add other environment-specific configurations as needed
  };
}

export function ProvidersWrapper({
  children,
}: ProvidersWrapperProps) {
  // Auto-detect environment if not explicitly provided
  // Environment detection can be implemented here if needed in the future

  // Environment detection can be verified through environment variables if needed

  return (
    // Force client-side only rendering to break hydration issues
    <ClientOnly>
      <ErrorBoundary
        onError={(error, errorInfo) => {
          logError(error, "Providers Wrapper - Provider Initialization Error", {
            componentStack: errorInfo.componentStack,
          }).catch(() => {
            // Swallow logging errors
          });
        }}
        fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-background p-8">
            <div className="max-w-md w-full text-center">
              <h2 className="text-lg font-semibold mb-2 text-foreground">Provider Initialization Error</h2>
              <p className="text-muted-foreground mb-4">
                Failed to initialize application providers. Please refresh the page.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 focus-ring"
              >
                Refresh Page
              </button>
            </div>
          </div>
        }
      >
        <Suspense fallback={null}>
          <NotificationProvider>
            <DatabaseProvider>
              <ProjectProvider>
                <SessionProvider>
                  <BackgroundJobsProvider>{children}</BackgroundJobsProvider>
                </SessionProvider>
              </ProjectProvider>
            </DatabaseProvider>
          </NotificationProvider>
        </Suspense>
      </ErrorBoundary>
    </ClientOnly>
  );
}
