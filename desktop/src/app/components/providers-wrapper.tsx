"use client";

import { useEffect, useState, lazy, Suspense } from "react";

import type React from "react";

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

const UILayoutProvider = lazy(() =>
  import("@/contexts").then((mod) => ({ default: mod.UILayoutProvider }))
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
      <Suspense fallback={null}>
        <NotificationProvider>
          <DatabaseProvider>
            <UILayoutProvider>
              <ProjectProvider>
                <SessionProvider>
                  <BackgroundJobsProvider>{children}</BackgroundJobsProvider>
                </SessionProvider>
              </ProjectProvider>
            </UILayoutProvider>
          </DatabaseProvider>
        </NotificationProvider>
      </Suspense>
    </ClientOnly>
  );
}
